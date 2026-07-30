/**
 * Guards the one rule the mobile theme switch depends on: **no module-scope token
 * capture**.
 *
 * The shared token objects are live views (see `packages/ui/src/themeRuntime.ts`),
 * so `COLORS.surface` returns the active theme's value — but only if it is read
 * during render. A module-scope `const bandStyle = { backgroundColor:
 * COLORS.surfaceAlt }` evaluates once at import and freezes on whichever theme
 * was active then, which in practice means Arcade Glow forever.
 *
 * That failure is invisible to typecheck and to every component test: the screen
 * renders fine, just in the wrong palette, and only on a device with the other
 * theme selected. Three real instances shipped past review during the Cozy
 * Tabletop work (`MoveBand.bandStyle`, home's `GAMES`, profile's `GAME_META`), so
 * the rule gets a test rather than a comment.
 */
import fs from 'fs';
import path from 'path';

const MOBILE_ROOT = path.resolve(__dirname, '../..');

// Only live views belong here. `LIQUIDATE_SEAT_COLORS`, its cozy twin and
// `LIQUIDATE_DECK_STYLE` are deliberately plain frozen data (the seat ramp has
// to keep `.length` and the array methods that wrap a seat index), so capturing
// them at module scope is correct and guarding them would fail honest code.
const TOKENS = [
  'COLORS', 'GAME_ACCENTS', 'BOARD_COLORS', 'CHECKERS_BOARD_COLORS',
  'REVERSI_BOARD_COLORS', 'LIQUIDATE_BOARD_COLORS', 'LIQUIDATE_PANEL_COLORS',
  'LIQUIDATE_SYSTEM_COLORS', 'CHESS_PIECE_STYLE',
  'CHECKERS_PIECE_STYLE', 'REVERSI_DISC_STYLE', 'SHADOWS_NATIVE',
  'GLOWS_NATIVE', 'GRADIENTS_NATIVE', 'FONTS',
];
const TOKEN_READ = new RegExp(`\\b(${TOKENS.join('|')})\\s*[.[]`);
const TOP_LEVEL_DECL = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*[:=]/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '__tests__', '.expo', 'android', 'ios'].includes(entry.name)) continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('tailwind.config')) {
      out.push(full);
    }
  }
  return out;
}

/** Net bracket depth a line contributes (string/comment contents are ignored). */
function depthDelta(line: string): number {
  const code = line.replace(/'[^']*'|"[^"]*"|`[^`]*`|\/\/.*$/g, '');
  let d = 0;
  for (const ch of code) {
    if (ch === '{' || ch === '[' || ch === '(') d++;
    else if (ch === '}' || ch === ']' || ch === ')') d--;
  }
  return d;
}

/** Top-level `const X = …` declarations whose value reads a themed token. */
function frozenCaptures(file: string): string[] {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const decl = TOP_LEVEL_DECL.exec(lines[i]);
    if (!decl) continue;
    // A function/arrow value is fine — its body runs at call time, i.e. render.
    if (lines[i].includes('=>') || lines[i].includes('function')) continue;
    // Walk the declaration to where its brackets close — a one-liner ends on its
    // own line, so we never spill into the component below it.
    const span: string[] = [];
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      span.push(lines[j]);
      depth += depthDelta(lines[j]);
      if (depth <= 0) break;
    }
    if (TOKEN_READ.test(span.join('\n'))) found.push(`${decl[1]} (line ${i + 1})`);
  }
  return found;
}

describe('no module-scope theme token capture', () => {
  it('reads every themed token during render, never at import', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(MOBILE_ROOT, 'src')).concat(
      sourceFiles(path.join(MOBILE_ROOT, 'app')),
    )) {
      for (const name of frozenCaptures(file)) {
        offenders.push(`${path.relative(MOBILE_ROOT, file)} :: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
