import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth }    from '../middleware/auth';
import { asyncHandler }   from '../middleware/asyncHandler';
import { validate }       from '../middleware/validation';
import { RestSchemas }    from '../schemas';
import { gameController } from '../controllers/game.controller';

const router: ExpressRouter = Router();

router.get('/active',         requireAuth, asyncHandler(gameController.getActiveGame));
router.get('/live',           requireAuth, asyncHandler(gameController.getLiveGames));
router.get('/:gameId',        requireAuth, validate({ params: RestSchemas.gameIdParams }), asyncHandler(gameController.getGame));

// There was a `POST /invite` here. No client called it — both use the
// `create_invite_link` socket event — and it never validated its input, stored
// every inviter as "Player" rated 1200, and put `gameType` into the link
// unencoded (security audit v2, WS5-31). Removed rather than fixed.

export default router;
