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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── TEMPORARY DIAGNOSTIC — security audit v2, item 4.2. DELETE THIS ROUTE. ──
// Moved off /health because Render polls that path continuously (ua "Render/1.0"),
// which buried real client requests. Returns the answer in the body so there is no
// log-grepping: just open this URL on your phone with Wi-Fi off and read the JSON.
//   observedIp === your public address -> `trust proxy: 1` is correct
//   observedIp is 10.x / ::ffff:10.x   -> every HTTP limiter shares ONE bucket
//   observedIp echoes a value you sent -> the header is caller-controlled
app.get('/__audit-trust-proxy', (req, res) => {
  const observed = {
    observedIp: req.ip,
    ips: req.ips,
    remoteAddress: req.socket.remoteAddress ?? null,
    trustProxySetting: req.app.get('trust proxy'),
    headers: {
      'x-forwarded-for': req.headers['x-forwarded-for'] ?? null,
      'x-real-ip': req.headers['x-real-ip'] ?? null,
      'cf-connecting-ip': req.headers['cf-connecting-ip'] ?? null,
      'true-client-ip': req.headers['true-client-ip'] ?? null,
      forwarded: req.headers['forwarded'] ?? null,
    },
    ua: req.headers['user-agent'] ?? null,
  };
  console.log('[audit 4.2]', JSON.stringify(observed));
  res.json(observed);
});
// ── END TEMPORARY DIAGNOSTIC ────────────────────────────────────────────────

// API routes
app.use('/api', apiLimiter, routes);

// Error handling (must be last)
app.use(errorHandler);

export default app;