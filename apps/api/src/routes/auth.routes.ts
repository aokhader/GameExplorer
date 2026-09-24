import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth }    from '../middleware/auth';
import { authLimiter, strictLimiter, usernameCheckLimiter } from '../middleware/rateLimiter';
import { authController } from '../controllers/auth.controller';

const router: ExpressRouter = Router();

// No requireAuth — this endpoint is what mints the session. authLimiter is the
// only thing standing between it and password guessing, so it is not optional.
router.post('/login', authLimiter, authController.login);

// No requireAuth — the sign-up form asks before an account exists. Its own
// limiter, never authLimiter: see usernameCheckLimiter for why, and for why its
// number is the enumeration budget.
router.get('/username-available', usernameCheckLimiter, authController.checkUsername);

// The limiter runs before requireAuth so unauthenticated floods are counted too.
router.post('/username', strictLimiter, requireAuth, authController.claimUsername);

export default router;
