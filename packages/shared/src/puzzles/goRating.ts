/**
 * Reading a Go problem's difficulty off the proof that already ran.
 *
 * Split from `calibration.ts` for one reason: that module is deliberately
 * engine-free — pure arithmetic over numbers somebody else measured — and this
 * one has to run the tsumego solver. Keeping them apart is what lets the maths
 * be unit-tested without a board in sight.
 *
 * It exists as a shared module rather than a helper inside
 * `scripts/puzzles/calibrate.mjs` because **two** callers need to agree
 * exactly: the script that fits the model and writes the ratings, and the CI
 * check that re-proves the model still reproduces the hand-rated problems. Two
 * copies of this function that drifted apart would leave the check validating a
 * model nobody ships, and passing while it did so.
 */

import { GoEngine } from '../game-logic/go/engine';
import { solveTsumego } from '../game-logic/go/tsumego';
import type { GoGameState } from '../game-logic/go/types';
import { goPuzzleRules } from './rules';
import type { GoStructuralFeatures } from './calibration';
import type { Puzzle } from './types';

/**
 * The three structural numbers, computed from the puzzle itself.
 *
 * Deliberately recomputed rather than read off the corpus row: a rating that
 * could be moved by hand-editing a `features` block is not a measurement, and
 * everything here is cheap because the solver is exhaustive over a region of at
 * most twelve points.
 *
 * Throws on a Go puzzle missing its region or target — those are not optional,
 * and a zeroed answer would rate an unprovable puzzle as an easy one.
 */
export function goFeaturesFor(puzzle: Puzzle): GoStructuralFeatures {
  if (!puzzle.region?.length || !puzzle.target) {
    throw new Error(`${puzzle.id}: a Go puzzle needs both a region and a target to be rated`);
  }
  const state: GoGameState = goPuzzleRules.decode(puzzle.position);
  const solved = solveTsumego(state, {
    region: puzzle.region,
    target: puzzle.target,
    goal: puzzle.goal as 'kill' | 'live',
  });
  const choices = GoEngine.getAllLegalMoves(state).filter((m) =>
    puzzle.region!.includes(m),
  ).length;

  return {
    regionSize: puzzle.region.length,
    logNodes: Math.log10(Math.max(1, solved.nodes)),
    losingMoves: Math.max(0, choices - solved.winningMoves.length),
  };
}
