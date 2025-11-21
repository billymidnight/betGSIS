// Bets store using Zustand
import { create } from 'zustand';

export interface BetSelection {
  id: string;
  playerId: number;
  playerName: string;
  threshold: number;
  side: 'over' | 'under' | 'special';
  decimalOdds: number;
  market?: 'totals' | 'first-guess' | 'country-props' | 'Specials' | 'moneylines' | 'frc' | 'ante';
  outcome?: string | null;
  stake: number;
  estimatedPayout: number;
}

interface BetsStore {
  selections: BetSelection[];
  recentBets: BetSelection[];
  addSelection: (selection: Omit<BetSelection, 'id' | 'estimatedPayout'> & { market?: 'totals' | 'first-guess' | 'country-props' | 'Specials' | 'moneylines' | 'frc' | 'ante' }) => void;
  removeSelection: (id: string) => void;
  updateStake: (id: string, stake: number) => void;
  clearSelections: () => void;
  placeBet: (selection: BetSelection) => void;
}

export const useBetsStore = create<BetsStore>((set) => ({
  selections: [],
  recentBets: [],
  addSelection: (selection) =>
    set((state) => {
      const id = `${selection.playerId}-${selection.threshold}-${selection.side}`;
      const payout = selection.stake * selection.decimalOdds;
      const existing = state.selections.find((s) => s.id === id);
      if (existing) {
        return state;
      }
      return {
        selections: [
          ...state.selections,
          { ...selection, id, estimatedPayout: payout },
        ],
      };
    }),
  removeSelection: (id) =>
    set((state) => ({
      selections: state.selections.filter((s) => s.id !== id),
    })),
  updateStake: (id, stake) =>
    set((state) => ({
      selections: state.selections.map((s) =>
        s.id === id
          ? { ...s, stake, estimatedPayout: stake * s.decimalOdds }
          : s
      ),
    })),
  clearSelections: () => set({ selections: [] }),
  placeBet: (selection) =>
    set((state) => ({
      recentBets: [selection, ...state.recentBets.slice(0, 9)],
      selections: [],
    })),
}));
