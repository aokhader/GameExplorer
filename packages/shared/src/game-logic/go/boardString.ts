// Position serialization for Go.
//
//     "........./........./..XXX..../..XOOX.../..XO.OX.. b"
//
// Rows rank 9 first (so the string reads the way the board is drawn),
// `/`-separated, then the side to move. `.` empty, `X` black, `O` white — the
// same letters `reversi/boardString.ts` uses, and the same shape, because a
// puzzle position has to be something a person can type into a data file.
//
// The board edge is taken from the number of rows, so this is size-generic even
// though only 9×9 ships.
//
// Whitespace between rows is ignored on the way in, so a position can be
// authored as a multi-line template literal and still round-trip. That round
// trip is not a nicety: the puzzle validation suite asserts
// `encode(decode(position)) === position` on every shipped puzzle, which is what
// stops a typo becoming a position nobody intended.
//
// What is deliberately NOT carried: move history, capture counts, superko keys,
// komi and the scoring rule. A decoded position is a fresh board with the given
// stones on it. Life-and-death problems — the only kind Go puzzles are — turn on
// none of those, and leaving them out is what keeps the round trip exact.

import type { GoBoard, GoColor, GoGameState } from './types';
import { boardKey, coordinatesToPosition, createInitialGameState, getStoneAt } from './utils';

const EMPTY = '.';
const BLACK = 'X';
const WHITE = 'O';

export function stateToGoBoardString(state: GoGameState): string {
  const { board, size } = state;
  const rows: string[] = [];

  // row size-1 is the top rank — emit it first.
  for (let row = size - 1; row >= 0; row--) {
    let line = '';
    for (let col = 0; col < size; col++) {
      const stone = getStoneAt(board, coordinatesToPosition({ row, col }));
      line += stone === null ? EMPTY : stone === 'black' ? BLACK : WHITE;
    }
    rows.push(line);
  }

  return `${rows.join('/')} ${state.currentTurn === 'black' ? 'b' : 'w'}`;
}

export function goBoardStringToState(input: string): GoGameState {
  const trimmed = input.trim();

  // Split position from side-to-move on the last whitespace run, then drop all
  // remaining whitespace so multi-line literals parse.
  const match = trimmed.match(/^([\s\S]+?)\s+([bwBW])$/);
  if (!match) {
    throw new Error("Invalid go position: expected rows then ' b' or ' w'");
  }

  const [, rawRows, side] = match;
  const rows = rawRows.replace(/\s+/g, '').split('/');
  const size = rows.length;
  if (size < 2) {
    throw new Error(`Invalid go position: expected at least 2 rows, got ${size}`);
  }

  const board: GoBoard = Array.from({ length: size }, () => Array<GoColor | null>(size).fill(null));

  rows.forEach((line, index) => {
    if (line.length !== size) {
      throw new Error(
        `Invalid go position: row ${index + 1} has ${line.length} points, expected ${size}`,
      );
    }
    // The first row given is the top rank.
    const row = size - 1 - index;

    for (let col = 0; col < size; col++) {
      const char = line[col];
      if (char === EMPTY) continue;
      if (char === BLACK) board[row][col] = 'black';
      else if (char === WHITE) board[row][col] = 'white';
      else throw new Error(`Invalid go position: unknown point '${char}'`);
    }
  });

  return {
    ...createInitialGameState({ size }),
    board,
    currentTurn: side.toLowerCase() === 'b' ? 'black' : 'white',
    positionKeys: [boardKey(board)],
  };
}

/** The empty 9×9 board, as a convenience for tests and fixtures. */
export const GO_EMPTY_POSITION = stateToGoBoardString(createInitialGameState());
