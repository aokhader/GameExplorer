// Which limiter guards which username route. A mix-up here is invisible in every
// other test and only shows up in production: put the availability check on
// authLimiter and a person typing in the sign-up form locks themselves out of
// signing in.
import { describe, it, expect, vi } from 'vitest';
import type { Router } from 'express';

vi.mock('../services/username.service', () => ({ usernameService: {} }));
vi.mock('../services/auth.service', () => ({ authService: {} }));

import authRoutes from '../routes/auth.routes';
import { authLimiter, strictLimiter, usernameCheckLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { escapeLike } from '../utils/escapeLike';

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } };

function handlers(method: string, path: string): unknown[] {
  const layer = ((authRoutes as unknown as Router).stack as unknown as Layer[]).find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer?.route) throw new Error(`no ${method.toUpperCase()} ${path} route`);
  return layer.route.stack.map((s) => s.handle);
}

describe('username routes', () => {
  it('guards the availability check with its own limiter, never authLimiter', () => {
    const chain = handlers('get', '/username-available');
    expect(chain).toContain(usernameCheckLimiter);
    expect(chain).not.toContain(authLimiter);
    expect(chain).not.toContain(requireAuth);
  });

  it('keeps authLimiter on sign-in', () => {
    expect(handlers('post', '/login')).toContain(authLimiter);
  });

  it('rate-limits the claim before authenticating it', () => {
    const chain = handlers('post', '/username');
    expect(chain.indexOf(strictLimiter)).toBeGreaterThanOrEqual(0);
    expect(chain.indexOf(strictLimiter)).toBeLessThan(chain.indexOf(requireAuth));
  });
});

describe('escapeLike', () => {
  it('escapes all three LIKE metacharacters and nothing else', () => {
    expect(escapeLike('b_b')).toBe('b\\_b');
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('plain')).toBe('plain');
  });
});
