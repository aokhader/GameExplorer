import { act, renderHook } from '@testing-library/react-native';
import { useEmotes } from '@/multiplayer/useEmotes';
import { fakeSession } from './helpers/fakeSession';
import type { GameSession } from '@/multiplayer/session';

type Handler = (data: {
  gameId: string;
  userId: string;
  username: string;
  emote: string;
}) => void;

/** A socket stub that only knows the one event this hook listens for. */
function fakeSocket() {
  const handlers = new Set<Handler>();
  return {
    handlers,
    on: jest.fn((event: string, fn: Handler) => {
      if (event === 'emote_received') handlers.add(fn);
    }),
    off: jest.fn((event: string, fn: Handler) => {
      if (event === 'emote_received') handlers.delete(fn);
    }),
    /** Deliver an incoming reaction the way the server would. */
    deliver(data: Parameters<Handler>[0]) {
      handlers.forEach((fn) => fn(data));
    },
  };
}

function setup(overrides: Partial<GameSession> = {}) {
  const socket = fakeSocket();
  const emit = jest.fn();
  const session = fakeSession({
    gameId: 'g1',
    // Only the two fields the hook reads off `user`; the rest of the shape is
    // Supabase's and irrelevant here.
    user: { id: 'me' } as GameSession['user'],
    socket: socket as unknown as GameSession['socket'],
    emit,
    ...overrides,
  });
  const view = renderHook(() => useEmotes(session));
  return { view, socket, emit };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('useEmotes — receiving', () => {
  it('shows a reaction and drops it after three seconds', () => {
    const { view, socket } = setup();

    act(() => socket.deliver({ gameId: 'g1', userId: 'them', username: 'Ada', emote: '👏' }));
    expect(view.result.current.reactions).toHaveLength(1);
    expect(view.result.current.reactions[0]).toMatchObject({ emote: '👏', username: 'Ada' });

    act(() => jest.advanceTimersByTime(3000));
    expect(view.result.current.reactions).toHaveLength(0);
  });

  /**
   * Every socket in a game room hears every emote, including ones for other
   * games the same connection is watching. Filtering on the id is what stops a
   * spectated game's reactions floating over the game being played.
   */
  it('ignores a reaction addressed to a different game', () => {
    const { view, socket } = setup();
    act(() => socket.deliver({ gameId: 'other', userId: 'them', username: 'Ada', emote: '👏' }));
    expect(view.result.current.reactions).toHaveLength(0);
  });

  it('marks the local player’s own reactions, so they can be laid out apart', () => {
    const { view, socket } = setup();
    act(() => socket.deliver({ gameId: 'g1', userId: 'me', username: 'Me', emote: '🎉' }));
    expect(view.result.current.reactions[0].mine).toBe(true);
  });

  it('unsubscribes on unmount rather than leaking a handler per game', () => {
    const { view, socket } = setup();
    expect(socket.handlers.size).toBe(1);
    view.unmount();
    expect(socket.handlers.size).toBe(0);
  });

  /**
   * Web leaves its expiry timers dangling, which is harmless in a tab about to
   * be torn down. On a phone the JS context outlives the screen, so a timer
   * firing after unmount would set state on a dead component.
   */
  it('clears pending expiry timers on unmount', () => {
    const { view, socket } = setup();
    act(() => socket.deliver({ gameId: 'g1', userId: 'them', username: 'Ada', emote: '👏' }));
    view.unmount();
    expect(() => act(() => jest.advanceTimersByTime(5000))).not.toThrow();
  });
});

describe('useEmotes — sending', () => {
  it('emits the reaction for this game', () => {
    const { view, emit } = setup();
    act(() => view.result.current.send('🎉'));
    expect(emit).toHaveBeenCalledWith('send_emote', { gameId: 'g1', emote: '🎉' });
  });

  /**
   * The server rate-limits emotes; without a matching client throttle a player
   * hammering the sheet just gets their own reactions silently dropped.
   */
  it('throttles to one reaction per second', () => {
    const { view, emit } = setup();

    act(() => view.result.current.send('🎉'));
    act(() => view.result.current.send('👏'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(view.result.current.cooling).toBe(true);

    act(() => jest.advanceTimersByTime(1000));
    expect(view.result.current.cooling).toBe(false);
    act(() => view.result.current.send('👏'));
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when there is no game to send it to', () => {
    const { view, emit } = setup({ gameId: null });
    act(() => view.result.current.send('🎉'));
    expect(emit).not.toHaveBeenCalled();
  });
});
