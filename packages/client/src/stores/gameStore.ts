import { create } from 'zustand';
import type {
  ClockSnapshot, GameResult, EndReason, UserSummary,
  TimeControlConfig, MultiplayerStatus, RatingInfo,
} from '@finesse/shared';
import type { ChessGameState }    from '@finesse/shared';
import type { CheckersGameState } from '@finesse/shared';
import type { ReversiGameState }  from '@finesse/shared';

export type AnyGameState = ChessGameState | CheckersGameState | ReversiGameState;

interface GameEndData {
  result:  GameResult;
  reason:  EndReason;
  white:   RatingInfo;
  black:   RatingInfo;
}

interface GameStore {
  gameId:            string | null;
  gameType:          'chess' | 'checkers' | 'reversi' | null;
  myColor:           'white' | 'black' | null;
  gameState:         AnyGameState | null;
  opponent:          UserSummary | null;
  clocks:            ClockSnapshot | null;
  clockSyncedAt:     number;
  timeControlConfig: TimeControlConfig | null;
  status:            MultiplayerStatus;
  gameEndData:       GameEndData | null;
  aborted:           boolean;
  drawOffered:       boolean;
  opponentGone:      boolean;
  opponentGraceMs:   number;

  setQueued:       (gameType: 'chess' | 'checkers' | 'reversi') => void;
  markAborted:     () => void;
  setGame:         (gameId: string, gameType: 'chess' | 'checkers' | 'reversi', myColor: 'white' | 'black', initialState: AnyGameState, opponent: UserSummary, clocks: ClockSnapshot, timeControlConfig: TimeControlConfig) => void;
  applyMove:       (newState: AnyGameState, clocks: ClockSnapshot) => void;
  syncClocks:      (clocks: ClockSnapshot) => void;
  endGame:         (data: GameEndData) => void;
  setDrawOffered:  (offered: boolean) => void;
  setOpponentGone: (gone: boolean, graceMs?: number) => void;
  reset:           () => void;
}

const initial = {
  gameId:            null,
  gameType:          null,
  myColor:           null,
  gameState:         null,
  opponent:          null,
  clocks:            null,
  clockSyncedAt:     0,
  timeControlConfig: null,
  status:            'idle' as MultiplayerStatus,
  gameEndData:       null,
  aborted:           false,
  drawOffered:       false,
  opponentGone:      false,
  opponentGraceMs:   0,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initial,

  setQueued: (gameType) => set({ status: 'queued', gameType }),

  markAborted: () => set({ status: 'ended', aborted: true }),

  setGame: (gameId, gameType, myColor, initialState, opponent, clocks, timeControlConfig) =>
    set({ gameId, gameType, myColor, gameState: initialState, opponent, clocks, clockSyncedAt: Date.now(), timeControlConfig, status: 'active', gameEndData: null, aborted: false, drawOffered: false, opponentGone: false }),

  applyMove: (newState, clocks) =>
    set({ gameState: newState, clocks, clockSyncedAt: Date.now() }),

  syncClocks: (clocks) =>
    set({ clocks, clockSyncedAt: Date.now() }),

  endGame: (data) =>
    set({ status: 'ended', gameEndData: data }),

  setDrawOffered: (offered) => set({ drawOffered: offered }),

  setOpponentGone: (gone, graceMs = 60_000) =>
    set({ opponentGone: gone, opponentGraceMs: gone ? graceMs : 0 }),

  reset: () => set({ ...initial }),
}));
