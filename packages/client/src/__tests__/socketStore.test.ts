/**
 * Connection-state rules for the multiplayer socket.
 *
 * These exist because of a measured production failure: the API runs on a free
 * Render instance that sleeps after ~15 minutes idle, and a cold start takes
 * ~21s. Render holds the WebSocket upgrade open while the instance boots rather
 * than refusing it, so socket.io's 20s default `timeout` fired a beat before the
 * server was ready — the first connection after every sleep reported
 * "Connection failed / timeout" to the player, then quietly connected on the
 * next attempt.
 *
 * So: a retryable transport failure must NOT be shown as a failure, and a
 * terminal one MUST be.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Handlers registered on the fake socket, by event name. */
type Handler = (...args: unknown[]) => void;

const socketHandlers = new Map<string, Handler>();
const managerHandlers = new Map<string, Handler>();

/**
 * Stand-in for a socket.io client. `active` is the real discriminator: socket.io
 * calls destroy() on a server-side middleware rejection before emitting
 * connect_error (leaving active false), but leaves it true when a retry is
 * already scheduled.
 */
const fakeSocket = {
  connected: false,
  active: true,
  io: { on: (event: string, fn: Handler) => managerHandlers.set(event, fn) },
  on: (event: string, fn: Handler) => socketHandlers.set(event, fn),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: () => fakeSocket,
  Socket: class {},
}));

const { useSocketStore } = await import('../stores/socketStore');

function emitSocket(event: string, ...args: unknown[]) {
  socketHandlers.get(event)?.(...args);
}

describe('socketStore connection state', () => {
  beforeEach(() => {
    socketHandlers.clear();
    managerHandlers.clear();
    fakeSocket.connected = false;
    fakeSocket.active = true;
    useSocketStore.setState({ socket: null, connected: false, connectionError: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not report a failure while a retry is still scheduled', () => {
    useSocketStore.getState().connect('jwt');
    // Exactly what a Render cold start produced at the 20s mark.
    fakeSocket.active = true;
    emitSocket('connect_error', new Error('timeout'));

    expect(useSocketStore.getState().connected).toBe(false);
    // Still null: the UI stays on "Connecting…" rather than "Connection failed".
    expect(useSocketStore.getState().connectionError).toBeNull();
  });

  it('reports a rejection that retrying cannot fix', () => {
    useSocketStore.getState().connect('jwt');
    // A middleware rejection: socket.io has already destroyed the socket.
    fakeSocket.active = false;
    emitSocket('connect_error', new Error('Invalid or expired token'));

    expect(useSocketStore.getState().connectionError).toBe('Invalid or expired token');
  });

  it('reports a failure once every retry is spent', () => {
    useSocketStore.getState().connect('jwt');
    fakeSocket.active = true;
    emitSocket('connect_error', new Error('websocket error'));
    expect(useSocketStore.getState().connectionError).toBeNull();

    managerHandlers.get('reconnect_failed')?.();
    expect(useSocketStore.getState().connectionError).toBe('Could not reach the server');
  });

  it('clears a past error once connected', () => {
    useSocketStore.getState().connect('jwt');
    fakeSocket.active = false;
    emitSocket('connect_error', new Error('Invalid or expired token'));
    expect(useSocketStore.getState().connectionError).not.toBeNull();

    emitSocket('connect');
    expect(useSocketStore.getState().connected).toBe(true);
    expect(useSocketStore.getState().connectionError).toBeNull();
  });

  it('allows a cold start longer than socket.io default 20s timeout', async () => {
    // Guards the actual regression: Render's cold start is ~21s, so anything at
    // or below the 20s default reintroduces the bug.
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'stores', 'socketStore.ts'),
      'utf8',
    );
    const timeout = Number(/timeout:\s*(\d+)/.exec(src)?.[1]);
    expect(timeout).toBeGreaterThan(30000);
  });
});
