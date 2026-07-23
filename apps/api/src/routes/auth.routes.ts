import { Router, type Router as ExpressRouter } from 'express';
import { authLimiter }    from '../middleware/rateLimiter';
import { authController } from '../controllers/auth.controller';

const router: ExpressRouter = Router();

// No requireAuth — this endpoint is what mints the session. authLimiter is the
// only thing standing between it and password guessing, so it is not optional.
router.post('/login', authLimiter, authController.login);

export default router;
