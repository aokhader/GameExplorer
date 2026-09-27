import { Socket } from 'socket.io';
import { verifySupabaseToken } from '../../utils/verifyToken';
import { revocationService } from '../../services/revocation.service';

export async function verifySocketToken(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));

    const payload = await verifySupabaseToken(token);
    // A deleted account's tokens still verify until they expire (GX-16).
    if (!payload.sub || revocationService.isRevoked(payload.sub)) {
      return next(new Error('Invalid or expired token'));
    }
    socket.data.userId = payload.sub;
    // The connection outlives this check; websocket/session.ts holds it to the
    // token's expiry (GX-16).
    socket.data.tokenExp = payload.exp;
    next();
  } catch (err) {
    if (err instanceof Error && err.message === 'SUPABASE_URL is not set') {
      return next(new Error('Server misconfiguration'));
    }
    next(new Error('Invalid or expired token'));
  }
}
