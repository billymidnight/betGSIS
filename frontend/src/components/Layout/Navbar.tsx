import ProfileIcon from './ProfileIcon';
import React, { useEffect, useState } from 'react';
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
      const bets = await fetchMyBets();
      if (!bets || !Array.isArray(bets)) {
        setPnlValueLive(0);
        return;
      }
      let total = 0;
      for (const b of bets) {
        const stake = Number(b.bet_size ?? b.stake ?? 0) || 0;
        // prefer stored decimal odds, otherwise convert from american
        let dec = null;
        if (b.odds_decimal || b.odds_decimal === 0) dec = Number(b.odds_decimal);
        else if (b.decimal_odds || b.odds_decimal) dec = Number(b.decimal_odds || b.odds_decimal);
        else if (b.odds_american || b.odds) {
          // parse american like '+480' or '-150'
          const raw = String(b.odds_american ?? b.odds ?? '');
          const num = parseInt(raw.replace('+', ''), 10);
          if (!Number.isNaN(num)) dec = americanToDecimal(num);
        }

        const status = (b.result ?? '').toString().toLowerCase();
        let profit = 0;
        if (status === 'win') {
          if (dec && !Number.isNaN(Number(dec))) profit = stake * (Number(dec) - 1.0);
          else profit = 0;
        } else if (status === 'loss') {
          profit = -stake;
        } else {
          // pending / other -> ignore
          profit = 0;
        }
        total += Number(profit || 0);
      }
      setPnlValueLive(total);
    } catch (e) {
      // on error, do not crash the nav; leave previous pnl
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

    // periodic refresh every 15s
    const iv = setInterval(() => computePnl(), 15000);

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
