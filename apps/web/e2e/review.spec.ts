import { test, expect } from '@playwright/test';
import {
  fixBoardOrientation,
  playPastAbortWindowCheckersLocal,
} from './helpers/abortWindow';

// Graded post-game review was mobile-only. Web now runs the same shared grading
// layer, so this walks a finished game into review and checks the parts that
// prove the engine wiring is real — an eval, a per-move grade, and a tally.
//
// Checkers is the subject rather than chess on purpose: its adapter is the pure
// TS engine from `packages/shared`, so a full scan finishes in milliseconds.
// Chess needs the ~7 MB Stockfish WASM download, which belongs in a manual pass.

/**
 * Start a pass-and-play checkers game, play one move each way so review has
 * something to grade, resign, and open review.
 *
 * The timeout is generous because the whole suite shares one dev server: under
 * parallel load a page can take seconds to become interactive, and a flaky test
 * is worse than no test.
 */
async function playedOutGame(page: import('@playwright/test').Page) {
  // A game has to be past its abort window before it can be resigned, and
  // pass-and-play is where that line can be fixed: both sides are played
  // here, so no bot gets to choose. The board must not turn between turns
  // for the line to mean anything.
  await fixBoardOrientation(page);
  await page.goto('/checkers/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await playPastAbortWindowCheckersLocal(page);

  // Resign asks twice (a 3s window), so the second click has to be prompt.
  const resign = page.getByRole('button', { name: /^Resign\??$/ });
  await resign.click();
  await resign.click();
  await page.getByRole('button', { name: 'Review Game' }).click();

  return page.getByRole('dialog', { name: 'Game review' });
}

test('a finished game can be reviewed and every move graded', async ({ page }) => {
  const review = await playedOutGame(page);
  await expect(review).toBeVisible();

  // Before the scan the panel says what it can do, not a fake verdict.
  await expect(review.getByText('Run the review to grade every move.')).toBeVisible();

  await review.getByRole('button', { name: 'Review every move' }).click();

  // A completed scan replaces the call-to-action with per-side tallies. This is
  // a pass-and-play game, so the sides are named rather than "You"/"Opponent" —
  // that split is what `showBothSides` exists for.
  await expect(review.getByText('White', { exact: true })).toBeVisible();
  await expect(review.getByText('Black', { exact: true })).toBeVisible();
  await expect(review.getByText('Blunder:')).toHaveCount(2);

  // The engine's own move is marked best — the one grade we can assert without
  // pinning a specific evaluation.
  await expect(review.getByText('★')).not.toHaveCount(0);

  await review.getByRole('button', { name: 'Done' }).click();
  await expect(review).toBeHidden();
});

test('review steps through the game', async ({ page }) => {
  const review = await playedOutGame(page);

  // Stepping back lands on the starting position and says so.
  await review.getByRole('button', { name: 'First' }).click();
  await expect(review.getByText('Starting position')).toBeVisible();

  await review.getByRole('button', { name: 'Next move' }).click();
  await expect(review.getByText('After move 1')).toBeVisible();
});
