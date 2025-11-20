import React, { useEffect, useState } from 'react';
import { fetchPricingContinentProps } from '../../lib/api/api';
import { useBetsStore } from '../../lib/state/betsStore';
import { americanToDecimal } from '../../lib/format';

export default function ContinentPropsList() {
  const [continents, setContinents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean>(false);
  const addSelection = useBetsStore((s) => s.addSelection);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchPricingContinentProps(5);
        // expected shape: { config: {...}, continents: [ { name, p, freq, hooks: [ {hook, overOddsAmerican, underOddsAmerican} ] } ] }
        const list = (res && res.continents) || res || [];
        if (mounted) setContinents(list);
      } catch (e) {
        console.error('Failed to fetch continent props', e);
        if (mounted) setContinents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div style={{padding: 8, color: '#999'}}>Loading continent totals...</div>;
  if (!continents || continents.length === 0) return <div style={{padding: 8, color: '#999'}}>No continent totals available</div>;

  // Flattened hook count so we can show only the first N outcomes when collapsed
  const HOOK_LIMIT = 6;
  let hookCounter = 0;
  let totalHooks = 0;
  continents.forEach((c) => { if (Array.isArray(c.hooks)) totalHooks += c.hooks.length; });

  return (
    <div className="continent-props">
      {continents.map((c: any) => (
        <div key={c.name} className="continent-block player-card" style={{padding: '0.5rem', borderRadius: 8, marginBottom: 8}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
            <div style={{fontWeight: 800, fontSize: '1.05rem'}}>{c.name}</div>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: '1fr', gap: 8}}>
            {Array.isArray(c.hooks) ? c.hooks.map((h: any) => {
              // h: { hook, overOddsAmerican, underOddsAmerican }
              const overA = h.overOddsAmerican ?? h.overOdds ?? h.over ?? '';
              const underA = h.underOddsAmerican ?? h.underOdds ?? h.under ?? '';

              // parse american string to int then to decimal
              let overDec = 1.0;
              let underDec = 1.0;
              try {
                const oa = String(overA || '').replace('+', '').trim();
                const oi = oa === '' ? null : parseInt(oa, 10);
                overDec = oi !== null && !isNaN(oi) ? americanToDecimal(oi) : 1.0;
              } catch (e) {
                overDec = 1.0;
              }
              try {
                const ua = String(underA || '').replace('+', '').trim();
                const ui = ua === '' ? null : parseInt(ua, 10);
                underDec = ui !== null && !isNaN(ui) ? americanToDecimal(ui) : 1.0;
              } catch (e) {
                underDec = 1.0;
              }

              // Determine whether to render this hook when collapsed
              const shouldRender = expanded || hookCounter < HOOK_LIMIT;
              hookCounter += 1;

              if (!shouldRender) return null;

              // Normalize hook value: if hook is an integer (e.g., 2) append .5 (-> 2.5)
              const rawHook = h.hook;
              let hookNum = typeof rawHook === 'string' ? parseFloat(rawHook) : Number(rawHook);
              if (isNaN(hookNum)) hookNum = rawHook as any;
              const processedHook = typeof hookNum === 'number' ? (hookNum % 1 === 0 ? hookNum + 0.5 : hookNum) : hookNum;
              const formattedHook = (typeof processedHook === 'number') ? String(processedHook) : String(processedHook);

              return (
                <div key={`${c.name}-hook-${h.hook}`} style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                  <div style={{fontSize: '0.9rem', color: '#bbb', fontWeight: 700, marginBottom: 4}}>{`Over ${formattedHook} / Under ${formattedHook}`}</div>
                  <div className="hook-row" style={{display: 'flex', gap: 8}}>
                  <button className="price-btn over" onClick={() => {
                    const sel = { playerId: -1, playerName: c.name, point: processedHook, threshold: processedHook, side: 'over' as const, decimalOdds: overDec, stake: 0, market: 'Continent Totals', outcome: `${c.name}: Over ${formattedHook}`, odds_american: overA };
                    addSelection(sel as any);
                  }} style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      <div className="odds-box">
                        <div className="hook-label" style={{fontSize: '0.95rem', fontWeight: 800, color: '#6a0dad', marginBottom: 6}}>{`Over ${formattedHook}`}</div>
                        <div className="price-large">{h.overOddsAmerican || overA}</div>
                        <div className="price-small">{(overDec || 1.0).toFixed(2)}</div>
                      </div>
                  </button>

                  <button className="price-btn under" onClick={() => {
                    const sel = { playerId: -1, playerName: c.name, point: processedHook, threshold: processedHook, side: 'under' as const, decimalOdds: underDec, stake: 0, market: 'Continent Totals', outcome: `${c.name}: Under ${formattedHook}`, odds_american: underA };
                    addSelection(sel as any);
                  }} style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <div className="odds-box">
                      <div className="hook-label" style={{fontSize: '0.95rem', fontWeight: 800, color: '#6a0dad', marginBottom: 6}}>{`Under ${formattedHook}`}</div>
                      <div className="price-large">{h.underOddsAmerican || underA}</div>
                      <div className="price-small">{(underDec || 1.0).toFixed(2)}</div>
                    </div>
                  </button>
                </div>
              </div>
              );
            }) : null}
          </div>
        </div>
      ))}

      {totalHooks > HOOK_LIMIT && (
        <div style={{textAlign: 'center', marginTop: 6}}>
          <button className="market-tab" onClick={() => setExpanded((s) => !s)}>{expanded ? 'Show less' : `Show all (${totalHooks})`}</button>
        </div>
      )}
    </div>
  );
}
