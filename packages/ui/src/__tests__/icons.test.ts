/**
 * The vendored icon set stays whole, drawable and accounted for.
 *
 * `paths.ts` is generated data from a third-party package. Three things can go
 * wrong with it and none would fail a type-check: a path pasted wrongly (an icon
 * that draws nothing), two names pointing at the same drawing (an icon that
 * says the wrong thing), and the licence record drifting from what was vendored.
 * The last matters here specifically — this repo's diligence rule is that every
 * link in a licence chain is recorded and checkable.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { ICON_PATHS, ICON_VIEWBOX } from '../icons/paths';

const REPO = path.resolve(__dirname, '../../../..');

describe('icon path data', () => {
  it('draws every icon on the 256 viewBox Phosphor authors in', () => {
    expect(ICON_VIEWBOX).toBe('0 0 256 256');
  });

  it('gives every icon a single well-formed path', () => {
    for (const [name, d] of Object.entries(ICON_PATHS)) {
      expect(d, name).toMatch(/^M/);
      expect(d, name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\-\s]+$/);
    }
  });

  it('never maps two names to the same drawing', () => {
    const seen = new Map<string, string>();
    for (const [name, d] of Object.entries(ICON_PATHS)) {
      expect(seen.get(d), `${name} duplicates ${seen.get(d)}`).toBeUndefined();
      seen.set(d, name);
    }
  });
});

describe('icon licence record', () => {
  const vendored = fs.readFileSync(path.join(REPO, 'packages/ui/src/icons/VENDORED.txt'), 'utf8');
  const header = fs.readFileSync(path.join(REPO, 'packages/ui/src/icons/paths.ts'), 'utf8');

  it('names the same package version in the data and the record', () => {
    const version = /@phosphor-icons\/core` (\d+\.\d+\.\d+)/.exec(header)?.[1];
    expect(version).toBeDefined();
    expect(vendored).toContain(`@phosphor-icons/core ${version} (npm)`);
  });

  it('ships the MIT licence text it cites, and lists the asset', () => {
    const licence = fs.readFileSync(path.join(REPO, 'LICENSES/phosphor-icons-MIT.txt'), 'utf8');
    expect(licence).toMatch(/^MIT License/);
    expect(licence).toContain('Phosphor Icons');
    expect(fs.readFileSync(path.join(REPO, 'LICENSE.md'), 'utf8')).toContain('LICENSES/phosphor-icons-MIT.txt');
  });
});
