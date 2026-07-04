import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth }    from '../middleware/auth';
import { strictLimiter }  from '../middleware/rateLimiter';
import { gameController } from '../controllers/game.controller';

const router: ExpressRouter = Router();

router.get('/active',         requireAuth, gameController.getActiveGame);
router.get('/live',           requireAuth, gameController.getLiveGames);
router.get('/:gameId',        requireAuth, gameController.getGame);
router.post('/invite',        requireAuth, strictLimiter, gameController.createInviteLink);

export default router;
