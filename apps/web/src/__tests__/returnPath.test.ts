import { describe, expect, it } from 'vitest';
import { parentPath, safeReturnPath } from '../lib/returnPath';

/**
 * `?next=` and `?back=` arrive in a link anyone can write, and the sign-in
 * pages follow them with a fresh session in hand. The checks below are the
 * ways a return path has reached another site (security audit v2, GX-11).
 */

const SITE = 'https://site.example';

/** Where a browser would actually go if handed `path` on this site. */
const landsOn = (path: string) => new URL(path, `${SITE}/auth/signin`).origin;

const OFF_SITE = [
  '//evil.example',
  '/\\evil.example',
  '/\\/evil.example',
  // Dot segments are resolved after the origin is settled, so these keep this
  // site's origin while their path comes out as `//evil.example`.
  '/.//evil.example',
  '/..//evil.example',
  '/a/..//evil.example',
  '/a/b/../..//evil.example',
  '/%2e//evil.example',
  '/%2E%2E//evil.example',
  '/.\\/evil.example',
  '/./\\evil.example',
  // The parser drops tabs and newlines anywhere in the input.
  '/\t/evil.example',
  '/\n/evil.example',
  '/.\t//evil.example',
  '/./\n/evil.example',
  '//@evil.example',
  'https://evil.example',
  'https:evil.example',
  'http:/evil.example',
  'javascript:alert(1)',
  ' /evil.example',
];

describe('safeReturnPath', () => {
  it.each(OFF_SITE)('refuses %j', (raw) => {
    expect(safeReturnPath(raw)).toBeNull();
  });

  it('never returns a path that leaves the site', () => {
    const hostile = [...OFF_SITE, '/%2F%2Fevil.example', '/@evil.example', '/chess//evil.example'];
    for (const raw of hostile) {
      const out = safeReturnPath(raw);
      if (out === null) continue;
      expect(out.startsWith('//'), raw).toBe(false);
      expect(landsOn(out), raw).toBe(SITE);
    }
  });

  it('refuses a backslash anywhere, even one the parser would read as a slash', () => {
    expect(safeReturnPath('/chess\\play')).toBeNull();
  });

  it.each(['/auth', '/auth/signin', '/auth/signup?next=/chess', '/chess/../auth/signin', '/./auth/choose-username'])(
    'refuses the auth page %j',
    (raw) => {
      expect(safeReturnPath(raw)).toBeNull();
    },
  );

  it.each([null, undefined, '', 'chess', '?next=/chess', '#top'])('refuses %j', (raw) => {
    expect(safeReturnPath(raw)).toBeNull();
  });

  it.each([
    ['/chess', '/chess'],
    ['/chess/play?invite=0b8f2c1e-2f7c-4b7b-9a51-6a2d7c3e9f10', '/chess/play?invite=0b8f2c1e-2f7c-4b7b-9a51-6a2d7c3e9f10'],
    ['/chess/analysis?gameId=abc&ply=12', '/chess/analysis?gameId=abc&ply=12'],
    ['/spectate/some-game', '/spectate/some-game'],
    ['/profile#ratings', '/profile#ratings'],
    ['/', '/'],
    // A dot segment that stays on the site is resolved, not refused.
    ['/learn/../chess', '/chess'],
  ])('keeps %j', (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });
});

describe('parentPath', () => {
  it.each([
    ['/chess/training', '/chess'],
    ['/spectate/abc?x=1', '/spectate'],
    ['/profile', '/'],
    ['/', '/'],
  ])('%j → %j', (path, expected) => {
    expect(parentPath(path)).toBe(expected);
  });
});
