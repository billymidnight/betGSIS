import React, { useEffect, useMemo, useState } from 'react';
import {
  verifyLeaderboardKey,
  fetchLeaderboardStats,
  fetchPokerLeaderboard,
  fetchGsPokerLeaderboard,
  fetchTradingLeaderboard,
  fetchSpecialsLeaderboard,
  LeaderboardStats,
  LeaderboardPlayer,
} from '../lib/api/api';
import './Leaderboard.css';

const STORAGE_KEY = 'leaderboard.accessKey';

function formatUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPnlUsd(n: number): string {
  if (n > 0) return `+${formatUsd(n)}`;
  return formatUsd(n);
}

function pnlClass(n: number): string {
  if (n > 0) return 'lb-pnl-pos';
  if (n < 0) return 'lb-pnl-neg';
  return 'lb-pnl-zero';
}

function initialsOf(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/[\s_\-.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function avatarTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 38%)`;
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        className="lb-avatar"
        src={url}
        alt=""
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="lb-avatar lb-avatar-fallback" style={{ background: avatarTint(name) }}>
      {initialsOf(name)}
    </span>
  );
}

function PlayerCell({ player }: { player: LeaderboardPlayer }) {
  return (
    <span className="lb-player-cell">
      <Avatar url={player.avatar_url} name={player.screenname} />
      <span className="lb-player-name">{player.screenname}</span>
    </span>
  );
}

type SortDir = 'asc' | 'desc';

interface Column {
  key: string;
  label: string;
  numeric?: boolean;
  pnl?: boolean;
  player?: boolean;
  get: (p: LeaderboardPlayer) => number | string;
}

function LeaderboardTable({
  title,
  subtitle,
  players,
  columns,
}: {
  title: string;
  subtitle?: string;
  players: LeaderboardPlayer[];
  columns: Column[];
}) {
  const [sortKey, setSortKey] = useState<string>(columns[0]?.key || 'screenname');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    const arr = [...players];
    arr.sort((a, b) => {
      const av = col ? col.get(a) : a.screenname;
      const bv = col ? col.get(b) : b.screenname;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === 'asc' ? -1 : 1;
      if (as > bs) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [players, columns, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      const col = columns.find((c) => c.key === key);
      setSortDir(col?.numeric ? 'desc' : 'asc');
    }
  };

  return (
    <section className="lb-section">
      <div className="lb-section-head">
        <h2 className="lb-section-title">{title}</h2>
        {subtitle && <span className="lb-section-subtitle">{subtitle}</span>}
        <span className="lb-count">{players.length} {players.length === 1 ? 'player' : 'players'}</span>
      </div>

      {players.length === 0 ? (
        <div className="lb-empty">No activity yet.</div>
      ) : (
        <div className="lb-table-wrap">
          <table className="lb-table">
            <thead>
              <tr>
                <th className="lb-th-rank">#</th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`${c.numeric ? 'lb-th-num' : ''} ${sortKey === c.key ? 'is-sorted' : ''}`}
                    role="button"
                  >
                    {c.label}
                    {sortKey === c.key && <span className="lb-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.user_id}>
                  <td className="lb-rank">{i + 1}</td>
                  {columns.map((c) => {
                    if (c.player) {
                      return (
                        <td key={c.key} className="lb-td-player">
                          <PlayerCell player={p} />
                        </td>
                      );
                    }
                    const v = c.get(p);
                    if (c.pnl && typeof v === 'number') {
                      return (
                        <td key={c.key} className={`lb-td-num ${pnlClass(v)}`}>
                          {formatPnlUsd(v)}
                        </td>
                      );
                    }
                    if (c.numeric && typeof v === 'number') {
                      return <td key={c.key} className="lb-td-num">{v.toLocaleString('en-US')}</td>;
                    }
                    return <td key={c.key}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AccessGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const ok = await verifyLeaderboardKey(input.trim());
      if (ok) {
        onUnlock(input.trim());
      } else {
        setErr('Invalid access key.');
      }
    } catch {
      setErr('Could not verify key.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lb-gate">
      <div className="lb-gate-card">
        <div className="lb-gate-eyebrow">Restricted</div>
        <h1 className="lb-gate-title">Leaderboard</h1>
        <p className="lb-gate-sub">Enter the access key to view stats.</p>
        <form onSubmit={submit} className="lb-gate-form">
          <input
            type="password"
            placeholder="Access key"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            className="lb-gate-input"
          />
          <button type="submit" className="lb-gate-btn" disabled={busy || !input.trim()}>
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
        {err && <div className="lb-gate-err">{err}</div>}
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [key, setKey] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [poker, setPoker] = useState<LeaderboardPlayer[]>([]);
  const [gsPoker, setGsPoker] = useState<LeaderboardPlayer[]>([]);
  const [trading, setTrading] = useState<LeaderboardPlayer[]>([]);
  const [specials, setSpecials] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unlock = (k: string) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, k);
    } catch {
      // ignore storage failures
    }
    setKey(k);
  };

  const lock = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
    setKey(null);
    setStats(null);
    setPoker([]);
    setGsPoker([]);
    setTrading([]);
    setSpecials([]);
  };

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    Promise.all([
      fetchLeaderboardStats(key),
      fetchPokerLeaderboard(key),
      fetchGsPokerLeaderboard(key),
      fetchTradingLeaderboard(key),
      fetchSpecialsLeaderboard(key),
    ])
      .then(([s, p, g, t, sp]) => {
        if (cancelled) return;
        setStats(s);
        setPoker(p);
        setGsPoker(g);
        setTrading(t);
        setSpecials(sp);
      })
      .catch(() => {
        if (cancelled) return;
        setErr('Failed to load leaderboard. Access key may have expired.');
        lock();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return <AccessGate onUnlock={unlock} />;

  const pokerCols: Column[] = [
    { key: 'screenname', label: 'Player', player: true, get: (p) => p.screenname },
    { key: 'bets', label: 'Games', numeric: true, get: (p) => p.bets },
    { key: 'pnl', label: 'Total P&L', numeric: true, pnl: true, get: (p) => p.pnl },
    { key: 'cash_pnl', label: 'Cash Game P&L', numeric: true, pnl: true, get: (p) => p.cash_pnl },
    { key: 'tournament_pnl', label: 'Tournament P&L', numeric: true, pnl: true, get: (p) => p.tournament_pnl },
  ];

  const singlePnlCols: Column[] = [
    { key: 'screenname', label: 'Player', player: true, get: (p) => p.screenname },
    { key: 'bets', label: 'Games', numeric: true, get: (p) => p.bets },
    { key: 'pnl', label: 'Net P&L', numeric: true, pnl: true, get: (p) => p.pnl },
  ];

  return (
    <div className="lb-page">
      <header className="lb-page-head">
        <div>
          <div className="lb-eyebrow">Stats</div>
          <h1 className="lb-page-title">Leaderboard</h1>
        </div>
        <button className="lb-lock-btn" onClick={lock} title="Lock this page">
          Lock
        </button>
      </header>

      {loading && <div className="lb-loading">Loading…</div>}
      {err && <div className="lb-error">{err}</div>}

      {stats && (
        <section className="lb-stats-box">
          <div className="lb-stats-head">
            <span className="lb-stats-kicker">House</span>
            <h2 className="lb-stats-title">betGSIS</h2>
          </div>
          <div className="lb-stats-grid">
            <div className="lb-stat">
              <div className="lb-stat-label">Net Wagered</div>
              <div className="lb-stat-value">{formatUsd(stats.net_wagered)}</div>
            </div>
            <div className="lb-stat">
              <div className="lb-stat-label">Total Bets</div>
              <div className="lb-stat-value">{stats.total_bets.toLocaleString('en-US')}</div>
            </div>
            <div className="lb-stat lb-stat-wide">
              <div className="lb-stat-label">Highest-Volume Market</div>
              {stats.top_market ? (
                <div className="lb-stat-value lb-stat-value-market">
                  <span className="lb-top-market-name">{stats.top_market.market}</span>
                  <span className="lb-top-market-meta">
                    {formatUsd(stats.top_market.volume)} · {stats.top_market.bet_count} bets
                  </span>
                </div>
              ) : (
                <div className="lb-stat-value">—</div>
              )}
            </div>
          </div>
        </section>
      )}

      <LeaderboardTable
        title="Poker"
        subtitle={`market = "Poker"`}
        players={poker}
        columns={pokerCols}
      />
      <LeaderboardTable
        title="GS Poker"
        subtitle={`market = "GS Poker"`}
        players={gsPoker}
        columns={singlePnlCols}
      />
      <LeaderboardTable
        title="Trading + Stocks"
        subtitle={`market in ("Trading", "Stocks")`}
        players={trading}
        columns={singlePnlCols}
      />
      <LeaderboardTable
        title="Specials"
        subtitle={`market = "Specials"`}
        players={specials}
        columns={singlePnlCols}
      />
    </div>
  );
}
