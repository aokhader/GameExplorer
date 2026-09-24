import { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { usernameService } from '../services/username.service';

/** Bound the inputs before they reach Supabase — these are unauthenticated. */
const MAX_IDENTIFIER_LENGTH = 320; // longest legal email address
const MAX_PASSWORD_LENGTH = 72; // bcrypt's ceiling
/**
 * A protocol bound, not the username rule: anything from 21 to 64 characters
 * still gets a proper `invalid-format` answer from the service. This only stops
 * an unauthenticated caller shipping kilobytes into the validator.
 */
const MAX_USERNAME_QUERY_LENGTH = 64;

/** The username from a query string or body, or null if it is not one short string. */
function usernameInput(value: unknown): string | null {
  // express.urlencoded({ extended: true }) lets `?username[]=a` arrive as an
  // array and `?username[x]=a` as an object, so the type is checked, not assumed.
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_USERNAME_QUERY_LENGTH) return null;
  return value;
}

export const authController = {
  /**
   * POST /api/auth/login — sign in with a username OR an email.
   *
   * Unauthenticated by design (it is what produces the session). Every failure
   * returns the same 401 so the response can't be used to test whether a
   * username or email is registered.
   */
  async login(req: Request, res: Response) {
    const { identifier, password } = req.body as {
      identifier?: unknown;
      password?: unknown;
    };

    if (
      typeof identifier !== 'string' ||
      typeof password !== 'string' ||
      identifier.trim().length === 0 ||
      password.length === 0 ||
      identifier.length > MAX_IDENTIFIER_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      res.status(400).json({ error: 'Username or email and password are required' });
      return;
    }

    const result = await authService.loginWithIdentifier(identifier.trim(), password);

    if (!result.ok) {
      if (result.reason === 'unavailable') {
        res.status(503).json({ error: 'Sign-in is temporarily unavailable' });
        return;
      }
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    res.json({ session: result.session });
  },

  /**
   * GET /api/auth/username-available?username=X — is this name free?
   *
   * Unauthenticated: the sign-up form asks before an account exists. Protocol
   * failures are `{ error }` with a status; product answers are always
   * `200 { available, reason }`. The reason is a code, never a sentence — the
   * words live in packages/shared so both platforms say the same thing.
   */
  async checkUsername(req: Request, res: Response) {
    const username = usernameInput(req.query.username);
    if (username === null) {
      res.status(400).json({ error: 'A username is required' });
      return;
    }

    const result = await usernameService.checkAvailability(username);

    // An answer that goes stale in seconds must never be served from a cache.
    res.set('Cache-Control', 'no-store');
    if (!result.ok) {
      res.status(503).json({ error: 'Username check is temporarily unavailable' });
      return;
    }
    res.json({ available: result.available, reason: result.reason });
  },

  /**
   * POST /api/auth/username — claim a username for the signed-in user, once.
   *
   * Product answers are `200 { claimed, reason }`, including `already-chosen`,
   * which a client treats as done (a second tab, a double tap) rather than as
   * a failure.
   */
  async claimUsername(req: AuthRequest, res: Response) {
    const username = usernameInput((req.body as { username?: unknown } | undefined)?.username);
    if (username === null || !req.userId) {
      res.status(400).json({ error: 'A username is required' });
      return;
    }

    const result = await usernameService.claim(req.userId, username);

    if (!result.ok) {
      res.status(503).json({ error: 'Choosing a username is temporarily unavailable' });
      return;
    }
    res.json(result.claimed ? { claimed: true, reason: 'ok' } : { claimed: false, reason: result.reason });
  },
};
