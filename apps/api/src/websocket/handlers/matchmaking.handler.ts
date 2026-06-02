import type { Server as SocketIOServer, Socket } from 'socket.io';
import { matchmakingService } from '../../services/matchmaking.service';
import type { GameType, TimeControl } from '@gameexplorer/shared';

export function registerMatchmakingHandlers(io: SocketIOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on('join_queue', async (data: {
    gameType:    GameType;
    timeControl: TimeControl;
    rated:       boolean;
    username:    string;
    rating:      number;
  }) => {
    // Store username/rating on socket for later use
    socket.data.username = data.username;
    socket.data.rating   = data.rating;

    const existingGameId = await (await import('../../services/gameSession.service')).gameSessionService.getActiveGameId(userId);
    if (existingGameId) {
      socket.emit('error', { code: 'ALREADY_IN_GAME', message: 'You are already in a game' });
      return;
    }

    await matchmakingService.addToQueue({
      userId,
      username:    data.username,
      rating:      data.rating,
      gameType:    data.gameType,
      timeControl: data.timeControl,
      rated:       data.rated,
      joinedAt:    Date.now(),
    });

    socket.emit('queue_joined', { estimatedWait: 30 });
  });

  socket.on('leave_queue', async (data: { gameType: GameType; timeControl: TimeControl; rated: boolean }) => {
    await matchmakingService.removeFromQueue(userId, data.gameType, data.timeControl, data.rated);
  });
}
