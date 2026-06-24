import { Response } from 'express';
import { gameSessionService } from '../services/gameSession.service';
import { inviteService }      from '../services/invite.service';
import { clockService }       from '../services/clock.service';
import type { AuthRequest }   from '../middleware/auth';

export const gameController = {
  async getActiveGame(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const gameId = await gameSessionService.getActiveGameId(userId);
    if (!gameId) { res.json({ game: null }); return; }

    const session = await gameSessionService.getGameSession(gameId);
    if (!session) { res.json({ game: null }); return; }

    const myColor = session.whiteId === userId ? 'white' : 'black';
    const oppId   = myColor === 'white' ? session.blackId : session.whiteId;
    const oppName = myColor === 'white' ? session.blackUsername : session.whiteUsername;
    const clocks  = await clockService.getSnapshot(gameId);

    res.json({
      game: {
        gameId,
        gameType:    session.gameType,
        myColor,
        opponent:    { userId: oppId, username: oppName },
        status:      session.status,
        timeControl: session.timeControl,
        clocks,
      },
    });
  },

  async getLiveGames(_req: AuthRequest, res: Response) {
    const games = await gameSessionService.listActiveGames();
    res.json({ games });
  },

  async getGame(req: AuthRequest, res: Response) {
    const { gameId } = req.params as { gameId: string };
    const session = await gameSessionService.getGameSession(gameId);
    if (!session) { res.status(404).json({ error: 'Game not found' }); return; }

    res.json({
      gameId,
      gameType:    session.gameType,
      status:      session.status,
      timeControl: session.timeControl,
      white: { userId: session.whiteId, username: session.whiteUsername, rating: Number(session.whiteRating) },
      black: { userId: session.blackId, username: session.blackUsername, rating: Number(session.blackRating) },
    });
  },

  async createInviteLink(req: AuthRequest, res: Response) {
    const { gameType, timeControl } = req.body as { gameType: string; timeControl: string };
    const userId = req.userId!;

    const inviteId = await inviteService.createInvite(
      userId,
      (req as any).username ?? 'Player',
      (req as any).rating ?? 1200,
      gameType as any,
      timeControl as any,
    );

    const baseUrl = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
    res.json({ inviteId, url: `${baseUrl}/${gameType}/play?invite=${inviteId}` });
  },
};
