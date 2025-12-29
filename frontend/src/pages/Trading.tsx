import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Trading.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export default function Trading() {
  const navigate = useNavigate();
  const [locks, setLocks] = useState({ master: false, sopranos: false, breaking_bad: false });
  const [sopranosCharCount, setSopranosCharCount] = useState<number | null>(null);

  useEffect(() => {
    fetchLocks();
    fetchSopranosCharCount();
  }, []);

  const fetchLocks = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/trading/locks`);
      if (response.data.success) {
        setLocks(response.data.locks);
      }
    } catch (error) {
      console.error('Failed to fetch locks:', error);
    }
  };

  const fetchSopranosCharCount = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/trading/sopranos/reference`);
      if (response.data.success) {
        // Count total characters from both Male and Female
        const males = response.data.characters_by_gender?.Male?.length || 0;
        const females = response.data.characters_by_gender?.Female?.length || 0;
        setSopranosCharCount(males + females);
      }
    } catch (error) {
      console.error('Failed to fetch Sopranos character count:', error);
    }
  };

  const handleSopranosClick = (e: React.MouseEvent) => {
    if (locks.master) {
      e.preventDefault();
      alert('🔒 betGSIS traders have locked all trading games');
      return;
    }
    // Let Link handle navigation if not locked
  };

  const handleBreakingBadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (locks.master) {
      alert('🔒 betGSIS traders have locked all trading games');
    } else {
      alert('Coming soon...');
    }
  };

  return (
    <div className="trading-container">
      <div className="trading-content">
        <h1 className="trading-title">Trading Games</h1>
        <p className="trading-subtitle">
          Test your trading skills across different themed markets
        </p>

        <div className="trading-grid">
          {/* Sopranos Trading */}
          <Link 
            to="/trading/sopranos" 
            className={`trading-card sopranos-card ${locks.master ? 'disabled' : ''}`}
            onClick={handleSopranosClick}
          >
            <div className="trading-card-content">
              <div className="trading-card-header">
                <h2 className="trading-card-title">
                  The Sopranos {locks.master && '🔒'}
                </h2>
                <span className="badge badge-active">ACTIVE</span>
              </div>
              <p className="trading-card-description">
                Trade character cards from the iconic HBO series. Bet on crew affiliations, family ties, and character fates.
              </p>
              <div className="trading-card-features">
                <span className="feature-item">• {sopranosCharCount !== null ? `${sopranosCharCount} Characters` : 'Loading...'}</span>
                <span className="feature-item">• Multiple Markets</span>
                <span className="feature-item">• Real-time Odds</span>
              </div>
            </div>
          </Link>

          {/* Breaking Bad Trading - Coming Soon */}
          <div 
            className={`trading-card breaking-bad-card disabled ${locks.master ? 'locked' : ''}`}
            onClick={handleBreakingBadClick}
            style={{ cursor: 'pointer' }}
          >
            <div className="trading-card-content">
              <div className="trading-card-header">
                <h2 className="trading-card-title">
                  Breaking Bad {locks.master && '🔒'}
                </h2>
                <span className="badge badge-coming-soon">COMING SOON</span>
              </div>
              <p className="trading-card-description">
                Trade character cards from the Albuquerque underworld. Coming soon...
              </p>
              <div className="trading-card-features">
                <span className="feature-item">• TBD Characters</span>
                <span className="feature-item">• DEA vs Cartel</span>
                <span className="feature-item">• Chemistry Markets</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}