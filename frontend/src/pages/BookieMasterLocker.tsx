import React from 'react';
import BookieLockManager from '../components/Bookie/BookieLockManager';
import BookkeepingStats from '../components/Bookie/BookkeepingStats';
import GameCounterPanel from '../components/Bookie/GameCounterPanel';
import AccountsOverview from '../components/Bookie/AccountsOverview';
import './BookieMasterLocker.css';

export default function BookieMasterLocker() {
  return (
    <div className="bookie-hub-page">
      <div className="bookie-hub-main">
        <div className="hub-left">
          <BookieLockManager />
        </div>
        <div className="hub-right">
          <BookkeepingStats />
          <div style={{height: '0.5rem'}} />
          <GameCounterPanel />
          <div style={{height: '0.5rem'}} />
          <AccountsOverview />
        </div>
      </div>
    </div>
  );
}
