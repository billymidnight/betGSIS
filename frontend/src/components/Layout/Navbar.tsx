import ProfileIcon from './ProfileIcon';
import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/state/authStore';
import { Badge } from '../Shared/Badge';
import { fetchCurrentGame, fetchMyBets } from '../../lib/api/api';
import { americanToDecimal } from '../../lib/format';
import './Navbar.css';

interface NavbarProps {
  pnlValue?: number;
}

export default function Navbar({ pnlValue = 0 }: NavbarProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [bookkeepingOpen, setBookkeepingOpen] = useState(false);
  const bkRef = useRef<HTMLDivElement>(null);

  // Close bookkeeping dropdown when clicking outside
  useEffect(() => {
    if (!bookkeepingOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (bkRef.current && !bkRef.current.contains(e.target as Node)) {
        setBookkeepingOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bookkeepingOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // will compute positivity after live value is initialized
  const [gameNo, setGameNo] = useState<number | null>(null);
  const [pnlValueLive, setPnlValueLive] = useState<number>(pnlValue ?? 0);

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

  const isPositive = pnlValueLive >= 0;

  // Compute live P&L for the logged-in user by fetching their bets and summing per rules.
  const computePnl = async () => {
    try {
      // Fetch both bettor and layeur bets in parallel
      const [bettorBets, layeurBets] = await Promise.all([
        fetchMyBets('bettor'),
        fetchMyBets('layeur'),
      ]);

      let total = 0;

      // Bettor P&L: standard (win = profit, loss = -stake)
      if (bettorBets && Array.isArray(bettorBets)) {
        for (const b of bettorBets) {
          const stake = Number(b.bet_size ?? b.stake ?? 0) || 0;
          let dec = null;
          if (b.odds_decimal || b.odds_decimal === 0) dec = Number(b.odds_decimal);
          else if (b.decimal_odds || b.odds_decimal) dec = Number(b.decimal_odds || b.odds_decimal);
          else if (b.odds_american || b.odds) {
            const raw = String(b.odds_american ?? b.odds ?? '');
            const num = parseInt(raw.replace('+', ''), 10);
            if (!Number.isNaN(num)) dec = americanToDecimal(num);
          }
          const status = (b.result ?? '').toString().toLowerCase();
          if (status === 'win') {
            if (dec && !Number.isNaN(Number(dec))) total += stake * (Number(dec) - 1.0);
          } else if (status === 'loss') {
            total -= stake;
          }
        }
      }

      // Layeur P&L: inverted (bettor win = layeur loses payout, bettor loss = layeur keeps stake)
      if (layeurBets && Array.isArray(layeurBets)) {
        for (const b of layeurBets) {
          const stake = Number(b.bet_size ?? b.stake ?? 0) || 0;
          let dec = null;
          if (b.odds_decimal || b.odds_decimal === 0) dec = Number(b.odds_decimal);
          else if (b.decimal_odds || b.odds_decimal) dec = Number(b.decimal_odds || b.odds_decimal);
          else if (b.odds_american || b.odds) {
            const raw = String(b.odds_american ?? b.odds ?? '');
            const num = parseInt(raw.replace('+', ''), 10);
            if (!Number.isNaN(num)) dec = americanToDecimal(num);
          }
          const status = (b.result ?? '').toString().toLowerCase();
          if (status === 'win') {
            // Bettor won → layeur pays out profit
            if (dec && !Number.isNaN(Number(dec))) total -= stake * (Number(dec) - 1.0);
          } else if (status === 'loss') {
            // Bettor lost → layeur keeps the stake
            total += stake;
          }
        }
      }

      setPnlValueLive(total);
    } catch (e) {
      console.warn('Failed to compute live P&L', e);
    }
  };

  useEffect(() => {
    // initial fetch
    computePnl();

    // refresh on visibility change (e.g., when returning to tab)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') computePnl();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // listen for custom event so other parts can signal updates
    const onBetsUpdated = () => computePnl();
    window.addEventListener('bets-updated', onBetsUpdated as EventListener);

    // periodic refresh every 5s
    const iv = setInterval(() => computePnl(), 5000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('bets-updated', onBetsUpdated as EventListener);
      clearInterval(iv);
    };
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          {/* Probe for multiple possible logo locations; fall back gracefully */}
          <LogoImage />
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
              <div className="navbar-dropdown-wrap" ref={bkRef}>
                <span
                  className="navbar-link navbar-dropdown-trigger"
                  onClick={() => setBookkeepingOpen(prev => !prev)}
                >
                  Bookkeeping {bookkeepingOpen ? '▴' : '▾'}
                </span>
                {bookkeepingOpen && (
                  <div className="navbar-dropdown navbar-dropdown-show">
                    <Link to="/betgsis-portfolio" className="navbar-dropdown-item" onClick={() => setBookkeepingOpen(false)}>Sportsbook</Link>
                    <Link to="/exchange-portfolio" className="navbar-dropdown-item" onClick={() => setBookkeepingOpen(false)}>Bet Exchange</Link>
                  </div>
                )}
              </div>
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
              {isPositive ? '+' : '-'}${Math.abs(pnlValueLive).toFixed(2)}
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

// Small helper component that probes possible logo locations and displays the first that loads.
function LogoImage() {
  const [src, setSrc] = React.useState<string | null>(null)
  React.useEffect(() => {
    let mounted = true
    const candidates = [
      '/assets/png/logo.png',
      '/assets/logo/—Pngtree—unicorn horse glitter copper_4221660.png',
      '/assets/logo/unicorn.png',
    ]
    const probe = async () => {
      for (const c of candidates) {
        try {
          // try to load image
          await new Promise<void>((res, rej) => {
            const img = new Image()
            img.onload = () => res()
            img.onerror = () => rej(new Error('not found'))
            img.src = c
          })
          if (mounted) {
            setSrc(c)
            return
          }
        } catch {
          // try next
        }
      }
    }
    probe()
    return () => { mounted = false }
  }, [])

  if (!src) return <div style={{width:36,height:36}} />
  return <img src={src} alt="betGSIS" className="navbar-logo-img" />
}
