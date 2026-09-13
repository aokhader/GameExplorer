// The native engine reports "enginefail" instead of exit()ing the app when it
// can't initialize (e.g. NNUE load failure on iOS). These tests pin the JS
// contract that turns that marker into a graceful fallback: the engine goes
// permanently unavailable and subscribers are notified, so callers switch to the
// in-house TS engine. Can't be device-verified from here, so it's unit-tested.

describe('chessEngineNative — engine-failure fallback', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  // Fresh module each test (module-level `failed` is sticky), with the native
  // module mocked as linked so availability starts true.
  function load() {
    jest.doMock('react-native-arasan', () => ({ useArasan: () => ({}) }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/engine/chessEngineNative');
  }

  it('reports available while the native module is linked', () => {
    const eng = load();
    expect(eng.isEngineAvailable()).toBe(true);
  });

  it('flips to unavailable and notifies on an enginefail marker', () => {
    const eng = load();
    const listener = jest.fn();
    eng.subscribeEngineFailed(listener);

    eng.handleEngineOutput('enginefail nnue\n');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(eng.isEngineAvailable()).toBe(false);
  });

  it('is idempotent — a second marker neither re-notifies nor throws', () => {
    const eng = load();
    const listener = jest.fn();
    eng.subscribeEngineFailed(listener);

    eng.handleEngineOutput('enginefail nnue');
    eng.handleEngineOutput('enginefail nnue');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(eng.isEngineAvailable()).toBe(false);
  });

  it('still processes a normal readyok in the same batch as the marker', () => {
    // The engine keeps running after the marker (idle), so readyok still arrives.
    // Availability must stay false regardless.
    const eng = load();
    eng.handleEngineOutput('enginefail nnue\nreadyok');

    expect(eng.isEngineReady()).toBe(true);
    expect(eng.isEngineAvailable()).toBe(false);
  });
});

/**
 * Game review asks the engine for a SCORE, not just a move — a second kind of
 * request sharing the one UCI channel. These pin that both kinds terminate on
 * `bestmove` and can't be crossed with each other.
 */
describe('chessEngineNative — evaluation channel', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  /** A started, handshaken engine plus the list of commands it was sent. */
  function loadReady() {
    jest.doMock('react-native-arasan', () => ({ useArasan: () => ({}) }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eng = require('@/engine/chessEngineNative');
    const sent: string[] = [];
    eng.registerEngineControls({
      start: () => {},
      send: (cmd: string) => sent.push(cmd),
      setupNetwork: async () => '/tmp/nnue',
    });
    eng.ensureEngineStarted();
    return { eng, sent };
  }

  /** Drive the handshake to completion (setupNetwork resolves on a microtask). */
  async function handshake(eng: ReturnType<typeof loadReady>['eng']) {
    await Promise.resolve();
    await Promise.resolve();
    eng.handleEngineOutput('uciok');
    eng.handleEngineOutput('readyok');
  }

  const startState = { moveHistory: [] };

  it('resolves with the deepest streamed score', async () => {
    const { eng } = loadReady();
    await handshake(eng);

    const promise = eng.getEngineEvaluation(startState, 200);
    eng.handleEngineOutput('info depth 4 score cp 10 pv e2e4');
    eng.handleEngineOutput('info depth 18 score cp 35 pv d2d4 d7d5');
    eng.handleEngineOutput('bestmove d2d4');

    await expect(promise).resolves.toEqual({
      cp: 35,
      mate: null,
      depth: 18,
      bestMove: { from: 'd2', to: 'd4', promotion: undefined },
    });
  });

  it('keeps the deeper score when a shallower line arrives after it', async () => {
    // Engines re-report shallow lines for other PVs; the deepest must win.
    const { eng } = loadReady();
    await handshake(eng);

    const promise = eng.getEngineEvaluation(startState, 200);
    eng.handleEngineOutput('info depth 20 score cp 80 pv c2c4');
    eng.handleEngineOutput('info depth 3 score cp -400 pv h2h4');
    eng.handleEngineOutput('bestmove c2c4');

    await expect(promise).resolves.toMatchObject({ cp: 80, depth: 20 });
  });

  it('carries a mate score through', async () => {
    const { eng } = loadReady();
    await handshake(eng);

    const promise = eng.getEngineEvaluation(startState, 200);
    eng.handleEngineOutput('info depth 10 score mate 2 pv d1h5 e8e7');
    eng.handleEngineOutput('bestmove d1h5');

    await expect(promise).resolves.toMatchObject({ mate: 2, cp: null });
  });

  it('resolves a finished position, where the engine answers bestmove (none)', async () => {
    // A checkmated position still has a score worth showing; only the move is
    // missing. A move request in the same spot would have nothing to resolve.
    const { eng } = loadReady();
    await handshake(eng);

    const promise = eng.getEngineEvaluation(startState, 200);
    eng.handleEngineOutput('info depth 1 score mate 0');
    eng.handleEngineOutput('bestmove (none)');

    await expect(promise).resolves.toMatchObject({ mate: 0, bestMove: null });
  });

  it('turns strength limiting off, so review judges at full strength', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.getEngineEvaluation(startState, 200).catch(() => {});
    expect(sent).toContain('setoption name UCI_LimitStrength value false');
  });

  it('aborts an in-flight evaluation when a newer request supersedes it', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    const first = eng.getEngineEvaluation(startState, 200);
    const firstSettled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = eng.getEngineEvaluation(startState, 200);
    expect(sent).toContain('stop');

    // The superseded search still answers first, and none of it is the second's.
    eng.handleEngineOutput('info depth 30 score cp 900 pv h2h4');
    eng.handleEngineOutput('bestmove h2h4');
    eng.handleEngineOutput('info depth 6 score cp 5 pv e2e4');
    eng.handleEngineOutput('bestmove e2e4');

    await firstSettled;
    await expect(second).resolves.toMatchObject({
      cp: 5,
      depth: 6,
      bestMove: { from: 'e2', to: 'e4' },
    });
  });

  it('does not feed score lines to a bot-move request', async () => {
    // Bot moves want only the move; an info line must not resolve them early.
    const { eng } = loadReady();
    await handshake(eng);

    const promise = eng.getEngineBestMove(startState, 1500);
    eng.handleEngineOutput('info depth 12 score cp 25 pv g1f3');
    eng.handleEngineOutput('bestmove b1c3');

    await expect(promise).resolves.toEqual({ from: 'b1', to: 'c3', promotion: undefined });
  });
});

/**
 * `position startpos moves …` is only correct for a state descended from the
 * opening. A puzzle or analysis position seeded from a FEN has an empty move
 * history, so the startpos form would have the engine evaluate the START
 * position instead of the one on the board — these pin the FEN path.
 */
describe('chessEngineNative — seeded positions', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  function loadReady() {
    jest.doMock('react-native-arasan', () => ({ useArasan: () => ({}) }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eng = require('@/engine/chessEngineNative');
    const sent: string[] = [];
    eng.registerEngineControls({
      start: () => {},
      send: (cmd: string) => sent.push(cmd),
      setupNetwork: async () => '/tmp/nnue',
    });
    eng.ensureEngineStarted();
    return { eng, sent };
  }

  async function handshake(eng: ReturnType<typeof loadReady>['eng']) {
    await Promise.resolve();
    await Promise.resolve();
    eng.handleEngineOutput('uciok');
    eng.handleEngineOutput('readyok');
  }

  const FEN = '4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1';
  const positionOf = (sent: string[]) => sent.find((c) => c.startsWith('position'));

  it('sends startpos when no seed FEN is given', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.getEngineEvaluation({ moveHistory: [] }, 200);

    expect(positionOf(sent)).toBe('position startpos');
  });

  it('sends the FEN when the state was seeded from one', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.getEngineEvaluation({ moveHistory: [] }, 200, FEN);

    expect(positionOf(sent)).toBe(`position fen ${FEN}`);
  });

  it('appends moves played since the seeded position', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.getEngineEvaluation(
      { moveHistory: [{ from: 'g8', to: 'h8' }, { from: 'e8', to: 'h8' }] },
      200,
      FEN,
    );

    expect(positionOf(sent)).toBe(`position fen ${FEN} moves g8h8 e8h8`);
  });

  it('takes a seed FEN on the move request too', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.getEngineBestMove({ moveHistory: [] }, 1600, FEN);

    expect(positionOf(sent)).toBe(`position fen ${FEN}`);
  });

  it('leaves the ordinary bot path on startpos', async () => {
    // The shipped bot path must stay byte-identical — it relies on the move
    // history for the engine's repetition detection.
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.getEngineBestMove({ moveHistory: [{ from: 'e2', to: 'e4' }] }, 1600);

    expect(positionOf(sent)).toBe('position startpos moves e2e4');
  });
});

/**
 * Which options and `go` line a bot request sends IS the strength fix, and no
 * device check can see it — the engine simply plays a move either way. These pin
 * that the service obeys the measured ladder in
 * `packages/shared/src/game-logic/chess/strength.ts` rather than deriving
 * strength itself, which is how a "1500" once reached Arasan as `UCI_Elo 1500`
 * and searched two plies.
 */
describe('chessEngineNative — bot strength commands', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  function loadReady() {
    jest.doMock('react-native-arasan', () => ({ useArasan: () => ({}) }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eng = require('@/engine/chessEngineNative');
    const sent: string[] = [];
    eng.registerEngineControls({
      start: () => {},
      send: (cmd: string) => sent.push(cmd),
      setupNetwork: async () => '/tmp/nnue',
    });
    eng.ensureEngineStarted();
    return { eng, sent };
  }

  async function handshake(eng: ReturnType<typeof loadReady>['eng']) {
    await Promise.resolve();
    await Promise.resolve();
    eng.handleEngineOutput('uciok');
    eng.handleEngineOutput('readyok');
  }

  function ladder(elo: number) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@gameexplorer/shared').chessBotConfig(elo);
  }

  const startState = { moveHistory: [] };

  it.each([1500, 2000, 2800])('sends the ladder settings for %i, budgeted by depth', async (elo) => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.getEngineBestMove(startState, elo).catch(() => {});

    const config = ladder(elo);
    expect(sent).toContain('setoption name UCI_LimitStrength value true');
    expect(sent).toContain(`setoption name UCI_Elo value ${config.arasanUciElo}`);
    // Exactly one go line, and it is a depth. `go depth N movetime M` would be a
    // TIMED search: Arasan takes one search type and the last limit wins.
    expect(sent.filter((c) => c.startsWith('go'))).toEqual([`go depth ${config.depth}`]);
    expect(sent.some((c) => c.includes('movetime'))).toBe(false);
  });

  it('refuses a rating below the seam without disturbing a search in flight', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    const review = eng.getEngineEvaluation(startState, 200);
    await expect(eng.getEngineBestMove(startState, 900)).rejects.toThrow(
      /not served by the native engine/,
    );

    // The evaluation is still the live request: it resolves, it was not aborted.
    eng.handleEngineOutput('info depth 8 score cp 12 pv e2e4');
    eng.handleEngineOutput('bestmove e2e4');
    await expect(review).resolves.toMatchObject({ cp: 12 });
    expect(sent.filter((c) => c.startsWith('go depth'))).toEqual([]);
  });

  it('sends stop at the wall-clock ceiling while the search is still running', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);
    jest.useFakeTimers();

    eng.getEngineBestMove(startState, 1500).catch(() => {});
    const { ceilingMs } = ladder(1500);

    jest.advanceTimersByTime(ceilingMs - 1);
    expect(sent).not.toContain('stop');
    jest.advanceTimersByTime(1);
    expect(sent).toContain('stop');
  });

  it('never sends a stray stop once the search has answered', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);
    jest.useFakeTimers();

    const move = eng.getEngineBestMove(startState, 1500);
    eng.handleEngineOutput('bestmove e2e4');
    await expect(move).resolves.toMatchObject({ from: 'e2', to: 'e4' });

    // A late stop would land on whatever search came next and cut it short.
    jest.advanceTimersByTime(ladder(1500).ceilingMs * 3);
    expect(sent).not.toContain('stop');
  });
});

/**
 * A search superseded mid-flight still owes the engine's answer, and Arasan
 * gives it before it reads the next `go`. These pin that the stale answer can
 * never settle the request that replaced it. The case that made it matter: a
 * training hint searches for a full second at full strength, and a player who
 * moves during it hands the bot the next search.
 */
describe('chessEngineNative — superseded searches', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  function loadReady() {
    jest.doMock('react-native-arasan', () => ({ useArasan: () => ({}) }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eng = require('@/engine/chessEngineNative');
    const sent: string[] = [];
    eng.registerEngineControls({
      start: () => {},
      send: (cmd: string) => sent.push(cmd),
      setupNetwork: async () => '/tmp/nnue',
    });
    eng.ensureEngineStarted();
    return { eng, sent };
  }

  async function handshake(eng: ReturnType<typeof loadReady>['eng']) {
    await Promise.resolve();
    await Promise.resolve();
    eng.handleEngineOutput('uciok');
    eng.handleEngineOutput('readyok');
  }

  const startState = { moveHistory: [] };

  it("stops a hint the bot supersedes, and gives the bot its own answer", async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    const hint = eng.getEngineEvaluation(startState, 1000);
    const hintSettled = expect(hint).rejects.toMatchObject({ name: 'AbortError' });
    const bot = eng.getEngineBestMove(startState, 1500);

    const stopAt = sent.indexOf('stop');
    expect(stopAt).toBeGreaterThan(sent.indexOf('go movetime 1000'));
    expect(stopAt).toBeLessThan(sent.findIndex((c) => c.startsWith('go depth')));

    let botSettled = false;
    bot.then(
      () => (botSettled = true),
      () => (botSettled = true),
    );
    eng.handleEngineOutput('bestmove g1f3'); // the hint's answer, for the old position
    await Promise.resolve();
    await Promise.resolve();
    expect(botSettled).toBe(false);

    eng.handleEngineOutput('bestmove e7e5');
    await hintSettled;
    await expect(bot).resolves.toEqual({ from: 'e7', to: 'e5', promotion: undefined });
  });

  it('settles a move request the engine has no move for, so the next search is not starved', async () => {
    const { eng } = loadReady();
    await handshake(eng);

    const none = eng.getEngineBestMove(startState, 1500);
    eng.handleEngineOutput('bestmove (none)');
    await expect(none).rejects.toThrow(/no move/);

    const next = eng.getEngineBestMove(startState, 1500);
    eng.handleEngineOutput('bestmove d2d4');
    await expect(next).resolves.toMatchObject({ from: 'd2', to: 'd4' });
  });

  it('sends no stop when nothing is searching', async () => {
    const { eng, sent } = loadReady();
    await handshake(eng);

    eng.cancelEngineSearch('New game started');

    expect(sent).not.toContain('stop');
  });
});

/**
 * A training hint must come from the engine itself. When the engine is still
 * starting the hint waits for it rather than falling back to anything weaker,
 * and these pin how that wait ends.
 */
describe('chessEngineNative — waiting for readiness', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  function load(linked = true) {
    if (linked) {
      jest.doMock('react-native-arasan', () => ({ useArasan: () => ({}) }), { virtual: true });
    } else {
      jest.doMock(
        'react-native-arasan',
        () => {
          throw new Error('native module not linked');
        },
        { virtual: true },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eng = require('@/engine/chessEngineNative');
    eng.registerEngineControls({
      start: () => {},
      send: () => {},
      setupNetwork: async () => '/tmp/nnue',
    });
    eng.ensureEngineStarted();
    return eng;
  }

  async function handshake(eng: ReturnType<typeof load>) {
    await Promise.resolve();
    await Promise.resolve();
    eng.handleEngineOutput('uciok');
    eng.handleEngineOutput('readyok');
  }

  it('resolves at once when the engine is already ready', async () => {
    const eng = load();
    await handshake(eng);

    await expect(eng.whenEngineReady(1000)).resolves.toBeUndefined();
  });

  it('resolves when the handshake finishes after the request', async () => {
    const eng = load();
    const waiting = eng.whenEngineReady(5000);

    await handshake(eng);

    await expect(waiting).resolves.toBeUndefined();
  });

  it('rejects if the engine fails while it is being waited for', async () => {
    const eng = load();
    const waiting = eng.whenEngineReady(5000);

    eng.handleEngineOutput('enginefail nnue');

    await expect(waiting).rejects.toThrow(/unavailable/);
  });

  it('rejects straight away when the binary has no engine', async () => {
    const eng = load(false);

    await expect(eng.whenEngineReady(5000)).rejects.toThrow(/unavailable/);
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    const eng = load();
    const waiting = eng.whenEngineReady(5000);
    const settled = expect(waiting).rejects.toThrow(/not ready/);

    jest.advanceTimersByTime(5000);

    await settled;
  });
});
