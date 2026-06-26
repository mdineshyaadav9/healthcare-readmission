"""
ML Pipeline: XGBoost + LightGBM Ensemble
- Feature engineering from raw patient data
- Cross-validated training
- MLflow experiment tracking
- SHAP global + per-patient explanations
- Model serialization for FastAPI serving
"""

import json
import warnings
import joblib
import numpy as np
import pandas as pd
import shap
import mlflow
import mlflow.sklearn
from pathlib import Path
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import (
    roc_auc_score, average_precision_score,
    classification_report, confusion_matrix
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
import xgboost as xgb
import lightgbm as lgb

warnings.filterwarnings("ignore")

BASE_DIR  = Path(__file__).parent.parent
DATA_DIR  = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "ml" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

MLFLOW_DIR = BASE_DIR / "ml" / "mlruns"
mlflow.set_tracking_uri(f"file://{MLFLOW_DIR}")
mlflow.set_experiment("readmission_risk")

# ── Load & feature-engineer ──────────────────────────────────────────────────
print("Loading data...")
df = pd.read_parquet(DATA_DIR / "patients_40k.parquet")
print(f"  Shape: {df.shape}")

# Encode categorical features
cat_cols = ["gender", "race", "insurance", "primary_icd10",
            "care_unit", "discharge_disposition"]
num_cols = [c for c in df.columns if c not in
            ["patient_id", "admission_id", "hospital_id",
             "comorbidities", "readmitted_30d", "readmission_risk_score"] + cat_cols]

# One-hot encode categoricals inline
print("Feature engineering...")
df_enc = pd.get_dummies(df[cat_cols + num_cols], columns=cat_cols, drop_first=False)

# Derived features
df_enc["creatinine_bun_ratio"] = df["creatinine"] / (df["bun"] + 1e-6)
df_enc["sodium_potassium_ratio"] = df["sodium"] / (df["potassium"] + 1e-6)
df_enc["shock_index"] = df["heart_rate"] / (df["systolic_bp"] + 1e-6)
df_enc["pulse_pressure"] = df["systolic_bp"] - df["diastolic_bp"]
df_enc["age_los_interaction"] = df["age"] * df["length_of_stay"]
df_enc["prior_admissions_ed_total"] = df["prior_admissions_1yr"] + df["prior_ed_visits_1yr"]
df_enc["albumin_creatinine_ratio"] = df["albumin"] / (df["creatinine"] + 1e-6)
df_enc["high_wbc"] = (df["wbc"] > 12).astype(int)
df_enc["low_hemoglobin"] = (df["hemoglobin"] < 10).astype(int)
df_enc["elevated_lactate"] = (df["lactate"] > 2.0).astype(int)
df_enc["high_inr"] = (df["inr"] > 1.5).astype(int)
df_enc["low_albumin"] = (df["albumin"] < 3.5).astype(int)
df_enc["hypotension"] = (df["systolic_bp"] < 90).astype(int)
df_enc["tachycardia"] = (df["heart_rate"] > 100).astype(int)
df_enc["hypoxia"] = (df["spo2"] < 90).astype(int)

# Fill any NaNs
df_enc = df_enc.fillna(df_enc.median(numeric_only=True))

X = df_enc.astype(np.float32)
y = df["readmitted_30d"].values
feature_names = list(X.columns)

print(f"  Features after engineering: {len(feature_names)}")
print(f"  Class balance: {y.mean():.3f} positive rate")

# ── XGBoost ──────────────────────────────────────────────────────────────────
print("\nTraining XGBoost...")
scale_pos = (y == 0).sum() / (y == 1).sum()

xgb_params = dict(
    n_estimators=600,
    learning_rate=0.05,
    max_depth=6,
    min_child_weight=5,
    subsample=0.8,
    colsample_bytree=0.7,
    reg_alpha=0.1,
    reg_lambda=1.0,
    scale_pos_weight=scale_pos,
    eval_metric="auc",
    use_label_encoder=False,
    random_state=42,
    n_jobs=-1,
)

xgb_model = xgb.XGBClassifier(**xgb_params)

# ── LightGBM ──────────────────────────────────────────────────────────────────
print("Training LightGBM...")
lgb_params = dict(
    n_estimators=600,
    learning_rate=0.05,
    num_leaves=63,
    max_depth=7,
    min_child_samples=20,
    subsample=0.8,
    colsample_bytree=0.7,
    reg_alpha=0.05,
    reg_lambda=1.0,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
    verbose=-1,
)

lgb_model = lgb.LGBMClassifier(**lgb_params)

# ── Cross-validated evaluation ────────────────────────────────────────────────
print("\nCross-validating both models (5-fold)...")
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

xgb_aucs = cross_val_score(xgb_model, X, y, cv=cv, scoring="roc_auc", n_jobs=-1)
lgb_aucs = cross_val_score(lgb_model, X, y, cv=cv, scoring="roc_auc", n_jobs=-1)

print(f"  XGBoost AUC:  {xgb_aucs.mean():.4f} ± {xgb_aucs.std():.4f}")
print(f"  LightGBM AUC: {lgb_aucs.mean():.4f} ± {lgb_aucs.std():.4f}")

# ── Full fit + ensemble ────────────────────────────────────────────────────────
print("\nFitting on full dataset...")
xgb_model.fit(X, y)
lgb_model.fit(X, y)

xgb_prob = xgb_model.predict_proba(X)[:, 1]
lgb_prob = lgb_model.predict_proba(X)[:, 1]
ensemble_prob = 0.5 * xgb_prob + 0.5 * lgb_prob

train_auc = roc_auc_score(y, ensemble_prob)
train_ap  = average_precision_score(y, ensemble_prob)
print(f"\nEnsemble train AUC: {train_auc:.4f} | AP: {train_ap:.4f}")

# ── SHAP explanations ──────────────────────────────────────────────────────────
print("\nComputing SHAP values (XGBoost)...")
explainer = shap.TreeExplainer(xgb_model)
# Use 5k sample for SHAP to keep it tractable
shap_sample_idx = np.random.choice(len(X), 5000, replace=False)
shap_vals = explainer.shap_values(X.iloc[shap_sample_idx])

# Global feature importance via mean |SHAP|
mean_shap = np.abs(shap_vals).mean(axis=0)
shap_importance = pd.DataFrame({
    "feature": feature_names,
    "mean_shap": mean_shap
}).sort_values("mean_shap", ascending=False)

top20 = shap_importance.head(20)
print("\nTop 20 SHAP features:")
for _, row in top20.iterrows():
    print(f"  {row['feature']:40s}  {row['mean_shap']:.4f}")

# Save SHAP importance
shap_importance.to_csv(MODEL_DIR / "shap_feature_importance.csv", index=False)

# ── MLflow logging ─────────────────────────────────────────────────────────────
print("\nLogging to MLflow...")
with mlflow.start_run(run_name="xgb_lgb_ensemble_v1"):
    mlflow.log_params({**xgb_params, "ensemble_weight_xgb": 0.5, "n_features": len(feature_names)})
    mlflow.log_metrics({
        "xgb_cv_auc_mean": float(xgb_aucs.mean()),
        "xgb_cv_auc_std":  float(xgb_aucs.std()),
        "lgb_cv_auc_mean": float(lgb_aucs.mean()),
        "lgb_cv_auc_std":  float(lgb_aucs.std()),
        "ensemble_train_auc": float(train_auc),
        "ensemble_train_ap":  float(train_ap),
        "n_patients": len(df),
        "positive_rate": float(y.mean()),
    })
    mlflow.log_artifact(str(MODEL_DIR / "shap_feature_importance.csv"))

# ── Serialize artifacts ─────────────────────────────────────────────────────────
print("\nSaving model artifacts...")

joblib.dump(xgb_model, MODEL_DIR / "xgb_model.joblib")
joblib.dump(lgb_model, MODEL_DIR / "lgb_model.joblib")
joblib.dump(explainer,  MODEL_DIR / "shap_explainer.joblib")

# Save feature names + schema
with open(MODEL_DIR / "feature_names.json", "w") as f:
    json.dump(feature_names, f)

# Save a representative row for schema validation
sample_row = X.iloc[0].to_dict()
with open(MODEL_DIR / "sample_input.json", "w") as f:
    json.dump({k: float(v) for k, v in sample_row.items()}, f, indent=2)

# Save score distribution bins for calibration display
score_dist = pd.qcut(ensemble_prob, 10, duplicates="drop").value_counts().sort_index()
with open(MODEL_DIR / "score_distribution.json", "w") as f:
    json.dump({str(k): int(v) for k, v in score_dist.items()}, f)

# Attach scores back to data and save
df["xgb_prob"]      = np.round(xgb_prob, 4)
df["lgb_prob"]      = np.round(lgb_prob, 4)
df["ensemble_prob"] = np.round(ensemble_prob, 4)
df["risk_tier"]     = pd.cut(
    ensemble_prob,
    bins=[0, 0.25, 0.50, 0.75, 1.0],
    labels=["Low", "Moderate", "High", "Critical"]
)
df.to_parquet(DATA_DIR / "patients_with_scores.parquet", index=False)

print(f"\n✅ All artifacts saved to {MODEL_DIR}")
print(f"\nRisk tier distribution:")
print(df["risk_tier"].value_counts().sort_index())
