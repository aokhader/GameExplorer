import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

export async function verifySocketToken(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) return next(new Error('Server misconfiguration'));

    const decoded = jwt.verify(token, secret) as { sub: string; email?: string };
    socket.data.userId = decoded.sub;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
