import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Stockfish builds are third-party binaries run in every visitor's browser.
 * `CHECKSUMS.txt` records what was checked against the npm package they came
 * from (see the README beside them), and this fails if a file changes without
 * its line (security audit v2, GX-23).
 */

const DIR = join(__dirname, '../../public/stockfish');
const NOT_ENGINE = new Set(['README.md', 'CHECKSUMS.txt']);

function listed(): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(join(DIR, 'CHECKSUMS.txt'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
    expect(match, `malformed line: ${line}`).not.toBeNull();
    out.set(match![2], match![1]);
  }
  return out;
}

describe('vendored Stockfish', () => {
  it('matches its recorded checksums', () => {
    for (const [file, sha] of listed()) {
      const actual = createHash('sha256').update(readFileSync(join(DIR, file))).digest('hex');
      expect(actual, file).toBe(sha);
    }
  });

  it('has no file without a checksum', () => {
    const files = readdirSync(DIR).filter((name) => !NOT_ENGINE.has(name));
    expect(files.sort()).toEqual([...listed().keys()].sort());
  });

  it('loads only checked builds', () => {
    const engine = readFileSync(join(__dirname, '../lib/stockfishEngine.ts'), 'utf8');
    const paths = [...engine.matchAll(/'\/stockfish\/([^']+)'/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const script of paths) {
      expect(listed().has(script), script).toBe(true);
      expect(listed().has(script.replace(/\.js$/, '.wasm')), `${script}'s .wasm`).toBe(true);
    }
  });
});
