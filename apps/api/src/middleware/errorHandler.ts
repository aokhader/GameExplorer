import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * The last middleware in app.ts. Since asyncHandler routes every rejected
 * controller here, this is where most failures now end up, so it must not
 * repeat the old handler's mistakes (security audit v2, WS5-23):
 *
 *   - It sent `err.message` in production. Prisma and pg messages can name
 *     tables, columns and constraints, and sometimes quote the values. Only
 *     development gets the detail now.
 *   - It sent `{ error: { message } }`, but apiFetch reads `error` as a
 *     string, so users saw "[object Object]". It is a string now.
 *   - It answered 500 to a body the JSON parser rejected. That is the client's
 *     mistake, and body-parser says so in `status`; 4xx is passed through.
 *   - It logged with console.error, outside the logger.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // The response has started, so there is nothing to replace. Express's own
  // handler closes the connection.
  if (res.headersSent) { next(err); return; }

  const status = clientErrorStatus(err);
  if (status) {
    res.status(status).json({ error: status === 413 ? 'Request too large' : 'Invalid request' });
    return;
  }

  // The route pattern, not the URL: the URL carries other users' ids.
  logger.error(`Unhandled error in ${req.method} ${req.baseUrl}${req.route?.path ?? ''}:`, err);

  const dev = process.env.NODE_ENV === 'development' && err instanceof Error;
  res.status(500).json({
    error: dev ? err.message : 'Internal server error',
    ...(dev && { stack: err.stack }),
  });
}

/** A 4xx that a parser attached to its error, if there is one. */
function clientErrorStatus(err: unknown): number | null {
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status
    ?? (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}
