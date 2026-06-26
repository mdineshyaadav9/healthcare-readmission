import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useApi } from '../hooks/useApi';

function riskColor(r) {
  if (r >= 0.75) return 0xef4444;
  if (r >= 0.50) return 0xf59e0b;
  if (r >= 0.25) return 0x60a5fa;
  return 0x10b981;
}
function riskColorHex(r) {
  if (r >= 0.75) return '#ef4444';
  if (r >= 0.50) return '#f59e0b';
  if (r >= 0.25) return '#60a5fa';
  return '#10b981';
}

// Convert lat/lon to 3D sphere coords
function latLonToVec3(lat, lon, radius = 2.2) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta),
  );
}

function GlobeCanvas({ hospitals, onHover }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});

  useEffect(() => {
    if (!hospitals?.length) return;
    const el = mountRef.current;
    const W = el.clientWidth, H = el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 6);

    // Globe sphere
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x0a1628, emissive: 0x050c18,
        transparent: true, opacity: 0.95,
        wireframe: false,
      })
    );
    scene.add(globe);

    // Wireframe overlay
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(2.21, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x1e2d3d, wireframe: true, transparent: true, opacity: 0.3 })
    );
    scene.add(wire);

    // Lights
    scene.add(new THREE.AmbientLight(0x334466, 1.5));
    const dir = new THREE.DirectionalLight(0x6699cc, 1.2);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    // Hospital markers
    const markers = [];
    hospitals.forEach(h => {
      const pos  = latLonToVec3(h.lat, h.lng);
      const size = 0.04 + h.pct_critical * 0.12;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 12, 12),
        new THREE.MeshPhongMaterial({ color: riskColor(h.avg_risk), emissive: riskColor(h.avg_risk), emissiveIntensity: 0.4 })
      );
      mesh.position.copy(pos);
      mesh.userData = h;
      scene.add(mesh);
      markers.push(mesh);

      // Pulse ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * 1.5, size * 2.2, 16),
        new THREE.MeshBasicMaterial({ color: riskColor(h.avg_risk), transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      ring.position.copy(pos);
      ring.lookAt(0, 0, 0);
      ring.userData = { pulse: true, base: size };
      scene.add(ring);
    });

    // Mouse interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / W) * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / H) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(markers);
      onHover(hits.length ? hits[0].object.userData : null);
    };
    el.addEventListener('mousemove', onMouseMove);

    // Drag rotation
    let isDragging = false, prevX = 0, prevY = 0;
    const rotGroup = new THREE.Group();
    scene.add(rotGroup);
    [globe, wire, ...markers].forEach(m => rotGroup.add(m));
    // Also add rings
    scene.children
      .filter(c => c.userData?.pulse)
      .forEach(c => rotGroup.add(c));

    el.addEventListener('mousedown', e => { isDragging = true; prevX = e.clientX; prevY = e.clientY; });
    el.addEventListener('mouseup',   () => { isDragging = false; });
    el.addEventListener('mouseleave',() => { isDragging = false; });
    el.addEventListener('mousemove', e => {
      if (!isDragging) return;
      rotGroup.rotation.y += (e.clientX - prevX) * 0.005;
      rotGroup.rotation.x += (e.clientY - prevY) * 0.003;
      prevX = e.clientX; prevY = e.clientY;
    });

    let t = 0;
    const animate = () => {
      t += 0.01;
      if (!isDragging) rotGroup.rotation.y += 0.002;
      // Pulse rings
      rotGroup.children.filter(c => c.userData?.pulse).forEach(r => {
        r.material.opacity = 0.2 + 0.3 * Math.sin(t * 2);
        const s = 1 + 0.15 * Math.sin(t * 2);
        r.scale.set(s, s, s);
      });
      renderer.render(scene, camera);
      sceneRef.current.raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(sceneRef.current.raf);
      el.removeEventListener('mousemove', onMouseMove);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitals]);

  return <div ref={mountRef} style={{ width: '100%', height: 440, cursor: 'grab' }} />;
}

export default function Hospitals() {
  const { data, loading } = useApi('/api/hospitals');
  const [hovered, setHovered] = useState(null);

  const hospitals = data?.hospitals || [];
  const sorted = [...hospitals].sort((a, b) => b.avg_risk - a.avg_risk);

  return (
    <div>
      <h1 style={h1}>Hospital Network</h1>
      <p style={sub}>25 hospitals · drag to rotate · hover markers for details</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18 }}>
        {/* Globe */}
        <div style={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
          {loading
            ? <div style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2d4a6a' }}>Loading globe...</div>
            : <GlobeCanvas hospitals={hospitals} onHover={setHovered} />}

          {/* Tooltip */}
          {hovered && (
            <div style={{
              position: 'absolute', bottom: 20, left: 20,
              background: 'rgba(13,17,23,0.95)', border: '1px solid #1e2d3d',
              borderRadius: 8, padding: '12px 16px', fontSize: 12,
            }}>
              <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>{hovered.name || hovered.city}</div>
              <div style={{ color: '#4a6785' }}>{hovered.n_patients?.toLocaleString()} patients</div>
              <div style={{ color: riskColorHex(hovered.avg_risk), fontWeight: 600 }}>Avg risk: {hovered.avg_risk?.toFixed(4)}</div>
              <div style={{ color: '#4a6785' }}>Readmission: {(hovered.readmission_rate * 100).toFixed(1)}%</div>
              <div style={{ color: '#4a6785' }}>Critical: {(hovered.pct_critical * 100).toFixed(1)}%</div>
            </div>
          )}

          {/* Legend */}
          <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[['#ef4444','Critical ≥0.75'],['#f59e0b','High 0.50–0.75'],['#60a5fa','Moderate 0.25–0.50'],['#10b981','Low <0.25']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#4a6785' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* Ranked list */}
        <div style={{ background: '#0d1117', border: '1px solid #1e2d3d', borderRadius: 10, padding: '16px 18px', overflowY: 'auto', maxHeight: 460 }}>
          <div style={{ fontSize: 11, color: '#4a6785', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>Ranked by avg risk</div>
          {sorted.map((h, i) => (
            <div key={h.hospital_id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#e2e8f0' }}>
                  <span style={{ color: '#2d4a6a', marginRight: 6, fontSize: 11 }}>{i + 1}.</span>
                  {h.city}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: riskColorHex(h.avg_risk) }}>
                  {h.avg_risk.toFixed(4)}
                </span>
              </div>
              <div style={{ height: 4, background: '#1e2d3d', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(h.avg_risk / 0.65 * 100).toFixed(0)}%`, height: '100%', background: riskColorHex(h.avg_risk), borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#2d4a6a', marginTop: 3 }}>
                <span>{h.n_patients?.toLocaleString()} pts</span>
                <span>{(h.readmission_rate * 100).toFixed(1)}% readm · {(h.pct_critical * 100).toFixed(1)}% critical</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const h1  = { fontSize: 20, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 };
const sub = { fontSize: 13, color: '#4a6785', marginBottom: 20 };
