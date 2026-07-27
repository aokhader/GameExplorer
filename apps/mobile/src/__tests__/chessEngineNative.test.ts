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
