import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

export const Brand: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="LOCSETVR">
    <span className="brand__mark"><i/><i/><i/></span>
    <span className="brand__name">LOCSET<span>VR</span></span>
  </div>
);

const AppFrame: React.FC<React.PropsWithChildren<{ action?: React.ReactNode }>> = ({ children, action }) => {
  const navigate = useNavigate();
  return (
    <div className="app-frame">
      <header className="app-header">
        <button className="brand-button" onClick={() => navigate('/')} aria-label="Vai alla home"><Brand /></button>
        <nav className="desktop-nav" aria-label="Navigazione principale">
          <NavLink to="/" end><Icon name="grid" size={18}/>Panoramica</NavLink>
          <NavLink to="/library"><Icon name="folder" size={18}/>Location</NavLink>
        </nav>
        <div className="app-header__end">
          <span className="engine-chip"><i/>Elaborazione locale</span>
          {action}
        </div>
      </header>
      {children}
      <nav className="mobile-nav" aria-label="Navigazione principale mobile">
        <NavLink to="/" end><Icon name="grid"/><span>Home</span></NavLink>
        <button onClick={() => navigate('/capture')} className="mobile-nav__capture" aria-label="Nuova scansione"><Icon name="scan" size={25}/></button>
        <NavLink to="/library"><Icon name="folder"/><span>Location</span></NavLink>
      </nav>
    </div>
  );
};

export default AppFrame;
