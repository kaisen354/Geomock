import React, { useState, useRef, useCallback } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import { useTelemetry } from './hooks/useTelemetry';
import { useMetrics } from './hooks/useMetrics';
import { LiveMap, type LiveMapHandle } from './components/LiveMap';
import { Sidebar } from './components/Sidebar';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { WelcomePage } from './components/WelcomePage';
import { IconNav, type ViewState } from './components/IconNav';
import { MapDropZone } from './components/MapDropZone';
import { CopilotTerminal } from './components/CopilotTerminal';
import { TopologyMap } from './components/TopologyMap';
import { LoadTestPanel } from './components/LoadTestPanel';
import { AIDiagnosticsPanel } from './components/AIDiagnosticsPanel';
import './index.css';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('welcome');
  const mapRef = useRef<LiveMapHandle | null>(null);
  const telemetry = useTelemetry();
  const { topology, metrics } = useMetrics();

  const handleFlyTo = useCallback((bounds: LatLngBoundsExpression) => {
    mapRef.current?.flyToBounds(bounds);
  }, []);

  // ── 2. Welcome page — map is NOT mounted here at all ───────
  //    Leaflet's own tile/pane z-indexes would bleed through
  //    any CSS overlay, so we use a completely separate tree.
  if (currentView === 'welcome') {
    return (
      <div
        style={{
          display: 'flex',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: '#0d0d0d',
        }}
      >
        {/* Icon nav stays so the user can jump to map/analytics */}
        <IconNav 
          currentView={currentView} 
          onViewChange={setCurrentView}
        />

        {/* Welcome page scrolls inside this flex child */}
        <div
          style={{
            flex: 1,
            height: '100vh',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <WelcomePage onEnter={() => setCurrentView('map')} />
        </div>
      </div>
    );
  }

  // ── 3. Main app shell (map / analytics / topology) ─────────
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', zIndex: 100 }}>
        <IconNav 
          currentView={currentView} 
          onViewChange={setCurrentView}
        />
        {currentView === 'map' && <Sidebar telemetry={telemetry} onFlyTo={handleFlyTo} />}

        {/* Topology sidebar — shown only in topology view */}
        {currentView === 'topology' && (
          <aside className="sidebar" style={{ gap: '1rem' }}>
            {/* Header */}
            <div className="sidebar-logo">
              ⬡ GEOMOCK
              <span style={{ fontSize: '0.6rem', marginLeft: '0.5rem', color: 'rgba(0,255,204,0.4)', fontWeight: 400 }}>
                v3.0 · MATRIX
              </span>
            </div>

            <div className="ws-indicator">
              <div className={topology ? 'dot-connected' : 'dot-disconnected'} />
              {topology ? 'TOPOLOGY LIVE' : 'AWAITING DATA'}
            </div>

            <div className="sidebar-section">
              <div className="sidebar-label">Pipeline Nodes</div>
              {(topology?.nodes ?? []).map(node => (
                <div
                  key={node.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.5rem 0.6rem',
                    background: 'rgba(0,255,204,0.03)',
                    border: '1px solid rgba(0,255,204,0.1)',
                    borderRadius: '3px',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background:
                        node.group === 'agents' ? '#00ffcc' :
                        node.group === 'queue'  ? '#ffaa00' : '#ff3366',
                      boxShadow:
                        node.group === 'agents' ? '0 0 6px #00ffcc' :
                        node.group === 'queue'  ? '0 0 6px #ffaa00' : '0 0 6px #ff3366',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)' }}>
                    {node.name}
                  </span>
                  {node.group === 'agents' && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        color: 'var(--cyan)',
                      }}
                    >
                      {metrics.currentRps} rps
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="sidebar-section">
              <div className="sidebar-label">Live Throughput</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="stat-card">
                  <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                    {metrics.currentRps.toLocaleString()}
                  </div>
                  <div className="stat-label">req / sec</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ fontSize: '1.2rem', color: metrics.httpFailures > 0 ? 'var(--red-alert)' : 'var(--cyan)' }}>
                    {metrics.httpFailures}
                  </div>
                  <div className="stat-label">http fails</div>
                </div>
              </div>
            </div>

            <div className="sidebar-section">
              <div className="sidebar-label">P95 Latency</div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: metrics.p95ResponseTime > 500 ? 'var(--red-alert)' : 'var(--cyan)',
                  textShadow: '0 0 8px rgba(0,255,204,0.4)',
                }}
              >
                {metrics.p95ResponseTime} <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>ms</span>
              </div>
              
              {metrics.p50ResponseTime !== undefined && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>p50 </span><span style={{ color: '#fff' }}>{metrics.p50ResponseTime}</span></div>
                  <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>p90 </span><span style={{ color: '#fff' }}>{metrics.p90ResponseTime}</span></div>
                  <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>p99 </span><span style={{ color: '#fff' }}>{metrics.p99ResponseTime}</span></div>
                </div>
              )}
            </div>

            <LoadTestPanel metrics={metrics} />

            <div className="sidebar-section" style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border-cyber)' }}>
              <div className="sidebar-label" style={{ marginBottom: '0.3rem' }}>About</div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'rgba(0,255,204,0.4)', lineHeight: 1.7 }}>
                Real-time physics simulation of the internal Go data pipeline. Particle speed scales with live RPS.
              </p>
            </div>
          </aside>
        )}
      </div>

      {/* Main content area */}
      {currentView === 'analytics' ? (
        <PerformanceDashboard />
      ) : currentView === 'topology' ? (
        <TopologyMap topology={topology} currentRps={metrics.currentRps} />
      ) : currentView === 'diagnostics' ? (
        <AIDiagnosticsPanel />
      ) : (
        <MapDropZone onFlyTo={handleFlyTo}>
          <LiveMap ref={mapRef} telemetry={telemetry} />
        </MapDropZone>
      )}

      {currentView !== 'analytics' && currentView !== 'topology' && currentView !== 'diagnostics' && (
        <CopilotTerminal onFlyTo={handleFlyTo} />
      )}
    </div>
  );
};

export default App;
