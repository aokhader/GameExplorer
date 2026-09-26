import type { Server as SocketIOServer, Socket } from 'socket.io';
import { matchmakingService } from '../../services/matchmaking.service';
import { persistenceService, FALLBACK_USERNAME } from '../../services/persistence.service';
import { gameSessionService } from '../../services/gameSession.service';
import { blockService }       from '../../services/block.service';
import { onEvent }            from '../../middleware/validation';

export function registerMatchmakingHandlers(_io: SocketIOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  // The payload's gameType and timeControl become part of a Redis key name, so
  // they are enums (schemas.ts): before Wave 3 one socket could create any
  // number of queues, each of which the 500 ms matchmaking loop then scanned.
  onEvent(socket, 'join_queue', async (data) => {
    // Checked first because it is two Redis reads, and everything after it
    // costs Supabase round-trips. A pointer to a game that has ended does not
    // count — gating on the bare pointer let a leftover one block queueing.
    const existingGameId = await gameSessionService.getLiveGameId(userId);
    if (existingGameId) {
      socket.emit('error', { code: 'ALREADY_IN_GAME', message: 'You are already in a game' });
      return;
    }

    // Rating AND username are server-authoritative: fetched from Supabase and
    // never taken from the client, which could otherwise name itself anything
    // shown to its opponent (WS5-22).
    const rating   = await persistenceService.getRating(userId, data.gameType);
    const username = (await persistenceService.getUsername(userId)) ?? FALLBACK_USERNAME;

    // Store username/rating on socket for later use
    socket.data.username = username;
    socket.data.rating   = rating;

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

  onEvent(socket, 'leave_queue', async (data) => {
    await matchmakingService.removeFromQueue(userId, data.gameType, data.timeControl, data.rated);
  });
}
