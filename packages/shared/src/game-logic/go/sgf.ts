/**
 * SGF — Smart Game Format, the file every Go program in the world reads.
 *
 * Go is the one game in this app with a universal interchange format that
 * players actually use: a game exported as SGF opens in OGS, KaTrain, Sabaki,
 * GoQuest, Sente, or any of the tsumego apps. Without it a game played here can
 * only ever be looked at here, which for Go is a real limitation rather than a
 * missing nicety.
 *
 * What is implemented is the *game record* subset — the properties needed to
 * carry one finished game faithfully, and no more. SGF is a general tree format
 * with variations, comments, annotations and setup stones; this reads a linear
 * main line and ignores the rest, which is what a review needs and all a game
 * played in this app can produce.
 *
 * ⚠️ **SGF coordinates are not our coordinates, and not the display ones
 * either.** SGF uses `aa`–`ss`, column then row, from the TOP-left, with no
 * skipped letter. Our engine uses `a1`–`s19`, column then rank, from the
 * BOTTOM-left. The display form skips I (`A`–`T`). Three conventions, and this
 * module is the only place the SGF one exists — `notation.ts` says it is the
 * only place the display one is translated, and that stays true because nothing
 * here goes near it.
 */

import { GoEngine } from './engine';
import { createInitialGameState, positionToCoordinates, coordinatesToPosition } from './utils';
import type { GoGameState, GoScoring } from './types';

/** SGF's own alphabet: `a` is the first line, with no letter skipped. */
const SGF_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Engine position → SGF coordinate. `a1` on a 9×9 board is `ai`.
 *
 * The row flips: SGF counts down from the top, the engine counts up from the
 * bottom. Getting this backwards produces a file that loads in every other
 * program as the game played upside down — legal, plausible, and wrong.
 */
export function toSgfPoint(position: string, size: number): string {
  const { row, col } = positionToCoordinates(position);
  return SGF_LETTERS[col] + SGF_LETTERS[size - 1 - row];
}

/** SGF coordinate → engine position. Returns null for a pass (`[]` or `tt`). */
export function fromSgfPoint(point: string, size: number): string | null {
  // An empty value is a pass. So is `tt` on boards up to 19×19, which is what
  // older programs wrote before the empty form was standardised.
  if (point === '' || (point === 'tt' && size <= 19)) return null;

  const col = SGF_LETTERS.indexOf(point[0]);
  const row = size - 1 - SGF_LETTERS.indexOf(point[1]);
  if (col < 0 || row < 0 || col >= size || row >= size) {
    throw new Error(`Invalid SGF coordinate: ${point}`);
  }
  return coordinatesToPosition({ row, col });
}

export interface SgfExportOptions {
  /** Names for the two players, if the caller has them. */
  blackName?: string;
  whiteName?: string;
  /** ISO date. Defaults to today. */
  date?: string;
}

/** Escape the characters SGF gives meaning to inside a property value. */
function escapeText(value: string): string {
  return value.replace(/([\\\]])/g, '\\$1');
}

/**
 * A finished (or unfinished) game as an SGF record.
 *
 * `RU` carries the scoring rule, because it is the one property that changes
 * what the same board is worth: `Japanese` for territory, `Chinese` for area.
 * They are not exactly our rules — Chinese scoring differs from Tromp-Taylor in
 * edge cases no game here reaches — but they are what every reader understands,
 * and the alternative is a file that says nothing about how it was counted.
 */
export function stateToSgf(state: GoGameState, options: SgfExportOptions = {}): string {
  const { size, komi, scoring, moveHistory } = state;

  const properties: string[] = [
    'FF[4]',
    'GM[1]', // 1 is Go.
    'CA[UTF-8]',
    `SZ[${size}]`,
    `KM[${komi}]`,
    `RU[${scoring === 'territory' ? 'Japanese' : 'Chinese'}]`,
    `DT[${options.date ?? new Date().toISOString().slice(0, 10)}]`,
  ];

  if (options.blackName) properties.push(`PB[${escapeText(options.blackName)}]`);
  if (options.whiteName) properties.push(`PW[${escapeText(options.whiteName)}]`);

  const result = sgfResult(state);
  if (result) properties.push(`RE[${result}]`);

  const moves = moveHistory
    .map((move) => {
      const colour = move.color === 'black' ? 'B' : 'W';
      // A pass is the empty value. Some programs write `tt`; both are read back
      // by `fromSgfPoint`, and the empty form is the one to write.
      const point = move.position === null ? '' : toSgfPoint(move.position, size);
      return `;${colour}[${point}]`;
    })
    .join('');

  return `(;${properties.join('')}${moves})`;
}

/** `B+3.5`, `W+7.5`, `0` for jigo — SGF's own result notation. */
function sgfResult(state: GoGameState): string | null {
  if (!state.isGameOver) return null;
  const { lead } = GoEngine.score(state);
  if (lead === 0) return '0';
  return `${lead > 0 ? 'B' : 'W'}+${Math.abs(lead)}`;
}

export interface ParsedSgf {
  size: number;
  komi: number;
  scoring: GoScoring;
  /** Positions in order; null is a pass. */
  moves: (string | null)[];
  /** The `RE` property verbatim, when the file carries one. */
  result?: string;
  blackName?: string;
  whiteName?: string;
}

/**
 * Read one property's first value: `SZ[19]` → `19`.
 *
 * The guard in front of the key is "not another uppercase letter", not "a
 * semicolon or whitespace". SGF packs its properties end to end, so in
 * `(;FF[4]CA[UTF-8]GM[1]SZ[19]` the `SZ` is preceded by `]` — a separator-based
 * guard finds nothing in a real file, while still passing every test written
 * against a hand-spaced one. That is exactly how this shipped broken for one
 * run: every hand-written fixture in the test file had spaces in it.
 *
 * It does still exclude a longer key ending in this one, so looking for `RE`
 * cannot match the tail of some other property.
 */
function property(sgf: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|[^A-Z])${key}\\[([^\\]]*)\\]`).exec(sgf);
  return match?.[1];
}

/**
 * Parse the main line of an SGF file.
 *
 * Deliberately forgiving about structure and strict about content. Real SGF in
 * the wild carries comments, annotations, variations and properties from a
 * dozen programs; refusing a file because of a property we do not understand
 * would make import useless. What it will NOT do is guess: a missing board size
 * or an out-of-range coordinate throws, because silently importing a 19×19 game
 * as 9×9 produces a plausible, wrong game rather than an error.
 */
export function parseSgf(input: string): ParsedSgf {
  const sgf = input.trim();
  if (!sgf.startsWith('(;')) {
    throw new Error('Not an SGF file: expected it to begin with "(;"');
  }

  const gameType = property(sgf, 'GM');
  if (gameType !== undefined && gameType !== '1') {
    throw new Error(`Not a Go game: GM[${gameType}]`);
  }

  const rawSize = property(sgf, 'SZ');
  if (rawSize === undefined) throw new Error('SGF has no board size (SZ)');
  // `SZ[19:19]` is the rectangular form. Square boards only here.
  if (rawSize.includes(':')) {
    const [width, height] = rawSize.split(':');
    if (width !== height) throw new Error(`Rectangular boards are not supported: SZ[${rawSize}]`);
  }
  const size = parseInt(rawSize, 10);
  if (!Number.isFinite(size) || size < 2 || size > 26) {
    throw new Error(`Unsupported board size: SZ[${rawSize}]`);
  }

  const rawKomi = property(sgf, 'KM');
  const komi = rawKomi === undefined ? 0 : Number(rawKomi);
  if (!Number.isFinite(komi)) throw new Error(`Unreadable komi: KM[${rawKomi}]`);

  // Anything Japanese-descended counts territory; everything else counts area.
  // A file with no RU is read as area, which is what an unlabelled record
  // usually is these days.
  const rawRules = (property(sgf, 'RU') ?? '').toLowerCase();
  const scoring: GoScoring =
    rawRules.includes('japanese') || rawRules.includes('korean') ? 'territory' : 'area';

  // Only B and W *move* properties, and only when they follow a node marker, so
  // a `PB[…]` player name or a `RE[B+3.5]` result cannot be read as a move.
  const moves: (string | null)[] = [];
  const moveMatcher = /;\s*([BW])\[([a-z]{0,2})\]/g;
  let match: RegExpExecArray | null;
  while ((match = moveMatcher.exec(sgf)) !== null) {
    moves.push(fromSgfPoint(match[2], size));
  }

  return {
    size,
    komi,
    scoring,
    moves,
    result: property(sgf, 'RE'),
    blackName: property(sgf, 'PB'),
    whiteName: property(sgf, 'PW'),
  };
}

/**
 * Parse an SGF and play it out, keeping every position along the way.
 *
 * The timeline is what review actually needs — grading a move means comparing
 * the position before it with the position after — so the file is played out
 * once, here, rather than reduced to a final state and replayed from its move
 * list by each caller.
 *
 * Stops at the first move the rules reject, the same way the replayers in
 * `analysis/timeline.ts` do: a foreign file may contain handicap setup or a
 * ruleset detail we do not model, and reviewing the part of the game that is
 * real beats refusing the whole file. A file whose every move was rejected
 * comes back as a single starting position, which the screens report as having
 * nothing to review.
 */
export function sgfToTimeline(input: string): GoGameState[] {
  const parsed = parseSgf(input);
  const timeline: GoGameState[] = [
    createInitialGameState({
      size: parsed.size,
      komi: parsed.komi,
      scoring: parsed.scoring,
    }),
  ];

  for (const position of parsed.moves) {
    const state = timeline[timeline.length - 1];
    if (position === null) {
      timeline.push(GoEngine.executePass(state));
      continue;
    }
    const result = GoEngine.validateMove(state, position);
    if (!result.valid || !result.resultingState) break;
    timeline.push(result.resultingState);
  }

  return timeline;
}

/** The position an SGF ends on — for a caller that wants a board, not a game. */
export function sgfToState(input: string): GoGameState {
  const timeline = sgfToTimeline(input);
  return timeline[timeline.length - 1];
}
