"""
Synthetic MIMIC-III-style dataset generator.
Produces ~40,000 patient records with:
  - Demographics
  - ICD-10 diagnosis codes (primary + 4 comorbidities)
  - Lab values (15 panels)
  - Vital signs (6 params)
  - Medication history (12 drug classes)
  - ICU flags, LOS, prior admissions
  - 30-day readmission label (realistic ~22% base rate)
"""

import numpy as np
import pandas as pd
from faker import Faker
import random
import json
from pathlib import Path

fake = Faker()
rng = np.random.default_rng(42)

N = 40_000

# ── ICD-10 groups and their readmission risk multipliers ─────────────────────
ICD10_GROUPS = {
    "I50": ("Heart failure", 2.2),
    "J44": ("COPD", 1.9),
    "N18": ("Chronic kidney disease", 2.0),
    "E11": ("Type 2 diabetes", 1.5),
    "I21": ("Acute MI", 1.8),
    "J18": ("Pneumonia", 1.4),
    "K92": ("GI hemorrhage", 1.6),
    "C34": ("Lung cancer", 1.7),
    "F20": ("Schizophrenia", 1.8),
    "G20": ("Parkinson's disease", 1.6),
    "I63": ("Cerebral infarction", 1.7),
    "K57": ("Diverticular disease", 1.2),
    "M54": ("Back pain", 1.0),
    "Z38": ("Liveborn infant", 0.3),
    "S72": ("Hip fracture", 1.5),
    "A41": ("Sepsis", 2.4),
    "K56": ("Ileus/obstruction", 1.5),
    "I10": ("Hypertension", 1.1),
    "E86": ("Dehydration", 1.1),
    "J96": ("Respiratory failure", 2.3),
}

ICD10_CODES = list(ICD10_GROUPS.keys())

COMORBIDITY_CODES = [
    "I10", "E11", "N18", "J44", "I50", "F32", "M79", "E78",
    "Z79", "K21", "G47", "I48", "E03", "M05", "N40",
]

MEDICATIONS = [
    "ACE_inhibitor", "beta_blocker", "diuretic", "anticoagulant",
    "antibiotic", "insulin", "corticosteroid", "antidepressant",
    "statin", "bronchodilator", "antipsychotic", "opioid_analgesic",
]

HOSPITAL_IDS = [f"HOSP_{i:03d}" for i in range(1, 26)]  # 25 hospitals
UNITS = ["MICU", "SICU", "CCU", "CSRU", "NICU", "MED", "SURG", "ONCO", "PSYCH"]

print("Generating demographics...")
ages = np.clip(rng.normal(65, 18, N).astype(int), 18, 95)
genders = rng.choice(["M", "F"], N)
races = rng.choice(
    ["White", "Black", "Hispanic", "Asian", "Other"],
    N, p=[0.60, 0.17, 0.12, 0.06, 0.05]
)
insurances = rng.choice(
    ["Medicare", "Medicaid", "Private", "Self-pay"],
    N, p=[0.44, 0.18, 0.32, 0.06]
)

print("Assigning diagnoses...")
primary_dx_idx = rng.integers(0, len(ICD10_CODES), N)
primary_dx = [ICD10_CODES[i] for i in primary_dx_idx]
risk_multipliers = np.array([ICD10_GROUPS[c][1] for c in primary_dx])

# 2–5 comorbidities per patient
def random_comorbidities(n, primary):
    pool = [c for c in COMORBIDITY_CODES if c != primary]
    k = rng.integers(1, 5)
    return ",".join(rng.choice(pool, k, replace=False).tolist())

comorbidities = [random_comorbidities(n, primary_dx[n]) for n in range(N)]
comorbidity_count = [len(c.split(",")) for c in comorbidities]

print("Generating lab values...")
# Reference-range-centered, perturbed by illness severity
def labs_for_patient(age, risk_mult):
    severity = rng.uniform(0.8, 1.2) * risk_mult / 2.0
    return {
        "sodium":         np.clip(rng.normal(140 - severity * 5, 4), 120, 160),
        "potassium":      np.clip(rng.normal(4.0 + severity * 0.3, 0.5), 2.5, 7.0),
        "creatinine":     np.clip(rng.exponential(0.9 + severity * 0.6), 0.4, 12.0),
        "bun":            np.clip(rng.normal(16 + severity * 8, 6), 5, 80),
        "glucose":        np.clip(rng.normal(100 + severity * 30, 25), 50, 500),
        "hemoglobin":     np.clip(rng.normal(13 - severity * 1.5, 1.8), 5, 18),
        "wbc":            np.clip(rng.normal(8 + severity * 4, 3), 1, 40),
        "platelets":      np.clip(rng.normal(220 - severity * 30, 60), 20, 700),
        "albumin":        np.clip(rng.normal(4.0 - severity * 0.6, 0.5), 1.5, 5.5),
        "total_bili":     np.clip(rng.exponential(0.8 + severity * 0.8), 0.1, 20),
        "ast":            np.clip(rng.exponential(30 + severity * 20), 5, 500),
        "alt":            np.clip(rng.exponential(28 + severity * 18), 5, 400),
        "inr":            np.clip(rng.normal(1.1 + severity * 0.5, 0.3), 0.8, 8.0),
        "lactate":        np.clip(rng.exponential(1.2 + severity * 1.0), 0.4, 12),
        "troponin":       np.clip(rng.exponential(0.02 + severity * 0.15), 0.001, 5),
    }

lab_rows = [labs_for_patient(ages[i], risk_multipliers[i]) for i in range(N)]
labs_df = pd.DataFrame(lab_rows)

print("Generating vitals...")
def vitals_for_patient(age, risk_mult):
    sev = rng.uniform(0.8, 1.2) * risk_mult / 2.0
    return {
        "heart_rate":      np.clip(rng.normal(78 + sev * 12, 12), 40, 160),
        "systolic_bp":     np.clip(rng.normal(130 - sev * 8, 18), 60, 220),
        "diastolic_bp":    np.clip(rng.normal(80 - sev * 4, 12), 40, 130),
        "temperature":     np.clip(rng.normal(37.0 + sev * 0.5, 0.5), 34, 41),
        "respiratory_rate":np.clip(rng.normal(16 + sev * 4, 3), 8, 40),
        "spo2":            np.clip(rng.normal(97 - sev * 3, 2), 70, 100),
    }

vital_rows = [vitals_for_patient(ages[i], risk_multipliers[i]) for i in range(N)]
vitals_df = pd.DataFrame(vital_rows)

print("Generating medications and hospital stay features...")
med_matrix = rng.binomial(1, 0.35, (N, len(MEDICATIONS)))
meds_df = pd.DataFrame(med_matrix, columns=[f"med_{m}" for m in MEDICATIONS])

los = np.clip(rng.exponential(5.5 + risk_multipliers * 0.8), 1, 45).astype(int)
icu_flag = (rng.random(N) < (0.15 + (risk_multipliers - 1) * 0.12)).astype(int)
prior_admissions_1yr = rng.poisson(lam=risk_multipliers * 0.8).clip(0, 10)
prior_ed_visits_1yr  = rng.poisson(lam=risk_multipliers * 0.6).clip(0, 10)
hospital_ids = rng.choice(HOSPITAL_IDS, N)
care_units   = rng.choice(UNITS, N)
discharge_disposition = rng.choice(
    ["Home", "Home_Health", "SNF", "Rehab", "AMA", "Expired"],
    N, p=[0.45, 0.22, 0.18, 0.10, 0.03, 0.02]
)

print("Computing readmission labels (realistic ~21-23% rate)...")
# Logistic-style label generation driven by real risk factors
log_odds = (
    -2.5
    + 0.03  * (ages - 65)
    + 0.5   * (risk_multipliers - 1.0)
    + 0.25  * np.array(comorbidity_count)
    + 0.4   * np.log1p(prior_admissions_1yr)
    + 0.2   * np.log1p(prior_ed_visits_1yr)
    + 0.3   * icu_flag
    + 0.05  * (los - 5).clip(0)
    - 0.4   * (labs_df["albumin"].values - 3.5)
    + 0.3   * (labs_df["creatinine"].values - 1.0).clip(0)
    + 0.2   * (labs_df["lactate"].values - 2.0).clip(0)
    - 0.03  * (vitals_df["spo2"].values - 95).clip(None, 0)
    + 0.4   * (discharge_disposition == "AMA").astype(int)
    - 0.3   * (discharge_disposition == "Rehab").astype(int)
    + rng.normal(0, 0.3, N)   # residual noise
)

probs = 1 / (1 + np.exp(-log_odds))
readmitted_30d = (rng.random(N) < probs).astype(int)
print(f"  Readmission rate: {readmitted_30d.mean():.3f} ({readmitted_30d.sum():,} / {N:,})")

print("Assembling master dataframe...")
patient_ids = [f"P{i:06d}" for i in range(N)]
admission_ids = [f"ADM{i:07d}" for i in range(N)]

core = pd.DataFrame({
    "patient_id":             patient_ids,
    "admission_id":           admission_ids,
    "hospital_id":            hospital_ids,
    "care_unit":              care_units,
    "age":                    ages,
    "gender":                 genders,
    "race":                   races,
    "insurance":              insurances,
    "primary_icd10":          primary_dx,
    "comorbidities":          comorbidities,
    "comorbidity_count":      comorbidity_count,
    "length_of_stay":         los,
    "icu_flag":               icu_flag,
    "prior_admissions_1yr":   prior_admissions_1yr,
    "prior_ed_visits_1yr":    prior_ed_visits_1yr,
    "discharge_disposition":  discharge_disposition,
    "readmission_risk_score": np.round(probs, 4),
    "readmitted_30d":         readmitted_30d,
})

df = pd.concat([core, labs_df.round(3), vitals_df.round(1), meds_df], axis=1)

out = Path(__file__).parent
df.to_parquet(out / "patients_40k.parquet", index=False)
df.to_csv(out / "patients_40k.csv", index=False)

print(f"\n✅ Dataset saved: {len(df):,} rows × {len(df.columns)} columns")
print(f"   Parquet: {(out / 'patients_40k.parquet').stat().st_size / 1e6:.1f} MB")
print(f"   CSV:     {(out / 'patients_40k.csv').stat().st_size / 1e6:.1f} MB")
print(f"\nColumn groups:")
print(f"  Core/demographic: {len(core.columns)}")
print(f"  Lab features:     {len(labs_df.columns)}")
print(f"  Vital features:   {len(vitals_df.columns)}")
print(f"  Medication flags: {len(meds_df.columns)}")
print(f"  Total features:   {len(df.columns) - 4}")  # exclude IDs + label
