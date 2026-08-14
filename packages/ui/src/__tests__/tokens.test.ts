/**
 * Token/theme invariants for `@gameexplorer/ui`.
 *
 * Why this file exists: `packages/ui` had no test runner at all, so turbo skipped
 * it and nothing in CI touched the token layer. The two guards that do exist
 * (`noFrozenTokens`, `themeRuntime`) live inside the *mobile* Jest project and
 * scan only `apps/mobile`, which leaves the shared package — where a mistake hits
 * BOTH platforms — uncovered.
 *
 * These tests import the token modules directly rather than the barrel: the
 * barrel also exports the piece components, and pulling React/React-Native
 * renderers in here would buy nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { setActiveTheme, getActiveTheme, liveView, type ThemeName } from '../themeRuntime';
import { COLORS, THEMES, GAME_ACCENTS, SHADOWS_NATIVE, GLOWS_NATIVE, GRADIENTS_NATIVE } from '../tokens';
import { BOARD_COLORS, CHESS_PIECE_STYLE } from '../chess/tokens';
import { CHECKERS_BOARD_COLORS, CHECKERS_PIECE_STYLE } from '../checkers/tokens';
import { REVERSI_BOARD_COLORS, REVERSI_DISC_STYLE } from '../reversi/tokens';
import {
  LIQUIDATE_BOARD_COLORS,
  LIQUIDATE_PANEL_COLORS,
  LIQUIDATE_SYSTEM_COLORS,
} from '../liquidate/tokens';

const THEME_NAMES: ThemeName[] = ['dark', 'cozy'];

/** Every `liveView`-backed export, by the name a failure should report. */
const LIVE_VIEWS: Record<string, object> = {
  COLORS,
  GAME_ACCENTS,
  SHADOWS_NATIVE,
  GLOWS_NATIVE,
  GRADIENTS_NATIVE,
  BOARD_COLORS,
  CHESS_PIECE_STYLE,
  CHECKERS_BOARD_COLORS,
  CHECKERS_PIECE_STYLE,
  REVERSI_BOARD_COLORS,
  REVERSI_DISC_STYLE,
  LIQUIDATE_BOARD_COLORS,
  LIQUIDATE_PANEL_COLORS,
  LIQUIDATE_SYSTEM_COLORS,
};

/** Dotted paths of every leaf that reads back `undefined`. */
function undefinedLeaves(value: unknown, trail: string, out: string[] = []): string[] {
  if (value === undefined) {
    out.push(trail);
    return out;
  }
  if (value === null || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    undefinedLeaves(child, trail ? `${trail}.${key}` : key, out);
  }
  return out;
}

// Tests mutate module-level theme state; leaving it switched would silently
// change what every later test in the file reads.
afterEach(() => setActiveTheme('dark'));

describe('theme completeness', () => {
  // Without this, the sweep below would still pass if `undefinedLeaves` were
  // broken and simply never reported anything.
  it('has a detector that actually finds a hole', () => {
    expect(undefinedLeaves({ a: '#fff', nested: { b: undefined } }, 'T')).toEqual(['T.nested.b']);
  });

  it('defines the same semantic palette keys in every theme', () => {
    const dark = Object.keys(THEMES.dark).sort();
    const cozy = Object.keys(THEMES.cozy).sort();
    expect(cozy).toEqual(dark);
  });

  it.each(THEME_NAMES)('resolves every token to a real value under %s', (theme) => {
    setActiveTheme(theme);
    const missing: string[] = [];
    for (const [name, view] of Object.entries(LIVE_VIEWS)) {
      missing.push(...undefinedLeaves(view, name));
    }
    // A key present in `dark` but absent from `cozy` reads back undefined —
    // which paints as "no colour" rather than failing, so only a test catches it.
    expect(missing).toEqual([]);
  });
});

describe('liveView', () => {
  it('tracks setActiveTheme without the call site changing', () => {
    setActiveTheme('dark');
    const darkSurface = COLORS.surface;
    setActiveTheme('cozy');
    const cozySurface = COLORS.surface;

    expect(typeof darkSurface).toBe('string');
    expect(typeof cozySurface).toBe('string');
    // Cozy Tabletop is a light parchment theme; its surface cannot be the dark one.
    expect(cozySurface).not.toBe(darkSurface);

    setActiveTheme('dark');
    expect(COLORS.surface).toBe(darkSurface);
  });

  it('reports the active theme name', () => {
    setActiveTheme('cozy');
    expect(getActiveTheme()).toBe('cozy');
    setActiveTheme('dark');
    expect(getActiveTheme()).toBe('dark');
  });

  /**
   * Pins the sharp edge in `liveView`: it enumerates `Object.keys(byTheme.dark)`,
   * so a key that exists only in the cozy block is dropped with no error. Adding
   * a token therefore means adding it to `dark` FIRST — cozy-only is invisible.
   */
  it('takes its key set from the dark block, silently dropping cozy-only keys', () => {
    const view = liveView({
      dark: { shared: 'a' },
      cozy: { shared: 'b', cozyOnly: 'c' } as unknown as { shared: string },
    });

    setActiveTheme('cozy');
    expect(view.shared).toBe('b');
    expect(Object.keys(view)).toEqual(['shared']);
    expect((view as Record<string, unknown>).cozyOnly).toBeUndefined();
  });
});

/**
 * The same rule `apps/mobile/src/__tests__/noFrozenTokens.test.ts` enforces, applied
 * to the package the tokens actually live in. A module-scope capture here would
 * freeze the value for web and mobile at once, and render the wrong palette
 * without failing typecheck or any component test.
 */
describe('no module-scope theme token capture in packages/ui', () => {
  const UI_SRC = path.resolve(__dirname, '..');
  const TOKENS = [
    'COLORS', 'GAME_ACCENTS', 'BOARD_COLORS', 'CHECKERS_BOARD_COLORS',
    'REVERSI_BOARD_COLORS', 'LIQUIDATE_BOARD_COLORS', 'LIQUIDATE_PANEL_COLORS',
    'LIQUIDATE_SYSTEM_COLORS', 'CHESS_PIECE_STYLE', 'CHECKERS_PIECE_STYLE',
    'REVERSI_DISC_STYLE', 'SHADOWS_NATIVE', 'GLOWS_NATIVE', 'GRADIENTS_NATIVE',
  ];
  const TOKEN_READ = new RegExp(`\\b(${TOKENS.join('|')})\\s*[.[]`);
  const TOP_LEVEL_DECL = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*[:=]/;

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, out);
      // tokens.ts and the per-game token files DEFINE these names; only their
      // consumers can freeze them.
      else if (/\.tsx?$/.test(entry.name) && entry.name !== 'tokens.ts') out.push(full);
    }
    return out;
  }

  /** Net bracket depth a line contributes (string/comment contents ignored). */
  function depthDelta(line: string): number {
    const code = line.replace(/'[^']*'|"[^"]*"|`[^`]*`|\/\/.*$/g, '');
    let d = 0;
    for (const ch of code) {
      if (ch === '{' || ch === '[' || ch === '(') d++;
      else if (ch === '}' || ch === ']' || ch === ')') d--;
    }
    return d;
  }

  it('reads every themed token during render, never at import', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(UI_SRC)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const decl = TOP_LEVEL_DECL.exec(lines[i]);
        if (!decl) continue;
        // A function/arrow value is fine — its body runs at call time.
        if (lines[i].includes('=>') || lines[i].includes('function')) continue;
        const span: string[] = [];
        let depth = 0;
        for (let j = i; j < lines.length; j++) {
          span.push(lines[j]);
          depth += depthDelta(lines[j]);
          if (depth <= 0) break;
        }
        if (TOKEN_READ.test(span.join('\n'))) {
          offenders.push(`${path.relative(UI_SRC, file)} :: ${decl[1]} (line ${i + 1})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
