import React from 'react';

export const WelcomeSidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        SYSTEM WELCOME
      </div>
      <div className="sidebar-section" style={{ flex: 1, padding: '1rem 0' }}>
        <p style={{ fontSize: '0.8rem', lineHeight: '1.5', color: 'var(--cyan-dim)' }}>
          Welcome to the GeoMock System.
          <br /><br />
          Use the left navigation panel to switch between the Live Telemetry view and the Performance Analytics view.
        </p>
      </div>
    </aside>
  );
};
