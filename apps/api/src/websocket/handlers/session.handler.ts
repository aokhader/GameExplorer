// Holding each socket to the token it connected with (security audit v2, GX-16).
//
// A token is checked once, at the handshake, and a connection can stay open for
// hours. Before this, a socket stayed trusted after its token expired: past a
// sign-out, past an account deletion, for as long as the client kept it open.
//
// Now each socket carries its token's expiry. An up-to-date client sends
// `reauth` with each token its session refreshes to, which moves the expiry on,
// so it never notices any of this. A socket whose token runs out anyway is
// marked expired. It may finish the game it is in but not start another
// (`onEvent` refuses join_queue, create_invite_link and accept_invite), and its
// connection is closed as soon as it is not in a live game.
//
// Closing the transport, rather than disconnecting the socket, lets socket.io's
// client reconnect by itself. The client asks for its current token on every
// attempt (packages/client socketStore), so an up-to-date one is back within a
// second, and one holding only the old token is refused at the handshake.
import type { Socket } from 'socket.io';
import { onEvent } from '../../middleware/validation';
import { verifySupabaseToken } from '../../utils/verifyToken';
import { revocationService } from '../../services/revocation.service';
import { gameSessionService } from '../../services/gameSession.service';
import { logger } from '../../utils/logger';

/** How long an expired socket in a live game waits before it is looked at again. Tests shorten it. */
export const SESSION_TIMING = { idleRecheckMs: 30_000 };

// setTimeout's longest delay; a longer one would fire at once.
const MAX_DELAY_MS = 2 ** 31 - 1;

const REFUSED = { code: 'AUTH_REQUIRED', message: 'Invalid or expired token' } as const;

function clearExpiry(socket: Socket): void {
  const timer = socket.data.expiryTimer as NodeJS.Timeout | undefined;
  if (timer) clearTimeout(timer);
  socket.data.expiryTimer = undefined;
}

/**
 * Marks the socket expired at `exp` (Unix seconds), replacing any earlier
 * deadline. A token with no `exp` sets none; Supabase always sends one, and
 * only the test fakes leave it out.
 */
function holdToExpiry(socket: Socket, exp: unknown): void {
  clearExpiry(socket);
  socket.data.tokenExpired = false;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return;
  const delay = Math.min(Math.max(0, exp * 1000 - Date.now()), MAX_DELAY_MS);
  socket.data.expiryTimer = setTimeout(() => {
    socket.data.tokenExpired = true;
    void closeWhenIdle(socket);
  }, delay);
}

async function closeWhenIdle(socket: Socket): Promise<void> {
  socket.data.expiryTimer = undefined;
  if (!socket.connected || !socket.data.tokenExpired) return;

  let inGame: boolean;
  try {
    inGame = (await gameSessionService.getLiveGameId(socket.data.userId as string)) !== null;
  } catch (err) {
    // Look again later rather than cut someone off mid-game over a Redis error.
    logger.error('Session expiry check failed:', err);
    inGame = true;
  }
  // A reauth may have landed during the lookup.
  if (!socket.connected || !socket.data.tokenExpired) return;

  if (inGame) {
    socket.data.expiryTimer = setTimeout(() => void closeWhenIdle(socket), SESSION_TIMING.idleRecheckMs);
    return;
  }
  logger.info(`Closing ${socket.id}: its token expired (user ${socket.data.userId})`);
  socket.conn.close();
}

export function registerSessionHandlers(socket: Socket): void {
  holdToExpiry(socket, socket.data.tokenExp);
  socket.once('disconnect', () => clearExpiry(socket));

  onEvent(socket, 'reauth', async ({ token }) => {
    let payload;
    try {
      payload = await verifySupabaseToken(token);
    } catch {
      socket.emit('error', REFUSED);
      return;
    }
    // Only the same account may refresh this socket: accepting another user's
    // token would change who the connection speaks for. The clients open a new
    // socket when the signed-in account changes.
    if (!payload.sub || payload.sub !== socket.data.userId || revocationService.isRevoked(payload.sub)) {
      socket.emit('error', REFUSED);
      return;
    }
    socket.data.tokenExp = payload.exp;
    holdToExpiry(socket, payload.exp);
  });
}
