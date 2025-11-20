import React, { useEffect, useState } from 'react';
import { fetchGeoGameCounter, incrementGeoGameCounter } from '../../lib/api/api';
import { useUIStore } from '../../lib/state/uiStore';
import { useAuthStore } from '../../lib/state/authStore';
import './GameCounterPanel.css';

export default function GameCounterPanel() {
  const [counter, setCounter] = useState<{ counter_id: number | null; current_game_id: number; updated_at: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchGeoGameCounter();
      setCounter(r);
      console.log('[BOOKIE-HUB] game counter', r);
    } catch (e) {
      console.error('[BOOKIE-HUB] failed to fetch game counter', e);
      addToast({ message: 'Failed to load game counter', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleIncrement = async () => {
    if (!user || user.role !== 'BOOKIE') {
      addToast({ message: 'Only bookies may increment the game', type: 'error' });
      return;
    }
    // confirm
    const ok = window.confirm('Increment current game id? This will advance the Geo game counter by 1.');
    if (!ok) return;
    try {
      const r = await incrementGeoGameCounter();
      setCounter(r);
      addToast({ message: 'Game counter incremented', type: 'success' });
      console.log('[BOOKIE-HUB] incremented game counter', r);
    } catch (e) {
      console.error('[BOOKIE-HUB] failed to increment', e);
      addToast({ message: 'Failed to increment game counter', type: 'error' });
    }
  };

  if (!counter) return <div className="gc-panel">Loading counter...</div>;

  return (
    <div className="gc-panel">
      <div className="gc-odometer" aria-live="polite">{counter.current_game_id}</div>
      <div className="gc-meta">Updated: {counter.updated_at ? new Date(counter.updated_at).toLocaleString() : '—'}</div>
      <button className="gc-btn" onClick={handleIncrement}>Increment game</button>
    </div>
  );
}
