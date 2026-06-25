import type { ClockSnapshot, GameResult, PlayerColor } from '../types/socket.types';

/**
 * Server-authoritative clocks arrive as a snapshot plus the wall-clock time it
 * was synced. Between syncs the client counts the active player's clock down
 * locally. Pure so web and mobile share identical countdown math.
 */
export function interpolateClocks(
  base: ClockSnapshot,
  syncedAt: number,
  now: number,
): { white: number; black: number } {
  const elapsed = now - syncedAt;
  return {
    white: base.active_color === 'white' ? Math.max(0, base.white_ms - elapsed) : base.white_ms,
    black: base.active_color === 'black' ? Math.max(0, base.black_ms - elapsed) : base.black_ms,
  };
}

/** Map an absolute game result to the given player's perspective. */
export function resultForColor(
  result: GameResult,
  myColor: PlayerColor,
): 'win' | 'loss' | 'draw' {
  if (result === 'draw') return 'draw';
  return result === (myColor === 'white' ? 'white_wins' : 'black_wins') ? 'win' : 'loss';
}

/** `m:ss` — used by chess (minute-scale clocks). */
export function formatClockLong(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** `Ns` — used by per-move games (checkers, reversi). */
export function formatClockShort(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}
