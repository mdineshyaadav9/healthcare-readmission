import React from 'react';

const NAV = [
  { id: 'overview',      label: 'Overview',        icon: '⬡' },
  { id: 'patients',      label: 'Patients',         icon: '👤' },
  { id: 'hospitals',     label: 'Hospital Network', icon: '🏥' },
  { id: 'explainability',label: 'Explainability',   icon: '🔍' },
  { id: 'vitals',        label: 'Live Vitals',      icon: '♥' },
  { id: 'predict',       label: 'Predict',          icon: '⚡' },
];

const s = {
  sidebar: {
    width: 220,
    minHeight: '100vh',
    background: '#0d1117',
    borderRight: '1px solid #1e2d3d',
    display: 'flex',
    flexDirection: 'column',
    padding: '0',
    position: 'fixed',
    top: 0, left: 0, bottom: 0,
    zIndex: 100,
  },
  brand: {
    padding: '24px 20px 20px',
    borderBottom: '1px solid #1e2d3d',
  },
  brandTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e2e8f0',
    letterSpacing: '.04em',
  },
  brandSub: {
    fontSize: 11,
    color: '#4a6785',
    marginTop: 3,
  },
  dot: (color) => ({
    display: 'inline-block',
    width: 6, height: 6,
    borderRadius: '50%',
    background: color,
    marginRight: 4,
  }),
  nav: { padding: '16px 0', flex: 1 },
  item: (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 20px',
    cursor: 'pointer',
    fontSize: 13,
    color: active ? '#60a5fa' : '#4a6785',
    background: active ? 'rgba(96,165,250,0.08)' : 'transparent',
    borderLeft: active ? '2px solid #60a5fa' : '2px solid transparent',
    transition: 'all 0.15s',
    userSelect: 'none',
  }),
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid #1e2d3d',
    fontSize: 11,
    color: '#2d4a6a',
  },
};

export default function Sidebar({ active, onNav }) {
  return (
    <aside style={s.sidebar}>
      <div style={s.brand}>
        <div style={{ marginBottom: 8 }}>
          <span style={s.dot('#10b981')} />
          <span style={s.dot('#ef4444')} />
          <span style={s.dot('#f59e0b')} />
        </div>
        <div style={s.brandTitle}>Readmission Risk</div>
        <div style={s.brandSub}>Clinical Intelligence Platform</div>
      </div>
      <nav style={s.nav}>
        {NAV.map(n => (
          <div key={n.id} style={s.item(active === n.id)} onClick={() => onNav(n.id)}>
            <span style={{ fontSize: 15 }}>{n.icon}</span>
            <span>{n.label}</span>
          </div>
        ))}
      </nav>
      <div style={s.footer}>
        XGBoost · LightGBM · SHAP<br />
        FastAPI · React · Three.js<br />
        n = 40,000 patients
      </div>
    </aside>
  );
}
