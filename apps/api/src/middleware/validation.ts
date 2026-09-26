// The two doors client input comes through, each with a schema check on it.
//
//   onEvent()   — every socket listener is registered through this. It spends
//                 the user's rate budget, checks the payload against
//                 SocketSchemas before the handler runs, and it is the only
//                 place a listener is attached, so each one
//                 is async and wrapped: a throw becomes a logged error and an
//                 `error` event back to the sender, never an unhandled rejection
//                 or (GX-03) a synchronous throw out of socket.io's dispatch.
//   validate()  — Express middleware for REST routes that take input.
//
// Both REPLACE the input with the parsed value. That strips unknown keys and
// applies coercions, so a handler reads only what passed — see schemas.ts.
import type { Socket } from 'socket.io';
import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import type { ErrorCode } from '@gameexplorer/shared';
import { SocketSchemas, type SocketEvent, type SocketPayload } from '../schemas';
import { SOCKET_LIMITS, take } from '../websocket/limits';
import { logger } from '../utils/logger';

export interface SocketFailure { code: ErrorCode; message: string }

const RATE_LIMITED: SocketFailure = { code: 'RATE_LIMITED', message: 'Too many requests. Slow down and try again.' };
const BAD_REQUEST: SocketFailure  = { code: 'BAD_REQUEST', message: 'Invalid request' };
const SERVER_ERROR: SocketFailure = { code: 'SERVER_ERROR', message: 'Something went wrong' };

/**
 * Registers `handler` for `event`, but only ever calls it with a payload that
 * passed `SocketSchemas[event]`, from a user still inside their budgets.
 *
 * The budgets (websocket/limits.ts) are per *user*, not per socket, so opening
 * more tabs buys no more. They are spent before the schema runs, so a flood of
 * junk is throttled like anything else.
 *
 * `limited`, `rejected` and `failed` replace the generic error for, in turn, a
 * spent budget, a payload that fails the schema and a handler that throws.
 * Override them where a client waits on a specific code: the invite hook only
 * reacts to INVITE_EXPIRED, so any other code would leave its spinner running
 * forever.
 */
export function onEvent<E extends SocketEvent>(
  socket: Socket,
  event: E,
  handler: (data: SocketPayload<E>) => Promise<void>,
  opts: { limited?: SocketFailure; rejected?: SocketFailure; failed?: SocketFailure } = {},
): void {
  const schema = SocketSchemas[event];
  const userId = socket.data.userId as string;
  socket.on(event as string, async (raw: unknown) => {
    const budget = SOCKET_LIMITS.perEvent[event];
    if (!take(`user:${userId}`, SOCKET_LIMITS.allEvents)
        || (budget && !take(`user:${userId}:${event}`, budget))) {
      socket.emit('error', opts.limited ?? RATE_LIMITED);
      return;
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      // Debug only: a flood of junk would otherwise become a flood of log lines.
      logger.debug(`rejected "${event}" payload from ${socket.id}`);
      socket.emit('error', opts.rejected ?? BAD_REQUEST);
      return;
    }
    try {
      await handler(parsed.data as SocketPayload<E>);
    } catch (err) {
      logger.error(`socket event "${event}" failed:`, err);
      socket.emit('error', opts.failed ?? SERVER_ERROR);
    }
  });
}

type RequestPart = 'params' | 'body';

/**
 * Express: 400 unless every given part of the request matches its schema.
 * Params are checked first, so a malformed id never reaches body parsing
 * rules that assume it was valid.
 */
export function validate(schemas: Partial<Record<RequestPart, ZodTypeAny>>): RequestHandler {
  return (req, res, next) => {
    for (const part of ['params', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const parsed = schema.safeParse(req[part]);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request' });
        return;
      }
      // Safe in Express 4: handlers in one route share the same req.params.
      (req as unknown as Record<RequestPart, unknown>)[part] = parsed.data;
    }
    next();
  };
}
