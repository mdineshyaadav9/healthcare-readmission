import { useState, useEffect, useRef } from 'react';

const WS = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';

export function useVitals(patientId) {
  const [vitals, setVitals] = useState(null);
  const [history, setHistory] = useState({ hr: [], spo2: [], ts: [] });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!patientId) return;

    const ws = new WebSocket(`${WS}/ws/vitals/${patientId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.error) return;
      setVitals(msg.vitals);
      setHistory(prev => {
        const MAX = 60;
        const hr  = [...prev.hr,  msg.vitals.heart_rate].slice(-MAX);
        const spo2= [...prev.spo2, msg.vitals.spo2].slice(-MAX);
        const ts  = [...prev.ts,  msg.t].slice(-MAX);
        return { hr, spo2, ts };
      });
    };

    return () => ws.close();
  }, [patientId]);

  return { vitals, history, connected };
}
