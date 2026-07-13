import { describe, expect, it } from 'vitest';
import {
  STOCKFISH_MIN_ELO,
  buildUciPositionCommand,
  clampStockfishElo,
  parseUciBestMove,
  stockfishMoveTimeMs,
  uciMoveString,
} from './uci';

describe('uciMoveString', () => {
  it('formats a plain move', () => {
    expect(uciMoveString({ from: 'e2', to: 'e4' })).toBe('e2e4');
  });

  it('formats queen promotion as q', () => {
    expect(uciMoveString({ from: 'e7', to: 'e8', promotion: 'queen' })).toBe('e7e8q');
  });

  it('formats knight promotion as n (not the first letter of "knight")', () => {
    expect(uciMoveString({ from: 'b7', to: 'a8', promotion: 'knight' })).toBe('b7a8n');
  });

  it('formats rook and bishop promotions', () => {
    expect(uciMoveString({ from: 'c7', to: 'c8', promotion: 'rook' })).toBe('c7c8r');
    expect(uciMoveString({ from: 'h7', to: 'h8', promotion: 'bishop' })).toBe('h7h8b');
  });
});

describe('buildUciPositionCommand', () => {
  it('uses bare startpos for a fresh game', () => {
    expect(buildUciPositionCommand([])).toBe('position startpos');
  });

  it('replays the move history in order', () => {
    expect(
      buildUciPositionCommand([
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
        { from: 'g1', to: 'f3' },
      ]),
    ).toBe('position startpos moves e2e4 e7e5 g1f3');
  });

  it('includes promotion suffixes in the replay', () => {
    expect(
      buildUciPositionCommand([
        { from: 'e2', to: 'e4' },
        { from: 'b7', to: 'b8', promotion: 'knight' },
      ]),
    ).toBe('position startpos moves e2e4 b7b8n');
  });
});

describe('parseUciBestMove', () => {
  it('parses a plain bestmove', () => {
    expect(parseUciBestMove('bestmove e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
  });

  it('parses bestmove with ponder suffix', () => {
    expect(parseUciBestMove('bestmove d7d5 ponder c2c4')).toEqual({
      from: 'd7',
      to: 'd5',
      promotion: undefined,
    });
  });

  it('parses promotions back to piece names', () => {
    expect(parseUciBestMove('bestmove e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'queen' });
    expect(parseUciBestMove('bestmove a2a1n ponder e2e4')).toEqual({
      from: 'a2',
      to: 'a1',
      promotion: 'knight',
    });
  });

  it('returns null for non-bestmove engine chatter', () => {
    expect(parseUciBestMove('info depth 12 score cp 34 pv e2e4')).toBeNull();
    expect(parseUciBestMove('uciok')).toBeNull();
    expect(parseUciBestMove('readyok')).toBeNull();
  });

  it('returns null for bestmove (none) on finished positions', () => {
    expect(parseUciBestMove('bestmove (none)')).toBeNull();
  });

  it('returns null for a malformed move token', () => {
    expect(parseUciBestMove('bestmove')).toBeNull();
    expect(parseUciBestMove('bestmove z9z9')).toBeNull();
  });
});

describe('clampStockfishElo', () => {
  it('clamps below the UCI_Elo floor', () => {
    expect(clampStockfishElo(1000)).toBe(1320);
  });

  it('clamps above the UCI_Elo ceiling', () => {
    expect(clampStockfishElo(9000)).toBe(3190);
  });

  it('passes through in-range values', () => {
    expect(clampStockfishElo(2000)).toBe(2000);
  });
});

describe('stockfishMoveTimeMs', () => {
  it('gives the base budget at the Stockfish threshold', () => {
    expect(stockfishMoveTimeMs(STOCKFISH_MIN_ELO)).toBe(500);
  });

  it('scales up toward the ceiling', () => {
    expect(stockfishMoveTimeMs(3000)).toBe(1500);
  });
});
