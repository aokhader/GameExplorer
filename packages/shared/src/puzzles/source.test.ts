import { describe, expect, it } from 'vitest';
import {
  createFetchPuzzleSource,
  createLayeredPuzzleSource,
  createStaticPuzzleSource,
  staticPuzzleSource,
} from './source';
import { PUZZLES } from '../constants/puzzles';
import type { Puzzle, PuzzleDifficulty, PuzzleGame, PuzzleSource } from './types';

function puzzle(
  id: string,
  game: PuzzleGame,
  difficulty: PuzzleDifficulty,
  rating: number,
): Puzzle {
  return {
    id,
    game,
    position: 'x',
    playerColor: 'white',
    goal: 'best-move',
    prompt: 'p',
    difficulty,
    rating,
    themes: ['fork'],
    steps: [{ move: 'a1a2' }],
    explanation: 'e',
  };
}

const FIXTURE = {
  chess: [
    puzzle('chess-003', 'chess', 'hard', 1800),
    puzzle('chess-001', 'chess', 'easy', 900),
    puzzle('chess-002', 'chess', 'easy', 700),
  ],
  checkers: [puzzle('checkers-001', 'checkers', 'medium', 1200)],
  reversi: [],
} satisfies Record<PuzzleGame, Puzzle[]>;

const source = createStaticPuzzleSource(FIXTURE);

describe('createStaticPuzzleSource', () => {
  it('finds a puzzle by id, and reports a miss as null rather than throwing', async () => {
    expect((await source.getPuzzle('chess-001'))?.id).toBe('chess-001');
    expect(await source.getPuzzle('nope-999')).toBeNull();
  });

  it('counts per game, including an empty set', async () => {
    expect(await source.countPuzzles('chess')).toBe(3);
    expect(await source.countPuzzles('reversi')).toBe(0);
  });

  it('orders by difficulty, then rating, then id', async () => {
    const listed = await source.listPuzzles({ game: 'chess' });
    expect(listed.map((p) => p.id)).toEqual(['chess-002', 'chess-001', 'chess-003']);
  });

  it('filters by game, difficulty and theme', async () => {
    expect((await source.listPuzzles({ game: 'checkers' })).map((p) => p.id)).toEqual([
      'checkers-001',
    ]);
    expect((await source.listPuzzles({ difficulty: 'easy' })).map((p) => p.id)).toEqual([
      'chess-002',
      'chess-001',
    ]);
    expect(await source.listPuzzles({ theme: 'pin' })).toEqual([]);
  });

  it('serves the easiest unsolved puzzle first', async () => {
    expect((await source.nextPuzzle('chess'))?.id).toBe('chess-002');
    expect((await source.nextPuzzle('chess', { solvedIds: ['chess-002'] }))?.id).toBe('chess-001');
  });

  it('returns null once a set is exhausted', async () => {
    const solvedIds = ['chess-001', 'chess-002', 'chess-003'];
    expect(await source.nextPuzzle('chess', { solvedIds })).toBeNull();
    expect(await source.nextPuzzle('reversi')).toBeNull();
  });

  it('pages with `after`, even when the anchor has just been solved', async () => {
    expect((await source.nextPuzzle('chess', { after: 'chess-002' }))?.id).toBe('chess-001');
    // The anchor is excluded by `solvedIds` but still orders the page.
    expect(
      (await source.nextPuzzle('chess', { after: 'chess-002', solvedIds: ['chess-002'] }))?.id,
    ).toBe('chess-001');
    expect(await source.nextPuzzle('chess', { after: 'chess-003' })).toBeNull();
  });

  it('falls back to the first puzzle when the anchor is unknown', async () => {
    expect((await source.nextPuzzle('chess', { after: 'chess-999' }))?.id).toBe('chess-002');
  });

  it('honours a difficulty filter in `nextPuzzle`', async () => {
    expect((await source.nextPuzzle('chess', { difficulty: 'hard' }))?.id).toBe('chess-003');
  });

  it('is stable — the same query twice gives the same order', async () => {
    const a = await source.listPuzzles({ game: 'chess' });
    const b = await source.listPuzzles({ game: 'chess' });
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });
});

describe('staticPuzzleSource', () => {
  it('is backed by the shipped content', async () => {
    expect(await staticPuzzleSource.countPuzzles('chess')).toBeGreaterThan(0);
    const first = await staticPuzzleSource.nextPuzzle('chess');
    expect(first?.game).toBe('chess');
  });
});

describe('band filtering', () => {
  // Chess band edges are 750 / 1050 / 1350 / 1750 / 2400.
  const banded = createStaticPuzzleSource({
    chess: [
      puzzle('chess-901', 'chess', 'easy', 600), // beginner
      puzzle('chess-902', 'chess', 'easy', 900), // novice
      puzzle('chess-903', 'chess', 'medium', 1100), // club
      puzzle('chess-904', 'chess', 'medium', 1200), // club
      puzzle('chess-905', 'chess', 'hard', 2500), // master
    ],
    checkers: [],
    reversi: [],
    go: [],
  });

  it('lists only the band asked for', async () => {
    const club = await banded.listPuzzles({ game: 'chess', band: 'club' });
    expect(club.map((p) => p.id)).toEqual(['chess-903', 'chess-904']);
  });

  it('serves the next puzzle from the band', async () => {
    const next = await banded.nextPuzzle('chess', { band: 'beginner' });
    expect(next?.id).toBe('chess-901');
  });

  it('returns null rather than falling out of the band when it is exhausted', async () => {
    // The alternative — quietly serving an easier puzzle — would break the one
    // promise the band makes.
    const next = await banded.nextPuzzle('chess', {
      band: 'beginner',
      solvedIds: ['chess-901'],
    });
    expect(next).toBeNull();
  });

  it('pages with `after` inside a band', async () => {
    const next = await banded.nextPuzzle('chess', { band: 'club', after: 'chess-903' });
    expect(next?.id).toBe('chess-904');
  });

  it('pages from an anchor that is not itself in the band', async () => {
    // `after` is usually the puzzle just solved, and a player can switch band
    // between puzzles — so the anchor is routinely outside the new band.
    const next = await banded.nextPuzzle('chess', { band: 'master', after: 'chess-901' });
    expect(next?.id).toBe('chess-905');
  });

  it('honours a rating window that is not a whole band', async () => {
    const listed = await banded.listPuzzles({ game: 'chess', minRating: 900, maxRating: 1200 });
    expect(listed.map((p) => p.id)).toEqual(['chess-902', 'chess-903', 'chess-904']);
  });

  it('counts every band, including the empty ones', async () => {
    const counts = await banded.countByBand('chess');
    // An empty band must read 0 rather than be absent — it is the band the
    // player most needs the picker to tell them about.
    expect(counts).toEqual({
      beginner: 1,
      novice: 1,
      club: 2,
      intermediate: 0,
      advanced: 0,
      master: 1,
    });
  });

  it('lists the ids in each band, in progression order', async () => {
    const ids = await banded.idsByBand('chess');
    expect(ids.club).toEqual(['chess-903', 'chess-904']);
    expect(ids.beginner).toEqual(['chess-901']);
  });

  it('keys every band in idsByBand, including the empty ones', async () => {
    // Same contract as `countByBand`: a caller must be able to index any band
    // without a null check, or an empty band becomes a crash instead of a zero.
    const ids = await banded.idsByBand('chess');
    expect(Object.keys(ids).sort()).toEqual(
      ['advanced', 'beginner', 'club', 'intermediate', 'master', 'novice'].sort(),
    );
    expect(ids.intermediate).toEqual([]);
  });

  it('agrees with countByBand', async () => {
    // The picker shows one over the other, so they cannot disagree.
    const [counts, ids] = await Promise.all([
      banded.countByBand('chess'),
      banded.idsByBand('chess'),
    ]);
    for (const [bandId, count] of Object.entries(counts)) {
      expect(ids[bandId], bandId).toHaveLength(count);
    }
  });

  it('counts every band for a game with no puzzles at all', async () => {
    expect(await banded.countByBand('go')).toEqual({
      beginner: 0,
      casual: 0,
      club: 0,
      strong: 0,
      expert: 0,
      master: 0,
    });
  });
});

describe('every shipped game is actually served', () => {
  /**
   * The bug this exists for has no symptom: the route loads, the board renders,
   * and there is simply nothing to solve. `createStaticPuzzleSource` used to
   * flatten its table with a hand-written spread, so a game added everywhere
   * else would still serve zero puzzles. Asserting per game rather than in
   * total is what makes the next one fail loudly.
   */
  it.each(Object.keys(PUZZLES) as PuzzleGame[])('serves %s puzzles', async (game) => {
    expect(PUZZLES[game].length).toBeGreaterThan(0);
    const listed = await staticPuzzleSource.listPuzzles({ game });
    expect(listed.length).toBe(PUZZLES[game].length);
    expect(await staticPuzzleSource.nextPuzzle(game, { solved: [] })).not.toBeNull();
  });
});

describe('createFetchPuzzleSource', () => {
  function puzzleAt(id: string, rating: number): Puzzle {
    return puzzle(id, 'chess', 'medium', rating);
  }

  /**
   * A fetch serving the published layout: one index per game, then pages.
   *
   * `bands` is band id → puzzles; the fake derives the index and slices the
   * pages from it, so a test cannot describe a layout the publisher would not
   * actually emit.
   */
  function fakeFetch(bands: Record<string, Puzzle[]>, pageSize = 2) {
    const calls: string[] = [];
    const index = {
      pageSize,
      bands: Object.fromEntries(
        Object.entries(bands).map(([id, list]) => [
          id,
          { total: list.length, ids: list.map((p) => p.id) },
        ]),
      ),
    };
    const impl = (async (url: string) => {
      calls.push(url);
      const file = url.split('/').pop()!.replace('.json', '');
      const ok = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

      if (file === 'index') return ok(index);
      const match = /^(.+)-(\d+)$/.exec(file);
      if (!match) return { ok: false, status: 404, json: async () => [] } as unknown as Response;
      const list = bands[match[1]] ?? [];
      const n = Number(match[2]);
      return ok(list.slice(n * pageSize, (n + 1) * pageSize));
    }) as unknown as typeof fetch;
    return { impl, calls, index };
  }

  it('serves a puzzle from the page holding it', async () => {
    const { impl } = fakeFetch({ club: [puzzleAt('chess-1000', 1100)] });
    const source = createFetchPuzzleSource('https://example.test/puzzles', impl);
    expect((await source.nextPuzzle('chess', { band: 'club' }))?.id).toBe('chess-1000');
  });

  it('answers band counts and ids from the index alone, fetching no page', async () => {
    // This is the reason the index exists: both are on the screen's load path,
    // and downloading a band to count it would defeat the paging entirely.
    const { impl, calls } = fakeFetch({
      club: [puzzleAt('chess-1000', 1100), puzzleAt('chess-1001', 1200)],
    });
    const source = createFetchPuzzleSource('https://example.test/puzzles', impl);

    expect((await source.countByBand('chess')).club).toBe(2);
    expect((await source.idsByBand('chess')).club).toEqual(['chess-1000', 'chess-1001']);
    expect(calls.filter((u) => /-\d+\.json$/.test(u))).toHaveLength(0);
  });

  it('fetches only the page the wanted puzzle is on', async () => {
    // Five puzzles at two per page; the third is on page 1, so pages 0 and 2
    // must never be requested.
    const club = [1000, 1001, 1002, 1003, 1004].map((n, i) => puzzleAt(`chess-${n}`, 1100 + i));
    const { impl, calls } = fakeFetch({ club });
    const source = createFetchPuzzleSource('https://example.test/puzzles', impl);

    const next = await source.nextPuzzle('chess', {
      band: 'club',
      solvedIds: ['chess-1000', 'chess-1001'],
    });
    expect(next?.id).toBe('chess-1002');
    const pages = calls.filter((u) => /-\d+\.json$/.test(u));
    expect(pages).toEqual(['https://example.test/puzzles/chess/club-1.json']);
  });

  it('asks for the index once, however many times it is read', async () => {
    const { impl, calls } = fakeFetch({ club: [puzzleAt('chess-1000', 1100)] });
    const source = createFetchPuzzleSource('https://example.test/puzzles', impl);
    await source.countByBand('chess');
    await source.idsByBand('chess');
    await source.nextPuzzle('chess', { band: 'club' });
    expect(calls.filter((u) => u.endsWith('index.json'))).toHaveLength(1);
  });

  it('retries a failed fetch rather than caching the failure forever', async () => {
    let failNext = true;
    const inner = fakeFetch({ club: [puzzleAt('chess-1000', 1100)] });
    const impl = (async (url: string) => {
      if (failNext) {
        failNext = false;
        throw new Error('offline');
      }
      return (inner.impl as unknown as (u: string) => Promise<Response>)(url);
    }) as unknown as typeof fetch;

    const source = createFetchPuzzleSource('https://example.test/puzzles', impl);
    await expect(source.nextPuzzle('chess', { band: 'club' })).rejects.toThrow();
    expect((await source.nextPuzzle('chess', { band: 'club' }))?.id).toBe('chess-1000');
  });

  it('tolerates a trailing slash on the base url', async () => {
    const { impl, calls } = fakeFetch({ club: [] });
    const source = createFetchPuzzleSource('https://example.test/puzzles/', impl);
    await source.countByBand('chess');
    expect(calls[0]).toBe('https://example.test/puzzles/chess/index.json');
  });
});

describe('the device cache', () => {
  function puzzleAt(id: string, rating: number): Puzzle {
    return puzzle(id, 'chess', 'medium', rating);
  }

  /** An in-memory stand-in for localStorage / AsyncStorage. */
  function memoryCache() {
    const store = new Map<string, unknown>();
    return {
      store,
      cache: {
        async read(key: string) {
          return store.has(key) ? store.get(key) : null;
        },
        async write(key: string, value: unknown) {
          store.set(key, value);
        },
      },
    };
  }

  function serving(bands: Record<string, Puzzle[]>) {
    const calls: string[] = [];
    const index = {
      pageSize: 2,
      bands: Object.fromEntries(
        Object.entries(bands).map(([id, l]) => [id, { total: l.length, ids: l.map((p) => p.id) }]),
      ),
    };
    const impl = (async (url: string) => {
      calls.push(url);
      const file = url.split('/').pop()!.replace('.json', '');
      const body = file === 'index' ? index : (bands[file.replace(/-\d+$/, '')] ?? []).slice(0, 2);
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it('reads from the cache instead of the network on a second session', async () => {
    const { cache } = memoryCache();
    const first = serving({ club: [puzzleAt('chess-1000', 1100)] });
    const a = createFetchPuzzleSource('https://x.test/p', first.impl, cache);
    await a.nextPuzzle('chess', { band: 'club' });
    expect(first.calls.length).toBeGreaterThan(0);

    // A brand-new source is a new session: no in-flight map, cold start.
    const second = serving({ club: [puzzleAt('chess-1000', 1100)] });
    const b = createFetchPuzzleSource('https://x.test/p', second.impl, cache);
    expect((await b.nextPuzzle('chess', { band: 'club' }))?.id).toBe('chess-1000');
    expect(second.calls, 'went to the network with a warm cache').toEqual([]);
  });

  it('works with no network at all once the cache is warm', async () => {
    const { cache } = memoryCache();
    const online = serving({ club: [puzzleAt('chess-1000', 1100)] });
    const warm = createFetchPuzzleSource('https://x.test/p', online.impl, cache);
    await warm.nextPuzzle('chess', { band: 'club' });

    const offline = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const plane = createFetchPuzzleSource('https://x.test/p', offline, cache);
    expect((await plane.nextPuzzle('chess', { band: 'club' }))?.id).toBe('chess-1000');
  });

  it('caches the index and each page under its own key', async () => {
    const { store, cache } = memoryCache();
    const net = serving({ club: [puzzleAt('chess-1000', 1100)] });
    const source = createFetchPuzzleSource('https://x.test/p', net.impl, cache);
    await source.nextPuzzle('chess', { band: 'club' });
    expect([...store.keys()].sort()).toEqual(['chess/club-0', 'chess/index']);
  });

  it('still serves when the cache throws on every call', async () => {
    // A full disk or a private window must degrade to "fetch it again", never
    // to "no puzzles".
    const broken = {
      async read() {
        throw new Error('no storage');
      },
      async write() {
        throw new Error('no storage');
      },
    };
    const net = serving({ club: [puzzleAt('chess-1000', 1100)] });
    const source = createFetchPuzzleSource('https://x.test/p', net.impl, broken);
    expect((await source.nextPuzzle('chess', { band: 'club' }))?.id).toBe('chess-1000');
  });
});

describe('createLayeredPuzzleSource', () => {
  const core = createStaticPuzzleSource({
    chess: [puzzle('chess-001', 'chess', 'easy', 600)],
    checkers: [],
    reversi: [],
    go: [],
  });

  /** A source that throws for everything — the airplane-mode case. */
  const offline: PuzzleSource = {
    getPuzzle: async () => {
      throw new Error('offline');
    },
    listPuzzles: async () => {
      throw new Error('offline');
    },
    nextPuzzle: async () => {
      throw new Error('offline');
    },
    countPuzzles: async () => {
      throw new Error('offline');
    },
    countByBand: async () => {
      throw new Error('offline');
    },
    idsByBand: async () => {
      throw new Error('offline');
    },
  };

  it('falls back to the bundled core when the network throws', async () => {
    const layered = createLayeredPuzzleSource(offline, core);
    expect((await layered.nextPuzzle('chess', { band: 'beginner' }))?.id).toBe('chess-001');
    expect(await layered.countPuzzles('chess')).toBe(1);
    expect((await layered.getPuzzle('chess-001'))?.id).toBe('chess-001');
  });

  it('falls back when the network answers but answers with nothing', async () => {
    // A chunk that is served but blank would otherwise strand a band the
    // bundled core could have filled — an empty answer is a miss, not truth.
    const blank = createStaticPuzzleSource({ chess: [], checkers: [], reversi: [], go: [] });
    const layered = createLayeredPuzzleSource(blank, core);
    expect((await layered.nextPuzzle('chess', { band: 'beginner' }))?.id).toBe('chess-001');
    expect((await layered.idsByBand('chess')).beginner).toEqual(['chess-001']);
  });

  it('prefers the primary when it has content', async () => {
    const bigger = createStaticPuzzleSource({
      chess: [puzzle('chess-1000', 'chess', 'easy', 600), puzzle('chess-1001', 'chess', 'easy', 610)],
      checkers: [],
      reversi: [],
      go: [],
    });
    const layered = createLayeredPuzzleSource(bigger, core);
    expect(await layered.countPuzzles('chess')).toBe(2);
  });

  it('falls back per call, not per session', async () => {
    // One failing chunk must not condemn the whole source to the core set.
    let calls = 0;
    const flaky: PuzzleSource = {
      ...core,
      countPuzzles: async (game) => {
        calls++;
        if (calls === 1) throw new Error('offline');
        return 99;
      },
    };
    const layered = createLayeredPuzzleSource(flaky, core);
    expect(await layered.countPuzzles('chess')).toBe(1); // fell back
    expect(await layered.countPuzzles('chess')).toBe(99); // primary recovered
  });
});

describe('the layered source bounds how long it waits', () => {
  const core = createStaticPuzzleSource({
    chess: [puzzle('chess-001', 'chess', 'easy', 600)],
    checkers: [],
    reversi: [],
    go: [],
  });

  /** A source whose every method never settles — a hung request, not a failed one. */
  const hangs = new Proxy({} as PuzzleSource, {
    get: () => () => new Promise(() => {}),
  });

  it('serves the bundled set rather than hanging forever', async () => {
    // The case this exists for: a rejection was always handled, silence was not,
    // and silence leaves the screen on its skeleton with no way out.
    const layered = createLayeredPuzzleSource(hangs, core, 20);
    expect((await layered.nextPuzzle('chess', { band: 'beginner' }))?.id).toBe('chess-001');
    expect(await layered.countPuzzles('chess')).toBe(1);
    expect((await layered.idsByBand('chess')).beginner).toEqual(['chess-001']);
  });

  it('does not fall back when the primary answers inside the bound', async () => {
    const slowButFine: PuzzleSource = {
      ...core,
      countPuzzles: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return 42;
      },
    };
    const layered = createLayeredPuzzleSource(slowButFine, core, 200);
    expect(await layered.countPuzzles('chess')).toBe(42);
  });
});
