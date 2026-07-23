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

// API routes
app.use('/api', apiLimiter, routes);

// Error handling (must be last)
app.use(errorHandler);

export default app;