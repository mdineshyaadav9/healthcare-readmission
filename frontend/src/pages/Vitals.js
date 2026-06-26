import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { useVitals } from '../hooks/useVitals';
import { useApi } from '../hooks/useApi';
import TierBadge from '../components/TierBadge';

const VITALS_META = [
  { key: 'heart_rate',        label: 'Heart rate',    unit: 'bpm',  normal: [60, 100],  color: '#ef4444' },
  { key: 'systolic_bp',       label: 'Systolic BP',   unit: 'mmHg', normal: [90, 140],  color: '#f59e0b' },
  { key: 'diastolic_bp',      label: 'Diastolic BP',  unit: 'mmHg', normal: [60, 90],   color: '#f59e0b' },
  { key: 'spo2',              label: 'SpO₂',          unit: '%',    normal: [95, 100],  color: '#60a5fa' },
  { key: 'temperature',       label: 'Temperature',   unit: '°C',   normal: [36, 37.5], color: '#a78bfa' },
  { key: 'respiratory_rate',  label: 'Resp. rate',    unit: '/min', normal: [12, 20],   color: '#10b981' },
];

function isAbnormal(key, val) {
  const m = VITALS_META.find(v => v.key === key);
  if (!m || val === undefined) return false;
  return val < m.normal[0] || val > m.normal[1];
}

export default function Vitals() {
  const { data: pts } = useApi('/api/patients', { risk_tier: 'Critical', page_size: 10 });
  const [patientId, setPatientId] = useState('P000008');
  const [selectedPt, setSelectedPt] = useState(null);
  const { vitals, history, connected } = useVitals(patientId);

  const patients = pts?.patients || [];

  const chartData = history.ts.map((t, i) => ({
    t,
    hr:   history.hr[i]   ? +history.hr[i].toFixed(1)   : null,
    spo2: history.spo2[i] ? +history.spo2[i].toFixed(1) : null,
  }));

  return (
    <div>
      <h1 style={h1}>Live Vitals</h1>
      <p style={sub}>WebSocket stream · 1Hz · select any Critical patient below</p>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18 }}>
        {/* Patient selector */}
        <div style={card}>
          <Label>Critical patients</Label>
          {patients.map(p => (
            <div key={p.patient_id}
              onClick={() => { setPatientId(p.patient_id); setSelectedPt(p); }}
              style={{
                padding: '9px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 4,
                background: patientId === p.patient_id ? 'rgba(96,165,250,0.1)' : 'transparent',
                border: `1px solid ${patientId === p.patient_id ? '#1e4a7a' : 'transparent'}`,
              }}>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#60a5fa' }}>{p.patient_id}</div>
              <div style={{ fontSize: 10, color: '#4a6785', marginTop: 2 }}>
                Age {p.age} · {p.primary_icd10} · {p.hospital_id}
              </div>
              <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
                Risk: {p.ensemble_prob.toFixed(3)}
              </div>
            </div>
          ))}
        </div>

        {/* Vitals panel */}
        <div>
          {/* Status bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? '#10b981' : '#ef4444',
              boxShadow: connected ? '0 0 6px #10b981' : 'none',
            }} />
            <span style={{ fontSize: 12, color: connected ? '#10b981' : '#ef4444' }}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <span style={{ fontSize: 12, color: '#4a6785' }}>
              Patient: <span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>{patientId}</span>
            </span>
            {selectedPt && <TierBadge tier={selectedPt.risk_tier || 'Critical'} />}
          </div>

          {/* Vital cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {VITALS_META.map(m => {
              const val = vitals?.[m.key];
              const abnormal = isAbnormal(m.key, val);
              return (
                <div key={m.key} style={{
                  background: '#0d1117', border: `1px solid ${abnormal ? m.color + '55' : '#1e2d3d'}`,
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 10, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: abnormal ? m.color : '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                    {val !== undefined ? val.toFixed(m.key === 'temperature' || m.key === 'spo2' ? 1 : 0) : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#2d4a6a', marginTop: 2 }}>
                    {m.unit} · normal {m.normal[0]}–{m.normal[1]}
                    {abnormal && <span style={{ color: m.color, marginLeft: 6 }}>⚠ abnormal</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* HR chart */}
          <div style={{ ...card, marginBottom: 14 }}>
            <Label>Heart rate — 60s window</Label>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={chartData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
                <XAxis dataKey="t" tick={{ fill: '#4a6785', fontSize: 10 }} />
                <YAxis domain={[50, 150]} tick={{ fill: '#4a6785', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }}
                  formatter={v => [v?.toFixed(0) + ' bpm', 'HR']}
                />
                <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* SpO2 chart */}
          <div style={card}>
            <Label>SpO₂ — 60s window</Label>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={chartData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
                <XAxis dataKey="t" tick={{ fill: '#4a6785', fontSize: 10 }} />
                <YAxis domain={[80, 100]} tick={{ fill: '#4a6785', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }}
                  formatter={v => [v?.toFixed(1) + '%', 'SpO₂']}
                />
                <Line type="monotone" dataKey="spo2" stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>{children}</div>;
}

const card = { background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '16px 18px' };
const h1   = { fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 };
const sub  = { fontSize: 13, color: '#4a6785', marginBottom: 20 };
