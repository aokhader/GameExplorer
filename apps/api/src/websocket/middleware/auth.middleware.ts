import { Socket } from 'socket.io';
import { verifySupabaseToken } from '../../utils/verifyToken';
import { logger } from '../../utils/logger';

export async function verifySocketToken(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      logger.warn(`[socket-auth] rejected ${socket.id}: no token in handshake.auth`);
      return next(new Error('Authentication required'));
    }

    const payload = await verifySupabaseToken(token);
    socket.data.userId = payload.sub;
    logger.info(`[socket-auth] OK ${socket.id}: user=${payload.sub}`);
    next();
  } catch (err) {
    if (err instanceof Error && err.message === 'SUPABASE_URL is not set') {
      logger.error(`[socket-auth] rejected ${socket.id}: SUPABASE_URL is not set`);
      return next(new Error('Server misconfiguration'));
    }
    logger.warn(`[socket-auth] rejected ${socket.id}: ${(err as Error)?.message ?? 'invalid token'}`);
    next(new Error('Invalid or expired token'));
  }
}
