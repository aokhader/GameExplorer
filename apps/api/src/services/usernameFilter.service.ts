// The username Bloom filter: which names are definitely free, without asking
// the database. Plan and measurements: project-docs/username-bloom-filter-plan.md.
//
// usernameService.checkAvailability consults it after the grammar, reserved
// and profanity rules and before the database. "Definitely free" answers the
// sign-up form directly; anything else — "maybe taken", not built yet, gone
// stale — is a database lookup exactly as before. A Bloom filter has no false
// "not here", so the only wrong answer it can give comes from a name newer than
// its last refresh. That is the same race two people typing the same name
// already have: the unique index decides, and the form rechecks with `fresh`,
// which skips the filter.
//
// Where the names come from, and why each path exists:
//   - build: every username, paged by id. Runs at boot, daily, and whenever the
//     filter passes its capacity. The new filter is swapped in only once it is
//     complete, so there is never a moment without one.
//   - poll (every POLL_MS): rows created since the last high-water mark, minus
//     an overlap for inserts that commit late. New sign-ups are written by the
//     on_auth_user_created DATABASE trigger, not by this API, so polling is the
//     only way the API hears of them. Adding a name twice is harmless, so the
//     overlap costs nothing.
//   - add(): a claim through usernameService.claim. A claim UPDATEs the row and
//     changes no timestamp, so no poll can see it. Only the instance that
//     handled the claim learns of it before the next build — fine while the API
//     is single-instance (13-operations.md lists what that assumption covers).
//   - Deleted accounts and names replaced by a claim stay in the filter until
//     the next build. That is a false positive, which only costs a lookup.
//
// In memory, per process. Redis here is colocated and wiped on restart too, so
// it would buy no durability, only a round trip per check.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { BloomFilter } from '../utils/bloomFilter';
import { logger } from '../utils/logger';

export const FILTER_FALSE_POSITIVE_RATE = 0.01;
/** Never sized below this, so a young site does not rebuild every few sign-ups. */
export const FILTER_MIN_CAPACITY = 10_000;
export const FILTER_PAGE_SIZE = 1_000;
export const FILTER_POLL_MS = 30_000;
/** How far behind the high-water mark each poll starts, for late-committing inserts. */
export const FILTER_POLL_OVERLAP_MS = 2 * 60_000;
/** With no successful refresh for this long, the filter stops answering. */
export const FILTER_STALE_AFTER_MS = 2 * 60_000;
export const FILTER_REBUILD_MS = 24 * 60 * 60_000;
/** Ceiling on the wait after repeated failures; the first retry is FILTER_POLL_MS. */
export const FILTER_MAX_BACKOFF_MS = 5 * 60_000;
export const FILTER_STATS_MS = 60 * 60_000;

export type FilterAnswer = 'definitely-free' | 'maybe-taken' | 'not-ready';

/** How one availability check went, for the summary line. */
export type FilterOutcome =
  /** The filter answered "free"; no database lookup. */
  | 'skipped'
  /** "Maybe", and the database found it taken. */
  | 'taken'
  /** "Maybe", but the database found it free: a false positive. */
  | 'false-positive'
  /** Not built yet, stale, or switched off: looked up. */
  | 'not-ready'
  /** The caller asked for a fresh answer: looked up. */
  | 'fresh';

interface Stats {
  /** When this window began, so a partial one printed at shutdown says how long it covers. */
  since: number;
  outcomes: Record<FilterOutcome, number>;
  lookups: number;
  lookupMsTotal: number;
  lookupMsMax: number;
}

const emptyStats = (since: number): Stats => ({
  since,
  outcomes: { skipped: 0, taken: 0, 'false-positive': 0, 'not-ready': 0, fresh: 0 },
  lookups: 0,
  lookupMsTotal: 0,
  lookupMsMax: 0,
});

export interface UsernameFilterOptions {
  client: () => SupabaseClient | null;
  /** False switches the filter off: every check goes to the database. */
  enabled: () => boolean;
  now?: () => number;
  log?: Pick<typeof logger, 'info' | 'warn'>;
}

const key = (name: string) => name.toLowerCase();

type Row = { id?: unknown; username?: unknown; created_at?: unknown };

export function createUsernameFilter(options: UsernameFilterOptions) {
  const now = options.now ?? Date.now;
  const log = options.log ?? logger;

  let filter: BloomFilter | null = null;
  let builtAt = 0;
  let refreshedAt = 0;
  /** Newest created_at seen, in ms, by the DATABASE's clock. Null for an empty table. */
  let highWater: number | null = null;
  let busy = false;
  /** Claims made while a build is paging; applied to the new filter at the swap. */
  let pendingAdds: string[] | null = null;
  let failures = 0;
  let retryAt = 0;
  let stats = emptyStats(now());
  let timers: NodeJS.Timeout[] = [];

  async function build(admin: SupabaseClient): Promise<void> {
    const { count, error: countError } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if (countError) throw new Error(`count failed: ${countError.message}`);

    // The high-water mark is read BEFORE paging. A row inserted while the pages
    // are read has a created_at at or after it, so the first poll finds any row
    // the pages missed.
    const { data: newest, error: newestError } = await admin
      .from('profiles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    if (newestError) throw new Error(`high-water read failed: ${newestError.message}`);
    const mark = timestamp((newest as Row[] | null)?.[0]?.created_at);

    const next = new BloomFilter(
      Math.max(FILTER_MIN_CAPACITY, 2 * (count ?? 0)),
      FILTER_FALSE_POSITIVE_RATE,
    );
    pendingAdds = [];
    try {
      // Keyset paging by id, not offsets: a deletion mid-build would shift an
      // offset and skip a row, and a skipped row is a false "free".
      let after: string | null = null;
      for (;;) {
        let page = admin.from('profiles').select('id, username').order('id').limit(FILTER_PAGE_SIZE);
        if (after !== null) page = page.gt('id', after);
        const { data, error } = await page;
        if (error) throw new Error(`page read failed: ${error.message}`);
        const rows = (data ?? []) as Row[];
        for (const row of rows) {
          if (typeof row.username === 'string') next.add(key(row.username));
        }
        if (rows.length < FILTER_PAGE_SIZE) break;
        after = String(rows[rows.length - 1].id);
      }
      for (const name of pendingAdds) next.add(key(name));
    } finally {
      pendingAdds = null;
    }

    filter = next;
    highWater = mark;
    builtAt = refreshedAt = now();
    log.info(
      `Username filter built: ${next.size} names, capacity ${next.capacity}, ` +
        `${Math.round(next.byteLength / 1024)} KiB`,
    );
  }

  async function poll(admin: SupabaseClient, current: BloomFilter): Promise<void> {
    const since = highWater === null ? null : new Date(highWater - FILTER_POLL_OVERLAP_MS).toISOString();
    let newest = highWater;
    for (let offset = 0; ; offset += FILTER_PAGE_SIZE) {
      let page = admin
        .from('profiles')
        .select('username, created_at')
        .order('created_at')
        .order('id')
        .range(offset, offset + FILTER_PAGE_SIZE - 1);
      if (since !== null) page = page.gte('created_at', since);
      const { data, error } = await page;
      if (error) throw new Error(`poll failed: ${error.message}`);
      const rows = (data ?? []) as Row[];
      for (const row of rows) {
        if (typeof row.username === 'string') current.add(key(row.username));
        const at = timestamp(row.created_at);
        if (at !== null && (newest === null || at > newest)) newest = at;
      }
      if (rows.length < FILTER_PAGE_SIZE) break;
    }
    highWater = newest;
    refreshedAt = now();
  }

  /** One unit of upkeep: build if one is due, otherwise poll. Never two at once. */
  async function tick(): Promise<void> {
    if (busy || now() < retryAt) return;
    const admin = options.client();
    if (!admin) return;
    busy = true;
    try {
      const current = filter;
      if (!current || now() - builtAt >= FILTER_REBUILD_MS || current.size > current.capacity) {
        await build(admin);
      } else {
        await poll(admin, current);
      }
      if (failures > 0) log.info(`Username filter recovered after ${failures} failed refresh(es)`);
      failures = 0;
      retryAt = 0;
    } catch (err) {
      failures++;
      const wait = Math.min(FILTER_POLL_MS * 2 ** (failures - 1), FILTER_MAX_BACKOFF_MS);
      retryAt = now() + wait;
      // Once, then quiet: a database outage would otherwise log every 30 s.
      if (failures === 1) {
        log.warn(
          `Username filter refresh failed (checks fall back to the database): ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      busy = false;
    }
  }

  function logStats(): void {
    const { since, outcomes, lookups, lookupMsTotal, lookupMsMax } = stats;
    stats = emptyStats(now());
    const checks = Object.values(outcomes).reduce((sum, n) => sum + n, 0);
    if (checks === 0) return;
    const minutes = Math.max(1, Math.round((now() - since) / 60_000));
    const free = outcomes.skipped + outcomes['false-positive'];
    const fpRate = free > 0 ? ((100 * outcomes['false-positive']) / free).toFixed(1) : '0.0';
    log.info(
      `Username filter, last ${minutes} min: ${checks} checks, ${outcomes.skipped} answered without the database, ` +
        `${outcomes['false-positive']} false positives (${fpRate}% of free names), ` +
        `${outcomes.taken} taken, ${outcomes['not-ready']} not ready, ${outcomes.fresh} fresh; ` +
        `${lookups} lookups, mean ${lookups ? Math.round(lookupMsTotal / lookups) : 0} ms, ` +
        `max ${Math.round(lookupMsMax)} ms; ${filter?.size ?? 0} names in the filter`,
    );
  }

  return {
    /** Build now, then keep fresh. Does nothing when switched off or without the secret key. */
    start(): void {
      if (timers.length > 0) return;
      if (!options.enabled()) {
        log.info('Username filter is off (USERNAME_FILTER=off): every check goes to the database');
        return;
      }
      if (!options.client()) return;
      void tick();
      timers = [setInterval(() => void tick(), FILTER_POLL_MS), setInterval(logStats, FILTER_STATS_MS)];
      for (const timer of timers) timer.unref();
    },

    /**
     * Also prints what the summary has counted so far. Render's free tier stops
     * the server after fifteen idle minutes, so on a quiet site the hourly
     * timer may never fire and this is the only line the logs get.
     */
    stop(): void {
      for (const timer of timers) clearInterval(timer);
      timers = [];
      logStats();
    },

    /** What the filter says about `name`. Case-insensitive, like the unique index. */
    check(name: string): FilterAnswer {
      if (!filter || now() - refreshedAt > FILTER_STALE_AFTER_MS) return 'not-ready';
      return filter.mightContain(key(name)) ? 'maybe-taken' : 'definitely-free';
    },

    /** A name that just became taken through this API. */
    add(name: string): void {
      filter?.add(key(name));
      pendingAdds?.push(name);
    },

    note(outcome: FilterOutcome, lookupMs?: number): void {
      stats.outcomes[outcome]++;
      if (lookupMs !== undefined) {
        stats.lookups++;
        stats.lookupMsTotal += lookupMs;
        stats.lookupMsMax = Math.max(stats.lookupMsMax, lookupMs);
      }
    },

    // For tests: drive upkeep and the summary without waiting on timers.
    tick,
    logStats,
  };
}

export type UsernameFilter = ReturnType<typeof createUsernameFilter>;

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export const usernameFilter: UsernameFilter = createUsernameFilter({
  client: () => supabaseAdmin,
  enabled: () => process.env.USERNAME_FILTER !== 'off',
});
