// The username endpoints' HTTP contract: protocol failures are `{ error }` with
// a status, product answers are 200 with a reason code. Plain function calls
// with a fake `res` — there is no supertest in this repo.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';

const mocks = vi.hoisted(() => ({
  checkAvailability: vi.fn(),
  claim: vi.fn(),
}));

vi.mock('../../services/username.service', () => ({
  usernameService: { checkAvailability: mocks.checkAvailability, claim: mocks.claim },
}));
vi.mock('../../services/auth.service', () => ({
  authService: { loginWithIdentifier: vi.fn() },
}));

import { authController } from '../auth.controller';

function mockRes() {
  const out = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status: vi.fn((code: number) => {
      out.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      out.body = body;
      return res;
    }),
    set: vi.fn((name: string, value: string) => {
      out.headers[name] = value;
      return res;
    }),
  };
  return { res: res as unknown as Response, out };
}

const checkReq = (query: Record<string, unknown>) => ({ query }) as unknown as Request;
const claimReq = (body: unknown, userId: string | undefined = 'user-1') =>
  ({ body, userId }) as unknown as AuthRequest;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkAvailability.mockResolvedValue({ ok: true, available: true, reason: 'ok' });
  mocks.claim.mockResolvedValue({ ok: true, claimed: true });
});

describe('GET /api/auth/username-available', () => {
  it.each([
    ['missing', {}],
    ['empty', { username: '' }],
    ['an array (?username[]=a)', { username: ['a', 'b'] }],
    ['an object (?username[x]=a)', { username: { x: 'a' } }],
    ['over 64 characters', { username: 'a'.repeat(65) }],
  ])('answers 400 when the username is %s, without calling the service', async (_label, query) => {
    const { res, out } = mockRes();
    await authController.checkUsername(checkReq(query), res);
    expect(out.statusCode).toBe(400);
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
  });

  it('passes a 64-character name through — the service owns the 20-character rule', async () => {
    const { res } = mockRes();
    await authController.checkUsername(checkReq({ username: 'a'.repeat(64) }), res);
    expect(mocks.checkAvailability).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('answers 200 with the reason code, uncached', async () => {
    mocks.checkAvailability.mockResolvedValue({ ok: true, available: false, reason: 'taken' });
    const { res, out } = mockRes();

    await authController.checkUsername(checkReq({ username: 'bob' }), res);

    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual({ available: false, reason: 'taken' });
    expect(out.headers['Cache-Control']).toBe('no-store');
  });

  it('answers 503 when the service could not look', async () => {
    mocks.checkAvailability.mockResolvedValue({ ok: false, reason: 'unavailable' });
    const { res, out } = mockRes();

    await authController.checkUsername(checkReq({ username: 'bob' }), res);

    expect(out.statusCode).toBe(503);
    expect(out.body).toEqual({ error: expect.any(String) });
  });
});

describe('POST /api/auth/username', () => {
  it('answers 200 claimed for a successful claim', async () => {
    const { res, out } = mockRes();
    await authController.claimUsername(claimReq({ username: 'New_Name' }), res);
    expect(mocks.claim).toHaveBeenCalledWith('user-1', 'New_Name');
    expect(out.body).toEqual({ claimed: true, reason: 'ok' });
  });

  it('answers 200 with the reason when the name is refused', async () => {
    mocks.claim.mockResolvedValue({ ok: true, claimed: false, reason: 'already-chosen' });
    const { res, out } = mockRes();
    await authController.claimUsername(claimReq({ username: 'New_Name' }), res);
    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual({ claimed: false, reason: 'already-chosen' });
  });

  it.each([
    ['no body', undefined],
    ['a non-string username', { username: 42 }],
    ['an over-long username', { username: 'a'.repeat(65) }],
  ])('answers 400 for %s', async (_label, body) => {
    const { res, out } = mockRes();
    await authController.claimUsername(claimReq(body), res);
    expect(out.statusCode).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('answers 503 when the service is unavailable', async () => {
    mocks.claim.mockResolvedValue({ ok: false, reason: 'unavailable' });
    const { res, out } = mockRes();
    await authController.claimUsername(claimReq({ username: 'New_Name' }), res);
    expect(out.statusCode).toBe(503);
  });
});
