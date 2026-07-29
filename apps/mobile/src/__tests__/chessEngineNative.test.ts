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
    const { eng } = loadReady();
    await handshake(eng);

    const first = eng.getEngineEvaluation(startState, 200);
    const firstSettled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = eng.getEngineEvaluation(startState, 200);
    eng.handleEngineOutput('info depth 6 score cp 5 pv e2e4');
    eng.handleEngineOutput('bestmove e2e4');

    await firstSettled;
    await expect(second).resolves.toMatchObject({ cp: 5 });
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
