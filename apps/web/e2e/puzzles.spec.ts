import { test, expect, type Page } from '@playwright/test';

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
 */
function chessSquare(page: Page, square: string) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return page.locator('.chess-board > .square').nth((8 - rank) * 8 + file);
}

/**
 * The status headline. Located through the banner's own `[data-title]` rather
 * than by text, because "Solved" also appears in "0 / 2 solved" and in the
 * "Solved:" stat label.
 */
function status(page: Page) {
  return page.locator('[role="status"] [data-title]');
}

async function openChessPuzzles(page: Page) {
  await page.goto('/chess/puzzles');
  await expect(page.getByTestId('puzzle-prompt')).toBeVisible();
}

test('renders without the global navbar', async ({ page }) => {
  await openChessPuzzles(page);
  // `isImmersiveGameRoute` and the shells must agree: if this route stopped
  // matching, the page would keep the fixed nav AND the shell would still drop
  // its `pt-16`, leaving a 64px gap above the board.
  await expect(page.locator('nav')).toHaveCount(0);
  await expect(page.locator('a[href="/chess"]').first()).toBeVisible();
});

test('opens on the first puzzle with progress at zero', async ({ page }) => {
  await openChessPuzzles(page);
  await expect(page.getByTestId('puzzle-prompt')).toContainText('mate in one');
  await expect(page.getByTestId('puzzle-progress')).toContainText('0 / 2 solved');
  await expect(status(page)).toHaveText('Your move');
});

test('a wrong move is refused, explained, and can be retried', async ({ page }) => {
  await openChessPuzzles(page);

  // Kg1–f1 is legal chess and not the solution.
  await chessSquare(page, 'g1').click();
  await chessSquare(page, 'f1').click();

  await expect(status(page)).toHaveText('Not quite');
  // Kf1 costs White nothing — it simply isn't mate. The copy has to say that
  // rather than claim a punish, so this is the case that proves the runtime's
  // "refuted" / "merely wrong" split reaches the screen.
  await expect(page.getByText('is playable, but it does not force mate')).toBeVisible();

  // The solution was never played: the rook is still on a1 and a8 is empty.
  // (The board does move — it plays the king step out — so this checks the
  // line itself did not advance, not that nothing happened.)
  await expect(chessSquare(page, 'a1').locator('svg')).toHaveAttribute('aria-label', 'white rook');
  await expect(chessSquare(page, 'a8').locator('svg')).toHaveCount(0);

  await page.getByTestId('puzzle-retry').click();
  await expect(status(page)).toHaveText('Your move');
  // The branch went with it — the king is back home.
  await expect(chessSquare(page, 'g1').locator('svg')).toHaveAttribute('aria-label', 'white king');
});

test('the opponent’s refutation is played out and named', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'ge:puzzles',
      JSON.stringify({ v: 1, solved: ['chess-001'], streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
    ),
  );
  await openChessPuzzles(page);
  await expect(page.getByTestId('puzzle-prompt')).toContainText('mate in two');

  // Rb1–a1 hangs the rook. Unlike the king step above this really is refuted,
  // and the board runs two plies on to show Black taking it.
  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'a1').click();

  await expect(status(page)).toHaveText('Not quite');
  await expect(page.getByText('Black answers a8→a1')).toBeVisible();
  // Black's rook is now sitting on a1, where White's just was.
  await expect(chessSquare(page, 'a1').locator('svg')).toHaveAttribute('aria-label', 'black rook');
  // …and the red arrow points at THEIR move. This is the one marker the board
  // draws for a wrong move, and it used to point at the player's own; a
  // regression would silently go back to marking the wrong thing.
  //
  // Not scoped to `.chess-board`: the arrow overlay is a SIBLING of that div
  // inside the board frame, not a child of it, so scoping the selector finds
  // nothing even when the arrow is right there on screen.
  await expect(page.locator('polygon[fill="rgba(248, 113, 113, 0.9)"]')).toHaveCount(1);
});

test('solving records progress that survives a reload', async ({ page }) => {
  await openChessPuzzles(page);

  await chessSquare(page, 'a1').click();
  await chessSquare(page, 'a8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-explanation')).toContainText('back rank');
  await expect(page.getByTestId('puzzle-progress')).toContainText('1 / 2 solved');
  // Solved first try with no hint — that is what a streak counts.
  await expect(page.getByTestId('puzzle-progress')).toContainText('streak 1');

  await page.reload();
  // The solved one is not served again, so the next puzzle loads and the count
  // has stuck.
  await expect(page.getByTestId('puzzle-progress')).toContainText('1 / 2 solved');
  await expect(page.getByTestId('puzzle-prompt')).toContainText('mate in two');
});

test('plays the opponent’s scripted reply and finishes a two-move line', async ({ page }) => {
  // Skip straight to the mate in two by marking the first one solved.
  await page.addInitScript(() =>
    localStorage.setItem(
      'ge:puzzles',
      JSON.stringify({ v: 1, solved: ['chess-001'], streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
    ),
  );
  await openChessPuzzles(page);
  await expect(page.getByTestId('puzzle-prompt')).toContainText('mate in two');

  await chessSquare(page, 'b2').click();
  await chessSquare(page, 'b8').click();
  await expect(status(page)).toHaveText('Correct');

  // Black's only legal answer is Rxb8, played for the player after the beat.
  await expect(chessSquare(page, 'b8').locator('svg')).toHaveAttribute(
    'aria-label',
    'black rook',
    { timeout: 5_000 },
  );

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();
  await expect(status(page)).toHaveText('Solved');
});

test('the hint points at the solution and costs the streak', async ({ page }) => {
  await openChessPuzzles(page);
  await page.getByRole('button', { name: 'Hint' }).click();

  await chessSquare(page, 'a1').click();
  await chessSquare(page, 'a8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-progress')).toContainText('1 / 2 solved');
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
  await page.goto('/checkers/puzzles');
  await expect(page.getByTestId('puzzle-prompt')).toContainText('Two jumps are on offer');

  // e2–g4–e6–c8 is a triple jump ending in a crowning. The board only ever
  // reports where the piece was picked up and put down; the engine resolves
  // the chain in between.
  await gridCell(page, 'e2').click();
  await gridCell(page, 'c8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-progress')).toContainText('1 / 2 solved');
});

test('checkers: the tempting shorter jump is refused', async ({ page }) => {
  await page.goto('/checkers/puzzles');
  await expect(page.getByTestId('puzzle-prompt')).toBeVisible();

  // c2–e4–g6 is legal, and a double capture — just not the best one.
  await gridCell(page, 'c2').click();
  await gridCell(page, 'g6').click();

  await expect(status(page)).toHaveText('Not quite');
  await expect(page.getByTestId('puzzle-progress')).toContainText('0 / 2 solved');
});

test('reversi: the opponent’s forced pass hands the move straight back', async ({ page }) => {
  // Skip to the parity endgame, which is the only puzzle with a forced pass.
  await page.addInitScript(() =>
    localStorage.setItem(
      'ge:puzzles',
      JSON.stringify({ v: 1, solved: ['reversi-001'], streak: 0, bestStreak: 0, lastSeen: {}, updatedAt: '' }),
    ),
  );
  await page.goto('/reversi/puzzles');
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
  await expect(page.getByTestId('puzzle-progress')).toContainText('2 / 2 solved');
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
