import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Marks a handler as wrapped, so a test can check that every route's handler is.
const WRAPPED = Symbol.for('gameexplorer.asyncHandler');

/**
 * Express 4 does not await a route handler. When an async one rejected — a
 * database error, a Supabase timeout — nothing called `next`, no response was
 * ever sent, and the request hung until the client gave up (security audit
 * v2, WS5-08). This hands the rejection to `next`, so it reaches errorHandler
 * and the client gets a 500 at once. Every controller route is mounted
 * through it.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  const wrapped: RequestHandler = (req, res, next) => {
    // Promise.resolve().then also catches a synchronous throw.
    Promise.resolve().then(() => fn(req as Req, res, next)).catch(next);
  };
  Object.defineProperty(wrapped, WRAPPED, { value: true });
  return wrapped;
}

export function isAsyncHandled(handler: unknown): boolean {
  return typeof handler === 'function' && (handler as unknown as Record<symbol, unknown>)[WRAPPED] === true;
}
