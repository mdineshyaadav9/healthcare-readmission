# Healthcare 30-Day Readmission Risk Platform

Predicts a patient's 30-day hospital readmission risk using an XGBoost + LightGBM ensemble trained on a synthetic MIMIC-III-style clinical dataset (40,000 patients). SHAP surfaces the top risk drivers behind every prediction. A FastAPI backend serves the model behind a React + Three.js dashboard that renders patient risk across a 25-hospital network, with vitals streamed live over WebSockets — the whole stack containerized for reproducible deployment.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React + Three.js Frontend (port 3000)                          │
│  • 3D hospital globe  • Patient risk table  • SHAP waterfall    │
│  • Live vitals charts (WebSocket)  • ICD-10 breakdown           │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST + WS
┌────────────────────────▼────────────────────────────────────────┐
│  FastAPI Backend (port 8000)                                     │
│  • /api/predict         — single-patient XGB+LGB+SHAP           │
│  • /api/predict/batch   — batch up to 500 patients              │
│  • /api/patients        — paginated filtered list               │
│  • /api/hospitals       — per-hospital risk aggregates          │
│  • /api/shap/global     — global feature importance             │
│  • /ws/vitals/{id}      — 1Hz WebSocket vitals stream           │
└────┬──────────────────┬────────────────────────────┬────────────┘
     │                  │                            │
┌────▼────┐      ┌──────▼──────┐             ┌──────▼──────┐
│Postgres │      │    Redis     │             │    Kafka    │
│(primary)│      │(predictions  │             │(vitals topic│
│patients │      │  cache)      │             │  streaming) │
│vitals   │      └─────────────┘             └─────────────┘
└─────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ML Pipeline (offline, artifacts served by FastAPI)             │
│  data/generate_data.py → ml/train.py → ml/models/              │
│  XGBoost · LightGBM · SHAP TreeExplainer · MLflow tracking      │
└─────────────────────────────────────────────────────────────────┘
```

## Dataset

- **40,000 synthetic patients** modeled after MIMIC-III clinical structure
- **51 raw columns** → **100 engineered features** after one-hot encoding + derived features
- Feature groups:
  - Demographics: age, gender, race, insurance
  - ICD-10 diagnoses: primary + 4 comorbidities per patient (20 distinct codes)
  - Lab values (15): sodium, potassium, creatinine, BUN, glucose, hemoglobin, WBC, platelets, albumin, total bilirubin, AST, ALT, INR, lactate, troponin
  - Vitals (6): heart rate, systolic/diastolic BP, temperature, respiratory rate, SpO2
  - Medications (12 drug classes): ACE inhibitors, beta blockers, diuretics, anticoagulants, etc.
  - Clinical: ICU flag, length of stay, prior admissions (1yr), prior ED visits (1yr), discharge disposition
  - Derived: shock index, pulse pressure, albumin:creatinine ratio, age×LOS interaction, binary flag features
- **Readmission rate: ~36%** (driven by logistic function of real clinical risk factors)
- Covers **25 hospitals** across major US cities

## ML Pipeline

### Models
| Model | Config | CV AUC (5-fold) |
|-------|--------|-----------------|
| XGBoost | 600 trees, lr=0.05, depth=6, subsampling 0.8 | 0.720 ± 0.006 |
| LightGBM | 600 trees, lr=0.05, 63 leaves, subsampling 0.8 | 0.719 ± 0.005 |
| **Ensemble** | 50% XGB + 50% LGB | **0.720** |

### Feature Importance (top SHAP drivers)
1. `age` (0.393)
2. `comorbidity_count` (0.226)
3. `lactate` (0.192)
4. `albumin_creatinine_ratio` (0.191)
5. `prior_admissions_ed_total` (0.183)
6. `age_los_interaction` (0.166)
7. `albumin` (0.143)
8. `icu_flag` (0.101)

### Risk Tiers
| Tier | Score range | Count |
|------|-------------|-------|
| Low | < 0.25 | 10,208 |
| Moderate | 0.25–0.50 | 13,603 |
| High | 0.50–0.75 | 10,459 |
| Critical | ≥ 0.75 | 5,730 |

## Quick Start

### Prerequisites
- Docker + Docker Compose v2
- 8 GB RAM recommended (Kafka + Postgres + API)

### 1. Generate data + train models (one-time)
```bash
pip install -r requirements.txt
python data/generate_data.py     # ~30s, produces 40k patient parquet
python ml/train.py               # ~5min, trains XGB + LGB, saves to ml/models/
```

### 2. Start full stack
```bash
docker compose up -d
```

Services:
- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- MLflow UI: http://localhost:5000
- Postgres: localhost:5432

### 3. Test the API
```bash
# Get dashboard stats
curl http://localhost:8000/api/stats

# Predict risk for a custom patient
curl -X POST http://localhost:8000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"age": 72, "primary_icd10": "I50", "albumin": 2.8, "creatinine": 2.1, "icu_flag": 1, "prior_admissions_1yr": 3}'

# Live vitals stream
wscat -c ws://localhost:8000/ws/vitals/P000008
```

## Project Structure

```
readmission-platform/
├── data/
│   ├── generate_data.py          # Synthetic MIMIC-III generator (40k pts)
│   ├── patients_40k.parquet      # Raw dataset
│   └── patients_with_scores.parquet  # Dataset + model predictions
├── ml/
│   ├── train.py                  # XGBoost + LightGBM + SHAP + MLflow
│   └── models/
│       ├── xgb_model.joblib
│       ├── lgb_model.joblib
│       ├── shap_explainer.joblib
│       ├── feature_names.json
│       └── shap_feature_importance.csv
├── backend/
│   └── main.py                   # FastAPI app (REST + WebSocket)
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Globe3D.jsx        # Three.js hospital network
│   │   │   ├── PatientTable.jsx
│   │   │   ├── ShapWaterfall.jsx
│   │   │   └── VitalsStream.jsx
│   │   └── hooks/
│   │       └── useWebSocket.js
│   └── Dockerfile
├── docker/
│   ├── Dockerfile.api
│   └── init.sql
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats` | GET | Dashboard KPIs |
| `/api/patients` | GET | Paginated list with filters |
| `/api/patients/{id}` | GET | Patient detail + SHAP |
| `/api/hospitals` | GET | Per-hospital aggregates |
| `/api/predict` | POST | Single-patient prediction |
| `/api/shap/global` | GET | Global feature importance |
| `/api/risk-distribution` | GET | Score histogram |
| `/api/icd10-breakdown` | GET | Readmission by diagnosis |
| `/ws/vitals/{patient_id}` | WS | 1Hz vitals stream |

## Extending the Platform

- **Real MIMIC-III data**: Replace `generate_data.py` output with actual MIMIC-III extracts (requires PhysioNet credentialing)
- **More models**: Add CatBoost, neural net, or logistic regression to the ensemble in `ml/train.py`
- **Real-time scoring**: Produce admission events to Kafka topic `new_admissions`, consume in a FastAPI background worker
- **FHIR integration**: Replace custom feature schema with HL7 FHIR R4 Patient + Observation resources
- **Hyperparameter tuning**: Add Optuna sweep in `ml/train.py` before final fit
