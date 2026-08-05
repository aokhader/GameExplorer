import { describe, expect, it } from 'vitest';
import {
  ENGINE_MIN_ELO,
  buildUciPositionCommand,
  buildUciPositionFromFen,
  clampStockfishElo,
  parseUciBestMove,
  parseUciInfoScore,
  parseUciMoveString,
  engineMoveTimeMs,
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

describe('buildUciPositionFromFen', () => {
  const FEN = '4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1';

  it('sends the bare position when nothing has been played from it', () => {
    expect(buildUciPositionFromFen(FEN)).toBe(`position fen ${FEN}`);
  });

  it('treats an empty history the same as none', () => {
    expect(buildUciPositionFromFen(FEN, [])).toBe(`position fen ${FEN}`);
  });

  it('appends moves played since the seeded position', () => {
    expect(
      buildUciPositionFromFen(FEN, [
        { from: 'g8', to: 'h8' },
        { from: 'e8', to: 'h8' },
      ]),
    ).toBe(`position fen ${FEN} moves g8h8 e8h8`);
  });

  it('includes promotion suffixes', () => {
    expect(
      buildUciPositionFromFen(FEN, [{ from: 'b7', to: 'b8', promotion: 'knight' }]),
    ).toBe(`position fen ${FEN} moves b7b8n`);
  });

  it('never claims the start position — that is the whole point of this builder', () => {
    expect(buildUciPositionFromFen(FEN)).not.toContain('startpos');
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

describe('parseUciInfoScore', () => {
  it('reads a centipawn line with its depth and PV', () => {
    const info = parseUciInfoScore(
      'info depth 18 seldepth 24 score cp -37 nodes 900000 pv e2e4 e7e5 g1f3',
    );
    expect(info).toEqual({ cp: -37, mate: null, depth: 18, pv: ['e2e4', 'e7e5', 'g1f3'] });
  });

  it('reads a mate line', () => {
    const info = parseUciInfoScore('info depth 12 score mate 3 pv d1h5');
    expect(info?.mate).toBe(3);
    expect(info?.cp).toBeNull();
  });

  it('reads a negative mate score (the engine is getting mated)', () => {
    expect(parseUciInfoScore('info depth 9 score mate -2 pv a1a2')?.mate).toBe(-2);
  });

  it('copes with a score line that carries no PV', () => {
    const info = parseUciInfoScore('info depth 4 score cp 12 nodes 100');
    expect(info).toEqual({ cp: 12, mate: null, depth: 4, pv: [] });
  });

  it('ignores lines without a score, and non-info lines', () => {
    expect(parseUciInfoScore('info depth 1 currmove e2e4')).toBeNull();
    expect(parseUciInfoScore('bestmove e2e4')).toBeNull();
    expect(parseUciInfoScore('readyok')).toBeNull();
  });
});

describe('parseUciMoveString', () => {
  it('parses a plain move', () => {
    expect(parseUciMoveString('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
  });

  it('parses an underpromotion to knight, not "n"-for-nothing', () => {
    expect(parseUciMoveString('e7e8n')?.promotion).toBe('knight');
  });

  it('rejects anything that is not a move', () => {
    expect(parseUciMoveString('(none)')).toBeNull();
    expect(parseUciMoveString('z9z9')).toBeNull();
    expect(parseUciMoveString('')).toBeNull();
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

describe('engineMoveTimeMs', () => {
  it('gives the base budget at the engine threshold', () => {
    expect(engineMoveTimeMs(ENGINE_MIN_ELO)).toBe(500);
  });

  it('scales up toward the ceiling', () => {
    expect(engineMoveTimeMs(3000)).toBe(1500);
  });
});
