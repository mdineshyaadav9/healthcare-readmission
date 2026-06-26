import React from 'react';
import { useApi } from '../hooks/useApi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

export default function Explainability() {
  const { data: shap, loading } = useApi('/api/shap/global');
  const { data: icd }           = useApi('/api/icd10-breakdown');

  const shapData = shap
    ? shap.features.map((f, i) => ({ feature: f, importance: +shap.mean_shap[i].toFixed(4) }))
    : [];

  const max = shapData[0]?.importance || 1;

  const icdData = icd
    ? icd.slice(0, 12).map(d => ({
        code: d.primary_icd10,
        risk: +d.avg_risk.toFixed(3),
        rate: +(d.readmission_rate * 100).toFixed(1),
      }))
    : [];

  function barColor(v) {
    const t = v / max;
    if (t > 0.7) return '#ef4444';
    if (t > 0.4) return '#f59e0b';
    if (t > 0.2) return '#60a5fa';
    return '#10b981';
  }

  return (
    <div>
      <h1 style={h1}>Explainability</h1>
      <p style={sub}>Global SHAP feature importance (TreeExplainer on XGBoost · 5,000-patient sample)</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        {/* Global SHAP bar chart */}
        <div style={card}>
          <SectionLabel>Mean |SHAP| — top 20 features</SectionLabel>
          {loading
            ? <Loader />
            : <ResponsiveContainer width="100%" height={420}>
                <BarChart data={shapData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#4a6785', fontSize: 10 }} />
                  <YAxis type="category" dataKey="feature" tick={{ fill: '#9ca3af', fontSize: 10, fontFamily: 'monospace' }} width={170} />
                  <Tooltip
                    contentStyle={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }}
                    formatter={v => [v.toFixed(4), 'Mean |SHAP|']}
                  />
                  <Bar dataKey="importance" radius={[0, 3, 3, 0]}>
                    {shapData.map((d, i) => <Cell key={i} fill={barColor(d.importance)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Manual waterfall for a sample patient */}
          <div style={card}>
            <SectionLabel>Patient-level SHAP — P000078 (Critical, score 0.97)</SectionLabel>
            <p style={{ fontSize: 11, color: '#2d4a6a', marginBottom: 12 }}>
              Male · 83y · A41 Sepsis · ICU · 21 days LOS · SNF discharge
            </p>
            {[
              { feat: 'age (83)',                    val: +0.41 },
              { feat: 'lactate (4.2)',               val: +0.31 },
              { feat: 'length_of_stay (21)',         val: +0.22 },
              { feat: 'icu_flag (1)',                val: +0.19 },
              { feat: 'primary_icd10_A41 (Sepsis)',  val: +0.17 },
              { feat: 'albumin (2.1)',               val: +0.15 },
              { feat: 'prior_admissions_1yr (1)',    val: +0.09 },
              { feat: 'discharge_disposition_Rehab', val: -0.08 },
              { feat: 'spo2 (97.2)',                 val: -0.05 },
            ].map((s, i) => {
              const pct = Math.min(100, Math.abs(s.val) / 0.45 * 100);
              return (
                <div key={i} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{s.feat}</span>
                    <span style={{ color: s.val > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                      {s.val > 0 ? '+' : ''}{s.val.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ height: 5, background: '#1e2d3d', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: pct + '%', height: '100%', borderRadius: 3,
                      background: s.val > 0 ? '#ef4444' : '#10b981',
                      marginLeft: s.val > 0 ? 0 : 'auto',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Avg risk by ICD */}
          <div style={card}>
            <SectionLabel>Avg model risk by primary ICD-10</SectionLabel>
            {icd
              ? <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={icdData} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" vertical={false} />
                    <XAxis dataKey="code" tick={{ fill: '#4a6785', fontSize: 10 }} />
                    <YAxis domain={[0, 1]} tick={{ fill: '#4a6785', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }}
                      formatter={(v, n) => [n === 'risk' ? v.toFixed(3) : v + '%', n === 'risk' ? 'Avg risk score' : 'Readmission %']}
                    />
                    <Bar dataKey="risk" name="risk" radius={[3, 3, 0, 0]}>
                      {icdData.map((d, i) => <Cell key={i} fill={barColor(d.risk)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              : <Loader />}
          </div>
        </div>
      </div>

      {/* Feature guide */}
      <div style={card}>
        <SectionLabel>Feature engineering reference</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, fontSize: 11 }}>
          {[
            ['shock_index', 'heart_rate / systolic_bp — proxy for hemodynamic instability'],
            ['albumin_creatinine_ratio', 'albumin / creatinine — nutritional + renal combined'],
            ['age_los_interaction', 'age × length_of_stay — compound frailty signal'],
            ['prior_admissions_ed_total', 'prior_admissions_1yr + prior_ed_visits_1yr'],
            ['elevated_lactate', 'Binary: lactate > 2.0 — tissue hypoperfusion marker'],
            ['low_albumin', 'Binary: albumin < 3.5 — malnutrition / inflammation marker'],
            ['high_inr', 'Binary: INR > 1.5 — coagulopathy flag'],
            ['hypotension', 'Binary: systolic_bp < 90 — shock indicator'],
            ['pulse_pressure', 'systolic_bp − diastolic_bp — cardiac output proxy'],
          ].map(([feat, desc]) => (
            <div key={feat} style={{ background: '#0a0e1a', borderRadius: 7, padding: '10px 12px', border: '1px solid #1a2332' }}>
              <div style={{ fontFamily: 'monospace', color: '#60a5fa', marginBottom: 4 }}>{feat}</div>
              <div style={{ color: '#4a6785', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>{children}</div>;
}
function Loader() {
  return <div style={{ color: '#2d4a6a', fontSize: 12, padding: '30px 0', textAlign: 'center' }}>Loading...</div>;
}

const card = { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '18px 20px' };
const h1   = { fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 };
const sub  = { fontSize: 13, color: '#4a6785', marginBottom: 24 };
