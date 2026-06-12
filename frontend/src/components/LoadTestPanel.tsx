import React, { useState } from 'react';
import type { MetricsPayload } from '../hooks/useMetrics';

interface Props {
  metrics: MetricsPayload;
}

export const LoadTestPanel: React.FC<Props> = ({ metrics }) => {
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
  const [url, setUrl] = useState(`${API_BASE}/api/start`);
  const [method, setMethod] = useState('POST');
  const [agents, setAgents] = useState(100);
  const [pattern, setPattern] = useState('spike');
  const [isRunning, setIsRunning] = useState(false);

  const handleStart = async () => {
    setIsRunning(true);
    try {
      await fetch(`${API_BASE}/api/loadtest/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method,
          agents,
          pattern,
          durationSec: 60,
          body: JSON.stringify({ count: 100, tickRate: 1000 }),
        }),
      });
    } catch (e) {
      console.error(e);
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    try {
      await fetch(`${API_BASE}/api/loadtest/stop`, { method: 'POST' });
    } catch (e) {}
    setIsRunning(false);
  };

  return (
    <div className="sidebar-section" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '1.5rem', marginTop: '1rem' }}>
      <div className="sidebar-label" style={{ marginBottom: '0.5rem' }}>
        Load Injector
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <input 
          className="text-input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Target API URL"
          style={{ width: '100%' }}
        />
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <select 
            className="text-input"
            value={method}
            onChange={e => setMethod(e.target.value)}
            style={{ width: '100%' }}
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>DELETE</option>
          </select>
          <select 
            className="text-input"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="spike">Spike</option>
            <option value="ramp-up">Ramp Up</option>
            <option value="soak">Soak</option>
          </select>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--ink-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
            <span>Virtual Agents</span>
            <span style={{ color: 'var(--ink)' }}>{agents}</span>
          </div>
          <input 
            type="range" 
            min="10" max="2000" step="10"
            value={agents}
            onChange={e => setAgents(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--primary)' }}
          />
        </div>

        {!isRunning ? (
          <button 
            className="btn-primary-green"
            onClick={handleStart}
            style={{ marginTop: '0.5rem', width: '100%' }}
          >
            Initialize Load
          </button>
        ) : (
          <button 
            className="btn-secondary-outline"
            onClick={handleStop}
            style={{ marginTop: '0.5rem', width: '100%' }}
          >
            Abort Test
          </button>
        )}
      </div>

      {metrics.activeConnections !== undefined && metrics.activeConnections > 0 && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--canvas-soft)', border: '1px solid var(--hairline)', borderRadius: '6px' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--ink-mute)', fontWeight: 500 }}>
            Active Connections
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', color: 'var(--ink)', fontWeight: 500 }}>
            {metrics.activeConnections}
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', color: 'var(--ink-mute)', marginTop: '0.3rem' }}>
            TTFB: <span style={{ color: 'var(--ink)' }}>{metrics.avgTtfb}ms</span>
          </div>
        </div>
      )}
    </div>
  );
};
