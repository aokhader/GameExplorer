import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth }    from '../middleware/auth';
import { gameController } from '../controllers/game.controller';

const router: ExpressRouter = Router();

router.get('/active',         requireAuth, gameController.getActiveGame);
router.get('/:gameId',        requireAuth, gameController.getGame);
router.post('/invite',        requireAuth, gameController.createInviteLink);

export default router;
