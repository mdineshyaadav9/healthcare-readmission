import React from 'react';

const COLORS = {
  Critical: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  High:     { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  Moderate: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' },
  Low:      { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
};

export default function TierBadge({ tier }) {
  const c = COLORS[tier] || COLORS.Low;
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      borderRadius: 5,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
    }}>
      {tier}
    </span>
  );
}

export { COLORS };
