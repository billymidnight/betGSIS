import React from 'react';
import { Link } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">betGSIS</div>
      <nav>
        <Link to="/home">Home</Link>
        <div style={{height:12}} />
        <div className="sidebar-section-title">Odds Screens</div>
        <Link to="/geoguessr">GeoGuessr Odds</Link>
        <Link to="/templates/chess">Chess Odds</Link>
        <Link to="/templates/zetamac">Zetamac Odds</Link>
        <Link to="/templates/monopoly">Monopoly Odds</Link>
        <Link to="/templates/poker">Poker Odds</Link>
        <Link to="/templates/birthday-paradox">Birthday Paradox Odds</Link>
        <div style={{height:8}} />
        <div className="sidebar-section-title">Help</div>
        <Link to="/help">Help</Link>
      </nav>
    </aside>
  );
}
