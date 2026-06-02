import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth }    from '../middleware/auth';
import { userController } from '../controllers/user.controller';

const router: ExpressRouter = Router();

router.get('/friends',             requireAuth, userController.getFriends);
router.post('/friends/request',    requireAuth, userController.sendFriendRequest);
router.put('/friends/:id/respond', requireAuth, userController.respondToFriendRequest);
router.delete('/friends/:id',      requireAuth, userController.removeFriend);

export default router;
