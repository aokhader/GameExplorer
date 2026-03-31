import { Socket } from 'socket.io';

export async function verifySocketToken(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    // TODO: Verify JWT token
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // socket.data.userId = decoded.userId;

    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
}