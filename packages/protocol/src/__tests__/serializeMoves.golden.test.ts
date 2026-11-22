// Golden test: each adapter's serializeMoves writes exactly the bytes the
// Render server writes to `games.moves`, on fixture games that reach every
// field the stored list keeps. A change here would change what the history
// screens read back. Temporary in one sense only: the copy of the old function
// goes with apps/api, but the fixtures and byte checks are worth keeping.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ReversiEngine } from '../../../shared/src/game-logic/reversi/engine';
import { ADAPTERS } from '../adapters';
import type { OnlineGameAdapter } from '../adapters/types';
import type { GameType } from '../sharedTypes';
import {
  CHECKERS_DRAW, CHECKERS_WIN, CHESS_EVERYTHING, CHESS_FIXTURE, CHESS_FOOLS_MATE, CHESS_STALEMATE,
  REVERSI_FULL, REVERSI_PASSES,
} from './fixtures/games';
import { legacySerializeMoves } from './fixtures/legacySerializeMoves';

const here = dirname(fileURLToPath(import.meta.url));
const lf = (text: string) => text.replace(/\r\n/g, '\n');

/** Every state along a line, opening position included. */
function statesOf(adapter: OnlineGameAdapter, line: ReadonlyArray<unknown>, start?: unknown): unknown[] {
  let state = start ?? adapter.newGame({});
  const states = [state];
  for (const action of line) {
    const side = adapter.sideToMove(state)!;
    const r = adapter.apply(state, side, action);
    if (!r.ok) throw new Error(`fixture action ${JSON.stringify(action)} refused: ${r.reason}`);
    state = r.state;
    states.push(state);
  }
  return states;
}

/** The reversi position the Render hot-fix tests use: black's c1 makes white pass. */
function reversiPassPosition() {
  const board = Array.from({ length: 8 }, () => Array<{ color: 'black' | 'white' } | null>(8).fill(null));
  board[0][0] = { color: 'black' };
  board[0][1] = { color: 'white' };
  board[7][0] = { color: 'black' };
  board[7][1] = { color: 'white' };
  return { ...ReversiEngine.newGame(), board };
}

const GAMES: Array<[string, GameType, ReadonlyArray<unknown>, unknown?]> = [
  ['chess: captures, both castles, en passant, promotion with check', 'chess', CHESS_EVERYTHING],
  ['chess: checkmate', 'chess', CHESS_FOOLS_MATE],
  ['chess: stalemate', 'chess', CHESS_STALEMATE],
  ['chess: a quiet opening', 'chess', CHESS_FIXTURE.lines[1]],
  ['checkers: a win, with multi-jumps', 'checkers', CHECKERS_WIN],
  ['checkers: kings and the move-limit draw', 'checkers', CHECKERS_DRAW],
  ['reversi: four forced passes', 'reversi', REVERSI_PASSES],
  ['reversi: a full board', 'reversi', REVERSI_FULL],
  ['reversi: the seeded auto-pass position', 'reversi', [{ type: 'reversi', position: 'c1' }, { type: 'reversi', position: 'c8' }], reversiPassPosition()],
];

describe('serializeMoves matches the Render server byte for byte', () => {
  it('runs a copy of the old function that still matches the API source', () => {
    const copy = lf(readFileSync(join(here, 'fixtures/legacySerializeMoves.ts'), 'utf8'));
    const verbatim = /\/\/ ── BEGIN verbatim ──\n([\s\S]*?)\/\/ ── END verbatim ──/.exec(copy)![1];
    const api = lf(readFileSync(join(here, '../../../../apps/api/src/services/persistence.service.ts'), 'utf8'));
    expect(verbatim.length).toBeGreaterThan(500);
    expect(api.includes(verbatim)).toBe(true);
  });

  it.each(GAMES)('%s, after every move', (_name, type, line, start) => {
    const adapter = ADAPTERS[type];
    for (const state of statesOf(adapter, line, start)) {
      expect(JSON.stringify(adapter.serializeMoves(state))).toBe(JSON.stringify(legacySerializeMoves(type, state)));
    }
  });

  it.each(['chess', 'checkers', 'reversi'] as const)('%s, on a state with no move list', (type) => {
    for (const state of [{}, { moveHistory: [] }]) {
      expect(JSON.stringify(ADAPTERS[type].serializeMoves(state))).toBe(JSON.stringify(legacySerializeMoves(type, state)));
    }
  });

  // A golden test is only as good as what its fixtures reach.
  it('the fixtures reach every field the stored list keeps', () => {
    const stored = (type: GameType, line: ReadonlyArray<unknown>, start?: unknown) => {
      const states = statesOf(ADAPTERS[type], line, start);
      return ADAPTERS[type].serializeMoves(states[states.length - 1]) as Array<Record<string, unknown>>;
    };

    const chess = [CHESS_EVERYTHING, CHESS_FOOLS_MATE, CHESS_STALEMATE].flatMap(l => stored('chess', l));
    expect(chess.some(m => m.capturedPiece)).toBe(true);
    expect(chess.filter(m => m.isCastling).map(m => m.castlingSide).sort()).toEqual(['kingside', 'queenside']);
    expect(chess.some(m => m.promotion === 'queen')).toBe(true);
    // The engine marks check and mate on the position, never on the move, so
    // these two stored fields have always been empty. If the engine starts
    // filling them, both functions copy them alike, but this fixture check
    // should then assert they are reached.
    expect(chess.some(m => m.isCheck !== undefined || m.isCheckmate !== undefined)).toBe(false);
    const enPassant = statesOf(ADAPTERS.chess, CHESS_EVERYTHING).at(-1) as { moveHistory: Array<{ isEnPassant?: boolean }> };
    expect(enPassant.moveHistory.some(m => m.isEnPassant)).toBe(true);

    const checkers = [CHECKERS_WIN, CHECKERS_DRAW].flatMap(l => stored('checkers', l));
    expect(checkers.some(m => (m.captures as string[]).length > 1 && (m.path as string[]).length > 1)).toBe(true);
    expect(checkers.some(m => m.isKingPromotion)).toBe(true);

    const reversi = stored('reversi', REVERSI_PASSES);
    expect(reversi.some(m => m.position === null)).toBe(true);
    expect(reversi.some(m => (m.flipped as string[]).length > 1)).toBe(true);
  });
});
