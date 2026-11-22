// Fixture games for the conformance suite and the serializeMoves golden test.
//
// Chess is written out by hand, to reach every field the stored move list
// keeps. Checkers and reversi are played out by a fixed rule (move number i
// takes legal move (i × k) mod n), which reaches multi-jumps, kings and forced
// passes without a hundred hand-checked moves. Same rule, same game, every run.
import { CheckersEngine } from '../../../../shared/src/game-logic/checkers/engine';
import { getAllLegalMoves as checkersLegalMoves } from '../../../../shared/src/game-logic/checkers/moves';
import { ReversiEngine } from '../../../../shared/src/game-logic/reversi/engine';
import type { CheckersGameState } from '../../../../shared/src/game-logic/checkers/types';
import type { ReversiGameState } from '../../../../shared/src/game-logic/reversi/types';
import { checkersAdapter } from '../../adapters/checkers';
import { reversiAdapter } from '../../adapters/reversi';
import type { ConformanceFixture } from '../../adapters/conformance';
import type { ChessMove, CheckersMove, ReversiMove } from '../../schemas';

// ── Chess ─────────────────────────────────────────────────────────────────────

function chess(moves: string): ChessMove[] {
  return moves.trim().split(/\s+/).map(m => {
    const [, from, to, promo] = /^([a-h][1-8])([a-h][1-8])(?:=([qrbn]))?$/.exec(m)!;
    const promotion = ({ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' } as const)[promo as 'q' | 'r' | 'b' | 'n'];
    return promotion ? { type: 'chess', from, to, promotion } : { type: 'chess', from, to };
  });
}

/**
 * Captures, castling on both sides, en passant, a promotion that gives check,
 * and a king walking out of it. Not over.
 */
export const CHESS_EVERYTHING = chess(`
  e2e4 d7d5  e4d5 g8f6  g1f3 f6d5  f1c4 c8g4  e1g1 b8c6  d2d4 d8d6
  c1g5 e8c8  a2a4 h7h6  a4a5 b7b5  a5b6 h6g5  b6a7 e7e6  a7a8=q c8d7
`);

/** The shortest mate. Black wins. */
export const CHESS_FOOLS_MATE = chess('f2f3 e7e5  g2g4 d8h4');

/** A well-known ten-move stalemate, with white to deliver it. A draw. */
export const CHESS_STALEMATE = chess(`
  e2e3 a7a5  d1h5 a8a6  h5a5 h7h5  h2h4 a6h6  a5c7 f7f6
  c7d7 e8f7  d7b7 d8d3  b7b8 d3h7  b8c8 f7g6  c8e6
`);

export const CHESS_FIXTURE: ConformanceFixture = {
  firstToMove: 'white',
  lines: [CHESS_EVERYTHING, chess('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6')],
  endings: [
    { line: CHESS_FOOLS_MATE, gameOver: { result: 'black_wins', reason: 'checkmate' } },
    { line: CHESS_STALEMATE,  gameOver: { result: 'draw', reason: 'stalemate' } },
  ],
  illegal: chess('e2e5 a1a3 e1e2 g1g3 d4d5 e7e5 b1d2'),
  malformed: [
    { type: 'chess', from: 'z9', to: 'e4' },
    { type: 'chess', from: 'e2', to: 'e9' },
    { type: 'chess', from: 'i1', to: 'a0' },
    { type: 'chess', from: 'E2', to: 'E4' },
    { type: 'chess', from: 'e2 ', to: 'e4' },
    { type: 'chess', from: 'e2' },
    { type: 'chess', from: 2, to: 4 },
    { type: 'chess', from: 'e2', to: 'e4', promotion: 'king' },
    { type: 'chess', from: 'e2', to: 'e4', promotion: 'q' },
    { type: 'chess', from: { $ne: null }, to: 'e4' },
    { type: 'checkers', from: 'c3', to: 'd4' },
    { type: 'reversi', position: 'd3' },
    { from: 'e2', to: 'e4' },
    'e2e4',
  ],
};

// ── Played-out games ──────────────────────────────────────────────────────────

/** Plays until the game ends or `maxPlies`, taking legal move (i × k) mod n. */
function playOut<S, A>(
  adapter: { newGame(o: Record<string, never>): S; apply(s: S, c: 'white' | 'black', a: unknown): { ok: true; state: S } | { ok: false; reason: string }; sideToMove(s: S): 'white' | 'black' | null },
  legal: (s: S) => A[],
  k: number,
  maxPlies = 1000,
): A[] {
  let state = adapter.newGame({});
  const line: A[] = [];
  for (let i = 0; i < maxPlies; i++) {
    const moves = legal(state);
    const side = adapter.sideToMove(state);
    if (moves.length === 0 || side === null) break;
    const action = moves[(i * k) % moves.length];
    const r = adapter.apply(state, side, action);
    if (!r.ok) throw new Error(`fixture move ${i} refused: ${r.reason}`);
    line.push(action);
    state = r.state;
  }
  return line;
}

const checkersMoves = (s: CheckersGameState): CheckersMove[] =>
  s.isGameOver ? [] : checkersLegalMoves(s.board, s.currentTurn).map(m => ({ type: 'checkers', from: m.from, to: m.to }));

const reversiMoves = (s: ReversiGameState): ReversiMove[] =>
  ReversiEngine.getAllLegalMoves(s).map(position => ({ type: 'reversi', position }));

/** White wins: black is left with no move. 47 plies, two multi-jumps. */
export const CHECKERS_WIN = playOut(checkersAdapter, checkersMoves, 0);
/** Kings on both sides, three multi-jumps, and the move-limit draw. */
export const CHECKERS_DRAW = playOut(checkersAdapter, checkersMoves, 3);

export const CHECKERS_FIXTURE: ConformanceFixture = {
  firstToMove: CheckersEngine.newGame().currentTurn,
  lines: [CHECKERS_WIN.slice(0, 20), CHECKERS_DRAW.slice(0, 40)],
  endings: [
    { line: CHECKERS_WIN,  gameOver: { result: 'white_wins', reason: 'no_moves' } },
    { line: CHECKERS_DRAW, gameOver: { result: 'draw', reason: 'fifty_move' } },
  ],
  illegal: [
    { type: 'checkers', from: 'a3', to: 'b5' },
    { type: 'checkers', from: 'd4', to: 'e5' },
    { type: 'checkers', from: 'a1', to: 'b2' },
    { type: 'checkers', from: 'b6', to: 'a5' },
  ],
  malformed: [
    { type: 'checkers', from: 'z9', to: 'a1' },
    { type: 'checkers', from: 'c3', to: 'd9' },
    { type: 'checkers', from: 'c3' },
    { type: 'checkers', from: ['c3'], to: 'd4' },
    { type: 'chess', from: 'c3', to: 'd4' },
    { type: 'reversi', position: 'c3' },
  ],
};

/** White wins, with four forced passes on the way. */
export const REVERSI_PASSES = playOut(reversiAdapter, reversiMoves, 0);
/** A full board with no passes. */
export const REVERSI_FULL = playOut(reversiAdapter, reversiMoves, 5);

export const REVERSI_FIXTURE: ConformanceFixture = {
  firstToMove: 'black',
  lines: [REVERSI_FULL.slice(0, 20), REVERSI_PASSES.slice(0, 30)],
  endings: [
    { line: REVERSI_PASSES, gameOver: { result: 'white_wins', reason: 'board_full' } },
    { line: REVERSI_FULL,   gameOver: { result: 'white_wins', reason: 'board_full' } },
  ],
  illegal: [
    { type: 'reversi', position: 'd4' }, // occupied
    { type: 'reversi', position: 'a1' }, // flips nothing
    { type: 'reversi', position: 'e3' }, // white's square, not black's
  ],
  malformed: [
    { type: 'reversi', position: 'z9' },
    { type: 'reversi', position: 'd0' },
    { type: 'reversi', position: 'D3' },
    { type: 'reversi', position: null },
    { type: 'reversi' },
    { type: 'reversi', position: 'd3d4' },
    { type: 'chess', from: 'd2', to: 'd3' },
    { type: 'checkers', from: 'c3', to: 'd4' },
    'd3',
  ],
};
