// Position serialization for reversi.
//
//     "......../......../......../...OX.../...XO.../......../......../........ b"
//
// Eight rows rank 8 first (so the string reads the way the board is drawn),
// `/`-separated, then the side to move. `.` empty, `X` black, `O` white —
// the same letters the reversi literature uses.
//
// Whitespace between rows is ignored on the way in, so a position can be
// authored as a multi-line template literal and still round-trip.

import { coordinatesToPosition, createInitialBoard, getDiscAt, setDiscAt } from './utils';
import type { ReversiBoard, ReversiColor, ReversiGameState } from './types';

const EMPTY = '.';
const BLACK = 'X';
const WHITE = 'O';

export function stateToBoardString(state: ReversiGameState): string {
  const rows: string[] = [];

  // row 7 is rank 8 — emit it first.
  for (let row = 7; row >= 0; row--) {
    let line = '';
    for (let col = 0; col < 8; col++) {
      const disc = getDiscAt(state.board, coordinatesToPosition({ row, col }));
      line += disc === null ? EMPTY : disc.color === 'black' ? BLACK : WHITE;
    }
    rows.push(line);
  }

  return `${rows.join('/')} ${state.currentTurn === 'black' ? 'b' : 'w'}`;
}

export function boardStringToState(input: string): ReversiGameState {
  const trimmed = input.trim();

  // Split position from side-to-move on the last whitespace run, then drop all
  // remaining whitespace so multi-line literals parse.
  const match = trimmed.match(/^([\s\S]+?)\s+([bwBW])$/);
  if (!match) {
    throw new Error("Invalid reversi position: expected 8 rows then ' b' or ' w'");
  }

  const [, rawRows, side] = match;
  const rows = rawRows.replace(/\s+/g, '').split('/');
  if (rows.length !== 8) {
    throw new Error(`Invalid reversi position: expected 8 rows, got ${rows.length}`);
  }

  let board: ReversiBoard = Array.from({ length: 8 }, () => Array(8).fill(null));

  rows.forEach((line, index) => {
    if (line.length !== 8) {
      throw new Error(`Invalid reversi position: row ${index + 1} has ${line.length} squares, expected 8`);
    }
    const row = 7 - index;

    for (let col = 0; col < 8; col++) {
      const char = line[col];
      if (char === EMPTY) continue;

      let color: ReversiColor;
      if (char === BLACK) color = 'black';
      else if (char === WHITE) color = 'white';
      else throw new Error(`Invalid reversi position: unknown square '${char}'`);

      board = setDiscAt(board, coordinatesToPosition({ row, col }), { color });
    }
  });

  return {
    board,
    currentTurn: side.toLowerCase() === 'b' ? 'black' : 'white',
    moveHistory: [],
    isGameOver: false,
    winner: null,
    consecutivePasses: 0,
  };
}

/** The standard opening position, as a convenience for tests and fixtures. */
export const REVERSI_START_POSITION = stateToBoardString({
  board: createInitialBoard(),
  currentTurn: 'black',
  moveHistory: [],
  isGameOver: false,
  winner: null,
  consecutivePasses: 0,
});
