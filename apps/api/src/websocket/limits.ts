// Rate limits and connection caps for the socket surface (security audit v2,
// Wave 3: WS5-10, WS5-11, WS5-12).
//
// Kept in memory on purpose. The API is a single instance (render.yaml), so a
// Map here is the whole truth, and it keeps the limits independent of Redis.
// The limiters this replaces lived in Redis inside a `catch {}` that let the
// request through: filling Redis, the audit's cheapest attack, also switched
// off every throttle. A limit that cannot be disabled from outside is worth
// more than one that survives a restart.
//
// If the API ever runs as more than one instance, each of these becomes a
// per-instance budget: N instances give every user N times the allowance, and
// the socket cap is dodged by landing on a different one. They have to move to
// a shared store first — and must fail closed there, never back into a
// `catch {}` that lets the request through. project-docs/spec-v7/13-operations.md
// ("The API assumes one instance") lists this with everything else that has
// to change before scaling out.
import type { SocketEvent } from '../schemas';

export interface Budget { max: number; windowMs: number }

// Mutable so a test can loosen one limit while it exercises something else.
export const SOCKET_LIMITS = {
  /** Sockets one account may hold at once. Each browser tab and each app is one. */
  socketsPerUser: 10,
  /** Handshakes per client address, counted before the token is even checked. */
  handshakesPerIp: { max: 60, windowMs: 60_000 } as Budget,
  /** Everything one user sends, all events together. */
  allEvents: { max: 20, windowMs: 1_000 } as Budget,
  /** Tighter budgets for events that are expensive or that a person sends rarely. */
  perEvent: {
    // A player cannot move twice without the opponent moving in between, so
    // ten a second is far above any real game, premoves included.
    make_move:          { max: 10, windowMs: 1_000 },
    send_chat:          { max: 2,  windowMs: 1_000 },
    send_emote:         { max: 1,  windowMs: 1_000 },
    // Each costs up to four Supabase calls.
    join_queue:         { max: 10, windowMs: 60_000 },
    create_invite_link: { max: 10, windowMs: 60_000 },
    accept_invite:      { max: 10, windowMs: 60_000 },
    spectate:           { max: 30, windowMs: 60_000 },
  } as Partial<Record<SocketEvent, Budget>>,
};

// ── Fixed-window counters ────────────────────────────────────────────────────

const windows = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;

/** Spends one unit of `key`'s budget. False once the window's budget is gone. */
export function take(key: string, budget: Budget, now = Date.now()): boolean {
  sweep(now);
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + budget.windowMs });
    return true;
  }
  if (w.count >= budget.max) return false;
  w.count++;
  return true;
}

// Drops finished windows about once a minute, so the map holds only users and
// addresses active in the last minute rather than everyone since boot.
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of windows) if (now >= w.resetAt) windows.delete(key);
}

// ── Open sockets per user ────────────────────────────────────────────────────

const openSockets = new Map<string, number>();

export function socketCount(userId: string): number {
  return openSockets.get(userId) ?? 0;
}

export function trackSocketOpen(userId: string): void {
  openSockets.set(userId, socketCount(userId) + 1);
}

export function trackSocketClose(userId: string): void {
  const n = socketCount(userId) - 1;
  if (n > 0) openSockets.set(userId, n);
  else openSockets.delete(userId);
}

/** Tests only: every suite starts from empty budgets. */
export function resetSocketLimitState(): void {
  windows.clear();
  openSockets.clear();
  lastSweep = 0;
}
