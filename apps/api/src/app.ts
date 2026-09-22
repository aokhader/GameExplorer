import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { corsOrigin } from './config/cors';

const app: Application = express();

// Behind a reverse proxy in production (Railway/Render) — needed so
// express-rate-limit sees real client IPs from X-Forwarded-For.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration — allows the production alias AND this project's Vercel
// preview deployments (see config/cors.ts). Shared with the Socket.io server.
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  // ── TEMPORARY DIAGNOSTIC — security audit v2, item 4.2. REMOVE AFTER READING. ──
  // Answers whether `app.set('trust proxy', 1)` above is correct for Render, which
  // decides whether every HTTP rate limit keys on the real client or on a shared
  // proxy hop. Logs only; nothing is returned to the caller.
  //
  // How to read it: deploy, then hit /health once from your phone on mobile data
  // (turn Wi-Fi off) and compare `ip` below to the address shown by whatismyip.com.
  //   ip === your phone's address   -> trust proxy is correct, nothing to do
  //   ip is 10.x / 100.64.x / ::1   -> every user shares ONE rate-limit bucket:
  //                                    raise the hop count until `ip` is the client
  //   ip changes when you add your  -> the header is caller-controlled and the
  //   own X-Forwarded-For header       limiter can be bypassed outright
  // Also check the boot logs for any `ERR_ERL_*` warning from express-rate-limit.
  console.log('[audit 4.2] trust-proxy probe', JSON.stringify({
    ip: req.ip,
    ips: req.ips,
    xForwardedFor: req.headers['x-forwarded-for'] ?? null,
    remoteAddress: req.socket.remoteAddress ?? null,
    // Added on the second pass: `ua` tells Render's own health checker apart from a
    // real client, and `path` lets you find a request you made by its ?marker=.
    path: req.originalUrl,
    ua: req.headers['user-agent'] ?? null,
    xRealIp: req.headers['x-real-ip'] ?? null,
    cfConnectingIp: req.headers['cf-connecting-ip'] ?? null,
    trueClientIp: req.headers['true-client-ip'] ?? null,
    forwarded: req.headers['forwarded'] ?? null,
  }));
  // ── END TEMPORARY DIAGNOSTIC ──────────────────────────────────────────────────

  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiLimiter, routes);

// Error handling (must be last)
app.use(errorHandler);

export default app;