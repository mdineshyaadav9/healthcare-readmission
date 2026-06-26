import React from 'react';

export default function KpiCard({ label, value, sub, color = '#60a5fa' }) {
  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #1e2d3d',
      borderRadius: 10,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontSize: 11, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#2d4a6a' }}>{sub}</div>}
    </div>
  );
}
