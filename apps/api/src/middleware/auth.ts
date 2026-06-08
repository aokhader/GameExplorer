import { Request, Response, NextFunction } from 'express';
import { verifySupabaseToken } from '../utils/verifyToken';

export interface AuthRequest extends Request {
  userId?: string;
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
    req.userId = payload.sub;
    next();
  } catch (err) {
    if (err instanceof Error && err.message === 'SUPABASE_URL is not set') {
      res.status(500).json({ error: 'Server misconfiguration' });
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
