import { describe, it, expect } from 'vitest';
import { REVERSI_START_POSITION, boardStringToState, stateToBoardString } from './boardString';
import { createInitialGameState, getDiscAt } from './utils';
import { ReversiEngine } from './engine';

describe('stateToBoardString / boardStringToState', () => {
  it('encodes the opening position with the four centre discs', () => {
    expect(REVERSI_START_POSITION).toBe(
      '......../......../......../...XO.../...OX.../......../......../........ b',
    );
  });

  it.each([
    REVERSI_START_POSITION,
    // Black has taken a corner.
    'X......./......../......../...XX.../...XO.../......../......../........ w',
    // A dense midgame position.
    'OOOOOOOO/OXXXXXXO/OXOOOOXO/OXOXXOXO/OXOXXOXO/OXOOOOXO/OXXXXXXO/OOOOOOOO b',
  ])('round-trips %s', (position) => {
    expect(stateToBoardString(boardStringToState(position))).toBe(position);
  });

  it('decodes the opening position to the same board createInitialGameState builds', () => {
    const decoded = boardStringToState(REVERSI_START_POSITION);
    expect(decoded.board).toEqual(createInitialGameState().board);
    expect(decoded.currentTurn).toBe('black');
  });

  it('reads rank 8 first, so the first row is the top of the board', () => {
    const state = boardStringToState('X......./......../......../......../......../......../......../.......O w');
    expect(getDiscAt(state.board, 'a8')).toEqual({ color: 'black' });
    expect(getDiscAt(state.board, 'h1')).toEqual({ color: 'white' });
    expect(getDiscAt(state.board, 'a1')).toBeNull();
  });

  it('tolerates whitespace and newlines between rows', () => {
    const authored = `
      ......../
      ......../
      ......../
      ...XO.../
      ...OX.../
      ......../
      ......../
      ........ b
    `;
    expect(stateToBoardString(boardStringToState(authored))).toBe(REVERSI_START_POSITION);
  });

  it('accepts an uppercase side-to-move marker', () => {
    const upper = REVERSI_START_POSITION.replace(/ b$/, ' B');
    expect(boardStringToState(upper).currentTurn).toBe('black');
  });

  it('decodes a fresh position — no history, not over', () => {
    const state = boardStringToState(REVERSI_START_POSITION);
    expect(state.moveHistory).toEqual([]);
    expect(state.isGameOver).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.consecutivePasses).toBe(0);
  });

  it('produces a position the engine can generate legal moves from', () => {
    const state = boardStringToState(REVERSI_START_POSITION);
    const moves = ReversiEngine.getAllLegalMoves(state);
    // The opening position has exactly four legal moves for Black.
    expect(moves).toHaveLength(4);
    for (const move of moves) {
      expect(ReversiEngine.validateMove(state, move).valid).toBe(true);
    }
  });

  it('rejects malformed input', () => {
    expect(() => boardStringToState('nonsense')).toThrow(/expected 8 rows/);
    expect(() => boardStringToState('......../......../........ b')).toThrow(/got 3/);
    expect(() => boardStringToState(REVERSI_START_POSITION.replace(/ b$/, ' x')))
      .toThrow(/expected 8 rows/);
    expect(() => boardStringToState('.......Z/......../......../......../......../......../......../........ b'))
      .toThrow(/unknown square/);
    expect(() => boardStringToState('......./......../......../......../......../......../......../........ b'))
      .toThrow(/row 1 has 7 squares/);
  });
});
