/**
 * Which way an account signs in again before it is deleted (security audit v2,
 * GX-19). Getting this wrong strands someone: a password prompt for an account
 * that has no password can never succeed.
 */
import { describe, it, expect } from 'vitest';
import { ApiError } from '../apiFetch';
import { needsReauth, reauthMethodFor } from '../reauth';

describe('reauthMethodFor', () => {
  it('asks a password account for its password', () => {
    expect(reauthMethodFor({ email: 'a@example.com', app_metadata: { provider: 'email', providers: ['email'] } }))
      .toEqual({ kind: 'password', email: 'a@example.com' });
  });

  it.each(['google', 'facebook', 'apple'] as const)('sends a %s account back through its provider', (provider) => {
    expect(reauthMethodFor({ email: 'a@example.com', app_metadata: { provider, providers: [provider] } }))
      .toEqual({ kind: 'provider', provider });
  });

  it('prefers the password when an account has both', () => {
    expect(reauthMethodFor({ email: 'a@example.com', app_metadata: { provider: 'google', providers: ['google', 'email'] } }))
      .toEqual({ kind: 'password', email: 'a@example.com' });
  });

  it('reads the single provider field when the list is missing', () => {
    expect(reauthMethodFor({ app_metadata: { provider: 'apple' } })).toEqual({ kind: 'provider', provider: 'apple' });
  });

  it('falls back to signing out and in for anything else', () => {
    expect(reauthMethodFor({ app_metadata: { providers: ['github'] } })).toEqual({ kind: 'sign-out' });
    expect(reauthMethodFor({ app_metadata: { providers: ['email'] } })).toEqual({ kind: 'sign-out' }); // no email to sign in with
    expect(reauthMethodFor(null)).toEqual({ kind: 'sign-out' });
  });
});

describe('needsReauth', () => {
  it('is true only for the API refusing for want of a recent sign-in', () => {
    expect(needsReauth(new ApiError('sign in again', 403, 'REAUTH_REQUIRED'))).toBe(true);
    expect(needsReauth(new ApiError('nope', 403))).toBe(false);
    expect(needsReauth(new Error('REAUTH_REQUIRED'))).toBe(false);
  });
});
