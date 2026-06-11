import React, { useState, useRef, useCallback } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import { useTelemetry } from './hooks/useTelemetry';
import { CoreTerminalIntro } from './components/CoreTerminalIntro';
import { LiveMap, type LiveMapHandle } from './components/LiveMap';
import { Sidebar } from './components/Sidebar';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { WelcomePage } from './components/WelcomePage';
import { IconNav, type ViewState } from './components/IconNav';
import { MapDropZone } from './components/MapDropZone';
import { CopilotTerminal } from './components/CopilotTerminal';
import './index.css';

const App: React.FC = () => {
  const [booted, setBooted] = useState(false);
  const [currentView, setCurrentView] = useState<ViewState>('welcome');
  const mapRef = useRef<LiveMapHandle | null>(null);
  const telemetry = useTelemetry();

  const handleFlyTo = useCallback((bounds: LatLngBoundsExpression) => {
    mapRef.current?.flyToBounds(bounds);
  }, []);

  // ── 1. Boot sequence (terminal intro) ──────────────────────
  if (!booted) {
    return <CoreTerminalIntro onBoot={() => setBooted(true)} />;
  }

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
        <IconNav currentView={currentView} onViewChange={setCurrentView} />

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

  // ── 3. Main app shell (map / analytics) ────────────────────
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ display: 'flex', zIndex: 100 }}>
        <IconNav currentView={currentView} onViewChange={setCurrentView} />
        {currentView === 'map' && <Sidebar telemetry={telemetry} onFlyTo={handleFlyTo} />}
      </div>

      {currentView === 'analytics' ? (
        <PerformanceDashboard />
      ) : (
        <MapDropZone onFlyTo={handleFlyTo}>
          <LiveMap ref={mapRef} telemetry={telemetry} />
        </MapDropZone>
      )}

      {currentView !== 'analytics' && (
        <CopilotTerminal onFlyTo={handleFlyTo} />
      )}
    </div>
  );
};

export default App;
