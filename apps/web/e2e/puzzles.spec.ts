import { test, expect, type Page } from '@playwright/test';
import { staticPuzzleSource, WEB_PUZZLE_PROGRESS_KEY } from '@finesse/shared';
import type { PuzzleGame } from '@finesse/shared';

/**
 * Puzzles, end to end, signed out.
 *
 * Everything here runs as a guest with no account, because that is the whole
 * point of the mode: progress lives in `localStorage` under `ge:puzzles` and no
 * call in the flow touches auth.
 */

/**
 * Index of a square in the chess board's DOM order.
 *
 * The board renders 64 `.square` divs row-major from rank 8 with White at the
 * bottom, and the squares carry no id of their own — so this is the coordinate
 * translation, kept in one place. a8 is 0, a1 is 56.
 *
 * This is what to CLICK. It is not where the pieces are: they live in a
 * separate `.piece-layer` so they can travel between squares, so asking a
 * square what is standing on it no longer works — use `chessPiece` for that.
 */
function chessSquare(page: Page, square: string) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return page.locator('.chess-board > .square').nth((8 - rank) * 8 + file);
}

/**
 * The piece standing on a square, if any.
 *
 * Scoped away from `[data-fading]`, which is a captured piece still being drawn
 * at its old square while it fades — visible for one animation frame's worth of
 * time and emphatically not the occupant.
 */
function chessPiece(page: Page, square: string) {
  return page.locator(`.piece-layer [data-square="${square}"]:not([data-fading])`);
}

/**
 * The status headline. Located through the banner's own `[data-title]` rather
 * than by text, because "Solved" also appears in "0 / 2 solved" and in the
 * "Solved:" stat label.
 */
function status(page: Page) {
  return page.locator('[role="status"] [data-title]');
}

/**
 * Open a game's puzzle page sitting on one specific puzzle.
 *
 * The page always serves the first unsolved puzzle in progression order, so
 * pinning one means marking everything before it solved. The list comes from
 * the shipped source rather than a hand-written array of ids — content gets
 * added, and a test that hard-codes "the second puzzle" quietly starts testing
 * a different position when it does.
 */
async function openPuzzle(page: Page, game: PuzzleGame, id?: string) {
  const ordered = await staticPuzzleSource.listPuzzles({ game });
  const index = id ? ordered.findIndex((p) => p.id === id) : 0;
  expect(index, `${id} is not in the ${game} set`).toBeGreaterThanOrEqual(0);

  const solved = ordered.slice(0, index).map((p) => p.id);
  await page.addInitScript(
    ([key, ids]) => {
      // Seed once. This script runs on every navigation, so writing
      // unconditionally would wipe a solve the moment the page reloaded — which
      // is precisely what one of the tests below is checking survives.
      if (localStorage.getItem(key as string)) return;
      localStorage.setItem(
        key as string,
        JSON.stringify({
          v: 1,
          solved: ids,
          streak: 0,
          bestStreak: 0,
          lastSeen: {},
          updatedAt: '',
        }),
      );
    },
    [WEB_PUZZLE_PROGRESS_KEY, solved] as const,
  );

  await page.goto(`/${game}/puzzles`);
  await expect(page.getByTestId('puzzle-prompt')).toBeVisible();
  return { ordered, solved };
}

test('renders without the global navbar', async ({ page }) => {
  await openPuzzle(page, 'chess');
  // `isImmersiveGameRoute` and the shells must agree: if this route stopped
  // matching, the page would keep the fixed nav AND the shell would still drop
  // its `pt-16`, leaving a 64px gap above the board.
  await expect(page.locator('nav')).toHaveCount(0);
  await expect(page.locator('a[href="/chess"]').first()).toBeVisible();
});

test('opens on the easiest unsolved puzzle with progress at zero', async ({ page }) => {
  const total = await staticPuzzleSource.countPuzzles('chess');
  await openPuzzle(page, 'chess');

  await expect(page.getByTestId('puzzle-prompt')).toContainText('mate in one');
  await expect(page.getByTestId('puzzle-progress')).toContainText(`0 / ${total} solved`);
  await expect(status(page)).toHaveText('Your move');
});

test('a wrong move is refused, explained, and can be retried', async ({ page }) => {
  await openPuzzle(page, 'chess', 'chess-003');

  // Qb7 is a legal queen move and not the mate.
  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b7').click();

  await expect(status(page)).toHaveText('Not quite');
  // Qb7 costs White nothing — it simply isn't mate. The copy has to say that
  // rather than claim a punish, so this is the case that proves the runtime's
  // "refuted" / "merely wrong" split reaches the screen.
  await expect(page.getByText('is playable, but it does not force mate')).toBeVisible();

  // The solution was never played: b8 is still empty.
  await expect(chessPiece(page, 'b8').locator('svg')).toHaveCount(0);

  await page.getByTestId('puzzle-retry').click();
  await expect(status(page)).toHaveText('Your move');
  // The branch went with it — the queen is back home.
  await expect(chessPiece(page, 'b1').locator('svg')).toHaveAttribute('aria-label', 'white queen');
});

test('the opponent’s refutation is played out and named', async ({ page }) => {
  // A position with a black queen in it, so a wrong move can actually be
  // punished rather than merely missing the point.
  await openPuzzle(page, 'chess', 'chess-007');

  // Rd7 hangs the rook to the queen it was supposed to capture.
  await chessSquare(page, 'd1').click();
  await chessSquare(page, 'd7').click();

  await expect(status(page)).toHaveText('Not quite');
  await expect(page.getByText('Black answers d8→d7')).toBeVisible();
  // The queen is now sitting on d7, where White's rook just was.
  await expect(chessPiece(page, 'd7').locator('svg')).toHaveAttribute('aria-label', 'black queen');
  // …and the red arrow points at THEIR move. This is the one marker the board
  // draws for a wrong move, and it used to point at the player's own; a
  // regression would silently go back to marking the wrong thing.
  //
  // Not scoped to `.chess-board`: the arrow overlay is a SIBLING of that div
  // inside the board frame, not a child of it, so scoping the selector finds
  // nothing even when the arrow is right there on screen.
  await expect(page.locator('polygon[fill="rgba(248, 113, 113, 0.9)"]')).toHaveCount(1);
});

test('a solved puzzle stays on screen until Next is pressed', async ({ page }) => {
  // Solving deliberately does not advance on its own: the explanation is the
  // point of the mode, and it cannot be read if the board moves on.
  await openPuzzle(page, 'chess', 'chess-003');

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();
  await expect(status(page)).toHaveText('Solved');

  await page.waitForTimeout(2_500);
  await expect(status(page)).toHaveText('Solved');
});

test('solving records progress that survives a reload', async ({ page }) => {
  const total = await staticPuzzleSource.countPuzzles('chess');
  await openPuzzle(page, 'chess', 'chess-003');

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-explanation')).toContainText('Qb8 is mate');
  await expect(page.getByTestId('puzzle-progress')).toContainText(`1 / ${total} solved`);
  // Solved first try with no hint — that is what a streak counts.
  await expect(page.getByTestId('puzzle-progress')).toContainText('streak 1');

  await page.reload();
  // The solved one is not served again, so the next puzzle loads and the count
  // has stuck.
  await expect(page.getByTestId('puzzle-progress')).toContainText(`1 / ${total} solved`);
  await expect(page.getByTestId('puzzle-prompt')).toBeVisible();
});

test('plays the opponent’s scripted reply and finishes a two-move line', async ({ page }) => {
  await openPuzzle(page, 'chess', 'chess-002');
  await expect(page.getByTestId('puzzle-prompt')).toContainText('mate in two');

  await chessSquare(page, 'b2').click();
  await chessSquare(page, 'b8').click();
  await expect(status(page)).toHaveText('Correct');

  // Black's only legal answer is Rxb8, played for the player after the beat.
  await expect(chessPiece(page, 'b8').locator('svg')).toHaveAttribute(
    'aria-label',
    'black rook',
    { timeout: 5_000 },
  );

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();
  await expect(status(page)).toHaveText('Solved');
});

test('a moved piece travels to its square instead of appearing on it', async ({ page }) => {
  // Guards the whole point of the piece layer. Nothing else here would notice
  // if pieces went back to teleporting — every other assertion is about where a
  // piece ended up, which is equally true of a board that just redraws.
  // A mate in one, so the line ends on the player's move. On a two-move puzzle
  // the opponent's reply lands 260ms later and captures on the same square,
  // which leaves both an arriving piece and a fading one there to race with.
  await openPuzzle(page, 'chess', 'chess-003');

  const arriving = chessPiece(page, 'b8');
  await expect(arriving).toHaveCount(0);

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();
  await expect(status(page)).toHaveText('Solved');

  // `data-travelling` is set on the frame the piece starts moving and stays for
  // the life of that slot, so this is not a race against the 200ms transition.
  await expect(arriving).toHaveAttribute('data-travelling', '');
  await expect(arriving).toHaveCSS('transition-duration', '0.2s, 0.2s');

  // Exactly one piece moved. Without this the assertion above would also pass
  // on a board that marked every piece as travelling on every render.
  await expect(page.locator('.piece-layer [data-travelling]')).toHaveCount(1);
});

test('the hint points at the solution and costs the streak', async ({ page }) => {
  const total = await staticPuzzleSource.countPuzzles('chess');
  await openPuzzle(page, 'chess', 'chess-003');
  await page.getByRole('button', { name: 'Hint' }).click();

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-progress')).toContainText(`1 / ${total} solved`);
  // Counted as solved, but a hinted solve is not a clean one.
  await expect(page.getByTestId('puzzle-progress')).not.toContainText('streak');
});

/**
 * A cell on the checkers / reversi boards, which are both an 8×8 CSS grid laid
 * out in the same row-major-from-rank-8 order as the chess board above.
 */
function gridCell(page: Page, square: string) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return page.locator('[class*="grid-cols-8"] > *').nth((8 - rank) * 8 + file);
}

test('checkers: a multi-jump is answered by its first and last square', async ({ page }) => {
  const total = await staticPuzzleSource.countPuzzles('checkers');
  const { solved } = await openPuzzle(page, 'checkers', 'checkers-001');
  await expect(page.getByTestId('puzzle-prompt')).toContainText('Two jumps are on offer');

  // e2–g4–e6–c8 is a triple jump ending in a crowning. The board only ever
  // reports where the piece was picked up and put down; the engine resolves
  // the chain in between.
  await gridCell(page, 'e2').click();
  await gridCell(page, 'c8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-progress')).toContainText(
    `${solved.length + 1} / ${total} solved`,
  );
});

test('checkers: the tempting shorter jump is refused', async ({ page }) => {
  const { solved } = await openPuzzle(page, 'checkers', 'checkers-001');

  // c2–e4–g6 is legal, and a double capture — just not the best one.
  await gridCell(page, 'c2').click();
  await gridCell(page, 'g6').click();

  await expect(status(page)).toHaveText('Not quite');
  const total = await staticPuzzleSource.countPuzzles('checkers');
  await expect(page.getByTestId('puzzle-progress')).toContainText(
    `${solved.length} / ${total} solved`,
  );
});

test('reversi: the opponent’s forced pass hands the move straight back', async ({ page }) => {
  // The parity endgame is the puzzle with a forced pass in the middle of it.
  const { solved } = await openPuzzle(page, 'reversi', 'reversi-002');
  await expect(page.getByTestId('puzzle-prompt')).toContainText('Win the game');

  await gridCell(page, 'h1').click();
  await expect(status(page)).toHaveText('Correct');
  // White answers a8 after the beat.
  await expect(gridCell(page, 'a8').locator('svg')).toBeVisible({ timeout: 5_000 });
  await expect(status(page)).toHaveText('Your move', { timeout: 5_000 });

  // After h8 White has no legal move. The step carries no scripted reply — the
  // runtime passes for White itself and it is Black to play again, so the run
  // must NOT sit in 'replying' or jump to 'solved'.
  await gridCell(page, 'h8').click();
  await expect(status(page)).toHaveText('Your move');

  await gridCell(page, 'a1').click();
  await expect(status(page)).toHaveText('Solved');
  const total = await staticPuzzleSource.countPuzzles('reversi');
  await expect(page.getByTestId('puzzle-progress')).toContainText(
    `${solved.length + 1} / ${total} solved`,
  );
});

for (const game of ['chess', 'checkers', 'reversi'] as const) {
  test(`${game} hub links to its puzzles, and the route loads`, async ({ page }) => {
    await page.goto(`/${game}`);
    const card = page.locator(`a[href="/${game}/puzzles"]`).first();
    await expect(card).toBeVisible();

    await card.click();
    await expect(page.getByTestId('puzzle-prompt')).toBeVisible();
    await expect(page.locator('nav')).toHaveCount(0);
  });
}
