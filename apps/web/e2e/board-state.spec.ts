import { test, expect, type Page } from '@playwright/test';
import { fixBoardOrientation, playPastAbortWindowChessLocal } from './helpers/abortWindow';

/**
 * Wave 3 of the UX fix ideas (`project-docs/ux-fix-ideas.md` §5.1–§5.4, §8.5):
 * the board's state budget, the three board settings, and the in-place
 * confirmation on the action row.
 */

/** Chess squares, white at the bottom: index = (8 - rank) * 8 + file. */
const sq = (page: Page, name: string) =>
  page.locator('.square').nth((8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97));

async function startChessLocal(page: Page, settings?: Record<string, unknown>) {
  if (settings) {
    await page.addInitScript((s) => localStorage.setItem('gx:settings', JSON.stringify(s)), settings);
  }
  await page.goto('/chess/local');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.locator('.chess-board')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
}

test('a selection is one flat teal tint over the square — no ring, no glow, no turn halo', async ({ page }) => {
  await startChessLocal(page);
  await sq(page, 'e2').click();
  await expect(sq(page, 'e4')).toHaveClass(/valid-move/, { timeout: 15000 });

  const look = await page.evaluate(() => {
    const selected = document.querySelector('.square.selected') as HTMLElement;
    const dot = document.querySelector('.move-indicator.empty') as HTMLElement;
    const board = document.querySelector('.chess-board') as HTMLElement;
    const s = getComputedStyle(selected);
    return {
      // Laid over the square's own colour, not swapped in for it.
      tint: s.backgroundImage,
      squareColour: s.backgroundColor,
      ring: s.boxShadow,
      dotGlow: getComputedStyle(dot).boxShadow,
      dotWidth: dot.getBoundingClientRect().width / selected.getBoundingClientRect().width,
      boardShadow: getComputedStyle(board).boxShadow,
    };
  });
  expect(look.tint).toContain('rgba(34, 211, 170, 0.5)');
  expect(look.squareColour).not.toBe('rgba(0, 0, 0, 0)');
  expect(look.ring).toBe('none');
  expect(look.dotGlow).toBe('none');
  expect(look.dotWidth).toBeCloseTo(0.22, 2);
  // It is White's move and the player cards say so; the board has no blue halo.
  expect(look.boardShadow).not.toContain('59, 130, 246');
});

test('the last move stays gold and the selection does not share it', async ({ page }) => {
  // Keep White at the bottom: pass-and-play otherwise turns the board after
  // the move, and the square lookup assumes White's view.
  await startChessLocal(page, { flipBoardPassAndPlay: false });
  await sq(page, 'e2').click();
  await expect(sq(page, 'e4')).toHaveClass(/valid-move/, { timeout: 15000 });
  await sq(page, 'e4').click();
  await expect(sq(page, 'e4')).toHaveClass(/last-move/, { timeout: 15000 });

  const lastMove = await sq(page, 'e4').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(lastMove).toContain('rgba(205, 164, 63');
  expect(lastMove).not.toContain('34, 211, 170');
});

test('switching legal moves off draws no destinations', async ({ page }) => {
  await startChessLocal(page, { showDestinations: false, flipBoardPassAndPlay: false });
  await sq(page, 'e2').click();
  await expect(sq(page, 'e4')).toHaveClass(/valid-move/, { timeout: 15000 });
  await expect(page.locator('.move-indicator')).toHaveCount(0);
  // The move is still legal — only its marking is gone.
  await sq(page, 'e4').click();
  await expect(sq(page, 'e4')).toHaveClass(/last-move/, { timeout: 15000 });
});

test('draw asks in place before it ends the game', async ({ page }) => {
  await startChessLocal(page);
  const draw = page.getByRole('button', { name: /^(½ Draw|Draw\?)$/ });
  await draw.click();
  await expect(page.getByRole('button', { name: 'Draw?' })).toBeVisible();
  await expect(page.getByText(/Draw by agreement|It's a draw|Draw$/)).toHaveCount(0);
  await draw.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('with confirmation switched off, one click resigns', async ({ page }) => {
  // Flipping off too, so the moves below address fixed squares.
  await startChessLocal(page, { confirmResign: false, flipBoardPassAndPlay: false });
  // Resign only appears once the game is past its abort window.
  await playPastAbortWindowChessLocal(page);
  await page.getByRole('button', { name: /^Resign\??$/ }).click();
  await expect(page.getByText(/White wins|Black wins/)).toBeVisible();
});

test('settings offers the four piece-animation speeds and remembers the choice', async ({ page }) => {
  await page.goto('/settings');
  const group = page.getByRole('radiogroup', { name: 'Piece animation' });
  await expect(group.getByRole('radio')).toHaveCount(4);
  await group.getByRole('radio', { name: 'Fast' }).click();
  await expect(group.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(
    page.getByRole('radiogroup', { name: 'Piece animation' }).getByRole('radio', { name: 'Fast' }),
  ).toHaveAttribute('aria-checked', 'true');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gx:settings') ?? '{}'));
  expect(stored.pieceAnimation).toBe('fast');
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a Go stone above 9×9 needs a second tap on the same point', async ({ page }) => {
    await page.goto('/go/local');
    await page.getByRole('button', { name: '13×13', exact: true }).click();
    await page.getByRole('button', { name: 'Start Game' }).click();

    const point = page.locator('[data-pos="g7"]');
    await expect(point).toHaveAttribute('data-legal', 'true', { timeout: 15000 });

    await point.tap();
    // Aimed, not played: a see-through stone, and the point is still empty.
    await expect(point.locator('[data-aim]')).toBeVisible();
    await expect(point).not.toHaveAttribute('data-stone', /.+/);

    await page.waitForTimeout(120); // past the 50ms bounce guard
    await point.tap();
    await expect(point).toHaveAttribute('data-stone', 'black');
  });
});
