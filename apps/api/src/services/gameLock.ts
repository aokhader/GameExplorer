// One game's moves and clock syncs run one at a time, in the order they arrive.
//
// A move is several Redis round trips: read the game, write the new position,
// read the clock, write the clock, then broadcast. Nothing made two of those
// sequences for the same game wait for each other, so:
//   - the same move sent twice (a double tap, a premove landing with a click)
//     could pass the turn check twice, because both reads saw the position
//     before either write. Both were broadcast, and the second charged the
//     clock again: before the clock followed the position (84fd9cf) it toggled
//     it back to the mover for the rest of the game, and since then it gives
//     the opponent a free increment;
//   - the 3-second clock sync could read the clock just before a move switched
//     it and broadcast that stale snapshot just after the move. The client then
//     ran the clock of the player who had just moved, on the opponent's turn,
//     until the next sync.
//
// The API is one instance (see websocket/limits.ts), so an in-process queue per
// game is enough. A second instance would need this in Redis, along with the
// rate limits.

const tails = new Map<string, Promise<void>>();

/**
 * Runs `fn` once every earlier call for `gameId` has settled, and returns its
 * result. A call that throws does not block the ones queued behind it.
 */
export function withGameLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(gameId) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.then(() => undefined, () => undefined);
  tails.set(gameId, tail);
  void tail.then(() => { if (tails.get(gameId) === tail) tails.delete(gameId); });
  return run;
}

/** Games with work queued or running. For tests. */
export function lockedGameCount(): number {
  return tails.size;
}
