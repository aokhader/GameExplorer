/**
 * The coverage gate — what makes "the puzzle set covers the whole difficulty
 * range" a fact rather than an intention.
 *
 * Two halves, and they activate at different times on purpose:
 *
 * - **The invariants** run today, over whatever is shipped. They check that the
 *   band model can actually describe the content: every puzzle lands in exactly
 *   one band, ids do not collide across games, ratings are sane.
 * - **The quotas** are the release gate for the mined corpus, and each game
 *   turns itself on the moment `data/puzzles/<game>.jsonl` appears — per game,
 *   not all-or-nothing, so chess started enforcing the day it was imported
 *   rather than waiting for the other three. Before a corpus exists the checks
 *   stand down deliberately: the shipped 56 hand-authored puzzles fill 0 of 24
 *   bands, so asserting quotas against them would paint CI red for the whole of
 *   the mining work and teach everyone to ignore the one test that matters.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUZZLES } from '../constants/puzzles';
import {
  MIN_BAND_SPREAD,
  MIN_CORE_PUZZLES_PER_BAND,
  MIN_PUZZLES_PER_BAND,
  PUZZLE_BANDS,
  bandFor,
  bandSpan,
  isExempt,
  BAND_EXEMPTIONS,
  type PuzzleBand,
} from './bands';
import { GO_STRUCTURAL_MODEL } from '../constants/puzzles/generated/calibration';
import { goStructuralRating } from './calibration';
import type { Puzzle, PuzzleGame } from './types';

const GAMES: PuzzleGame[] = ['chess', 'checkers', 'reversi', 'go'];

/** Repo root, from `packages/shared/src/puzzles/`. */
const CORPUS_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'puzzles');

function corpusFor(game: PuzzleGame): Puzzle[] | null {
  const file = join(CORPUS_DIR, `${game}.jsonl`);
  if (!existsSync(file)) return null;
  const mined = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Puzzle);

  // Authored ∪ mined, because that is what `scripts/puzzles/publish.mjs`
  // actually serves. Measuring the mined file alone checks a set no player ever
  // sees, and it is the smaller one: Go's fourteen hand-composed problems are a
  // third of everything it has in the Casual band, and they were invisible here.
  const minedIds = new Set(mined.map((p) => p.id));
  const authored = PUZZLES[game].filter((p) => !minedIds.has(p.id));
  return [...authored, ...mined];
}

/**
 * Per game, not all-or-nothing.
 *
 * Chess has a corpus today and the other three do not, so an all-or-nothing
 * gate would leave chess unchecked for the whole of the mining work — which is
 * exactly backwards: the quotas should start binding on each game the moment
 * that game has content to hold them to.
 */
const HAS_CORPUS: Record<PuzzleGame, boolean> = {
  chess: corpusFor('chess') !== null,
  checkers: corpusFor('checkers') !== null,
  reversi: corpusFor('reversi') !== null,
  go: corpusFor('go') !== null,
};

/**
 * The lowest rating each game's rating pipeline can actually produce.
 *
 * Only Go differs. Chess takes its ratings from Lichess and checkers and
 * reversi are rated structurally on their own bot-ELO scale, so all three reach
 * the ladder's nominal floor. Go's floor is the smallest problem its composer
 * can build, because its rating is a formula over shape rather than a
 * measurement: a three-point eye space — the smallest shape in the composer's
 * list — in which nothing loses.
 *
 * It used to say "with one losing move", which was true while the gate demanded
 * a unique answer and every other move in the region therefore lost. Accepting
 * a proved set of answers took that term to zero and dropped the floor by 169,
 * which is a whole band step: written down rather than left as a stale constant
 * because it is the number the Beginner band's spread is measured against.
 *
 * Measuring a band's spread against ground its own pipeline cannot reach
 * reports a full band as half empty, which is the same error `bandSpan` already
 * corrects for the ELO floor, one level further up.
 */
function ratingFloor(game: PuzzleGame): number {
  if (game !== 'go') return 400;
  return goStructuralRating({ regionSize: 3, logNodes: 0, losingMoves: 0 }, GO_STRUCTURAL_MODEL);
}

/**
 * Fraction of a band's *fillable* width the ratings in it actually span.
 *
 * Measured against `bandSpan`, not the nominal edges — see its comment. The
 * bottom band starts at 0 so `bandFor` can be total, but nothing below the
 * game's ELO floor exists, and asking a band to cover ground nothing can stand
 * on reports a full band as 40% empty.
 */
function spread(game: PuzzleGame, band: PuzzleBand, ratings: number[]): number {
  if (ratings.length < 2) return 0;
  const highest = Math.max(...ratings);
  const { min, max } = bandSpan(game, band, highest, ratingFloor(game));
  return (highest - Math.min(...ratings)) / Math.max(1, max - min);
}

describe('band model describes the shipped content', () => {
  it('places every shipped puzzle in exactly one band', () => {
    const failures: string[] = [];
    for (const game of GAMES) {
      for (const puzzle of PUZZLES[game]) {
        const hits = PUZZLE_BANDS[game].filter(
          (b) => puzzle.rating >= b.min && puzzle.rating < b.max,
        );
        if (hits.length !== 1) {
          failures.push(`${puzzle.id} (rating ${puzzle.rating}) matched ${hits.length} bands`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('gives every puzzle a rating a band could mean something about', () => {
    const failures: string[] = [];
    for (const game of GAMES) {
      for (const puzzle of PUZZLES[game]) {
        if (!Number.isFinite(puzzle.rating) || puzzle.rating <= 0) {
          failures.push(`${puzzle.id} has rating ${puzzle.rating}`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('ships no id twice within a game', () => {
    // The bundled set is authored + generated core, and the core is sliced from
    // a corpus that contains the authored puzzles too — so this is one careless
    // publish away at any time. A duplicate is not cosmetic: `solvedAmong`
    // counts a band's ids, so a repeated id makes one solve register as two and
    // the progress line climbs twice as fast as the player earns it.
    const failures: string[] = [];
    for (const game of GAMES) {
      const seen = new Set<string>();
      for (const puzzle of PUZZLES[game]) {
        if (seen.has(puzzle.id)) failures.push(`${puzzle.id} appears twice in ${game}`);
        seen.add(puzzle.id);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('has no id colliding across games', () => {
    const seen = new Map<string, string>();
    const failures: string[] = [];
    for (const game of GAMES) {
      for (const puzzle of PUZZLES[game]) {
        const prior = seen.get(puzzle.id);
        if (prior) failures.push(`${puzzle.id} appears in both ${prior} and ${game}`);
        seen.set(puzzle.id, game);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('ships at least one puzzle for every game that offers the mode', () => {
    // Guards the silent-empty failure: `PUZZLES` is built by `Object.values`
    // precisely so a new game cannot serve zero puzzles unnoticed.
    for (const game of GAMES) expect(PUZZLES[game].length, game).toBeGreaterThan(0);
  });
});

/**
 * The bundled core must cover every band, so a guest in airplane mode still
 * meets the whole range. Until the corpus split lands, the bundled set IS
 * everything, so this and the corpus check below measure the same content.
 */
describe('bundled core covers every band offline', () => {
  it.each(GAMES)('%s bundles at least the core quota in every band', (game) => {
    if (!HAS_CORPUS[game]) return; // no corpus yet — nothing to slice a core from
    const failures: string[] = [];
    for (const band of PUZZLE_BANDS[game]) {
      if (isExempt(game, band.id, 'count')) continue;
      const n = PUZZLES[game].filter((p) => bandFor(game, p.rating).id === band.id).length;
      if (n < MIN_CORE_PUZZLES_PER_BAND) {
        failures.push(`${game}/${band.id}: ${n} bundled < ${MIN_CORE_PUZZLES_PER_BAND}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('mined corpus covers the full difficulty range', () => {
  it.each(GAMES)('%s meets its per-band quota', (game) => {
    if (!HAS_CORPUS[game]) return;
    const corpus = corpusFor(game)!;
    const quota = MIN_PUZZLES_PER_BAND[game];
    const failures: string[] = [];
    for (const band of PUZZLE_BANDS[game]) {
      if (isExempt(game, band.id, 'count')) continue;
      const n = corpus.filter((p) => bandFor(game, p.rating).id === band.id).length;
      if (n < quota) failures.push(`${game}/${band.id}: ${n} < ${quota}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it.each(GAMES)('%s spreads its ratings across each band, not just at one edge', (game) => {
    if (!HAS_CORPUS[game]) return;
    const corpus = corpusFor(game)!;
    const failures: string[] = [];
    for (const band of PUZZLE_BANDS[game]) {
      if (isExempt(game, band.id, 'spread')) continue;
      const ratings = corpus
        .filter((p) => bandFor(game, p.rating).id === band.id)
        .map((p) => p.rating);
      const s = spread(game, band, ratings);
      if (s < MIN_BAND_SPREAD[game]) {
        failures.push(`${game}/${band.id}: spread ${s.toFixed(2)} < ${MIN_BAND_SPREAD[game]}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('still needs every exemption it grants, for the check it names', () => {
    // Guards the exemption list. An exemption that has quietly become
    // unnecessary is indistinguishable from one that is still load-bearing, and
    // the difference matters: the first is a band nobody is looking at any
    // more, the second is a documented limit. This is what took the other two
    // entries off the list, and it is deliberately checked per CHECK — a band
    // excused from the spread measurement is still held to its count, and an
    // exemption that grew wider than it needs to be should fail here too.
    const unnecessary: string[] = [];
    for (const { game, band, checks, why } of BAND_EXEMPTIONS) {
      if (!HAS_CORPUS[game]) continue;
      const model = PUZZLE_BANDS[game].find((b) => b.id === band);
      const held = corpusFor(game)!.filter((p) => bandFor(game, p.rating).id === band);
      const drop = (what: string) =>
        unnecessary.push(
          `${game}/${band} no longer needs its '${what}' exemption ("${why}") — ` +
            'delete it so the band is enforced again',
        );

      if (checks.includes('count') && held.length >= MIN_PUZZLES_PER_BAND[game]) drop('count');
      if (
        checks.includes('spread') &&
        model &&
        spread(game, model, held.map((p) => p.rating)) >= MIN_BAND_SPREAD[game]
      ) {
        drop('spread');
      }
    }
    expect(unnecessary, unnecessary.join('\n')).toEqual([]);
  });

  it('is enforcing at least one game today', () => {
    // Guards the guard: every assertion above returns early without a corpus,
    // so a path bug that found no corpus files would make the whole block
    // vacuously green while reporting success.
    expect(
      Object.values(HAS_CORPUS).some(Boolean),
      'no corpus found at all — check CORPUS_DIR',
    ).toBe(true);
  });
});
