import React from 'react';
import Card from '../components/Shared/Card';
import './Bets.css';

export default function Bets() {
  return (
    <div className="bets-page">
      <div className="bets-main">
        <div className="bets-header">
          <h1 className="bets-title">Bet History</h1>
          <p className="bets-subtitle">View and analyze all your placed bets</p>
        </div>

        <Card title="Coming Soon" variant="default">
          <p>Detailed bet history and analytics interface coming in next update.</p>
        </Card>
      </div>
    </div>
  );
}
