import type { Server as SocketIOServer, Socket } from 'socket.io';
import { matchmakingService } from '../../services/matchmaking.service';
import { persistenceService } from '../../services/persistence.service';
import { gameSessionService } from '../../services/gameSession.service';
import { blockService }       from '../../services/block.service';
import type { GameType, TimeControl } from '@gameexplorer/shared';

export function registerMatchmakingHandlers(io: SocketIOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on('join_queue', async (data: {
    gameType:    GameType;
    timeControl: TimeControl;
    rated:       boolean;
    username:    string;
    rating:      number; // ignored — rating is fetched server-side
  }) => {
    // Rating AND username are server-authoritative: fetched from Supabase, never
    // trusted from the client (rating previously hardcoded 1200; a client could
    // otherwise present any display name to opponents).
    const rating   = await persistenceService.getRating(userId, data.gameType);
    const username = (await persistenceService.getUsername(userId)) ?? data.username ?? 'Anonymous';

    // Store username/rating on socket for later use
    socket.data.username = username;
    socket.data.rating   = rating;

    const existingGameId = await gameSessionService.getActiveGameId(userId);
    if (existingGameId) {
      socket.emit('error', { code: 'ALREADY_IN_GAME', message: 'You are already in a game' });
      return;
    }

    // Cache this user's block set in Redis so the matchmaking loop can exclude
    // blocked users without a Supabase round-trip per pairing attempt.
    await blockService.cacheBlockSet(userId);

    await matchmakingService.addToQueue({
      userId,
      username,
      rating,
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
