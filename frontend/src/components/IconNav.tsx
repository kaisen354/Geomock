import React from 'react';
import { Home, LayoutGrid, Map, Activity, Radio } from 'lucide-react';

export type ViewState = 'welcome' | 'map' | 'analytics';

interface Props {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
}

export const IconNav: React.FC<Props> = ({ currentView, onViewChange }) => {
  return (
    <nav className="icon-nav">
      <div 
        className={`icon-nav-btn ${currentView === 'welcome' ? 'active' : ''}`}
        onClick={() => onViewChange('welcome')}
      >
        <Home size={20} />
      </div>

      <div 
        className={`icon-nav-btn ${currentView === 'map' ? 'active' : ''}`}
        onClick={() => onViewChange('map')}
      >
        <LayoutGrid size={20} />
      </div>

      <div className="icon-nav-btn">
        <Map size={20} />
      </div>

      <div 
        className={`icon-nav-btn ${currentView === 'analytics' ? 'active' : ''}`}
        onClick={() => onViewChange('analytics')}
      >
        <Activity size={20} />
      </div>

      <div className="icon-nav-btn">
        <Radio size={20} />
      </div>
    </nav>
  );
};
