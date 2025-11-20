import React, { useState, useEffect } from 'react';
import { useBetsStore } from '../../lib/state/betsStore';
import { Badge } from '../Shared/Badge';
import './OddsTable.css';
import type { OddsLine } from '../../lib/api/mockApi';

interface OddsTableProps {
  lines: OddsLine[];
  threshold: number;
}

export default function OddsTable({ lines, threshold }: OddsTableProps) {
  const selections = useBetsStore((state) => state.selections);
  const addSelection = useBetsStore((state) => state.addSelection);
  const removeSelection = useBetsStore((state) => state.removeSelection);

  // Check if a line is selected by matching the canonical selection id used in the bets store:
  // `${playerIdNumber}-${threshold}-${side}`
  const isLineSelected = (playerIdStr: string, side: 'over' | 'under', thresh: number) => {
    const pidNum = parseInt(playerIdStr.split('_')[1], 10);
    const selId = `${pidNum}-${thresh}-${side}`;
    return selections.some((s) => s.id === selId);
  };

  return (
    <div className="odds-table">
      <div className="odds-table-header">
        <h3 className="odds-table-title">Odds at {threshold} Threshold</h3>
        <p className="odds-table-subtitle">{lines.length} lines available</p>
      </div>

      <div className="odds-grid">
        {lines.map((line) => {
          const selectedOver = isLineSelected(line.playerId, 'over', threshold);
          const selectedUnder = isLineSelected(line.playerId, 'under', threshold);

          return (
            <div key={line.id} className="odds-card">
              <div className="odds-card-header">
                <div className="odds-player-name">{line.playerName}</div>
                <div className="odds-threshold">{line.threshold}</div>
              </div>

              <div className="odds-split">
                <button
                  className={`odds-side odds-side-clickable ${selectedOver ? 'selected' : ''}`}
                  onClick={() => {
                    const selId = `${parseInt(line.playerId.split('_')[1])}-${threshold}-over`;
                    if (selectedOver) {
                      removeSelection(selId);
                    } else {
                      addSelection({
                        playerId: parseInt(line.playerId.split('_')[1]),
                        playerName: line.playerName,
                        threshold,
                        side: 'over',
                        decimalOdds: line.over.odds,
                        stake: 0,
                      });
                    }
                  }}
                >
                  <div className="odds-side-label">Over</div>
                  <div className="odds-decimal">{line.over.odds}</div>
                  <div className="odds-american">{line.over.american}</div>
                  <Badge variant="primary" size="sm">
                    {line.probability.over}%
                  </Badge>
                  {selectedOver && <div className="odds-checkmark">✓</div>}
                </button>

                <div className="odds-divider" />

                <button
                  className={`odds-side odds-side-clickable ${selectedUnder ? 'selected' : ''}`}
                  onClick={() => {
                    const selId = `${parseInt(line.playerId.split('_')[1])}-${threshold}-under`;
                    if (selectedUnder) {
                      removeSelection(selId);
                    } else {
                      addSelection({
                        playerId: parseInt(line.playerId.split('_')[1]),
                        playerName: line.playerName,
                        threshold,
                        side: 'under',
                        decimalOdds: line.under.odds,
                        stake: 0,
                      });
                    }
                  }}
                >
                  <div className="odds-side-label">Under</div>
                  <div className="odds-decimal">{line.under.odds}</div>
                  <div className="odds-american">{line.under.american}</div>
                  <Badge variant="info" size="sm">
                    {line.probability.under}%
                  </Badge>
                  {selectedUnder && <div className="odds-checkmark">✓</div>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
