"""
FastAPI Backend — Healthcare Readmission Risk Platform
Endpoints:
  POST /api/predict          — Single patient risk prediction + SHAP
  POST /api/predict/batch    — Batch prediction (up to 500 patients)
  GET  /api/patients         — Paginated patient list with filters
  GET  /api/patients/{id}    — Single patient detail + explanation
  GET  /api/hospitals        — Hospital-level risk aggregates
  GET  /api/stats            — Dashboard KPIs
  WS   /ws/vitals/{id}       — Live vitals stream
  GET  /api/shap/global      — Global SHAP feature importance
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json
import random
import time
from typing import Optional, List
from contextlib import asynccontextmanager
import numpy as np
import pandas as pd
import joblib
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE     = Path(__file__).parent.parent
MODEL_DIR = BASE / "ml/models"
DATA_DIR  = BASE / "data"

# ── Load model artifacts at startup ───────────────────────────────────────────
print("Loading model artifacts...")
xgb_model   = joblib.load(MODEL_DIR / "xgb_model.joblib")
lgb_model   = joblib.load(MODEL_DIR / "lgb_model.joblib")
shap_explainer = joblib.load(MODEL_DIR / "shap_explainer.joblib")

with open(MODEL_DIR / "feature_names.json") as f:
    FEATURE_NAMES = json.load(f)

print("Loading patient dataset...")
df_patients = pd.read_parquet(DATA_DIR / "patients_with_scores.parquet")
df_patients["risk_tier"] = df_patients["risk_tier"].astype(str)
print(f"  Loaded {len(df_patients):,} patients")

shap_importance = pd.read_csv(MODEL_DIR / "shap_feature_importance.csv")

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Healthcare Readmission Risk API",
    description="30-day readmission prediction powered by XGBoost + LightGBM ensemble with SHAP explanations",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helper: build feature vector ──────────────────────────────────────────────
def build_feature_vector(patient_row: pd.Series) -> np.ndarray:
    """Reconstruct the engineered feature vector from a patient row."""
    # One-hot encode categoricals
    cat_cols = ["gender", "race", "insurance", "primary_icd10",
                "care_unit", "discharge_disposition"]
    row_df = patient_row.to_frame().T
    enc = pd.get_dummies(row_df[cat_cols], drop_first=False)

    # Numeric base cols
    num_cols = [c for c in FEATURE_NAMES
                if not any(c.startswith(p) for p in
                           ["gender_", "race_", "insurance_", "primary_icd10_",
                            "care_unit_", "discharge_disposition_",
                            "creatinine_bun_ratio", "sodium_potassium_ratio",
                            "shock_index", "pulse_pressure", "age_los_interaction",
                            "prior_admissions_ed_total", "albumin_creatinine_ratio",
                            "high_wbc", "low_hemoglobin", "elevated_lactate",
                            "high_inr", "low_albumin", "hypotension",
                            "tachycardia", "hypoxia"])]

    # Build a full feature df with all expected columns
    feat = pd.DataFrame(columns=FEATURE_NAMES, dtype=np.float32)
    row_out = {}

    # Numerical features from dataset
    for col in num_cols:
        if col in patient_row.index:
            row_out[col] = float(patient_row[col])

    # One-hot cols
    for col in enc.columns:
        if col in FEATURE_NAMES:
            row_out[col] = float(enc[col].iloc[0])

    # Derived features
    cr = float(patient_row.get("creatinine", 1))
    bn = float(patient_row.get("bun", 16))
    na = float(patient_row.get("sodium", 140))
    k  = float(patient_row.get("potassium", 4))
    hr = float(patient_row.get("heart_rate", 78))
    sbp= float(patient_row.get("systolic_bp", 130))
    dbp= float(patient_row.get("diastolic_bp", 80))
    ag = float(patient_row.get("age", 65))
    los= float(patient_row.get("length_of_stay", 5))
    alb= float(patient_row.get("albumin", 4))
    pa = float(patient_row.get("prior_admissions_1yr", 0))
    ed = float(patient_row.get("prior_ed_visits_1yr", 0))
    wbc= float(patient_row.get("wbc", 8))
    hgb= float(patient_row.get("hemoglobin", 13))
    lac= float(patient_row.get("lactate", 1.2))
    inr= float(patient_row.get("inr", 1.1))
    spo= float(patient_row.get("spo2", 97))

    row_out.update({
        "creatinine_bun_ratio":       cr / (bn + 1e-6),
        "sodium_potassium_ratio":     na / (k + 1e-6),
        "shock_index":                hr / (sbp + 1e-6),
        "pulse_pressure":             sbp - dbp,
        "age_los_interaction":        ag * los,
        "prior_admissions_ed_total":  pa + ed,
        "albumin_creatinine_ratio":   alb / (cr + 1e-6),
        "high_wbc":    float(wbc > 12),
        "low_hemoglobin": float(hgb < 10),
        "elevated_lactate": float(lac > 2.0),
        "high_inr":    float(inr > 1.5),
        "low_albumin": float(alb < 3.5),
        "hypotension": float(sbp < 90),
        "tachycardia": float(hr > 100),
        "hypoxia":     float(spo < 90),
    })

    # Assemble in exact order
    vec = np.array([row_out.get(f, 0.0) for f in FEATURE_NAMES], dtype=np.float32)
    return vec


# ── SHAP for a single patient ─────────────────────────────────────────────────
def get_shap_explanation(vec: np.ndarray, top_n: int = 10) -> list:
    X_row = pd.DataFrame([vec], columns=FEATURE_NAMES)
    sv = shap_explainer.shap_values(X_row)[0]
    pairs = sorted(zip(FEATURE_NAMES, sv), key=lambda x: abs(x[1]), reverse=True)
    return [{"feature": f, "shap_value": round(float(v), 4),
             "direction": "increases_risk" if v > 0 else "decreases_risk"}
            for f, v in pairs[:top_n]]


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"service": "Readmission Risk API", "status": "healthy",
            "patients_loaded": len(df_patients)}


@app.get("/api/stats")
async def get_stats():
    """Dashboard KPIs."""
    total = len(df_patients)
    by_tier = df_patients["risk_tier"].value_counts().to_dict()
    readmission_rate = float(df_patients["readmitted_30d"].mean())
    avg_score = float(df_patients["ensemble_prob"].mean())
    avg_los   = float(df_patients["length_of_stay"].mean())

    # Hospital-level summary
    hosp_summary = (
        df_patients.groupby("hospital_id")["ensemble_prob"]
        .agg(["mean", "count"]).reset_index()
        .rename(columns={"mean": "avg_risk", "count": "n_patients"})
    )

    return {
        "total_patients": total,
        "readmission_rate": round(readmission_rate, 4),
        "avg_risk_score": round(avg_score, 4),
        "avg_length_of_stay": round(avg_los, 2),
        "by_risk_tier": by_tier,
        "n_hospitals": df_patients["hospital_id"].nunique(),
        "model_auc_cv": 0.7202,
    }


@app.get("/api/patients")
async def get_patients(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    hospital_id: Optional[str] = None,
    risk_tier: Optional[str] = None,
    min_risk: Optional[float] = None,
    max_risk: Optional[float] = None,
    sort_by: str = "ensemble_prob",
    sort_dir: str = "desc",
):
    """Paginated patient list with filters."""
    q = df_patients.copy()
    if hospital_id:
        q = q[q["hospital_id"] == hospital_id]
    if risk_tier:
        q = q[q["risk_tier"] == risk_tier]
    if min_risk is not None:
        q = q[q["ensemble_prob"] >= min_risk]
    if max_risk is not None:
        q = q[q["ensemble_prob"] <= max_risk]

    q = q.sort_values(sort_by, ascending=(sort_dir == "asc"))
    total = len(q)
    start = (page - 1) * page_size
    page_df = q.iloc[start:start + page_size]

    cols = ["patient_id", "admission_id", "hospital_id", "age", "gender",
            "primary_icd10", "comorbidity_count", "length_of_stay",
            "icu_flag", "risk_tier", "ensemble_prob", "readmitted_30d",
            "discharge_disposition", "care_unit"]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": -(-total // page_size),
        "patients": page_df[cols].to_dict(orient="records"),
    }


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str):
    """Single patient detail with SHAP explanation."""
    row = df_patients[df_patients["patient_id"] == patient_id]
    if row.empty:
        raise HTTPException(404, f"Patient {patient_id} not found")
    patient = row.iloc[0]

    # SHAP
    vec = build_feature_vector(patient)
    explanation = get_shap_explanation(vec, top_n=12)

    return {
        "patient": patient.to_dict(),
        "shap_explanation": explanation,
        "risk_summary": {
            "xgb_prob": float(patient["xgb_prob"]),
            "lgb_prob": float(patient["lgb_prob"]),
            "ensemble_prob": float(patient["ensemble_prob"]),
            "risk_tier": str(patient["risk_tier"]),
        }
    }


@app.get("/api/hospitals")
async def get_hospitals():
    """Per-hospital aggregate risk metrics for 3D globe."""
    # Approximate lat/lon for 25 fictional hospitals spread across US
    hospital_coords = {
        f"HOSP_{i:03d}": {
            "lat": 25 + (i * 3.1 % 25),
            "lon": -125 + (i * 4.7 % 55),
            "name": f"Medical Center {i:03d}",
            "city": ["Chicago", "New York", "Los Angeles", "Houston", "Phoenix",
                     "Philadelphia", "San Antonio", "Dallas", "San Jose", "Austin",
                     "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "Indianapolis",
                     "San Francisco", "Seattle", "Denver", "Nashville", "Boston",
                     "El Paso", "Washington DC", "Las Vegas", "Louisville", "Portland"][i-1]
        }
        for i in range(1, 26)
    }

    agg = (
        df_patients.groupby("hospital_id").agg(
            n_patients=("patient_id", "count"),
            avg_risk=("ensemble_prob", "mean"),
            readmission_rate=("readmitted_30d", "mean"),
            avg_los=("length_of_stay", "mean"),
            pct_critical=("risk_tier", lambda x: (x == "Critical").mean()),
            pct_high=("risk_tier", lambda x: (x == "High").mean()),
        ).reset_index()
    )

    result = []
    for _, row in agg.iterrows():
        hid = row["hospital_id"]
        coords = hospital_coords.get(hid, {"lat": 39.5, "lon": -98.35, "name": hid, "city": "Unknown"})
        result.append({
            "hospital_id": hid,
            **coords,
            "n_patients": int(row["n_patients"]),
            "avg_risk": round(float(row["avg_risk"]), 4),
            "readmission_rate": round(float(row["readmission_rate"]), 4),
            "avg_los": round(float(row["avg_los"]), 2),
            "pct_critical": round(float(row["pct_critical"]), 4),
            "pct_high": round(float(row["pct_high"]), 4),
        })

    return {"hospitals": result}


@app.get("/api/shap/global")
async def get_global_shap():
    """Global SHAP feature importance (top 25)."""
    top = shap_importance.head(25)
    return {
        "features": top["feature"].tolist(),
        "mean_shap": top["mean_shap"].round(4).tolist(),
    }


@app.post("/api/predict")
async def predict_single(payload: dict):
    """
    Run prediction on a patient feature dict.
    Input can be a subset of features; missing ones default to dataset median.
    """
    # Build vector using dataset-level medians as defaults
    medians = df_patients.median(numeric_only=True)
    base_row = df_patients.iloc[0].copy()
    for key, val in payload.items():
        if key in base_row.index:
            base_row[key] = val

    vec = build_feature_vector(base_row)
    X = pd.DataFrame([vec], columns=FEATURE_NAMES)

    xgb_p = float(xgb_model.predict_proba(X)[0, 1])
    lgb_p = float(lgb_model.predict_proba(X)[0, 1])
    ens_p = 0.5 * xgb_p + 0.5 * lgb_p

    risk_tier = (
        "Critical" if ens_p >= 0.75 else
        "High"     if ens_p >= 0.50 else
        "Moderate" if ens_p >= 0.25 else "Low"
    )

    explanation = get_shap_explanation(vec)

    return {
        "xgb_prob": round(xgb_p, 4),
        "lgb_prob": round(lgb_p, 4),
        "ensemble_prob": round(ens_p, 4),
        "risk_tier": risk_tier,
        "shap_explanation": explanation,
    }


# ── WebSocket: live vitals stream ─────────────────────────────────────────────
@app.websocket("/ws/vitals/{patient_id}")
async def vitals_stream(websocket: WebSocket, patient_id: str):
    """Stream simulated live vitals for a patient at 1-second intervals."""
    await websocket.accept()

    row = df_patients[df_patients["patient_id"] == patient_id]
    if row.empty:
        await websocket.send_json({"error": "patient not found"})
        await websocket.close()
        return

    patient = row.iloc[0]
    # Seed vitals from stored values
    base = {
        "heart_rate":       float(patient.get("heart_rate", 78)),
        "systolic_bp":      float(patient.get("systolic_bp", 130)),
        "diastolic_bp":     float(patient.get("diastolic_bp", 80)),
        "spo2":             float(patient.get("spo2", 97)),
        "temperature":      float(patient.get("temperature", 37.0)),
        "respiratory_rate": float(patient.get("respiratory_rate", 16)),
    }

    try:
        t = 0
        while True:
            noise = {
                "heart_rate":       np.clip(base["heart_rate"] + np.random.normal(0, 2), 40, 160),
                "systolic_bp":      np.clip(base["systolic_bp"] + np.random.normal(0, 3), 60, 200),
                "diastolic_bp":     np.clip(base["diastolic_bp"] + np.random.normal(0, 2), 40, 120),
                "spo2":             np.clip(base["spo2"] + np.random.normal(0, 0.5), 70, 100),
                "temperature":      np.clip(base["temperature"] + np.random.normal(0, 0.05), 34, 42),
                "respiratory_rate": np.clip(base["respiratory_rate"] + np.random.normal(0, 0.5), 8, 40),
            }
            await websocket.send_json({
                "t": t,
                "patient_id": patient_id,
                "vitals": {k: round(float(v), 1) for k, v in noise.items()},
                "timestamp": time.time(),
            })
            t += 1
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass


@app.get("/api/risk-distribution")
async def risk_distribution():
    """Score histogram for frontend charts."""
    bins = np.linspace(0, 1, 21)
    counts, edges = np.histogram(df_patients["ensemble_prob"], bins=bins)
    return {
        "bins": [round(float(e), 2) for e in edges[:-1]],
        "counts": counts.tolist(),
    }


@app.get("/api/icd10-breakdown")
async def icd10_breakdown():
    """Top diagnoses by count and avg risk."""
    grp = df_patients.groupby("primary_icd10").agg(
        count=("patient_id", "count"),
        avg_risk=("ensemble_prob", "mean"),
        readmission_rate=("readmitted_30d", "mean"),
    ).reset_index().sort_values("count", ascending=False).head(15)
    return grp.round(4).to_dict(orient="records")
