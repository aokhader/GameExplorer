/**
 * The multiplayer requests carry no identity (security audit v2, GX-25).
 *
 * The play hook used to derive a display name from the local part of the
 * player's email address and send it with every queue, invite and accept
 * request. The server has ignored it since Wave 3 (it reads names from the
 * database), so what was left was personal data sent for no purpose.
 *
 * Source-level, like `import-boundary.test.ts`: this package has no React test
 * renderer, and what matters is that the tokens are gone from the code that
 * builds the payloads. Comments are stripped first so the explanation of the
 * old behaviour in the hook doesn't trip the scan.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks');

function code(file: string): string {
  return readFileSync(join(HOOKS, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const EMITS = /emit\(\s*'(join_queue|create_invite_link|accept_invite)'\s*,\s*\{[^}]*\}/g;

describe('multiplayer requests carry no identity', () => {
  for (const file of ['useGameSession.ts', 'useInvite.ts']) {
    it(`${file} derives nothing from the email address`, () => {
      expect(code(file)).not.toMatch(/\.email\b/);
    });

    it(`${file} sends no username with queue or invite requests`, () => {
      const payloads = [...code(file).matchAll(EMITS)].map((m) => m[0]);
      for (const payload of payloads) expect(payload).not.toMatch(/\busername\b/);
    });
  }

  it('finds the requests it is checking', () => {
    // Guards the regex: if the emit calls change shape, the checks above would
    // pass vacuously.
    const all = [...code('useGameSession.ts').matchAll(EMITS), ...code('useInvite.ts').matchAll(EMITS)];
    expect(all.map((m) => m[1]).sort()).toEqual(['accept_invite', 'create_invite_link', 'join_queue']);
  });
});
