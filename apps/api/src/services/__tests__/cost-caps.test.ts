import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LIMITS } from '@gameexplorer/shared';
import type { GameSession } from '../gameSession.service';

// Same in-memory fakes as the other service tests, mocked at the module
// specifiers the services import so they share these instances.
vi.mock('../../config/supabase', async () => {
  const { createSupabaseFakeModule } = await import('../../__tests__/helpers/supabase-fake');
  return createSupabaseFakeModule();
});
vi.mock('../../config/redis', async () => {
  const { createRedisFakeModule } = await import('../../__tests__/helpers/redis-fake');
  return createRedisFakeModule();
});

import * as supabaseModule from '../../config/supabase';
import { persistenceService } from '../persistence.service';
import { blockService } from '../block.service';

const fake = supabaseModule as unknown as {
  __tables: Record<string, Array<Record<string, unknown>>>;
  __reset(): void;
};

beforeEach(() => fake.__reset());

function session(over: Partial<GameSession> = {}): GameSession {
  return {
    id: 'game-1',
    gameType: 'chess',
    whiteId: 'w',
    blackId: 'b',
    whiteUsername: 'White',
    blackUsername: 'Black',
    state: JSON.stringify({ moveHistory: [] }),
    ...over,
  } as unknown as GameSession;
}

function seedGames(userId: string, gameType: string, n: number, prefix: string) {
  for (let i = 0; i < n; i++) {
    fake.__tables.games.push({
      id: `${prefix}${i}`,
      user_id: userId,
      game_type: gameType,
      // Old enough that any freshly-inserted row sorts as newest.
      created_at: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    });
  }
}

// ── Per-game-type retention (LIMITS.GAMES_PER_TYPE) ──────────────────────────
describe('persistenceService game pruning', () => {
  it('keeps only the newest games per game type after a persist', async () => {
    seedGames('w', 'chess', LIMITS.GAMES_PER_TYPE, 'c'); // already at the cap
    seedGames('w', 'checkers', 3, 'k');                  // other type untouched

    await persistenceService.persistGameResult({
      session: session(),
      result: 'white_wins',
      reason: 'checkmate',
      rated: false,
      white: { ratingBefore: 1200, ratingAfter: 1200 },
      black: { ratingBefore: 1200, ratingAfter: 1200 },
    });

    const of = (userId: string, type: string) =>
      fake.__tables.games.filter(g => g.user_id === userId && g.game_type === type);

    // The insert pushed w to cap+1 chess games; the oldest was pruned back down.
    expect(of('w', 'chess')).toHaveLength(LIMITS.GAMES_PER_TYPE);
    expect(of('w', 'chess').map(g => g.id)).not.toContain('c0');
    // Checkers games and the opponent's single chess game are untouched.
    expect(of('w', 'checkers')).toHaveLength(3);
    expect(of('b', 'chess')).toHaveLength(1);
  });

  it('does not prune while under the cap', async () => {
    seedGames('w', 'chess', 2, 'c');
    await persistenceService.persistGameResult({
      session: session(),
      result: 'draw',
      reason: 'draw_agreement',
      rated: false,
      white: { ratingBefore: 1200, ratingAfter: 1200 },
      black: { ratingBefore: 1200, ratingAfter: 1200 },
    });
    expect(fake.__tables.games.filter(g => g.user_id === 'w')).toHaveLength(3);
  });
});

// ── Report dedupe + open-report cap ──────────────────────────────────────────
describe('blockService.report caps', () => {
  it('stores a report, then skips duplicates for the same open pair', async () => {
    await blockService.report({ reporterId: 'r', reportedId: 'x', reason: 'spam' });
    await blockService.report({ reporterId: 'r', reportedId: 'x', reason: 'harassment' });
    expect(fake.__tables.user_reports).toHaveLength(1);
  });

  it('still accepts a new report when the earlier one for that pair is closed', async () => {
    fake.__tables.user_reports.push({ reporter_id: 'r', reported_id: 'x', status: 'resolved' });
    await blockService.report({ reporterId: 'r', reportedId: 'x', reason: 'spam' });
    expect(fake.__tables.user_reports).toHaveLength(2);
  });

  it('stops inserting once the reporter has MAX_OPEN_REPORTS open reports', async () => {
    for (let i = 0; i < LIMITS.MAX_OPEN_REPORTS; i++) {
      fake.__tables.user_reports.push({ reporter_id: 'r', reported_id: `t${i}`, status: 'open' });
    }
    await blockService.report({ reporterId: 'r', reportedId: 'fresh-target', reason: 'spam' });
    expect(fake.__tables.user_reports).toHaveLength(LIMITS.MAX_OPEN_REPORTS);
  });
});

// ── Block count (drives the MAX_BLOCKS cap in the controller) ────────────────
describe('blockService.countBlocked', () => {
  it('counts only the blocker’s own rows', async () => {
    fake.__tables.user_blocks.push({ blocker_id: 'r', blocked_id: 'a' });
    fake.__tables.user_blocks.push({ blocker_id: 'r', blocked_id: 'b' });
    fake.__tables.user_blocks.push({ blocker_id: 'other', blocked_id: 'r' });
    expect(await blockService.countBlocked('r')).toBe(2);
  });
});
