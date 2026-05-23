import React from 'react';
import { Link } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">betGSIS</div>
      <nav>
        <Link to="/home">Home</Link>
        <div style={{height:8}} />
        <Link to="/dammox" className="sidebar-dammox-link">
          <span className="sidebar-dammox-emoji">🎂</span>
          <span className="sidebar-dammox-text">Yaya Bday</span>
          <span className="sidebar-dammox-emoji">🎉</span>
        </Link>
        <div style={{height:12}} />
        <div className="sidebar-section-title">Odds Screens</div>
        <Link to="/geoguessr">GeoGuessr Odds</Link>
        <Link to="/zetamac">Zetamac Odds</Link>
        <Link to="/templates/chess">Chess Odds</Link>
        <Link to="/templates/monopoly">Monopoly Odds</Link>
        <Link to="/templates/poker">Poker Odds</Link>
        <Link to="/templates/birthday-paradox">Birthday Paradox Odds</Link>
        <div style={{height:12}} />
        <div className="sidebar-section-title">Exchanges</div>
        <Link to="/exchange">GSIS Bet Exchange</Link>
        <Link to="/parimutuel">Parimutuel</Link>
        <div style={{height:12}} />
        <div className="sidebar-section-title">Games</div>
        <Link to="/gs-poker">GS Poker</Link>
        <Link to="/trading">Trading Games</Link>
        <div style={{height:12}} />
        <div className="sidebar-section-title">Racing</div>
        <Link to="/racing/horses">Horse Racing</Link>
        <div style={{height:12}} />
        <div className="sidebar-section-title">Stats</div>
        <Link to="/leaderboard">Leaderboard</Link>
        <div style={{height:8}} />
        <div className="sidebar-section-title">Help</div>
        <Link to="/help">Help</Link>
      </nav>
    </aside>
  );
}
