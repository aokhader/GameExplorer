import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { bandFor, PUZZLE_BANDS, staticPuzzleSource, WEB_PUZZLE_PROGRESS_KEY } from '@gameexplorer/shared';
import type { Puzzle, PuzzleGame } from '@gameexplorer/shared';

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
 * What the app actually serves, in the order it serves it.
 *
 * **Not `staticPuzzleSource`.** The screen reads a layered source whose primary
 * is the published corpus under `apps/web/public/puzzles/`, so seeding against
 * the bundled set computes band sizes and "which puzzle is next" for content
 * the page is not showing. Reading the published index and pages here mirrors
 * the app exactly; a game with nothing published falls back to the bundled set,
 * which is also what the layered source does.
 */
function servedPuzzles(game: PuzzleGame): Puzzle[] | null {
  const dir = join(__dirname, '..', 'public', 'puzzles', game);
  const indexFile = join(dir, 'index.json');
  if (!existsSync(indexFile)) return null;

  const index = JSON.parse(readFileSync(indexFile, 'utf8')) as {
    pageSize: number;
    bands: Record<string, { total: number; ids: string[] }>;
  };
  const out: Puzzle[] = [];
  for (const [band, entry] of Object.entries(index.bands)) {
    const pages = Math.ceil(entry.total / index.pageSize);
    for (let n = 0; n < pages; n++) {
      const file = join(dir, `${band}-${n}.json`);
      if (existsSync(file)) out.push(...(JSON.parse(readFileSync(file, 'utf8')) as Puzzle[]));
    }
  }
  // Empty is a miss, not truth — the same rule `createLayeredPuzzleSource`
  // applies. Games with no corpus publish an empty index (so the fetch is a
  // fast 200 rather than a slow Next 404), and for those the app serves the
  // bundled set, so that is what the test must compute against.
  return out.length > 0 ? out : null;
}

async function openPuzzle(page: Page, game: PuzzleGame, id?: string) {
  const ordered = servedPuzzles(game) ?? (await staticPuzzleSource.listPuzzles({ game }));
  const index = id ? ordered.findIndex((p) => p.id === id) : 0;
  expect(index, `${id} is not in the ${game} set`).toBeGreaterThanOrEqual(0);

  const target = ordered[index];
  const band = bandFor(game, target.rating);
  const inBand = ordered.filter((p) => bandFor(game, p.rating).id === band.id);
  const total = inBand.length;
  const solved = inBand.slice(0, inBand.findIndex((p) => p.id === target.id)).map((p) => p.id);

  await page.addInitScript(
    ([key, ids, g, bandId]) => {
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
          bands: { [g as string]: bandId },
          updatedAt: '',
        }),
      );
    },
    [WEB_PUZZLE_PROGRESS_KEY, solved, game, band.id] as const,
  );

  await page.goto(`/${game}/puzzles`);
  await expect(page.getByTestId('puzzle-prompt')).toBeVisible();
  return { ordered, solved, band, total };
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
  const { total } = await openPuzzle(page, 'chess');

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
  const { solved, total } = await openPuzzle(page, 'chess', 'chess-003');

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-explanation')).toContainText('Qb8 is mate');
  await expect(page.getByTestId('puzzle-progress')).toContainText(`${solved.length + 1} / ${total} solved`);
  // Solved first try with no hint — that is what a streak counts.
  await expect(page.getByTestId('puzzle-progress')).toContainText('streak 1');

  await page.reload();
  // The solved one is not served again, so the next puzzle loads and the count
  // has stuck.
  await expect(page.getByTestId('puzzle-progress')).toContainText(`${solved.length + 1} / ${total} solved`);
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
  const { solved, total } = await openPuzzle(page, 'chess', 'chess-003');
  await page.getByRole('button', { name: 'Hint' }).click();

  await chessSquare(page, 'b1').click();
  await chessSquare(page, 'b8').click();

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-progress')).toContainText(`${solved.length + 1} / ${total} solved`);
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
  const { solved, total } = await openPuzzle(page, 'checkers', 'checkers-001');
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
  const { solved, total } = await openPuzzle(page, 'checkers', 'checkers-001');

  // c2–e4–g6 is legal, and a double capture — just not the best one.
  await gridCell(page, 'c2').click();
  await gridCell(page, 'g6').click();

  await expect(status(page)).toHaveText('Not quite');
  await expect(page.getByTestId('puzzle-progress')).toContainText(
    `${solved.length} / ${total} solved`,
  );
});

test('reversi: the opponent’s forced pass hands the move straight back', async ({ page }) => {
  // The parity endgame is the puzzle with a forced pass in the middle of it.
  const { solved, total } = await openPuzzle(page, 'reversi', 'reversi-002');
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
  await expect(page.getByTestId('puzzle-progress')).toContainText(
    `${solved.length + 1} / ${total} solved`,
  );
});

for (const game of ['chess', 'checkers', 'reversi', 'go'] as const) {
  test(`${game} hub links to its puzzles, and the route loads`, async ({ page }) => {
    await page.goto(`/${game}`);
    const card = page.locator(`a[href="/${game}/puzzles"]`).first();
    await expect(card).toBeVisible();

    await card.click();
    // Longer than the default: this is a client-side route transition in a dev
    // server under parallel workers, and the mode now fetches its index before
    // it can paint. Production serves those off a CDN in a fraction of this.
    await expect(page.getByTestId('puzzle-prompt')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('nav')).toHaveCount(0);
  });
}

/** A point on the Go board, which addresses its crossings by `data-pos`. */
function goPoint(page: Page, point: string) {
  return page.locator(`[data-pos="${point}"]`);
}

test('go: a life-and-death puzzle is solved point by point', async ({ page }) => {
  const { solved, total } = await openPuzzle(page, 'go', 'go-001');
  const puzzle = (await staticPuzzleSource.getPuzzle('go-001'))!;
  await expect(page.getByTestId('puzzle-prompt')).toContainText('three points of eye space');

  // Go's puzzles are the ones that could not exist until the engine could prove
  // something. Playing the proved line is the check that the proof and the
  // board agree about what the moves are.
  for (const step of puzzle.steps) {
    await goPoint(page, step.move).click();
    if (step.reply !== undefined) await expect(status(page)).toHaveText('Your move');
  }

  await expect(status(page)).toHaveText('Solved');
  await expect(page.getByTestId('puzzle-progress')).toContainText(
    `${solved.length + 1} / ${total} solved`,
  );
  await expect(page.getByTestId('puzzle-explanation')).toContainText('Play in the middle');
});

test('go: a plausible wrong point is refused and the punishment is played out', async ({ page }) => {
  await openPuzzle(page, 'go', 'go-001');
  const puzzle = (await staticPuzzleSource.getPuzzle('go-001'))!;
  const wrong = puzzle.region!.find((p) => p !== puzzle.steps[0].move)!;

  await goPoint(page, wrong).click();
  await expect(status(page)).toHaveText('Not quite');
  // The refutation comes from the tsumego solver, so it names a real move
  // rather than the generic "that is playable" fallback.
  await expect(page.locator('[role="status"]')).toContainText(/White answers|Black answers/);
  await expect(page.getByTestId('puzzle-explanation')).toHaveCount(0);
});

/**
 * The difficulty band picker.
 *
 * The mode's claim is that "Club" here means the same strength as "Club" on the
 * bot setup screen, so what these check is that the band actually governs which
 * puzzle is served — not merely that a pill highlights.
 */
test('the band picker serves a puzzle whose rating is inside the band', async ({ page }) => {
  await openPuzzle(page, 'chess');

  for (const band of PUZZLE_BANDS.chess) {
    const served = servedPuzzles('chess') ?? [];
    const count = served.filter((p) => bandFor('chess', p.rating).id === band.id).length;
    if (count === 0) continue;

    await page.getByTestId(`puzzle-band-${band.id}`).click();
    await expect(page.getByTestId('puzzle-band-label')).toContainText(band.label);

    // The rating shown must fall inside the band it was served from. This is
    // the assertion that would catch a filter that silently stopped filtering.
    const label = await page.getByTestId('puzzle-band-label').textContent();
    const rating = Number(label!.split('·')[1].trim());
    expect(rating, `${band.id} served a ${rating}`).toBeGreaterThanOrEqual(band.min);
    if (band.max !== Infinity) expect(rating).toBeLessThan(band.max);
  }
});

test('the chosen band survives a reload', async ({ page }) => {
  await openPuzzle(page, 'chess');
  await page.getByTestId('puzzle-band-beginner').click();
  await expect(page.getByTestId('puzzle-band-label')).toContainText('Beginner');

  await page.reload();
  // A guest, with no account anywhere in this flow — the band rides in the same
  // `localStorage` record the solves do.
  await expect(page.getByTestId('puzzle-band-label')).toContainText('Beginner');
});

test('progress counts the band, not the whole game', async ({ page }) => {
  const { solved, total } = await openPuzzle(page, 'chess', 'chess-003');
  const whole = (servedPuzzles('chess') ?? []).length;

  // Guard the guard: if these were equal the assertion below would pass for
  // the wrong reason.
  expect(total).toBeLessThan(whole);
  await expect(page.getByTestId('puzzle-progress')).toContainText(`/ ${total} solved`);
});

test('an empty band says so and offers a way out', async ({ page }) => {
  // Checkers, not chess. Chess's Master band was empty until the Lichess import
  // filled it with 1,388 puzzles, and this test failed loudly and demanded to be
  // repointed — which is what its previous comment asked for and the reason it
  // was written that way. Checkers has no mined corpus yet, so its Beginner band
  // is genuinely empty; the same will happen here when checkers is mined.
  await openPuzzle(page, 'checkers');

  const served = servedPuzzles('checkers') ?? (await staticPuzzleSource.listPuzzles({ game: 'checkers' }));
  const empty = served.filter(
    (p) => bandFor('checkers', p.rating).id === 'beginner',
  );
  expect(empty, 'the checkers Beginner band now has content — repoint this test').toHaveLength(0);

  // The band must say so plainly rather than looking like a broken mode, and
  // must leave the picker reachable: the way out of an empty band is another
  // band, not "start over", which would throw away a solved set to escape one
  // that was never started.
  await page.getByTestId('puzzle-band-beginner').click();

  await expect(page.getByText(/No Beginner Checkers puzzles yet/)).toBeVisible();
  await expect(page.getByTestId('puzzle-band-club')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start over' })).toHaveCount(0);

  // …and picking a populated band recovers.
  await page.getByTestId('puzzle-band-club').click();
  await expect(page.getByTestId('puzzle-prompt')).toBeVisible();
});

test('progress never counts solves from other bands', async ({ page }) => {
  // The bug this exists for read "3 / 1": `solved` counted the whole game while
  // `total` counted the band, so working across two bands produced a progress
  // line that was both wrong and impossible.
  const ordered = (servedPuzzles('chess') ?? await staticPuzzleSource.listPuzzles({ game: 'chess' }));
  const beginner = ordered.filter((p) => bandFor('chess', p.rating).id === 'beginner');
  const novice = ordered.filter((p) => bandFor('chess', p.rating).id === 'novice');

  await page.addInitScript(
    ([key, ids]) => {
      localStorage.setItem(
        key as string,
        JSON.stringify({
          v: 1,
          solved: ids,
          streak: 0,
          bestStreak: 0,
          lastSeen: {},
          bands: { chess: 'novice' },
          updatedAt: '',
        }),
      );
    },
    // Everything in Beginner solved, plus one in Novice.
    [WEB_PUZZLE_PROGRESS_KEY, [...beginner.map((p) => p.id), novice[0].id]] as const,
  );

  await page.goto('/chess/puzzles');
  await expect(page.getByTestId('puzzle-prompt')).toBeVisible();

  // Novice: exactly one solved, out of the band's own size.
  await expect(page.getByTestId('puzzle-progress')).toContainText(`1 / ${novice.length} solved`);
  // Never more solved than the band holds — the shape of the original bug.
  const text = (await page.getByTestId('puzzle-progress').textContent())!;
  const [done, of] = text.match(/(\d+) \/ (\d+)/)!.slice(1).map(Number);
  expect(done).toBeLessThanOrEqual(of);

  // …and the picker reports each band separately.
  await expect(page.getByTestId('puzzle-band-beginner-progress')).toContainText(
    `${beginner.length}/${beginner.length}`,
  );
  await expect(page.getByTestId('puzzle-band-novice-progress')).toContainText(
    `1/${novice.length}`,
  );
});

test('start over clears only the band it was pressed in', async ({ page }) => {
  const ordered = (servedPuzzles('chess') ?? await staticPuzzleSource.listPuzzles({ game: 'chess' }));
  const beginner = ordered.filter((p) => bandFor('chess', p.rating).id === 'beginner');
  const novice = ordered.filter((p) => bandFor('chess', p.rating).id === 'novice');

  await page.addInitScript(
    ([key, ids]) => {
      localStorage.setItem(
        key as string,
        JSON.stringify({
          v: 1,
          solved: ids,
          streak: 0,
          bestStreak: 0,
          lastSeen: {},
          bands: { chess: 'beginner' },
          updatedAt: '',
        }),
      );
    },
    // Beginner finished (so it shows the empty state), one Novice solved.
    [WEB_PUZZLE_PROGRESS_KEY, [...beginner.map((p) => p.id), novice[0].id]] as const,
  );

  await page.goto('/chess/puzzles');
  await expect(page.getByText("You've solved every Beginner puzzle")).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();

  // Beginner restarts…
  await expect(page.getByTestId('puzzle-progress')).toContainText(`0 / ${beginner.length} solved`);
  // …and the Novice solve is still there. `clearGame` would have taken it.
  await expect(page.getByTestId('puzzle-band-novice-progress')).toContainText(
    `1/${novice.length}`,
  );
});
