import React, { useState } from 'react';
import { api } from '../hooks/useApi';
import TierBadge from '../components/TierBadge';

const DEFAULTS = {
  age: 68, primary_icd10: 'I50', gender: 'M', icu_flag: 0,
  length_of_stay: 6, prior_admissions_1yr: 1, prior_ed_visits_1yr: 0,
  albumin: 3.2, creatinine: 1.4, lactate: 1.8, spo2: 96,
  heart_rate: 88, systolic_bp: 118, comorbidity_count: 2,
};

const ICD_OPTIONS = [
  ['I50','Heart failure'], ['A41','Sepsis'], ['J96','Resp. failure'],
  ['J44','COPD'], ['N18','CKD'], ['I21','Acute MI'], ['E11','Type 2 DM'],
  ['I10','Hypertension'], ['J18','Pneumonia'], ['K92','GI Hemorrhage'],
  ['S72','Hip fracture'], ['I63','Stroke'], ['E86','Dehydration'],
];

function riskColor(r) {
  if (r >= 0.75) return '#ef4444';
  if (r >= 0.50) return '#f59e0b';
  if (r >= 0.25) return '#60a5fa';
  return '#10b981';
}

export default function Predict() {
  const [form, setForm] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError(null);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach(k => {
        const v = payload[k];
        if (!isNaN(v) && v !== '') payload[k] = +v;
      });
      const res = await api.post('/api/predict', payload);
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h1 style={h1}>Live Prediction</h1>
      <p style={sub}>Enter patient features below — the ensemble model returns a readmission risk score and SHAP explanation in real time.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Form */}
        <div style={card}>
          <SectionLabel>Patient features</SectionLabel>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Age">
              <input type="number" value={form.age} onChange={e => set('age', e.target.value)} style={inp} min={18} max={95} />
            </Field>
            <Field label="Gender">
              <select value={form.gender} onChange={e => set('gender', e.target.value)} style={inp}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </Field>
            <Field label="Primary ICD-10">
              <select value={form.primary_icd10} onChange={e => set('primary_icd10', e.target.value)} style={inp}>
                {ICD_OPTIONS.map(([c, l]) => <option key={c} value={c}>{c} — {l}</option>)}
              </select>
            </Field>
            <Field label="ICU stay">
              <select value={form.icu_flag} onChange={e => set('icu_flag', e.target.value)} style={inp}>
                <option value={0}>No</option>
                <option value={1}>Yes</option>
              </select>
            </Field>
            <Field label="Length of stay (days)">
              <input type="number" value={form.length_of_stay} onChange={e => set('length_of_stay', e.target.value)} style={inp} min={1} max={60} />
            </Field>
            <Field label="Prior admissions (1yr)">
              <input type="number" value={form.prior_admissions_1yr} onChange={e => set('prior_admissions_1yr', e.target.value)} style={inp} min={0} max={20} />
            </Field>
            <Field label="Prior ED visits (1yr)">
              <input type="number" value={form.prior_ed_visits_1yr} onChange={e => set('prior_ed_visits_1yr', e.target.value)} style={inp} min={0} max={20} />
            </Field>
            <Field label="Comorbidity count">
              <input type="number" value={form.comorbidity_count} onChange={e => set('comorbidity_count', e.target.value)} style={inp} min={0} max={10} />
            </Field>
          </div>

          <div style={{ marginTop: 16 }}>
            <SectionLabel>Lab values</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Albumin (g/dL)">
                <input type="number" step="0.1" value={form.albumin} onChange={e => set('albumin', e.target.value)} style={inp} />
              </Field>
              <Field label="Creatinine (mg/dL)">
                <input type="number" step="0.1" value={form.creatinine} onChange={e => set('creatinine', e.target.value)} style={inp} />
              </Field>
              <Field label="Lactate (mmol/L)">
                <input type="number" step="0.1" value={form.lactate} onChange={e => set('lactate', e.target.value)} style={inp} />
              </Field>
              <Field label="SpO₂ (%)">
                <input type="number" step="0.1" value={form.spo2} onChange={e => set('spo2', e.target.value)} style={inp} />
              </Field>
              <Field label="Heart rate (bpm)">
                <input type="number" value={form.heart_rate} onChange={e => set('heart_rate', e.target.value)} style={inp} />
              </Field>
              <Field label="Systolic BP (mmHg)">
                <input type="number" value={form.systolic_bp} onChange={e => set('systolic_bp', e.target.value)} style={inp} />
              </Field>
            </div>
          </div>

          {error && <div style={{ marginTop: 14, fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: 7, padding: '8px 12px' }}>{error}</div>}

          <button onClick={submit} disabled={loading} style={{
            marginTop: 20, width: '100%', padding: '12px',
            background: loading ? '#1e2d3d' : '#1d4ed8',
            border: 'none', borderRadius: 8, color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}>
            {loading ? 'Predicting...' : '⚡ Predict readmission risk'}
          </button>
        </div>

        {/* Result */}
        <div>
          {!result && !loading && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#2d4a6a', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>⚡</div>
              <div style={{ fontSize: 13 }}>Fill in patient features and click Predict</div>
            </div>
          )}

          {loading && (
            <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#4a6785' }}>
              Running XGBoost + LightGBM ensemble...
            </div>
          )}

          {result && !loading && (
            <>
              {/* Score card */}
              <div style={{ ...card, marginBottom: 14 }}>
                <SectionLabel>Readmission risk</SectionLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 52, fontWeight: 700, color: riskColor(result.ensemble_prob), fontVariantNumeric: 'tabular-nums' }}>
                      {(result.ensemble_prob * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: '#4a6785' }}>30-day readmission probability</div>
                  </div>
                  <div>
                    <TierBadge tier={result.risk_tier} />
                    <div style={{ marginTop: 12, fontSize: 11, color: '#4a6785' }}>
                      <div style={{ marginBottom: 4 }}>XGBoost:  <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{result.xgb_prob.toFixed(4)}</span></div>
                      <div>LightGBM: <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{result.lgb_prob.toFixed(4)}</span></div>
                    </div>
                  </div>
                </div>

                {/* Risk bar */}
                <div style={{ height: 10, background: '#1e2d3d', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(result.ensemble_prob * 100).toFixed(0)}%`,
                    height: '100%', borderRadius: 5,
                    background: riskColor(result.ensemble_prob),
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#2d4a6a', marginTop: 4 }}>
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>

              {/* SHAP */}
              <div style={card}>
                <SectionLabel>Top SHAP drivers for this patient</SectionLabel>
                {result.shap_explanation.map((s, i) => {
                  const pct = Math.min(100, Math.abs(s.shap_value) / 0.5 * 100);
                  return (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'monospace', color: '#9ca3af', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.feature}</span>
                        <span style={{ fontWeight: 600, color: s.shap_value > 0 ? '#ef4444' : '#10b981' }}>
                          {s.shap_value > 0 ? '+' : ''}{s.shap_value.toFixed(3)}
                        </span>
                      </div>
                      <div style={{ height: 5, background: '#1e2d3d', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: s.shap_value > 0 ? '#ef4444' : '#10b981' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#4a6785', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>{children}</div>;
}

const card = { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '18px 20px' };
const h1   = { fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 };
const sub  = { fontSize: 13, color: '#4a6785', marginBottom: 24 };
const inp  = { width: '100%', background: '#0a0e1a', border: '1px solid #1e2d3d', borderRadius: 6, padding: '7px 10px', color: '#e2e8f0', fontSize: 12, outline: 'none' };
