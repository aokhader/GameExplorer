// Security audit v2, Wave 1 — the two findings whose regression test is a guard
// rather than an exploit.
//
//   GX-05  `pool.on('error') → process.exit(-1)`. `pg` emits that event on an
//          IDLE client, which happens routinely when Supabase's pooler recycles
//          a connection. No attacker needed: a normal, self-healing event was
//          restarting the instance, and because Redis is colocated with
//          persistence off, each restart destroyed every live game.
//   GX-09  engine.io / ws / socket.io-parser carried 5 DoS and memory-disclosure
//          advisories. Fixed by version floors in the root package.json's
//          pnpm.overrides, which this pins so a future install cannot silently
//          resolve back under them.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

describe('GX-05 · a Postgres pool error must not kill the process', () => {
  it('the pool error handler does not call process.exit', () => {
    // Asserted against the source because triggering a real idle-client error
    // needs a live Postgres connection, which this suite deliberately has no
    // credentials for.
    const src = readFileSync(join(__dirname, '../config/database.ts'), 'utf8');

    const handler = /pool\.on\(\s*['"]error['"][\s\S]*?\n\}\);/.exec(src)?.[0];
    expect(handler, 'pool error handler not found — did the file move?').toBeDefined();
    expect(handler).not.toMatch(/process\.exit/);
    // It must still be observable, or a recurring connection fault goes unnoticed.
    expect(handler).toMatch(/console\.(error|warn)|logger\./);
  });
});

describe('GX-09 · websocket stack stays above the advisory floors', () => {
  // GHSA-gr94-w7qr-f4j3 and GHSA-r635-g3xr-vw7x (engine.io, HIGH, both fixed in
  // 6.6.7); GHSA-2m8v-j782-fhvr (socket.io-parser, HIGH, fixed in 4.2.7);
  // GHSA-96hv-2xvq-fx4p (ws, HIGH, fixed in 8.21.0) and GHSA-58qx-3vcg-4xpx
  // (ws, MODERATE, fixed in 8.20.1).
  const floors: Array<[string, string]> = [
    ['engine.io', '6.6.7'],
    ['socket.io-parser', '4.2.7'],
  ];

  /**
   * Node's own package lookup, done by hand: walk up from `fromDir` until a
   * `node_modules/<pkg>/package.json` turns up. `require.resolve` cannot be used
   * because these packages declare `exports` without a `./package.json` entry.
   */
  function manifestPath(pkg: string, fromDir: string): string | null {
    let dir = fromDir;
    for (;;) {
      const candidate = join(dir, 'node_modules', pkg, 'package.json');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  function versionOf(pkg: string, fromDir: string = __dirname): { version: string; dir: string } {
    const manifest = manifestPath(pkg, fromDir);
    expect(manifest, `${pkg} is not installed anywhere above ${fromDir}`).not.toBeNull();
    return {
      version: JSON.parse(readFileSync(manifest!, 'utf8')).version as string,
      dir: dirname(manifest!),
    };
  }

  function atLeast(actual: string, floor: string): boolean {
    const a = actual.split('.').map(Number);
    const f = floor.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((a[i] ?? 0) !== (f[i] ?? 0)) return (a[i] ?? 0) > (f[i] ?? 0);
    }
    return true;
  }

  it.each(floors)('%s is at least %s', (pkg, floor) => {
    const { version } = versionOf(pkg);
    expect(atLeast(version, floor), `${pkg}@${version} is below ${floor}`).toBe(true);
  });

  it('the ws that engine.io actually loads is at least 8.21.0', () => {
    // Resolved starting from engine.io's own directory rather than from the
    // workspace root: the repo still carries an older ws on the Metro/devtools
    // side, which is dev-only and outside this floor.
    const engineIo = versionOf('engine.io');
    const { version } = versionOf('ws', engineIo.dir);
    expect(atLeast(version, '8.21.0'), `ws@${version} is below 8.21.0`).toBe(true);
  });
});
