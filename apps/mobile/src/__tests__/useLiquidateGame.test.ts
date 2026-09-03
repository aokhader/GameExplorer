import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LiquidateEngine, type LiquidateGameState } from '@finesse/shared';
import { useLiquidateGame } from '@/liquidate/useLiquidateGame';
import { SettingsProvider } from '@/providers/SettingsProvider';
import { createElement, type ReactNode } from 'react';

/**
 * The hook reads `reducedMotion` through the walk clock, so it needs the
 * settings provider — and that provider hydrates from AsyncStorage, so every
 * render awaits the first paint to keep the state update inside `act`.
 */
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(SettingsProvider, null, children);

const SLOT = 'gx:liquidate:bot';

function seats() {
  return [{ name: 'Captain' }, { name: 'Vega', isBot: true }, { name: 'Orin', isBot: true }];
}

async function mount(botLevel?: 'cautious' | 'steady' | 'shrewd' | 'ruthless') {
  const view = renderHook(
    () => useLiquidateGame({ storageKey: 'bot', ...(botLevel ? { botLevel } : {}) }),
    { wrapper },
  );
  await waitFor(() => expect(view.result.current.hydrated).toBe(true));
  return view;
}

/**
 * Play the human's seat until a bot is on the clock.
 *
 * Takes the first legal action each time rather than a chosen one: the acting
 * seat is not always the current seat here (an auction rotates bidders), so
 * hunting for a specific action can strand the human mid-auction with nothing
 * it recognises to play.
 */
async function handOverToABot(result: { current: ReturnType<typeof useLiquidateGame> }) {
  for (let i = 0; i < 40; i++) {
    // Let any walk finish, or the bot loop stays gated on `moving`. Needs more
    // than waitFor's 1s default: a walk is an ~890ms lead plus 150ms per tile.
    await waitFor(() => expect(result.current.boardMoving).toBe(false), { timeout: 8000 });
    if (result.current.actingPlayer?.isBot) return;

    const legal = LiquidateEngine.getLegalActions(result.current.state!);
    if (legal.length === 0) return;
    act(() => result.current.dispatch(legal[legal.length - 1]!));
  }
}

/** A snapshot the validator should accept. */
function goodSave(): { state: LiquidateGameState; savedAt: number } {
  return {
    state: LiquidateEngine.newGame({ players: seats(), mode: 'quick', seed: 4 }),
    savedAt: Date.now(),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.useRealTimers();
});

describe('useLiquidateGame — hydrate', () => {
  it('reports hydrated with no save present', async () => {
    const { result } = await mount();
    expect(result.current.savedGame).toBeNull();
    expect(result.current.state).toBeNull();
  });

  it('offers a valid snapshot to resume', async () => {
    await AsyncStorage.setItem(SLOT, JSON.stringify(goodSave()));
    const { result } = await mount();
    expect(result.current.savedGame).not.toBeNull();

    act(() => result.current.resume());
    expect(result.current.state?.players).toHaveLength(3);
  });

  it.each([
    ['malformed JSON', '{ not json'],
    ['no players', JSON.stringify({ state: { config: {}, decks: {}, rng: {} }, savedAt: 1 })],
  ])('discards a save with %s rather than resuming into it', async (_label, raw) => {
    await AsyncStorage.setItem(SLOT, raw);
    const { result } = await mount();
    expect(result.current.savedGame).toBeNull();
  });

  it('discards a snapshot missing a field the engine relies on', async () => {
    const save = goodSave();
    // A save written before `decks` existed would desync the card draw.
    delete (save.state as Partial<LiquidateGameState>).decks;
    await AsyncStorage.setItem(SLOT, JSON.stringify(save));

    const { result } = await mount();
    expect(result.current.savedGame).toBeNull();
  });

  it('discards a snapshot whose trade counter is the wrong type', async () => {
    const save = goodSave();
    (save.state as unknown as { tradesProposedThisTurn: string }).tradesProposedThisTurn = '0';
    await AsyncStorage.setItem(SLOT, JSON.stringify(save));

    const { result } = await mount();
    expect(result.current.savedGame).toBeNull();
  });
});

describe('useLiquidateGame — persist', () => {
  it('writes a slot once a game starts', async () => {
    const { result } = await mount();
    act(() => result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));

    await waitFor(async () => expect(await AsyncStorage.getItem(SLOT)).not.toBeNull());
  });

  it('caps the stored log so a long match cannot outgrow the store', async () => {
    const { result } = await mount();
    act(() => result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));
    await waitFor(async () => expect(await AsyncStorage.getItem(SLOT)).not.toBeNull());

    // Push the log well past the cap and let the persist effect run.
    act(() => {
      const state = result.current.state!;
      const padded = {
        ...state,
        log: Array.from({ length: 400 }, (_, i) => ({
          round: 1,
          playerId: null,
          message: `line ${i}`,
        })),
      };
      // Resume is the only public way to swap the whole state in.
      AsyncStorage.setItem(SLOT, JSON.stringify({ state: padded, savedAt: 1 }));
    });

    const view = await mount();
    act(() => view.result.current.resume());
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(SLOT);
      const parsed = JSON.parse(raw!) as { state: LiquidateGameState };
      expect(parsed.state.log.length).toBeLessThanOrEqual(200);
    });
  });

  it('clears the slot once the game is decided', async () => {
    const { result } = await mount();
    act(() => result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));
    await waitFor(async () => expect(await AsyncStorage.getItem(SLOT)).not.toBeNull());

    act(() => {
      result.current.quit();
    });
    await waitFor(async () => expect(await AsyncStorage.getItem(SLOT)).toBeNull());
  });
});

describe('useLiquidateGame — dispatch', () => {
  it('keeps the state and reports why an illegal action was refused', async () => {
    const { result } = await mount();
    act(() => result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));

    const before = result.current.state;
    act(() => result.current.dispatch({ type: 'buy' }));

    expect(result.current.state).toBe(before);
    expect(result.current.lastError).toBeTruthy();
  });

  it('clears the error once a legal action lands', async () => {
    const { result } = await mount();
    act(() => result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));

    act(() => result.current.dispatch({ type: 'buy' }));
    expect(result.current.lastError).toBeTruthy();

    act(() => result.current.dispatch({ type: 'roll' }));
    expect(result.current.lastError).toBeNull();
  });
});

describe('useLiquidateGame — bot loop', () => {
  it('names the acting seat, which is not always the current one', async () => {
    const { result } = await mount();
    act(() => result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));

    expect(result.current.actingPlayer?.name).toBe('Captain');
    expect(result.current.actingPlayer?.isBot).toBeFalsy();
  });

  it('plays the bots without being driven', async () => {
    const { result } = await mount();
    act(() => result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));

    await handOverToABot(result);
    const before = result.current.state!.log.length;

    // Nothing else touches the hook from here — the loop is on its own.
    await waitFor(
      () => expect(result.current.state!.log.length).toBeGreaterThan(before),
      { timeout: 15000 },
    );
  }, 25000);

  /**
   * The invariant that makes the shell's in-component navigation safe: a
   * re-render with unchanged options must not re-register the bot effect, or
   * every view switch would cancel the pending action and stall the game.
   */
  it('keeps a pending bot action across an unrelated re-render', async () => {
    const view = await mount();
    act(() => view.result.current.newGame({ players: seats(), mode: 'quick', seed: 9 }));

    await handOverToABot(view.result);
    const before = view.result.current.state!.log.length;

    // Re-render mid-flight, exactly as switching sub-views would.
    act(() => {
      view.rerender(undefined as never);
      view.rerender(undefined as never);
    });

    await waitFor(
      () => expect(view.result.current.state!.log.length).toBeGreaterThan(before),
      { timeout: 15000 },
    );
  }, 25000);
});
