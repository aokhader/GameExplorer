import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The site's content security policy has to allow inline script (Next's own
 * hydration scripts cannot carry a nonce on a static page), so it cannot stop
 * an injected script. What stops one is having nowhere to inject it: no raw
 * HTML reaches the page except the theme bootstrap, which is a build-time
 * constant. The session sits in cookies scripts can read, so one sink rendering
 * a username or a chat line is an account takeover (security audit v2, WS6-02).
 */

const ROOT = join(__dirname, '../../../..');
const SCANNED = ['apps/web/src', 'packages/client/src', 'packages/ui/src', 'packages/shared/src'];
const ALLOWED = new Set(['apps/web/src/app/layout.tsx']);
const SINK = /dangerouslySetInnerHTML|\.(inner|outer)HTML\s*=|insertAdjacentHTML|document\.write/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'node_modules' || name === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('raw HTML sinks', () => {
  it('exist only where the theme bootstrap is written', () => {
    const found = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((file) => SINK.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'));
    expect(found.filter((file) => !ALLOWED.has(file))).toEqual([]);
    // If the bootstrap moves, move the allowance with it rather than widening it.
    expect(found).toEqual([...ALLOWED]);
  });
});
