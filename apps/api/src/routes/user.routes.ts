import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth }    from '../middleware/auth';
import { strictLimiter }  from '../middleware/rateLimiter';
import { userController } from '../controllers/user.controller';

const router: ExpressRouter = Router();

router.get('/friends',             requireAuth, userController.getFriends);
router.post('/friends/request',    requireAuth, strictLimiter, userController.sendFriendRequest);
router.put('/friends/:id/respond', requireAuth, userController.respondToFriendRequest);
router.delete('/friends/:id',      requireAuth, userController.removeFriend);

router.get('/blocks',                requireAuth, userController.getBlocked);
router.post('/blocks',               requireAuth, strictLimiter, userController.blockUser);
router.delete('/blocks/:targetUserId', requireAuth, userController.unblockUser);
router.post('/reports',              requireAuth, strictLimiter, userController.reportUser);

export default router;
