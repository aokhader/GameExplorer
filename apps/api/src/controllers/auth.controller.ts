import { Request, Response } from 'express';
import { authService } from '../services/auth.service';

/** Bound the inputs before they reach Supabase — these are unauthenticated. */
const MAX_IDENTIFIER_LENGTH = 320; // longest legal email address
const MAX_PASSWORD_LENGTH = 72; // bcrypt's ceiling

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
};
