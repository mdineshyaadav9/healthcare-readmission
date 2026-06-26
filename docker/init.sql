-- Healthcare Readmission Risk Platform — DB Schema

CREATE TABLE IF NOT EXISTS patients (
    patient_id          VARCHAR(10) PRIMARY KEY,
    admission_id        VARCHAR(11) UNIQUE NOT NULL,
    hospital_id         VARCHAR(10),
    care_unit           VARCHAR(10),
    age                 INTEGER,
    gender              CHAR(1),
    race                VARCHAR(20),
    insurance           VARCHAR(15),
    primary_icd10       VARCHAR(6),
    comorbidities       TEXT,
    comorbidity_count   INTEGER,
    length_of_stay      INTEGER,
    icu_flag            SMALLINT,
    prior_admissions_1yr INTEGER,
    prior_ed_visits_1yr  INTEGER,
    discharge_disposition VARCHAR(20),
    readmission_risk_score FLOAT,
    readmitted_30d      SMALLINT,
    xgb_prob            FLOAT,
    lgb_prob            FLOAT,
    ensemble_prob       FLOAT,
    risk_tier           VARCHAR(10),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_hospital ON patients(hospital_id);
CREATE INDEX idx_patients_risk_tier ON patients(risk_tier);
CREATE INDEX idx_patients_ensemble_prob ON patients(ensemble_prob DESC);

CREATE TABLE IF NOT EXISTS predictions (
    id              SERIAL PRIMARY KEY,
    patient_id      VARCHAR(10) REFERENCES patients(patient_id),
    model_version   VARCHAR(20) DEFAULT 'v1.0',
    xgb_prob        FLOAT,
    lgb_prob        FLOAT,
    ensemble_prob   FLOAT,
    risk_tier       VARCHAR(10),
    shap_top10      JSONB,
    predicted_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vitals_stream (
    id          BIGSERIAL PRIMARY KEY,
    patient_id  VARCHAR(10),
    heart_rate  FLOAT,
    systolic_bp FLOAT,
    diastolic_bp FLOAT,
    spo2        FLOAT,
    temperature FLOAT,
    resp_rate   FLOAT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vitals_patient ON vitals_stream(patient_id, recorded_at DESC);
