import { Socket } from 'socket.io';
import { verifySupabaseToken } from '../../utils/verifyToken';

export async function verifySocketToken(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));

    const payload = await verifySupabaseToken(token);
    socket.data.userId = payload.sub;
    next();
  } catch (err) {
    if (err instanceof Error && err.message === 'SUPABASE_URL is not set') {
      return next(new Error('Server misconfiguration'));
    }
    next(new Error('Invalid or expired token'));
  }
}
