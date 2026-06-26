/**
 * Import-boundary smoke test for the shared client layer.
 *
 * `@gameexplorer/client` is consumed by apps/web (Next.js) today and apps/mobile
 * (React Native) later. For the mobile clone to reuse this layer verbatim, the
 * source must stay free of web-only dependencies: no `next/*`, no DOM globals
 * (window/document/navigator/localStorage/sessionStorage), and no `process.env`
 * (env is injected via config.ts setApiUrl(), not read from the global).
 *
 * This test scans every source file under packages/client/src and fails CI if
 * any forbidden token leaks. It is the concrete proof — per the cross-over plan's
 * verification step 5 — that the layer is mobile-ready BEFORE the native build.
 *
 * Comments and string-embedded URLs ("http://…") are stripped first so the doc
 * comments above (which mention these very tokens) don't trip the scan.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Recursively collect .ts/.tsx files, skipping this __tests__ directory. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Remove block comments, line comments, and ://-style URLs so only real code is scanned. */
function stripCommentsAndUrls(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(?<!:)\/\/.*$/gm, ''); // line comments (but not the // in http://)
}

// label → regex matching ACTUAL usage of a web-only dependency.
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: "next/* import", pattern: /from\s+['"]next(?:\/|['"])|require\(\s*['"]next/ },
  { label: 'window.*', pattern: /\bwindow\s*\./ },
  { label: 'document.*', pattern: /\bdocument\s*\./ },
  { label: 'navigator.*', pattern: /\bnavigator\s*\./ },
  { label: 'localStorage', pattern: /\blocalStorage\b/ },
  { label: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { label: 'process.env', pattern: /\bprocess\s*\.\s*env\b/ },
];

describe('packages/client import boundary', () => {
  const files = collectSourceFiles(SRC_DIR);

  it('scans at least the known source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('contains no web-only dependencies (mobile-ready)', () => {
    const violations: string[] = [];

    for (const file of files) {
      const code = stripCommentsAndUrls(readFileSync(file, 'utf8'));
      for (const { label, pattern } of FORBIDDEN) {
        if (pattern.test(code)) {
          violations.push(`${file}: ${label}`);
        }
      }
    }

    expect(violations, `Web-only dependency leaked into @gameexplorer/client:\n${violations.join('\n')}`).toEqual([]);
  });
});
