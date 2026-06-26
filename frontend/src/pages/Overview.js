import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import KpiCard from '../components/KpiCard';
import { useApi } from '../hooks/useApi';

const TIER_COLORS = ['#ef4444', '#f59e0b', '#60a5fa', '#10b981'];

export default function Overview() {
  const { data: stats, loading: sL } = useApi('/api/stats');
  const { data: icd,   loading: iL } = useApi('/api/icd10-breakdown');
  const { data: dist,  loading: dL } = useApi('/api/risk-distribution');

  if (sL || !stats) return <Loader />;

  const tierData = [
    { name: 'Critical', value: stats.by_risk_tier['Critical'] || 0 },
    { name: 'High',     value: stats.by_risk_tier['High']     || 0 },
    { name: 'Moderate', value: stats.by_risk_tier['Moderate'] || 0 },
    { name: 'Low',      value: stats.by_risk_tier['Low']      || 0 },
  ];

  const distData = dist ? dist.bins.map((b, i) => ({ bin: (b * 100).toFixed(0) + '%', count: dist.counts[i] })) : [];
  const icdData  = icd  ? icd.slice(0, 10).map(d => ({ code: d.primary_icd10, rate: +(d.readmission_rate * 100).toFixed(1) })) : [];

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>Overview</h1>
      <p style={{ fontSize: 13, color: '#4a6785', marginBottom: 24 }}>40,000 patients · 25 hospitals · XGBoost + LightGBM ensemble</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <KpiCard label="Total patients"     value={stats.total_patients.toLocaleString()}              sub="MIMIC-III synthetic cohort" />
        <KpiCard label="30-day readmission" value={`${(stats.readmission_rate * 100).toFixed(1)}%`}    sub="patients readmitted"        color="#ef4444" />
        <KpiCard label="Avg risk score"     value={stats.avg_risk_score.toFixed(3)}                    sub="Ensemble probability"       color="#f59e0b" />
        <KpiCard label="Model CV AUC"       value={stats.model_auc_cv.toFixed(4)}                      sub="5-fold stratified"          color="#10b981" />
        <KpiCard label="Avg length of stay" value={`${stats.avg_length_of_stay.toFixed(1)}d`}          sub="All admissions" />
        <KpiCard label="Hospitals"          value={stats.n_hospitals}                                  sub="Across US"                  color="#a78bfa" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div style={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 16 }}>Risk tier distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={tierData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                {tierData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }} formatter={(v) => [v.toLocaleString(), 'patients']} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
            {tierData.map((t, i) => (
              <span key={t.name} style={{ fontSize: 11, color: TIER_COLORS[i], display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: TIER_COLORS[i], display: 'inline-block' }} />
                {t.name}: {t.value.toLocaleString()}
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 16 }}>ICD-10 readmission rate (top 10)</div>
          {iL ? <Loader /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={icdData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#4a6785', fontSize: 11 }} tickFormatter={v => v + '%'} />
                <YAxis type="category" dataKey="code" tick={{ fill: '#9ca3af', fontSize: 11 }} width={36} />
                <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }} formatter={(v) => [v + '%', 'Readmission rate']} />
                <Bar dataKey="rate" fill="#60a5fa" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 16 }}>Risk score distribution (40,000 patients)</div>
        {dL ? <Loader /> : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={distData} margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" vertical={false} />
              <XAxis dataKey="bin" tick={{ fill: '#4a6785', fontSize: 10 }} interval={2} />
              <YAxis tick={{ fill: '#4a6785', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {distData.map((_, i) => {
                  const r = i / distData.length;
                  const fill = r >= 0.75 ? '#ef4444' : r >= 0.5 ? '#f59e0b' : r >= 0.25 ? '#60a5fa' : '#10b981';
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Loader() {
  return <div style={{ color: '#2d4a6a', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading...</div>;
}
