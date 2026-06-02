import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

class SocketClient {
  private socket: Socket | null = null;

  connect(token: string) {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(WS_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to WebSocket');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from WebSocket');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    return this.socket;
  }

  // Game-specific methods
  joinMatchmaking(gameType: string) {
    this.getSocket().emit('join_matchmaking', { gameType });
  }

  makeMove(gameId: string, move: unknown) {
    this.getSocket().emit('make_move', { gameId, move });
  }

  // Add more methods...
}

export const socketClient = new SocketClient();