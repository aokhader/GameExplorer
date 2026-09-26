import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { clientIp } from '../utils/clientIp';

// Every limiter below keys on `clientIp(req)`, NOT on the default `req.ip`.
// Behind Cloudflare + Render, `req.ip` resolves to a Render-internal load
// balancer address that changes between requests, so these limiters were
// counting nobody. See utils/clientIp.ts for the measurement and for why
// `trust proxy: true` is the wrong fix.
const keyGenerator = (req: Request) => clientIp(req);

// General limiter for all REST endpoints. Socket events and handshakes have
// their own per-user and per-address budgets in websocket/limits.ts.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300, // per client per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many requests, please try again later' },
});

// Sign-in. Tighter than strictLimiter because each request is a password
// guess. 20/15min per client is generous for a human who forgot which username
// they picked, and useless for brute force. Successful logins count too — a
// legitimate user does not sign in 20 times in a quarter of an hour.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many sign-in attempts, please try again later' },
});

// Username availability (GET /api/auth/username-available). Deliberately NOT
// authLimiter: that bucket is shared with POST /auth/login, so typing in a
// sign-up form would lock the same person out of signing in.
//
// This number IS the enumeration budget. `profiles` SELECT is owner-only, so
// this endpoint is the only way a stranger can ask "does this name exist?", and
// 60 per 15 minutes per client is how fast they may ask it. A real sign-up
// costs a handful: checks are debounced (300ms) and cached per name.
export const usernameCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many username checks, please try again later' },
});

// Stricter limiter for write-heavy / abuse-prone endpoints (friend requests,
// invite creation, username claims). Mount per-route as needed.
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Too many requests, please try again later' },
});
