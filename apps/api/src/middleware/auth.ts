import { Request, Response, NextFunction } from 'express';
import type { JWTPayload } from 'jose';
import { verifySupabaseToken } from '../utils/verifyToken';
import { revocationService } from '../services/revocation.service';

/**
 * When the session behind a token last signed in, in Unix seconds, or null if
 * the token does not say.
 *
 * Supabase lists each way the session authenticated in the `amr` claim, with a
 * timestamp, and keeps those timestamps when it refreshes the token. So unlike
 * `iat`, which is renewed every hour, this is the moment someone last proved
 * who they were.
 */
export function signedInAt(payload: JWTPayload): number | null {
  const amr = (payload as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return null;
  const times = amr
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { timestamp?: unknown }).timestamp : undefined))
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  return times.length > 0 ? Math.max(...times) : null;
}

export interface AuthRequest extends Request {
  userId?: string;
  /** When the session behind the token last signed in (Unix seconds), or null if it does not say. */
  signedInAt?: number | null;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifySupabaseToken(token);
    // A deleted account's tokens still verify until they expire (GX-16).
    if (!payload.sub || revocationService.isRevoked(payload.sub)) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.userId = payload.sub;
    req.signedInAt = signedInAt(payload);
    next();
  } catch (err) {
    if (err instanceof Error && err.message === 'SUPABASE_URL is not set') {
      res.status(500).json({ error: 'Server misconfiguration' });
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
