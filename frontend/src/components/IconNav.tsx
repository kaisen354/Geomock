import React from 'react';
import { Home, LayoutGrid, Activity, Network, MessageSquare } from 'lucide-react';

export type ViewState = 'welcome' | 'map' | 'analytics' | 'topology' | 'diagnostics';

interface Props {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
}

export const IconNav: React.FC<Props> = ({ currentView, onViewChange }) => {
  return (
    <nav className="icon-nav">
      <div
        id="nav-home"
        className={`icon-nav-btn ${currentView === 'welcome' ? 'active' : ''}`}
        onClick={() => onViewChange('welcome')}
        title="Home"
      >
        <Home size={20} />
      </div>

      <div
        id="nav-map"
        className={`icon-nav-btn ${currentView === 'map' ? 'active' : ''}`}
        onClick={() => onViewChange('map')}
        title="Live Map"
      >
        <LayoutGrid size={20} />
      </div>

      <div
        id="nav-analytics"
        className={`icon-nav-btn ${currentView === 'analytics' ? 'active' : ''}`}
        onClick={() => onViewChange('analytics')}
        title="Performance Dashboard"
      >
        <Activity size={20} />
      </div>

      <div
        id="nav-topology"
        className={`icon-nav-btn ${currentView === 'topology' ? 'active' : ''}`}
        onClick={() => onViewChange('topology')}
        title="Matrix Topology"
      >
        <Network size={20} />
      </div>

      <div
        id="nav-diagnostics"
        className={`icon-nav-btn ${currentView === 'diagnostics' ? 'active' : ''}`}
        onClick={() => onViewChange('diagnostics')}
        title="AI Diagnostics"
      >
        <MessageSquare size={20} />
      </div>
    </nav>
  );
};
