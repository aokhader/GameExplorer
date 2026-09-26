import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth }    from '../middleware/auth';
import { asyncHandler }   from '../middleware/asyncHandler';
import { strictLimiter }  from '../middleware/rateLimiter';
import { validate }       from '../middleware/validation';
import { RestSchemas as S } from '../schemas';
import { userController } from '../controllers/user.controller';

const router: ExpressRouter = Router();

// Every route that takes input validates it after authenticating and before
// the controller. Without that, a non-UUID `targetUserId` or a non-numeric
// `:id` made Prisma throw inside an async handler Express 4 never awaits, and
// the request hung until the client gave up (WS5-08); an object in place of
// `targetUserId` was read by Prisma as a filter operator (WS5-09).
router.get('/friends',             requireAuth, asyncHandler(userController.getFriends));
router.post('/friends/request',    requireAuth, strictLimiter, validate({ body: S.friendRequestBody }), asyncHandler(userController.sendFriendRequest));
router.put('/friends/:id/respond', requireAuth, validate({ params: S.friendIdParams, body: S.friendRespondBody }), asyncHandler(userController.respondToFriendRequest));
router.delete('/friends/:id',      requireAuth, validate({ params: S.friendIdParams }), asyncHandler(userController.removeFriend));

router.get('/blocks',                requireAuth, asyncHandler(userController.getBlocked));
router.post('/blocks',               requireAuth, strictLimiter, validate({ body: S.blockBody }), asyncHandler(userController.blockUser));
router.delete('/blocks/:targetUserId', requireAuth, validate({ params: S.targetUserParams }), asyncHandler(userController.unblockUser));
router.post('/reports',              requireAuth, strictLimiter, validate({ body: S.reportBody }), asyncHandler(userController.reportUser));

// Full account deletion (App Store 5.1.1 / Play data deletion). strictLimiter
// (30/15min) is ample for a destructive, rarely-repeated action.
router.delete('/me',                 requireAuth, strictLimiter, asyncHandler(userController.deleteAccount));

export default router;
