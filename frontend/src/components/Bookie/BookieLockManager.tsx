import React, { useEffect, useState } from 'react';
import { fetchLocks, updateLock } from '../../lib/api/api';
import { useUIStore } from '../../lib/state/uiStore';
import './BookieLockManager.css';

export default function BookieLockManager() {
  const [markets, setMarkets] = useState<Array<{ lockid: number | null; market: string; locked: boolean }>>([]);
  const [master, setMaster] = useState<boolean>(false);
  const addToast = useUIStore((s) => s.addToast);

  useEffect(() => {
    console.log('[BOOKIE-HUB] BookieLockManager mounted');
    loadLocks();
  }, []);

  const loadLocks = async () => {
    console.log('[BOOKIE-HUB] fetching /api/locks');
    try {
      const r = await fetchLocks();
      const js = r.data || r;
      console.log('[BOOKIE-HUB] locks fetched', js);
      setMaster(!!js.master);
      setMarkets(Array.isArray(js.markets) ? js.markets : []);
    } catch (e) {
      console.error('[BOOKIE-HUB] failed to fetch locks', e);
      addToast({ message: 'Failed to load locks', type: 'error' });
    }
  };

  const handleToggle = async (lockid: number | null, currentlyLocked: boolean) => {
    if (lockid == null) return;
    const newVal = !currentlyLocked;
    // optimistic UI
    setMarkets((prev) => prev.map((m) => (m.lockid === lockid ? { ...m, locked: newVal } : m)));
    if (markets && markets.find((x) => x.lockid === lockid && (x.market || '').toLowerCase() === 'master')) {
      setMaster(newVal);
    }
    console.log('[BOOKIE-HUB] toggling lock', { lockid, newVal });
    try {
      const res = await updateLock(lockid, newVal);
      console.log('[BOOKIE-HUB] lock update response', res);
      addToast({ message: `Lock ${res.get ? res.get('market') : (res.market || lockid)} updated`, type: 'success' });
      // refresh bookkeeping or locks if desired
    } catch (err) {
      console.error('[BOOKIE-HUB] failed to update lock', err);
      // revert optimistic
      setMarkets((prev) => prev.map((m) => (m.lockid === lockid ? { ...m, locked: currentlyLocked } : m)));
      // revert master if needed
      if (markets && markets.find((x) => x.lockid === lockid && (x.market || '').toLowerCase() === 'master')) {
        setMaster(currentlyLocked);
      }
      addToast({ message: 'Failed to update lock. Please retry.', type: 'error' });
    }
  };

  return (
    <div className="bookie-lock-manager">
      <h2 className="blm-title">Master Locker — Lock Manager</h2>

      <div className="blm-grid">
        {markets.map((m) => (
          <div key={String(m.lockid) + '-' + m.market} className={`blm-row ${((m.market || '').toLowerCase() === 'master') ? 'blm-master' : ''}`}>
            <div className="blm-name">{m.market}</div>
            <div className="blm-toggle-wrapper">
              <button
                aria-pressed={m.locked}
                aria-label={`${m.market} ${m.locked ? 'locked' : 'unlocked'}`}
                className={`blm-toggle ${m.locked ? 'locked' : 'unlocked'}`}
                onClick={() => handleToggle(m.lockid, m.locked)}
              >
                {/* show the ACTION (what will happen when clicked): if currently locked -> show Unlock action */}
                <span className="blm-emoji" aria-hidden="true">{m.locked ? '🔒' : '🔓'}</span>
                <span className="blm-text">{m.locked ? 'Unlock' : 'Lock'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
