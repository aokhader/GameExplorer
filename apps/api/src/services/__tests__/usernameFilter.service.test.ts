// The username filter's upkeep. What matters is that it never answers "free"
// for a name it should know about: one from a build, a poll, or a claim made
// in the middle of a build. And that it stops answering, rather than guess, once
// it has not refreshed for a while.
//
// The fake below runs the real filters, orders and ranges over an in-memory
// table, so paging bugs (a skipped row, an endless loop) show up here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createUsernameFilter,
  FILTER_PAGE_SIZE,
  FILTER_POLL_MS,
  FILTER_POLL_OVERLAP_MS,
  FILTER_REBUILD_MS,
  FILTER_STALE_AFTER_MS,
  FILTER_STATS_MS,
  type UsernameFilter,
} from '../usernameFilter.service';

type Row = { id: string; username: string; created_at: string };
type Op = [string, ...unknown[]];

const T0 = Date.parse('2026-10-29T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

let rows: Row[];
let queries: Op[][];
let failQueries: boolean;
/** Runs inside every query, before it answers — for interleaving a claim. */
let onQuery: ((ops: Op[]) => void) | null;
let clock: number;
let log: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

function run(ops: Op[], head: boolean) {
  if (failQueries) return { data: null, count: null, error: { message: 'connection refused' } };
  if (head) return { data: null, count: rows.length, error: null };

  let result = [...rows];
  const orders: { column: keyof Row; ascending: boolean }[] = [];
  let slice: [number, number] | null = null;
  for (const [name, ...args] of ops) {
    if (name === 'gt') result = result.filter((r) => r[args[0] as keyof Row] > (args[1] as string));
    if (name === 'gte') {
      result = result.filter((r) => Date.parse(r.created_at) >= Date.parse(args[1] as string));
    }
    if (name === 'order') {
      const opts = args[1] as { ascending?: boolean } | undefined;
      orders.push({ column: args[0] as keyof Row, ascending: opts?.ascending ?? true });
    }
    if (name === 'limit') slice = [0, args[0] as number];
    if (name === 'range') slice = [args[0] as number, (args[1] as number) + 1];
  }
  result.sort((a, b) => {
    for (const { column, ascending } of orders) {
      if (a[column] !== b[column]) return (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1);
    }
    return 0;
  });
  return { data: slice ? result.slice(...slice) : result, count: null, error: null };
}

function fakeClient(): SupabaseClient {
  return {
    from: () => ({
      select: (columns: string, opts?: { head?: boolean }) => {
        const ops: Op[] = [['select', columns]];
        queries.push(ops);
        const record =
          (name: string) =>
          (...args: unknown[]) => {
            ops.push([name, ...args]);
            return b;
          };
        const b: Record<string, unknown> = {
          order: record('order'),
          limit: record('limit'),
          range: record('range'),
          gt: record('gt'),
          gte: record('gte'),
          then(resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) {
            onQuery?.(ops);
            return Promise.resolve(run(ops, !!opts?.head)).then(resolve, reject);
          },
        };
        return b;
      },
    }),
  } as unknown as SupabaseClient;
}

const row = (n: number, username: string, createdAt = T0 - 60_000): Row => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  username,
  created_at: iso(createdAt),
});

function makeFilter(enabled = true): UsernameFilter {
  return createUsernameFilter({
    client: () => fakeClient(),
    enabled: () => enabled,
    now: () => clock,
    log: log as never,
  });
}

/** Queries that read pages of names (not the count or the high-water read). */
const pageReads = () => queries.filter((ops) => ops[0][1] === 'id, username');
const pollReads = () => queries.filter((ops) => ops[0][1] === 'username, created_at');

beforeEach(() => {
  rows = [row(1, 'Bob'), row(2, 'alice')];
  queries = [];
  failQueries = false;
  onQuery = null;
  clock = T0;
  log = { info: vi.fn(), warn: vi.fn() };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('building', () => {
  it('answers not-ready until the first build, then from the filter', async () => {
    const filter = makeFilter();
    expect(filter.check('bob')).toBe('not-ready');

    await filter.tick();

    expect(filter.check('bob')).toBe('maybe-taken');
    expect(filter.check('nobody_here')).toBe('definitely-free');
  });

  it('folds case the way the unique index does', async () => {
    const filter = makeFilter();
    await filter.tick();
    expect(filter.check('BOB')).toBe('maybe-taken');
    expect(filter.check('Alice')).toBe('maybe-taken');
  });

  it('pages by id through more than one page, and misses nobody', async () => {
    rows = Array.from({ length: 2 * FILTER_PAGE_SIZE + 500 }, (_, i) => row(i + 1, `player_${i}`));
    const filter = makeFilter();

    await filter.tick();

    expect(pageReads()).toHaveLength(3);
    expect(rows.every((r) => filter.check(r.username) === 'maybe-taken')).toBe(true);
  });

  it('keeps a claim made while the build is paging', async () => {
    const filter = makeFilter();
    onQuery = (ops) => {
      if (ops[0][1] === 'id, username') filter.add('Claimed_Mid_Build');
    };

    await filter.tick();

    expect(filter.check('claimed_mid_build')).toBe('maybe-taken');
  });
});

describe('staying fresh', () => {
  it('learns a sign-up the database trigger wrote, at the next poll', async () => {
    const filter = makeFilter();
    await filter.tick();
    expect(filter.check('newcomer')).toBe('definitely-free');

    clock += FILTER_POLL_MS;
    rows.push(row(3, 'newcomer', clock - 1_000));
    await filter.tick();

    expect(pollReads()).toHaveLength(1);
    expect(filter.check('newcomer')).toBe('maybe-taken');
  });

  it('catches an insert that committed late with an older created_at', async () => {
    const filter = makeFilter();
    await filter.tick(); // high-water mark: Bob's and alice's created_at, T0 - 60 s

    clock += FILTER_POLL_MS;
    // Created before the mark but committed after the build read it.
    rows.push(row(3, 'late_commit', T0 - 60_000 - FILTER_POLL_OVERLAP_MS / 2));
    await filter.tick();

    expect(filter.check('late_commit')).toBe('maybe-taken');
  });

  it('starts each poll an overlap behind the newest row it has seen', async () => {
    const filter = makeFilter();
    await filter.tick();
    clock += FILTER_POLL_MS;
    await filter.tick();

    const gte = pollReads()[0].find(([name]) => name === 'gte');
    expect(gte).toEqual(['gte', 'created_at', iso(T0 - 60_000 - FILTER_POLL_OVERLAP_MS)]);
  });

  it('learns a claim at once, which no poll could see', async () => {
    const filter = makeFilter();
    await filter.tick();
    filter.add('Fresh_Claim');
    expect(filter.check('fresh_claim')).toBe('maybe-taken');
  });

  it('stops answering once it has not refreshed for too long, and resumes after', async () => {
    const filter = makeFilter();
    await filter.tick();

    failQueries = true;
    clock += FILTER_POLL_MS;
    await filter.tick();
    expect(filter.check('nobody_here')).toBe('definitely-free'); // still within the window

    clock = T0 + FILTER_STALE_AFTER_MS + 1;
    expect(filter.check('nobody_here')).toBe('not-ready');
    expect(filter.check('bob')).toBe('not-ready');

    failQueries = false;
    clock += 10 * 60_000; // past any backoff
    await filter.tick();
    expect(filter.check('nobody_here')).toBe('definitely-free');
  });

  it('rebuilds daily, which drops deleted accounts', async () => {
    const filter = makeFilter();
    await filter.tick();
    for (let i = 1; i <= 5; i++) {
      clock += FILTER_POLL_MS;
      await filter.tick();
    }
    expect(filter.check('bob')).toBe('maybe-taken');

    rows = rows.filter((r) => r.username !== 'Bob'); // account deleted
    clock = T0 + FILTER_REBUILD_MS;
    queries = [];
    await filter.tick();

    expect(pageReads()).toHaveLength(1);
    expect(filter.check('bob')).toBe('definitely-free');
  });

  it('rebuilds bigger once it holds more names than it was sized for', async () => {
    const filter = makeFilter();
    await filter.tick();

    clock += FILTER_POLL_MS;
    // Past the 10,000 floor by more than the ~1% that `size` undercounts.
    rows = Array.from({ length: 10_500 }, (_, i) => row(i + 1, `player_${i}`, clock - 1_000));
    await filter.tick(); // a poll adds them all
    expect(pageReads()).toHaveLength(1);

    clock += FILTER_POLL_MS;
    await filter.tick();
    expect(pageReads()).toHaveLength(1 + Math.ceil(10_500 / FILTER_PAGE_SIZE));
    expect(log.info).toHaveBeenLastCalledWith(expect.stringContaining('capacity 21000'));
  });
});

describe('failures', () => {
  it('stays not-ready while it cannot build, warns once, and backs off', async () => {
    failQueries = true;
    const filter = makeFilter();

    await filter.tick();
    expect(filter.check('anyone')).toBe('not-ready');
    expect(log.warn).toHaveBeenCalledTimes(1);

    const before = queries.length;
    clock += FILTER_POLL_MS - 1; // inside the first backoff
    await filter.tick();
    expect(queries.length).toBe(before);

    clock += 1;
    await filter.tick(); // retried, failed again
    expect(queries.length).toBeGreaterThan(before);
    expect(log.warn).toHaveBeenCalledTimes(1);

    failQueries = false;
    clock += 10 * 60_000;
    await filter.tick();
    expect(filter.check('anyone')).toBe('definitely-free');
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('recovered'));
  });
});

describe('start and stop', () => {
  it('does nothing when switched off', () => {
    vi.useFakeTimers();
    const filter = makeFilter(false);
    filter.start();
    expect(vi.getTimerCount()).toBe(0);
    expect(queries).toEqual([]);
    expect(filter.check('bob')).toBe('not-ready');
  });

  it('builds at once, keeps polling on a timer, and stop() clears every timer', async () => {
    vi.useFakeTimers();
    const filter = makeFilter();
    filter.start();
    filter.start(); // idempotent
    await vi.waitFor(() => expect(filter.check('bob')).toBe('maybe-taken'));
    expect(vi.getTimerCount()).toBe(2);

    clock += FILTER_POLL_MS;
    await vi.advanceTimersByTimeAsync(FILTER_POLL_MS);
    expect(pollReads()).toHaveLength(1);

    filter.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the hourly summary', () => {
  it('reports the false-positive rate over free names, then resets', () => {
    const filter = makeFilter();
    for (let i = 0; i < 98; i++) filter.note('skipped');
    filter.note('false-positive', 20);
    filter.note('false-positive', 40);
    filter.note('taken', 30);

    filter.logStats();

    const line = log.info.mock.calls.at(-1)?.[0] as string;
    expect(line).toContain('101 checks');
    expect(line).toContain('98 answered without the database');
    expect(line).toContain('2 false positives (2.0% of free names)');
    expect(line).toContain('3 lookups, mean 30 ms, max 40 ms');

    log.info.mockClear();
    filter.logStats();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('runs on its own timer', () => {
    vi.useFakeTimers();
    const filter = makeFilter();
    filter.start();
    filter.note('skipped');
    vi.advanceTimersByTime(FILTER_STATS_MS);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('1 checks'));
    filter.stop();
  });
});
