import rateLimit from 'express-rate-limit';

// General limiter for all REST endpoints. WebSocket events have their own
// Redis-based limiter in the game handler (1 move / 200ms per socket).
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300, // per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Sign-in. Tighter than strictLimiter because each request is a password
// guess. 20/15min per IP is generous for a human who forgot which username they
// picked, and useless for brute force. Successful logins count too — a legitimate
// user does not sign in 20 times in a quarter of an hour.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts, please try again later' },
});

// Stricter limiter for write-heavy / abuse-prone endpoints (friend requests,
// invite creation). Mount per-route as needed.
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
