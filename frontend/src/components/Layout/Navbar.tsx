import ProfileIcon from './ProfileIcon';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/state/authStore';
import { Badge } from '../Shared/Badge';
import { fetchCurrentGame } from '../../lib/api/api';
import './Navbar.css';

interface NavbarProps {
  pnlValue?: number;
}

export default function Navbar({ pnlValue = 0 }: NavbarProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isPositive = pnlValue >= 0;
  const [gameNo, setGameNo] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const g = await fetchCurrentGame();
        setGameNo(g ?? null);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <span className="navbar-logo-icon">⬟</span>
          <span className="navbar-logo-text">betGSIS</span>
        </Link>

        <div className="navbar-menu">
          <Link to="/home" className="navbar-link">
            Home
          </Link>
          <Link to="/my-bets" className="navbar-link">
            My Bets
          </Link>
          <Link to="/portfolio" className="navbar-link">
            Portfolio
          </Link>
          <Link to="/bet-settler" className="navbar-link">
            Bet Settler
          </Link>
          {user && user.role === 'BOOKIE' && (
            <>
              <Link to="/betgsis-portfolio" className="navbar-link">
                betGSIS-Portfolio
              </Link>
              <Link to="/market-locker" className="navbar-link">
                Market Locker
              </Link>
            </>
          )}
        </div>

        <div className="navbar-right">
          <div className="navbar-game">
            <span className="navbar-game-label">Geo Game</span>
            <span className="navbar-game-num">{gameNo ?? '—'}</span>
          </div>
          <div className="navbar-pnl">
            <span className="navbar-pnl-label">P&L</span>
            <Badge variant={isPositive ? 'success' : 'error'} size="md">
              {isPositive ? '+' : ''}${Math.abs(pnlValue).toFixed(2)}
            </Badge>
          </div>

          <button
            className="navbar-hamburger"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`hamburger-line ${isMenuOpen ? 'active' : ''}`} />
            <span className={`hamburger-line ${isMenuOpen ? 'active' : ''}`} />
            <span className={`hamburger-line ${isMenuOpen ? 'active' : ''}`} />
          </button>

          {/* Profile icon and dropdown */}
          <div style={{marginLeft: 12}}>
            <ProfileIcon />
          </div>
        </div>
      </div>
    </nav>
  );
}
