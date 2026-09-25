// Security audit v2, Wave 2 — GX-04, the shared rating.
//
// The browser used to write `user_ratings.rating` after every bot and training
// game, and the API read that same number to pair players and to price the
// OPPONENT's Elo change in rated online games. So a number any user could type
// moved other people's ratings (the "rating faucet" and "trap" in WS3-01).
//
// The fix (owner's choice, Option B) splits the number in two:
//   • Rating — `user_ratings`, written only by this API with the service key.
//     Clients hold SELECT and nothing else (`supabase-security-wave2.sql` PART 3).
//   • Practice level — `practice_ratings`, moved by bot/training games through
//     `record_practice_result`, which only touches the caller's own row. The API
//     never reads it.
//
// The database half (grants, policies, CHECKs) cannot run in this suite — it is
// verified by PART 4 of the migration, including a role-switched probe of the
// attack itself. What CAN rot in the repo is pinned here:
//   1. the server clamps every rating it reads before it prices a game, and
//   2. no client code path writes `user_ratings` or calls the old writer again.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { RATING_BOUNDS } from '@gameexplorer/shared';

vi.mock('../../config/supabase', async () => {
  const { createSupabaseFakeModule } = await import('../helpers/supabase-fake');
  return createSupabaseFakeModule();
});

import * as supabaseModule from '../../config/supabase';
import { persistenceService } from '../../services/persistence.service';

const supa = supabaseModule as unknown as {
  __tables: { user_ratings: Record<string, unknown>[] };
  __reset(): void;
};

beforeEach(() => supa.__reset());

function seed(userId: string, row: Record<string, unknown>) {
  supa.__tables.user_ratings.push({
    user_id: userId,
    game_type: 'chess',
    games_played: 10,
    wins: 5,
    losses: 5,
    draws: 0,
    peak_rating: 1200,
    updated_at: '2026-09-24T00:00:00Z',
    ...row,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GX-04 · the server never prices a game with an out-of-range rating', () => {
  // Defence in depth behind the lockdown: whoever wrote the row — a client before
  // PART 3 ran, a future bug, a hand edit — it is clamped on the way in.
  it.each([
    ['a forged ceiling', 99_999, RATING_BOUNDS.max],
    ['a forged floor', -50, RATING_BOUNDS.min],
    ['a fraction', 1234.6, 1235],
    ['an honest value', 1480, 1480],
  ])('%s (%s) reads as %s', async (_label, stored, expected) => {
    seed('p1', { rating: stored });
    expect(await persistenceService.getRating('p1', 'chess')).toBe(expected);
  });

  it('a non-number reads as the default rather than poisoning the arithmetic', async () => {
    seed('p1', { rating: 'NaN' });
    expect(await persistenceService.getRating('p1', 'chess')).toBe(1200);
  });

  it('a missing row reads as the default', async () => {
    expect(await persistenceService.getRating('nobody', 'chess')).toBe(1200);
  });

  it('a forged games_played cannot go negative (the K-factor input)', async () => {
    seed('p1', { rating: 1200, games_played: -7 });
    expect(await persistenceService.getGamesPlayed('p1', 'chess')).toBe(0);
  });

  // Deliberately NOT tested here: "a clamped forgery moves the victim less".
  // It does not — Elo saturates, so a forged 1 000 000 and a forged 4000 price
  // a game identically (a mutation run proved the test could not fail). The
  // clamp guards the arithmetic against non-numbers and the stored columns
  // against the CHECK; what stops the forgery is PART 3's lockdown.

  it('writes stay inside the bounds the database CHECK enforces', async () => {
    // A peak forged before the lockdown must not make every later server write
    // violate `user_ratings_bounds` and silently drop the result.
    seed('p1', { rating: 1300, peak_rating: 50_000 });
    await persistenceService.upsertRating('p1', 'chess', 1316, 'win');
    const row = supa.__tables.user_ratings.find(r => r.user_id === 'p1')!;
    expect(row.rating).toBe(1316);
    expect(row.peak_rating).toBe(RATING_BOUNDS.max);
    expect(row.games_played).toBe(11);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const REPO = join(__dirname, '../../../../..');

/** Client-side source trees — everything that runs with the public anon key. */
const CLIENT_ROOTS = [
  'apps/web/src',
  'apps/mobile/app',
  'apps/mobile/src',
  'packages/client/src',
  'packages/db/src',
  'packages/ui/src',
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const clientFiles = CLIENT_ROOTS.flatMap(root => sourceFiles(join(REPO, root)));

describe('GX-04 · no client code writes the online Rating', () => {
  it('found the client source trees (a moved folder must not pass this vacuously)', () => {
    expect(clientFiles.length).toBeGreaterThan(200);
    expect(clientFiles.some(f => f.endsWith(join('packages', 'db', 'src', 'ratings.ts')))).toBe(true);
  });

  it('never calls the old client writer, record_game_result', () => {
    const offenders = clientFiles.filter(f => readFileSync(f, 'utf8').includes('record_game_result'));
    expect(offenders.map(f => relative(REPO, f))).toEqual([]);
  });

  it('only ever reads user_ratings', () => {
    // Every `.from('user_ratings')` must be followed by `.select(` — an upsert,
    // insert, update or delete from a client is exactly the hole being closed.
    const offenders: string[] = [];
    for (const f of clientFiles) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.from\(\s*['"`]user_ratings['"`]\s*\)\s*\.(\w+)/g)) {
        if (m[1] !== 'select') offenders.push(`${relative(REPO, f)}: .${m[1]}(`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the db package's rating module reads both tables and writes only through record_practice_result", () => {
    const src = readFileSync(join(REPO, 'packages/db/src/ratings.ts'), 'utf8');
    // Its table access goes through one generic reader, so check every `.from(`.
    const methods = [...src.matchAll(/\.from\([^)]*\)\s*\.(\w+)/g)].map(m => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every(m => m === 'select')).toBe(true);
    const rpcs = [...src.matchAll(/\.rpc\(\s*['"`](\w+)['"`]/g)].map(m => m[1]);
    expect(rpcs).toEqual(['record_practice_result']);
  });

  it('the db package exports no writer for user_ratings', () => {
    const index = readFileSync(join(REPO, 'packages/db/src/index.ts'), 'utf8');
    const line = /export\s*\{([^}]*)\}\s*from\s*'\.\/ratings'/.exec(index)?.[1];
    expect(line, 'ratings export line not found — did index.ts change shape?').toBeDefined();
    const names = line!.split(',').map(s => s.trim()).filter(Boolean).sort();
    expect(names).toEqual(
      ['getPracticeRating', 'getPracticeRatings', 'getUserRating', 'getUserRatings', 'recordPracticeResult'].sort(),
    );
  });
});

describe('GX-04 · the server never reads the Practice level', () => {
  it('apps/api does not query practice_ratings', () => {
    // A self-reported number must not reach server arithmetic — that is the
    // whole reason it is a separate table.
    const apiFiles = sourceFiles(join(REPO, 'apps/api/src'));
    expect(apiFiles.length).toBeGreaterThan(20);
    const offenders = apiFiles.filter(f => /\.from\(\s*['"`]practice_ratings['"`]/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(f => relative(REPO, f))).toEqual([]);
  });
});
