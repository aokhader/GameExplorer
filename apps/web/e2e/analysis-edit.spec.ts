import { test, expect, type Page } from '@playwright/test';

/**
 * The analysis board's position editor, by drag.
 *
 * Dragging a piece in edit mode relocates it — any colour, any square, no rules
 * — and the drag only starts once the pointer moves. That second half is what
 * these tests guard hardest: the editor places and erases with a *click*, and a
 * board that grabbed the pointer on press would send that click to itself
 * instead of the square, so clicking a piece with the eraser would do nothing.
 */

/** Chess squares, white at the bottom: index = (8 - rank) * 8 + file. */
const sq = (page: Page, name: string) =>
  page.locator('.chess-board > .square').nth((8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97));

/** The placement field of the FEN box — the part an edit changes. */
async function placement(page: Page) {
  return (await page.getByLabel('FEN string').inputValue()).split(' ')[0];
}

async function centre(page: Page, square: string) {
  const box = await sq(page, square).boundingBox();
  if (!box) throw new Error(`no box for ${square}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press on `from`, move in steps to `to` (a square or a point), release. */
async function drag(page: Page, from: string, to: string | { x: number; y: number }) {
  const a = await centre(page, from);
  const b = typeof to === 'string' ? await centre(page, to) : to;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

test.beforeEach(async ({ page }) => {
  await page.goto('/chess/analysis');
  await expect(page.getByLabel('FEN string')).toHaveValue(new RegExp(`^${START} w`));
  // Hydrated: edit mode offers every piece for dragging.
  await expect(page.locator('.square.grabbable')).toHaveCount(32, { timeout: 15000 });
});

test('dragging a piece relocates it — either colour, any square, over whatever stands there', async ({ page }) => {
  // Not a legal move from the start position: the editor applies no rules.
  await drag(page, 'e2', 'e5');
  await expect.poll(() => placement(page)).toBe('rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR');

  // Black's piece, although it is White to move.
  await drag(page, 'g8', 'f6');
  await expect.poll(() => placement(page)).toBe('rnbqkb1r/pppppppp/5n2/4P3/8/8/PPPP1PPP/RNBQKBNR');

  // Onto an occupied square: the dragged piece replaces it.
  await drag(page, 'd1', 'd7');
  await expect.poll(() => placement(page)).toBe('rnbqkb1r/pppQpppp/5n2/4P3/8/8/PPPP1PPP/RNB1KBNR');
  await expect(page.locator('.piece-layer [data-square="d7"]:not([data-fading])')).toBeVisible();
});

test('released off the board, a piece stays put', async ({ page }) => {
  const board = await page.locator('.chess-board').boundingBox();
  if (!board) throw new Error('no board');
  await drag(page, 'e2', { x: board.x + board.width + 60, y: board.y + board.height / 2 });
  await expect.poll(() => placement(page)).toBe(START);
  await expect(page.locator('.piece-layer [data-square="e2"]:not([data-fading])')).toBeVisible();
});

test('a click on a piece is still a click: erasing, placing and previewing moves', async ({ page }) => {
  // No tool picked: a click previews that piece's moves.
  await sq(page, 'e2').click();
  await expect(sq(page, 'e4')).toHaveClass(/valid-move/);

  // Eraser over a piece.
  await page.getByRole('button', { name: 'Eraser' }).click();
  await sq(page, 'e2').click();
  await expect.poll(() => placement(page)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR');

  // Placing over a piece.
  await page.getByTitle('white queen').click();
  await sq(page, 'e7').click();
  await expect.poll(() => placement(page)).toBe('rnbqkbnr/ppppQppp/8/8/8/8/PPPP1PPP/RNBQKBNR');
});

test('with the eraser picked, a drag still relocates — and no click trails the drop', async ({ page }) => {
  await page.getByRole('button', { name: 'Eraser' }).click();
  await drag(page, 'd2', 'd4');
  await expect.poll(() => placement(page)).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR');
  await expect(page.locator('.piece-layer [data-square="d4"]:not([data-fading])')).toBeVisible();

  // Out and back: far enough to be a drag, dropped where it began. Press and
  // release on one square is the shape of a click, and a click here would erase.
  const e2 = await centre(page, 'e2');
  await page.mouse.move(e2.x, e2.y);
  await page.mouse.down();
  await page.mouse.move(e2.x + 80, e2.y - 80, { steps: 5 });
  await page.mouse.move(e2.x, e2.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.piece-layer [data-square="e2"]:not([data-fading])')).toBeVisible();
  expect(await placement(page)).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR');
});

test('in analysis mode a drag is a move again, and only a legal one', async ({ page }) => {
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Position' })).toBeVisible();
  // White's own pieces only — the editor's pick-up-anything is gone.
  await expect(page.locator('.square.grabbable')).toHaveCount(16);

  await drag(page, 'e2', 'e5');
  await expect(page.locator('.piece-layer [data-square="e2"]:not([data-fading])')).toBeVisible();
  await expect(page.locator('.piece-layer [data-square="e5"]:not([data-fading])')).toHaveCount(0);

  await drag(page, 'e2', 'e4');
  await expect(page.locator('.piece-layer [data-square="e4"]:not([data-fading])')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.piece-layer [data-square="e2"]:not([data-fading])')).toHaveCount(0);
});
