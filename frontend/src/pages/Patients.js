import React, { useState } from 'react';
import { useApi, api } from '../hooks/useApi';
import TierBadge from '../components/TierBadge';

const ICD_NAMES = {
  I50:'Heart failure', J44:'COPD', N18:'CKD', E11:'Type 2 DM',
  I21:'Acute MI', J18:'Pneumonia', K92:'GI Hemorrhage', A41:'Sepsis',
  J96:'Resp. failure', I63:'Stroke', S72:'Hip fracture', I10:'Hypertension',
  E86:'Dehydration', Z38:'Newborn', M54:'Back pain', G20:'Parkinson\'s',
  F20:'Schizophrenia', C34:'Lung cancer', K57:'Diverticular', K56:'Ileus',
};

function riskColor(r) {
  if (r >= 0.75) return '#ef4444';
  if (r >= 0.50) return '#f59e0b';
  if (r >= 0.25) return '#60a5fa';
  return '#10b981';
}

export default function Patients() {
  const [tier, setTier]     = useState('');
  const [sort, setSort]     = useState('desc');
  const [page, setPage]     = useState(1);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { data, loading } = useApi('/api/patients', {
    page, page_size: 50,
    risk_tier: tier || undefined,
    sort_by: 'ensemble_prob',
    sort_dir: sort,
  });

  const openPatient = async (p) => {
    setSelected(p);
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/patients/${p.patient_id}`);
      setDetail(res.data);
    } catch (e) { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={h1}>Patients</h1>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <select value={tier} onChange={e => { setTier(e.target.value); setPage(1); }} style={sel}>
            <option value="">All tiers</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} style={sel}>
            <option value="desc">Risk ↓</option>
            <option value="asc">Risk ↑</option>
          </select>
          {data && (
            <span style={{ fontSize: 12, color: '#4a6785', alignSelf: 'center', marginLeft: 4 }}>
              {data.total.toLocaleString()} patients
            </span>
          )}
        </div>

        {/* Table */}
        <div style={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0a0e1a' }}>
                {['Patient', 'Hospital', 'Age', 'Primary Dx', 'LOS', 'ICU', 'Risk', 'Tier'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#2d4a6a' }}>Loading...</td></tr>
                : data?.patients.map(p => (
                  <tr key={p.patient_id}
                    onClick={() => openPatient(p)}
                    style={{ borderBottom: '1px solid #1a2332', cursor: 'pointer',
                      background: selected?.patient_id === p.patient_id ? 'rgba(96,165,250,0.06)' : 'transparent' }}>
                    <td style={td}><span style={{ fontFamily: 'monospace', fontSize: 11, color: '#60a5fa' }}>{p.patient_id}</span></td>
                    <td style={td}><span style={{ fontSize: 11, color: '#4a6785' }}>{p.hospital_id}</span></td>
                    <td style={td}>{p.age}</td>
                    <td style={td}>
                      <span title={ICD_NAMES[p.primary_icd10]} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {p.primary_icd10}
                      </span>
                    </td>
                    <td style={td}>{p.length_of_stay}d</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.icu_flag ? '🔴' : '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 50, height: 5, background: '#1e2d3d', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${(p.ensemble_prob * 100).toFixed(0)}%`, height: '100%', background: riskColor(p.ensemble_prob), borderRadius: 3 }} />
                        </div>
                        <span style={{ color: riskColor(p.ensemble_prob), fontWeight: 600 }}>{p.ensemble_prob.toFixed(3)}</span>
                      </div>
                    </td>
                    <td style={td}><TierBadge tier={p.risk_tier} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btn}>← Prev</button>
            <span style={{ fontSize: 12, color: '#4a6785' }}>Page {page} of {data.pages}</span>
            <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} style={btn}>Next →</button>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div style={{
          width: 320, background: '#0d1117', border: '1px solid #1e2d3d',
          borderRadius: 10, padding: 20, flexShrink: 0, alignSelf: 'flex-start',
          position: 'sticky', top: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Patient detail</span>
            <button onClick={() => { setSelected(null); setDetail(null); }}
              style={{ background: 'none', border: 'none', color: '#4a6785', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>

          {detailLoading
            ? <div style={{ color: '#2d4a6a', fontSize: 12 }}>Loading SHAP...</div>
            : detail && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#60a5fa' }}>{selected.patient_id}</span>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <TierBadge tier={selected.risk_tier} />
                    <span style={{ fontSize: 11, color: '#4a6785' }}>Age {selected.age} · {selected.gender === 'M' ? 'Male' : 'Female'}</span>
                  </div>
                </div>

                {/* Risk scores */}
                <div style={{ marginBottom: 16 }}>
                  <Label>Risk scores</Label>
                  <Row label="XGBoost" val={detail.risk_summary.xgb_prob.toFixed(4)} />
                  <Row label="LightGBM" val={detail.risk_summary.lgb_prob.toFixed(4)} />
                  <Row label="Ensemble" val={<strong style={{ color: riskColor(detail.risk_summary.ensemble_prob) }}>{detail.risk_summary.ensemble_prob.toFixed(4)}</strong>} />
                </div>

                {/* SHAP explanation */}
                <div>
                  <Label>Top SHAP drivers</Label>
                  {detail.shap_explanation.map((s, i) => (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                        <span style={{ fontFamily: 'monospace', color: '#9ca3af', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.feature}
                        </span>
                        <span style={{ color: s.shap_value > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                          {s.shap_value > 0 ? '+' : ''}{s.shap_value.toFixed(3)}
                        </span>
                      </div>
                      <div style={{ height: 4, background: '#1e2d3d', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, Math.abs(s.shap_value) / 0.5 * 100)}%`,
                          height: '100%',
                          background: s.shap_value > 0 ? '#ef4444' : '#10b981',
                          borderRadius: 2,
                          marginLeft: s.shap_value > 0 ? 0 : 'auto',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Clinical summary */}
                <div style={{ marginTop: 16 }}>
                  <Label>Clinical summary</Label>
                  <Row label="Primary Dx" val={`${selected.primary_icd10} — ${ICD_NAMES[selected.primary_icd10] || 'Unknown'}`} />
                  <Row label="LOS" val={`${selected.length_of_stay} days`} />
                  <Row label="ICU" val={selected.icu_flag ? 'Yes 🔴' : 'No'} />
                  <Row label="Discharge" val={selected.discharge_disposition} />
                  <Row label="Hospital" val={selected.hospital_id} />
                  <Row label="Readmitted" val={selected.readmitted_30d ? 'Yes' : 'No'} />
                </div>
              </>
            )}
        </div>
      )}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 10, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{children}</div>;
}
function Row({ label, val }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5, color: '#9ca3af' }}>
      <span style={{ color: '#4a6785' }}>{label}</span>
      <span>{val}</span>
    </div>
  );
}

const h1 = { fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 16 };
const sel = { background: '#0d1117', border: '1px solid #1e2d3d', color: '#9ca3af', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' };
const btn = { background: '#0d1117', border: '1px solid #1e2d3d', color: '#9ca3af', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' };
const th  = { padding: '10px 12px', textAlign: 'left', fontSize: 10, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 };
const td  = { padding: '9px 12px', color: '#9ca3af' };
