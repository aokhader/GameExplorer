/**
 * Where puzzles come from.
 *
 * **Every method returns a Promise, even in the static implementation.** A
 * sync-now/async-later source would force a change in every call site, the
 * hook, and both screens the day a database arrives; one `await` today buys
 * that swap for free. A `createSupabasePuzzleSource()` satisfying this same
 * interface is the whole of the eventual migration.
 */

import { PUZZLES } from '../constants/puzzles';
import { PUZZLE_BANDS, bandFor } from './bands';
import type { Puzzle, PuzzleDifficulty, PuzzleGame } from './types';

export interface PuzzleQuery {
  game?: PuzzleGame;
  /**
   * Three-value authoring tier. Kept alongside `band` rather than replaced by
   * it: `byProgression` sorts by this first, and the shipped content and
   * `source.test.ts` both depend on that ordering. `difficulty` says how a
   * puzzle was written; `band` says how hard it measured.
   */
  difficulty?: PuzzleDifficulty;
  /** Matches a puzzle carrying this theme tag. */
  theme?: string;
  /** Band id from `PUZZLE_BANDS` — the rating range a player picks. */
  band?: string;
  /** Rating window, when a caller wants one that is not a whole band. */
  minRating?: number;
  maxRating?: number;
}

export interface NextPuzzleOptions {
  /** Ids to skip — usually everything the player has already solved. */
  solvedIds?: readonly string[];
  difficulty?: PuzzleDifficulty;
  /** Serve only from this band. */
  band?: string;
  /** Take the first puzzle ordered strictly after this id, for "next". */
  after?: string;
}

export interface PuzzleSource {
  getPuzzle(id: string): Promise<Puzzle | null>;
  listPuzzles(query?: PuzzleQuery): Promise<Puzzle[]>;
  nextPuzzle(game: PuzzleGame, opts?: NextPuzzleOptions): Promise<Puzzle | null>;
  countPuzzles(game: PuzzleGame): Promise<number>;
  /**
   * How many puzzles this source holds in each band, keyed by band id.
   *
   * The picker shows a count per band, and asking for it through `listPuzzles`
   * would mean fetching every puzzle in every band to call `.length` on the
   * results — free over an in-memory table and absurd over a fetched corpus.
   */
  countByBand(game: PuzzleGame): Promise<Record<string, number>>;
  /**
   * The ids in each band, keyed by band id.
   *
   * Progress stores ids and no ratings, so it cannot tell on its own which band
   * a solve belongs to — this is what lets a caller scope "solved" to the set
   * the player is actually working through, and what "start over" clears.
   *
   * Ids rather than puzzles because that is all either job needs, and a band
   * chunk of full puzzles is a great deal of data to move to count a set
   * intersection.
   */
  idsByBand(game: PuzzleGame): Promise<Record<string, string[]>>;
}

const DIFFICULTY_RANK: Record<PuzzleDifficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

/**
 * Easiest first, then by rating, then by id.
 *
 * Total and deterministic — the id tiebreak means two puzzles of equal
 * difficulty and rating can never swap places between calls, which is what lets
 * `after` page through the set without repeating or skipping.
 */
export function byProgression(a: Puzzle, b: Puzzle): number {
  const rank = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
  if (rank !== 0) return rank;
  if (a.rating !== b.rating) return a.rating - b.rating;
  return a.id.localeCompare(b.id);
}

/**
 * A source over an in-memory table.
 *
 * The injectable `data` is what the runtime tests build fixtures from, so they
 * stay green while the shipped content churns.
 */
export function createStaticPuzzleSource(
  data: Record<PuzzleGame, Puzzle[]> = PUZZLES,
): PuzzleSource {
  // `Object.values`, not a hand-written spread: a spread silently serves no
  // puzzles for a game nobody remembered to add, which is a failure with no
  // symptom anywhere — the route loads, the board renders, and there is simply
  // nothing to solve. Adding a game to `PuzzleGame` is now enough.
  const all = (): Puzzle[] => Object.values(data).flat();

  return {
    async getPuzzle(id) {
      return all().find((p) => p.id === id) ?? null;
    },

    async listPuzzles(query = {}) {
      return all()
        .filter((p) => (query.game ? p.game === query.game : true))
        .filter((p) => (query.difficulty ? p.difficulty === query.difficulty : true))
        .filter((p) => (query.theme ? p.themes.includes(query.theme) : true))
        .filter((p) => (query.band ? bandFor(p.game, p.rating).id === query.band : true))
        .filter((p) => (query.minRating === undefined ? true : p.rating >= query.minRating))
        .filter((p) => (query.maxRating === undefined ? true : p.rating <= query.maxRating))
        .sort(byProgression);
    },

    async nextPuzzle(game, opts = {}) {
      const solved = new Set(opts.solvedIds ?? []);
      const ordered = (data[game] ?? [])
        .filter((p) => !solved.has(p.id))
        .filter((p) => (opts.difficulty ? p.difficulty === opts.difficulty : true))
        .filter((p) => (opts.band ? bandFor(game, p.rating).id === opts.band : true))
        .sort(byProgression);

      if (opts.after === undefined) return ordered[0] ?? null;

      // `after` may itself have been filtered out (just solved, most likely), so
      // page by ordering rather than by index.
      const anchor = (data[game] ?? []).find((p) => p.id === opts.after);
      if (!anchor) return ordered[0] ?? null;
      return ordered.find((p) => byProgression(p, anchor) > 0) ?? null;
    },

    async countPuzzles(game) {
      return (data[game] ?? []).length;
    },

    async countByBand(game) {
      // Seeded with every band at zero rather than built up from what is
      // present, so an empty band reads as `0` instead of vanishing from the
      // picker — which is exactly the band a player most needs to be told about.
      const counts: Record<string, number> = {};
      for (const band of PUZZLE_BANDS[game]) counts[band.id] = 0;
      for (const puzzle of data[game] ?? []) counts[bandFor(game, puzzle.rating).id]++;
      return counts;
    },

    async idsByBand(game) {
      // Same seeding rule as `countByBand`, for the same reason: every band is
      // a key, so a caller can index it without a null check.
      const ids: Record<string, string[]> = {};
      for (const band of PUZZLE_BANDS[game]) ids[band.id] = [];
      // Progression order, so a caller can rely on it the way `nextPuzzle` does.
      for (const puzzle of [...(data[game] ?? [])].sort(byProgression)) {
        ids[bandFor(game, puzzle.rating).id].push(puzzle.id);
      }
      return ids;
    },
  };
}

/** The shipped content, as a source. */
export const staticPuzzleSource: PuzzleSource = createStaticPuzzleSource();

/**
 * A source over band-chunked JSON served from a URL.
 *
 * **Why the corpus is not simply bundled.** `packages/shared/package.json` sets
 * `"react-native": "./src/index.ts"`, so Metro parses this package's TypeScript
 * source on every cold boot, and `constants/puzzles/` is reachable from the
 * barrel. A few thousand puzzles as a TS literal is around a megabyte of source
 * Hermes must parse before the first frame — a boot-time regression on exactly
 * the devices that matter. A `.json` import is no better, because Metro turns
 * JSON into a JS object literal module.
 *
 * So the bundle carries a fixed core per band (enough that every band works
 * with no network) and the rest is fetched a band at a time. Chunks are
 * immutable and cached the way `/stockfish/*` already is.
 *
 * Deliberately **not** Supabase for v1, despite this module's own note about
 * `createSupabasePuzzleSource()`: both `PuzzleScreen`s deep-import `usePuzzle`
 * specifically to keep `@gameexplorer/db` off the puzzle chunk, and a Supabase
 * source would put it straight back. Static chunks need no table, no migration
 * and no RLS policy. The swap stays free — which is why every method here is
 * async in the first place.
 */
/**
 * Where a fetched band chunk is kept so it survives the session.
 *
 * Injected rather than reached for, exactly as `PuzzleProgressStore` is: this
 * package must not touch DOM globals (the import-boundary test in
 * `packages/client` forbids it downstream), and the two platforms store
 * differently — `localStorage` on web, the filesystem on native, where a
 * hundred-kilobyte chunk has no business in AsyncStorage's SQLite backing.
 *
 * Every method may fail and the source carries on: a cache is an optimisation,
 * and a full disk must degrade to "fetch it again", never to "no puzzles".
 */
export interface PuzzleChunkCache {
  /**
   * The cached value, or null on a miss or any failure.
   *
   * Untyped because two different shapes go through here — the per-game index
   * and a page of puzzles — and the cache has no business knowing which.
   */
  read(key: string): Promise<unknown | null>;
  write(key: string, value: unknown): Promise<void>;
}

/** Shape of the published `<game>/index.json`. */
export interface PuzzleIndex {
  pageSize: number;
  bands: Record<string, { total: number; ids: string[] }>;
}

export function createFetchPuzzleSource(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  cache?: PuzzleChunkCache,
): PuzzleSource {
  // One in-flight request per resource, and the result kept for the session.
  // `countByBand`, `idsByBand` and `nextPuzzle` all fire within a frame or two
  // of each other on the same screen; without this that is three fetches of
  // the same index.
  const pending = new Map<string, Promise<unknown>>();
  const base = baseUrl.replace(/\/$/, '');

  /**
   * Fetch, with the device cache in front of the network.
   *
   * Disk first is what makes an offline session work: a page the player has
   * already been served survives a flight, a tunnel and the next cold start.
   * That does far more for offline play than bundling more content would, and
   * it costs a hundred kilobytes rather than a megabyte.
   */
  function load<T>(key: string, url: string): Promise<T> {
    let inflight = pending.get(key) as Promise<T> | undefined;
    if (inflight) return inflight;

    inflight = (async () => {
      const cached = cache ? await cache.read(key).catch(() => null) : null;
      if (cached !== null) return cached as T;

      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`puzzle fetch ${key}: HTTP ${res.status}`);
      const body = (await res.json()) as T;
      // Fire and forget: a cache write that fails (quota, full disk) must not
      // fail a read that already succeeded.
      if (cache) void cache.write(key, body).catch(() => {});
      return body;
    })().catch((err) => {
      // Drop the rejection so a later attempt retries rather than caching the
      // failure for the life of the session.
      pending.delete(key);
      throw err;
    }) as Promise<T>;

    pending.set(key, inflight as Promise<unknown>);
    return inflight;
  }

  const index = (game: PuzzleGame) =>
    load<PuzzleIndex>(`${game}/index`, `${base}/${game}/index.json`);

  const page = (game: PuzzleGame, band: string, n: number) =>
    load<Puzzle[]>(`${game}/${band}-${n}`, `${base}/${game}/${band}-${n}.json`);

  /** Every page of a band. Used off the hot path only — see `listPuzzles`. */
  async function wholeBand(game: PuzzleGame, band: string): Promise<Puzzle[]> {
    const idx = await index(game);
    const entry = idx.bands[band];
    if (!entry || entry.total === 0) return [];
    const pages = Math.ceil(entry.total / idx.pageSize);
    const all = await Promise.all(
      Array.from({ length: pages }, (_, n) => page(game, band, n)),
    );
    return all.flat();
  }

  async function wholeGame(game: PuzzleGame): Promise<Puzzle[]> {
    const idx = await index(game);
    const lists = await Promise.all(Object.keys(idx.bands).map((b) => wholeBand(game, b)));
    return lists.flat();
  }

  /** Locate an id through the index, then fetch only the page holding it. */
  async function puzzleById(game: PuzzleGame, id: string): Promise<Puzzle | null> {
    const idx = await index(game);
    for (const [band, entry] of Object.entries(idx.bands)) {
      const at = entry.ids.indexOf(id);
      if (at === -1) continue;
      const got = await page(game, band, Math.floor(at / idx.pageSize));
      return got.find((p) => p.id === id) ?? null;
    }
    return null;
  }

  return {
    async getPuzzle(id) {
      const game = id.split('-')[0] as PuzzleGame;
      if (!PUZZLE_BANDS[game]) return null;
      return puzzleById(game, id);
    },

    async listPuzzles(query = {}) {
      const games = query.game ? [query.game] : (Object.keys(PUZZLE_BANDS) as PuzzleGame[]);
      const lists = await Promise.all(
        games.map((g) => (query.band ? wholeBand(g, query.band) : wholeGame(g))),
      );
      return lists
        .flat()
        .filter((p) => (query.difficulty ? p.difficulty === query.difficulty : true))
        .filter((p) => (query.theme ? p.themes.includes(query.theme) : true))
        .filter((p) => (query.minRating === undefined ? true : p.rating >= query.minRating))
        .filter((p) => (query.maxRating === undefined ? true : p.rating <= query.maxRating))
        .sort(byProgression);
    },

    /**
     * The next unsolved puzzle, fetching **one page**.
     *
     * The index already lists every id in progression order, so which puzzle is
     * next is answerable without downloading a single position — and then only
     * the page holding it is fetched. This is the whole reason for the index:
     * on the screen's load path it turns "download the band" into "download
     * 200 puzzles", and on a second visit into "read one cached file".
     */
    async nextPuzzle(game, opts = {}) {
      const idx = await index(game);
      const solved = new Set(opts.solvedIds ?? []);
      const bands = opts.band ? [opts.band] : Object.keys(idx.bands);

      for (const band of bands) {
        const entry = idx.bands[band];
        if (!entry) continue;

        let ids = entry.ids.filter((id) => !solved.has(id));
        if (opts.after !== undefined) {
          const at = entry.ids.indexOf(opts.after);
          // An anchor outside this band pages from the start of it, matching
          // the static source: switching band mid-set must not skip content.
          if (at !== -1) ids = ids.filter((id) => entry.ids.indexOf(id) > at);
        }
        if (ids.length === 0) continue;

        const wanted = ids[0];
        const got = await page(game, band, Math.floor(entry.ids.indexOf(wanted) / idx.pageSize));
        const found = got.find((p) => p.id === wanted);
        // `difficulty` is a property of the puzzle, so it can only be applied
        // once the page is in hand; falling through keeps the filter honest.
        if (found && (!opts.difficulty || found.difficulty === opts.difficulty)) return found;
      }
      return null;
    },

    async countPuzzles(game) {
      const idx = await index(game);
      return Object.values(idx.bands).reduce((n, b) => n + b.total, 0);
    },

    async countByBand(game) {
      const idx = await index(game);
      const counts: Record<string, number> = {};
      for (const band of PUZZLE_BANDS[game]) counts[band.id] = idx.bands[band.id]?.total ?? 0;
      return counts;
    },

    async idsByBand(game) {
      const idx = await index(game);
      const ids: Record<string, string[]> = {};
      for (const band of PUZZLE_BANDS[game]) ids[band.id] = idx.bands[band.id]?.ids ?? [];
      return ids;
    },
  };
}
/**
 * Serve `primary`, and fall back to `fallback` on any failure.
 *
 * This is what makes the fetched corpus safe to depend on: the bundled core
 * answers whenever the network and the device cache both do not, so airplane
 * mode on a cold cache degrades to a smaller set rather than an empty screen.
 *
 * Every method falls back **independently and per call**, not once per session.
 * A fetched source can fail one page and serve the next, and a tunnel ends.
 *
 * An empty answer counts as a miss, not as truth: a page that is served but
 * blank would otherwise strand a band the bundled core could have filled.
 *
 * Failures are swallowed deliberately. A player in a tunnel does not need to be
 * told which page 404'd — they need a puzzle — and the fallback is authored
 * content that is always present.
 */
export function createLayeredPuzzleSource(
  primary: PuzzleSource,
  fallback: PuzzleSource,
  /**
   * How long to wait on the primary before serving the bundled set instead.
   *
   * A safety net, not a performance target. Without it a request that never
   * settles — a captive portal, a hung proxy, a phone with one bar — leaves the
   * puzzle screen on its skeleton **forever**, because the screen cannot paint
   * until the source answers. A rejection is handled; silence was not.
   *
   * **This was four seconds, and the right value changed when the fallback did.**
   * The old reasoning was that falling back was itself a loss worth waiting to
   * avoid — and it was, while three of the four games had no bundled core at
   * all and "fall back" meant "show nothing". Now every game ships a core
   * covering every band, so the fallback is a complete puzzle set rather than a
   * degraded one, and the calculation inverts: four seconds of skeleton is a
   * large, certain cost to avoid a small, uncertain one.
   *
   * Still a safety net rather than a performance target — a normal fetch of a
   * 140KB index and a ~100KB page finishes far inside this — but now bounded by
   * what a person will wait for rather than by what a network might need. The
   * fetched corpus is not lost either way: the next request tries again, and by
   * then it is in the device cache.
   */
  timeoutMs = 1500,
): PuzzleSource {
  const via = async <T>(run: (s: PuzzleSource) => Promise<T>, empty: (v: T) => boolean) => {
    const LATE = Symbol('late');
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const value = await Promise.race([
        // The rejection is handled by the outer catch; attaching here as well
        // would double-handle it. Racing does not cancel the fetch — it keeps
        // running and still warms the cache, which is the right outcome.
        run(primary),
        new Promise<typeof LATE>((resolve) => {
          timer = setTimeout(() => resolve(LATE), timeoutMs);
        }),
      ]).finally(() => clearTimeout(timer));

      if (value === LATE) return run(fallback);
      return empty(value as T) ? await run(fallback) : (value as T);
    } catch {
      return run(fallback);
    }
  };

  return {
    getPuzzle: (id) => via((s) => s.getPuzzle(id), (v) => v === null),
    listPuzzles: (query) => via((s) => s.listPuzzles(query), (v) => v.length === 0),
    nextPuzzle: (game, opts) => via((s) => s.nextPuzzle(game, opts), (v) => v === null),
    countPuzzles: (game) => via((s) => s.countPuzzles(game), (v) => v === 0),
    countByBand: (game) =>
      via(
        (s) => s.countByBand(game),
        (v) => Object.values(v).every((n) => n === 0),
      ),
    idsByBand: (game) =>
      via(
        (s) => s.idsByBand(game),
        (v) => Object.values(v).every((ids) => ids.length === 0),
      ),
  };
}
