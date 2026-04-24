import React, { useEffect, useMemo, useState } from 'react';
import { fetchChopUsers } from '../../lib/api/api';
import './ChopModal.css';

export interface ChopUser {
  user_id: string;
  screenname: string;
  display_name: string;
}

export interface ChopEntry {
  user_id: string;
  display_name: string;
  percentage: number;
}

type Tab = 'player' | 'house';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  playerChops: ChopEntry[];
  houseChops: ChopEntry[];
  onSave: (next: { playerChops: ChopEntry[]; houseChops: ChopEntry[] }) => void;
}

export default function ChopModal({ isOpen, onClose, playerChops, houseChops, onSave }: Props) {
  const [tab, setTab] = useState<Tab>('player');
  const [users, setUsers] = useState<ChopUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftPlayer, setDraftPlayer] = useState<ChopEntry[]>(playerChops);
  const [draftHouse, setDraftHouse] = useState<ChopEntry[]>(houseChops);
  const [pickerValue, setPickerValue] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setDraftPlayer(playerChops);
      setDraftHouse(houseChops);
      setPickerValue('');
      setError(null);
    }
  }, [isOpen, playerChops, houseChops]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchChopUsers()
      .then((data) => {
        if (cancelled) return;
        setUsers(data.users || []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const list = tab === 'player' ? draftPlayer : draftHouse;
  const setList = tab === 'player' ? setDraftPlayer : setDraftHouse;

  const addedIds = useMemo(() => new Set(list.map((e) => e.user_id)), [list]);
  const availableUsers = useMemo(
    () => users.filter((u) => !addedIds.has(u.user_id)),
    [users, addedIds]
  );

  const partnerSum = useMemo(
    () => list.reduce((sum, e) => sum + (Number.isFinite(e.percentage) ? e.percentage : 0), 0),
    [list]
  );
  const residual = Math.max(0, 100 - partnerSum);
  const residualLabel = tab === 'player' ? 'Your share' : 'betgsis share';
  const overAllocated = partnerSum > 100 + 1e-6;

  const addUser = (userId: string) => {
    if (!userId) return;
    const u = users.find((x) => x.user_id === userId);
    if (!u) return;
    setList([...list, { user_id: u.user_id, display_name: u.display_name, percentage: 0 }]);
    setPickerValue('');
  };

  const updatePct = (userId: string, raw: string) => {
    const pct = raw === '' ? 0 : parseFloat(raw);
    setList(list.map((e) => (e.user_id === userId ? { ...e, percentage: Number.isFinite(pct) ? pct : 0 } : e)));
  };

  const removeUser = (userId: string) => {
    setList(list.filter((e) => e.user_id !== userId));
  };

  const splitEvenly = () => {
    if (list.length === 0) return;
    const per = Math.floor((100 / (list.length + (tab === 'player' ? 1 : 1))) * 100) / 100;
    setList(list.map((e) => ({ ...e, percentage: per })));
  };

  const handleSave = () => {
    if (overAllocated) {
      setError('Total exceeds 100%');
      return;
    }
    const clean = (arr: ChopEntry[]) => arr.filter((e) => e.percentage > 0);
    onSave({ playerChops: clean(draftPlayer), houseChops: clean(draftHouse) });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="chop-modal-root" role="dialog" aria-modal="true" aria-label="Chop session P&L">
      <div className="chop-modal-backdrop" onClick={onClose} />
      <div className="chop-modal-panel">
        <div className="chop-modal-header">
          <h2>Chop Session P&amp;L</h2>
          <button type="button" className="chop-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="chop-modal-tabs">
          <button
            type="button"
            className={`chop-tab ${tab === 'player' ? 'is-active' : ''}`}
            onClick={() => setTab('player')}
          >
            Player Chop
            {draftPlayer.length > 0 && <span className="chop-tab-count">{draftPlayer.length}</span>}
          </button>
          <button
            type="button"
            className={`chop-tab ${tab === 'house' ? 'is-active' : ''}`}
            onClick={() => setTab('house')}
          >
            House Chop
            {draftHouse.length > 0 && <span className="chop-tab-count">{draftHouse.length}</span>}
          </button>
        </div>

        <div className="chop-modal-body">
          <p className="chop-modal-hint">
            {tab === 'player'
              ? 'Split YOUR side of the session P&L. Whatever % you do not assign stays with you.'
              : "Split the HOUSE side of the session P&L. Whatever % you do not assign stays with betgsis."}
          </p>

          <div className="chop-picker-row">
            <select
              value={pickerValue}
              onChange={(e) => {
                setPickerValue(e.target.value);
                addUser(e.target.value);
              }}
              disabled={loading || availableUsers.length === 0}
            >
              <option value="">
                {loading
                  ? 'Loading users...'
                  : availableUsers.length === 0
                  ? 'No more users to add'
                  : '+ Add user'}
              </option>
              {availableUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.display_name}
                </option>
              ))}
            </select>
            {list.length > 1 && (
              <button type="button" className="chop-split-btn" onClick={splitEvenly}>
                Split evenly
              </button>
            )}
          </div>

          <ul className="chop-list">
            {list.length === 0 && <li className="chop-list-empty">No chop partners added.</li>}
            {list.map((e) => (
              <li key={e.user_id} className="chop-list-item">
                <span className="chop-name">{e.display_name}</span>
                <div className="chop-pct-wrap">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={Number.isFinite(e.percentage) ? e.percentage : 0}
                    onChange={(ev) => updatePct(e.user_id, ev.target.value)}
                  />
                  <span>%</span>
                </div>
                <button type="button" className="chop-remove" onClick={() => removeUser(e.user_id)} aria-label="Remove">
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className={`chop-totals ${overAllocated ? 'is-over' : ''}`}>
            <div>
              Partners total: <strong>{partnerSum.toFixed(2)}%</strong>
            </div>
            <div>
              {residualLabel}: <strong>{residual.toFixed(2)}%</strong>
            </div>
          </div>

          {error && <div className="chop-error">{error}</div>}
        </div>

        <div className="chop-modal-footer">
          <button type="button" className="chop-btn chop-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="chop-btn chop-btn-primary" onClick={handleSave} disabled={overAllocated}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
