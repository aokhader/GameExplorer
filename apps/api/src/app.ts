import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { corsOrigin } from './config/cors';

const app: Application = express();

// Behind a reverse proxy in production, so X-Forwarded-Proto is honoured
// (req.secure / req.protocol).
//
// This does NOT give us the client's address, and the rate limiters no longer
// pretend it does. The real chain is client → Cloudflare → Render, three hops,
// so trusting one leaves req.ip pointing at a Render-internal load balancer
// that changes between requests. Limiters key on utils/clientIp.ts instead —
// read the comment there before raising this number, and in particular before
// setting it to `true`, which would make req.ip attacker-supplied.
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

// API routes
app.use('/api', apiLimiter, routes);

// Error handling (must be last)
app.use(errorHandler);

export default app;