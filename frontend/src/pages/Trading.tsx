import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchTradingLocks, fetchSopranosReference } from '../lib/api/api';
import './Trading.css';

export default function Trading() {
  const navigate = useNavigate();
  const [locks, setLocks] = useState({ master: false, sopranos: false, breaking_bad: false, harry_potter: false });
  const [sopranosCharCount, setSopranosCharCount] = useState<number | null>(null);

  useEffect(() => {
    loadLocks();
    loadSopranosCharCount();
  }, []);

  const loadLocks = async () => {
    try {
      const response = await fetchTradingLocks();
      if (response.success) {
        setLocks(response.locks);
      }
    } catch (error) {
      console.error('Failed to fetch locks:', error);
    }
  };

  const loadSopranosCharCount = async () => {
    try {
      const response = await fetchSopranosReference();
      if (response.success) {
        // Count total characters from both Male and Female
        const males = response.characters_by_gender?.Male?.length || 0;
        const females = response.characters_by_gender?.Female?.length || 0;
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
    if (locks.master) {
      e.preventDefault();
      alert('🔒 betGSIS traders have locked all trading games');
      return;
    }
    // Let Link handle navigation if not locked
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

          {/* Breaking Bad Trading */}
          <Link 
            to="/trading/breaking-bad" 
            className={`trading-card breaking-bad-card ${locks.master ? 'disabled' : ''}`}
            onClick={handleBreakingBadClick}
          >
            <div className="trading-card-content">
              <div className="trading-card-header">
                <h2 className="trading-card-title">
                  Breaking Bad {locks.master && '🔒'}
                </h2>
                <span className="badge badge-active">ACTIVE</span>
              </div>
              <p className="trading-card-description">
                Trade character cards from the Emmy-winning series. Bet on families, Emmy winners, and survival odds.
              </p>
              <div className="trading-card-features">
                <span className="feature-item">• 27 Characters</span>
                <span className="feature-item">• Multiple Markets</span>
                <span className="feature-item">• Real-time Odds</span>
              </div>
            </div>
          </Link>

          {/* Harry Potter Trading */}
          <Link 
            to="/trading/harry-potter" 
            className={`trading-card harry-potter-card ${locks.master ? 'disabled' : ''}`}
            onClick={(e) => {
              if (locks.master) {
                e.preventDefault();
                alert('🔒 betGSIS traders have locked all trading games');
              }
            }}
          >
            <div className="trading-card-content">
              <div className="trading-card-header">
                <h2 className="trading-card-title">
                  Harry Potter {locks.master && '🔒'}
                </h2>
                <span className="badge badge-active">ACTIVE</span>
              </div>
              <p className="trading-card-description">
                Trade character cards from the wizarding world. Bet on Hogwarts houses, teachers, and magical fates.
              </p>
              <div className="trading-card-features">
                <span className="feature-item">• 38 Characters</span>
                <span className="feature-item">• Multiple Markets</span>
                <span className="feature-item">• Real-time Odds</span>
              </div>
            </div>
          </Link>

          {/* Good Shepherd Trading */}
          <Link 
            to="/trading/good-shepherd" 
            className={`trading-card good-shepherd-card ${locks.master ? 'disabled' : ''}`}
            onClick={(e) => {
              if (locks.master) {
                e.preventDefault();
                alert('🔒 betGSIS traders have locked all trading games');
              }
            }}
          >
            <div className="trading-card-content">
              <div className="trading-card-header">
                <h2 className="trading-card-title">
                  Good Shepherd {locks.master && '🔒'}
                </h2>
                <span className="badge badge-active">ACTIVE</span>
              </div>
              <p className="trading-card-description">
                Trade student cards from the legendary high school. Bet on houses, prefects, and student attributes.
              </p>
              <div className="trading-card-features">
                <span className="feature-item">• Student Cards</span>
                <span className="feature-item">• Multiple Markets</span>
                <span className="feature-item">• Real-time Odds</span>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}