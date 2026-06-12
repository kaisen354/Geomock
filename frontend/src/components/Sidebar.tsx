import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import type { TelemetryHandle } from '../hooks/useTelemetry';

interface BoundingEnvelope {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface Props {
  telemetry: TelemetryHandle;
  onFlyTo: (bounds: LatLngBoundsExpression) => void;
}

const API_BASE = 'http://localhost:8080';

export const Sidebar: React.FC<Props> = ({ telemetry, onFlyTo }) => {
  const [riderCount, setRiderCount] = useState(1000);
  const [tickRate, setTickRate] = useState(1000);
  const [starting, setStarting] = useState(false);
  const [startStatus, setStartStatus] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live stats polled at 1 Hz from the useRef — no WS re-renders needed
  const [msgPerSec, setMsgPerSec]   = useState(0);
  const [anomalies, setAnomalies]   = useState(0);
  const [recentAnomalies, setRecentAnomalies] = useState<import('../types').AnomalyEvent[]>([]);
  const [connected, setConnected]   = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      const s = telemetry.statsRef.current;
      setMsgPerSec(s.msgPerSec);
      setAnomalies(s.anomalies);
      // We must spread to create a new array ref to trigger render
      setRecentAnomalies([...s.recentAnomalies]);
      setConnected(s.connected);
    }, 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [telemetry]);

  const handleStart = async () => {
    setStarting(true);
    setStartStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: riderCount, tickRate }),
      });
      setStartStatus(res.ok ? '✓ Engine started' : `Error ${res.status}`);
    } catch {
      setStartStatus('✗ Backend unreachable');
    } finally {
      setStarting(false);
      setTimeout(() => setStartStatus(null), 3000);
    }
  };

  const showUploadStatus = (msg: string) => {
    setUploadStatus(msg);
    setTimeout(() => setUploadStatus(null), 4000);
  };

  const handleFileUpload = useCallback(async (file: File) => {
    // Client-side validation
    const text = await file.text();
    let parsed: { type?: string };
    try { parsed = JSON.parse(text); } catch {
      showUploadStatus('✗ Invalid JSON');
      return;
    }
    if (parsed.type !== 'FeatureCollection') {
      showUploadStatus('✗ Must be a FeatureCollection');
      return;
    }

    setUploading(true);
    showUploadStatus('⟳ Uploading...');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/upload-map`, { method: 'POST', body: form });
      if (!res.ok) { showUploadStatus(`✗ Error ${res.status}`); return; }
      const env = await res.json() as BoundingEnvelope;
      onFlyTo([[env.minLat, env.minLng], [env.maxLat, env.maxLng]]);
      showUploadStatus('✓ City loaded');
    } catch {
      showUploadStatus('✗ Backend unreachable');
    } finally {
      setUploading(false);
      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [onFlyTo]);

  return (
    <aside className="sidebar">
      {/* ── Header ── */}
      <div className="sidebar-logo">
        <span style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>⬡</span> GEOMOCK
        <span style={{
          fontSize: '0.7rem',
          marginLeft: '0.5rem',
          color: 'var(--ink-mute)',
          fontWeight: 400,
          fontFamily: 'var(--font-mono)'
        }}>
          v3.0
        </span>
      </div>

      {/* ── WS Status ── */}
      <div className="ws-indicator">
        <div className={connected ? 'dot-connected' : 'dot-disconnected'} style={{ background: connected ? 'var(--primary)' : 'var(--accent-tomato)', boxShadow: 'none' }} />
        {connected ? 'Connection Active' : 'Connecting...'}
      </div>

      {/* ── Live Stats ── */}
      <div className="sidebar-section">
        <div className="sidebar-label">Live Telemetry</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div className="stat-card">
            <div className="stat-value">{msgPerSec.toLocaleString()}</div>
            <div className="stat-label">msg / sec</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: anomalies > 0 ? 'var(--accent-tomato)' : 'var(--ink)' }}>
              {anomalies}
            </div>
            <div className="stat-label">anomalies</div>
          </div>
        </div>

        {recentAnomalies.length > 0 && (
          <div className="anomaly-feed">
            {recentAnomalies.map((ev, i) => (
              <div 
                key={`${ev.id}-${ev.time}-${i}`} 
                className="anomaly-card"
                onClick={() => onFlyTo([[ev.lat - 0.005, ev.lng - 0.005], [ev.lat + 0.005, ev.lng + 0.005]])}
              >
                <div className="anomaly-header">
                  <span>⚠ {ev.type}</span>
                  <span>{ev.time}</span>
                </div>
                <div className="anomaly-coords">
                  {ev.lat.toFixed(5)}, {ev.lng.toFixed(5)}<br/>
                  Agent: {ev.id.substring(0,8)}...
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Agent Count ── */}
      <div className="sidebar-section">
        <div className="sidebar-label">Rider Count</div>
        <input
          type="range"
          min={10}
          max={2000}
          step={10}
          value={riderCount}
          onChange={e => setRiderCount(Number(e.target.value))}
          style={{ accentColor: 'var(--primary)' }}
        />
        <div className="sidebar-value">{riderCount.toLocaleString()} agents</div>
      </div>

      {/* ── Tick Rate ── */}
      <div className="sidebar-section">
        <div className="sidebar-label">Tick Rate</div>
        <input
          type="range"
          min={100}
          max={2000}
          step={100}
          value={tickRate}
          onChange={e => setTickRate(Number(e.target.value))}
          style={{ accentColor: 'var(--primary)' }}
        />
        <div className="sidebar-value">{tickRate} ms / tick</div>
      </div>

      {/* ── Start Button ── */}
      <div className="sidebar-section">
        <button
          className="btn-primary-green"
          style={{ width: '100%' }}
          onClick={handleStart}
          disabled={starting}
        >
          {starting ? 'Starting...' : 'Start Stress Test'}
        </button>
        {startStatus && (
          <div style={{
            fontSize: '0.75rem',
            color: startStatus.startsWith('✓') ? 'var(--primary-deep)' : 'var(--accent-tomato)',
            fontFamily: 'var(--font-ui)',
            marginTop: '0.4rem',
          }}>
            {startStatus}
          </div>
        )}
      </div>

      {/* ── Map Ingestion ── */}
      <div className="sidebar-section" style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--hairline)' }}>
        <div className="sidebar-label">Map Ingestion</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--ink-mute)', fontFamily: 'var(--font-ui)', lineHeight: 1.5, marginBottom: '0.6rem' }}>
          Drop a <span style={{ fontFamily: 'var(--font-mono)' }}>.geojson</span> onto the map,
          or browse to upload:
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,application/geo+json,application/json"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
          }}
        />

        {/* Browse button */}
        <button
          className="btn-secondary-outline"
          style={{
            width: '100%',
            opacity: uploading ? 0.6 : 1,
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Uploading...' : 'Browse .geojson'}
        </button>

        {/* Upload status */}
        {uploadStatus && (
          <div style={{
            fontSize: '0.75rem',
            marginTop: '0.4rem',
            fontFamily: 'var(--font-ui)',
            color: uploadStatus.startsWith('✓') ? 'var(--primary-deep)' : uploadStatus.startsWith('⟳') ? 'var(--ink)' : 'var(--accent-tomato)',
          }}>
            {uploadStatus}
          </div>
        )}
      </div>
    </aside>
  );
};
