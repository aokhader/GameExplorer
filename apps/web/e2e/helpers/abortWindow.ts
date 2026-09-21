import { expect, type Page } from '@playwright/test';
import { ABORT_MOVE_LIMIT } from '@gameexplorer/shared';

/**
 * Play a bot game past its abort window, so Resign is the control on offer.
 *
 * A game's opening moves can be cancelled rather than conceded
 * (`ABORT_MOVE_LIMIT`), which is right for a player and inconvenient for a
 * test: several specs used to reach a result screen by resigning on move zero.
 * They call this first instead.
 *
 * Only White's — or Black's, in reversi — moves are played here; in a bot game
 * the reply comes for free, so three moves clear five plies with room to spare.
 * The gates are the ones each board's own spec already relies on.
 */

/** Chess squares, white at the bottom: index = (8 - rank) * 8 + file. */
const chessSquare = (page: Page, name: string) =>
  page.locator('.square').nth((8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97));

/** Plies the saved game has recorded — the gate each move below waits on. */
const chessPliesPlayed = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('gx:inprogress:chess:guest');
    return raw ? (JSON.parse(raw).actions?.length ?? 0) : 0;
  });

/**
 * Play one of White's moves and wait until the game has recorded `plies`.
 *
 * The gate is the saved game, not the `last-move` highlight: that highlight
 * marks only the *latest* move, so the bot's reply takes it straight back off
 * our square — sometimes before an assertion could ever see it, on a move that
 * had in fact been played.
 *
 * And it is an absolute count, not "one more than before". A click that lands
 * while the bot is still thinking is queued as a *premove*, so a relative gate
 * could be satisfied by the bot's own reply while our move sat in the queue,
 * and the helper would walk away a ply short. Every count below needs White's
 * move in it to be reachable at all.
 */
async function chessMove(page: Page, from: string, to: string, plies: number) {
  // Select, wait for the destination to be offered, then play it. Clicking both
  // squares back to back races the render between them, and a click on a square
  // the board has not yet marked legal is simply dropped.
  await expect(async () => {
    await chessSquare(page, from).click();
    await expect(chessSquare(page, to)).toHaveClass(/valid-move/, { timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await chessSquare(page, to).click();
  await expect.poll(() => chessPliesPlayed(page), { timeout: 20000 }).toBeGreaterThanOrEqual(plies);
}

/** Three quiet developing moves, each answered by the bot. */
export async function playPastAbortWindowChess(page: Page) {
  // The board accepts a move before the worker is ready and then drops it, so
  // this gate is not optional — see `aria-disabled` in `ChessBoard`.
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', {
    timeout: 20000,
  });
  // Each move waits for the bot's answer too, so the next click lands on our
  // own turn rather than being queued behind the one still being thought about.
  // Three of White's moves and two replies is `ABORT_MOVE_LIMIT`, which the
  // last gate names: the contract every caller relies on, failing here rather
  // than as a missing Resign button three lines later.
  await chessMove(page, 'e2', 'e4', 2);
  await chessMove(page, 'd2', 'd4', 4);
  await chessMove(page, 'g1', 'f3', ABORT_MOVE_LIMIT);
}

/**
 * Chess pass-and-play: five plies, both sides played here. Call
 * `fixBoardOrientation` before `goto`, or the board turns between turns and
 * these square names stop meaning what they say.
 */
export async function playPastAbortWindowChessLocal(page: Page, plies = 5) {
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', {
    timeout: 20000,
  });

  const played = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('gx:inprogress:chess:guest');
      return raw ? (JSON.parse(raw).actions?.length ?? 0) : 0;
    });

  // A quiet opening, alternating sides. Some callers have already played the
  // first move or two, so each is attempted and skipped if it is not on offer.
  const LINE: [string, string][] = [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'c4'],
    ['f8', 'c5'],
    ['d2', 'd3'],
    ['d7', 'd6'],
  ];

  for (const [from, to] of LINE) {
    if ((await played()) >= plies) return;
    await chessSquare(page, from).click();
    if (!(await chessSquare(page, to).getAttribute('class'))?.includes('valid-move')) {
      // Not this side's move, or the move is already made: clear and move on.
      await chessSquare(page, from).click();
      continue;
    }
    await chessSquare(page, to).click();
    await expect(chessSquare(page, to)).toHaveClass(/last-move/, { timeout: 20000 });
  }
  await expect.poll(played, { timeout: 15000 }).toBeGreaterThanOrEqual(plies);
}

/**
 * Reversi. Every move adds a disc and the bot's reply adds another, so the
 * count is the gate — the same one `reversi-bot.spec.ts` uses.
 */
export async function playPastAbortWindowReversi(page: Page) {
  const discs = page.locator('[data-disc]');
  const legal = page.locator('[data-legal]');
  await expect(discs).toHaveCount(4);
  for (let round = 1; round <= 3; round++) {
    await legal.first().click();
    await expect
      .poll(() => discs.count(), { timeout: 20_000, message: `round ${round}` })
      .toBeGreaterThanOrEqual(4 + round * 2);
  }
}

/** Checkers cells, white at the bottom: index = (8 - rank) * 8 + file. */
const checkersCell = (page: Page, rank: number, file: number) =>
  page.locator('.grid.grid-cols-8.grid-rows-8 > *').nth((8 - rank) * 8 + file);

async function checkersMove(page: Page, from: [number, number], to: [number, number], text: string) {
  await checkersCell(page, from[0], from[1]).click();
  // Click-to-move needs a render between the two clicks — the gap
  // `review.spec.ts` established. Without it the selection has not landed and
  // the destination click is read as a fresh selection instead.
  await page.waitForTimeout(120);
  await checkersCell(page, to[0], to[1]).click();
  await expect(page.locator('body')).toContainText(text, { timeout: 15000 });
}

/**
 * Checkers pass-and-play, past the abort window in five plies.
 *
 * Both sides are played here, so the line is fixed rather than searched. It is
 * chosen so that no capture is available to either player until the last move,
 * which is one — a capture is compulsory in checkers, and a scripted quiet move
 * would be illegal the moment one appears:
 *
 * ```
 * 1. a3-b4  h6-g5      the wings stay apart
 * 2. b4-a5  g5-f4      a5 cannot be taken: the square behind it is off the board
 * 3. e3xg5             f4 walks into it, and White must take
 * ```
 *
 * Checkers records a jump as one move, so this is exactly `ABORT_MOVE_LIMIT`.
 * Call `fixBoardOrientation` before `goto`, or the board turns between turns.
 */
export async function playPastAbortWindowCheckersLocal(page: Page) {
  await expect(page.locator('body')).toContainText('to move', { timeout: 15000 });
  await checkersMove(page, [3, 0], [4, 1], 'a3-b4');
  await checkersMove(page, [6, 7], [5, 6], 'h6-g5');
  await checkersMove(page, [4, 1], [5, 0], 'b4-a5');
  await checkersMove(page, [5, 6], [4, 5], 'g5-f4');
  await checkersMove(page, [3, 4], [5, 6], 'e3xg5');
  await expect(page.getByRole('button', { name: /^Resign\??$/ })).toBeVisible({ timeout: 15000 });
}

/**
 * The same against the bot, whose replies `seedRandom` has pinned.
 *
 * ```
 * 1. a3-b4  d6-e5      the bot's answer, fixed by the seed
 * 2. c3-d4  e5xc3      it takes, and White must take back
 * 3. b2xd4             from the *second* rank — d2 is blocked by b4
 * ```
 *
 * Five plies, which is `ABORT_MOVE_LIMIT`. Requires `seedRandom` before `goto`;
 * without it the bot picks something else and the second move is illegal.
 */
export async function playPastAbortWindowCheckers(page: Page) {
  // Each move waits for the bot's answer, not just for its own text to appear.
  // Without that the next click lands while it is still the bot's turn — and
  // the square the line is about to use has not been vacated yet.
  const myMove = async (from: [number, number], to: [number, number], text: string) => {
    await checkersMove(page, from, to, text);
    await expect(page.locator('body')).toContainText('your move', { timeout: 20000 });
  };
  await expect(page.locator('body')).toContainText('your move', { timeout: 15000 });
  await myMove([3, 0], [4, 1], 'a3-b4');
  await myMove([3, 2], [4, 3], 'c3-d4');
  await myMove([2, 1], [4, 3], 'b2xd4');
  await expect(page.getByRole('button', { name: /^Resign\??$/ })).toBeVisible({ timeout: 15000 });
}

/**
 * Pin the bot's randomness, so a game against it plays the same way twice.
 * The weak engines add noise to their scores and blunder on a dice roll, both
 * through `Math.random`; nothing else in a local game is random. Call before
 * `goto`.
 */
export async function seedRandom(page: Page) {
  await page.addInitScript(() => {
    let seed = 0x2f6e2b1;
    Math.random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x80000000;
    };
  });
}

/**
 * Keep both players on one orientation. Pass-and-play turns the board between
 * turns, which is right for two people sharing a phone and hopeless for a test
 * addressing squares by name. Call before `goto`.
 */
export async function fixBoardOrientation(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem('gx:settings', JSON.stringify({ flipBoardPassAndPlay: false })),
  );
}
