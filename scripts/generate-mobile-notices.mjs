/**
 * Generates the mobile app's open-source notices from what actually ships.
 *
 *   cd apps/mobile
 *   npx expo export --platform android --source-maps --no-bytecode --output-dir <tmp>
 *   cd ../..
 *   node scripts/generate-mobile-notices.mjs <tmp>/_expo/static/js/android/entry-*.js.map
 *
 * Why a source map and not `pnpm licenses list --prod`: the dependency tree
 * includes Expo's CLI and build tooling (about 900 packages), most of which
 * never reach the phone. The source map of a production bundle lists exactly
 * the modules Metro put in it, so the notices describe the binary rather than
 * the lockfile.
 *
 * Adds the things a source map cannot see: the vendored Arasan engine, its
 * Fathom tablebase code and the wrapper module (native C++), the OFL font
 * files, and the CC0 content (chess piece art, Lichess puzzles).
 *
 * Writes apps/mobile/src/legal/notices.generated.ts. Identical licence texts
 * are stored once and referenced by index, which is most of the size saving.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps/mobile/src/legal/notices.generated.ts');
const LICENSE_FILES = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
const MIT_PERMISSION = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
const FIRST_PARTY = /^@gameexplorer\//;

const mapPath = process.argv[2];
if (!mapPath || !fs.existsSync(mapPath)) {
  console.error('usage: node scripts/generate-mobile-notices.mjs <android bundle .js.map>');
  process.exit(2);
}

/**
 * Package roots, as absolute paths, for every node_modules source in the
 * bundle. Metro writes sources relative to the monorepo root with a leading
 * slash (`/node_modules/react-native/…`); nested copies
 * (`react-native/node_modules/@react-native/…`) are separate roots.
 */
function packageRoots(map) {
  const roots = new Set();
  for (const source of map.sources) {
    const p = source.split('\\').join('/');
    const i = p.lastIndexOf('node_modules/');
    if (i < 0) continue;
    const parts = p.slice(i + 'node_modules/'.length).split('/');
    const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    roots.add(path.join(ROOT, p.slice(0, i + 'node_modules/'.length) + name));
  }
  return [...roots];
}

function readLicenseText(dir) {
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter((f) => LICENSE_FILES.test(f)).sort();
  // Font packages carry the OFL for the font files beside the MIT licence for the code.
  const fontLicense = fs.existsSync(path.join(dir, 'LICENSE_FONT')) ? ['LICENSE_FONT'] : [];
  const texts = [...names, ...fontLicense].map((f) =>
    fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim(),
  );
  return texts.length ? texts.join('\n\n') : null;
}

function licenseId(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
}

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const libraries = new Map();
const missing = [];
for (const root of packageRoots(map)) {
  const pkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    missing.push(path.relative(ROOT, root));
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const name = pkg.name ?? path.basename(root);
  if (FIRST_PARTY.test(name) || libraries.has(`${name}@${pkg.version}`)) continue;
  const license = licenseId(pkg);
  const author = (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name)?.replace(/\.$/, '');
  // A package that declares MIT but ships no licence file still needs the
  // permission notice to travel with it, so the standard text is supplied.
  const text =
    readLicenseText(root) ??
    `${name} does not include a licence file. Its package.json declares the ${license} licence` +
      (author ? `, author ${author}.` : '.') +
      (license === 'MIT' ? `\n\n${MIT_PERMISSION}` : '');
  libraries.set(`${name}@${pkg.version}`, { name, version: pkg.version ?? '', license, kind: 'library', text });
}
const entries = [...libraries.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);

// Native and content items a JavaScript source map cannot see.
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').trim();
// VENDORED.txt reads "arasan-chess <sha> (<date>) vendored"; a phone row wants it short.
const vendored = read('apps/mobile/modules/react-native-arasan/cpp/arasan/VENDORED.txt').split('\n')[0];
const [, sha, date] = vendored.match(/([0-9a-f]{40}) \(([^)]+)\)/) ?? [];
const vendoredCommit = sha ? `commit ${sha.slice(0, 7)} (${date})` : vendored;
entries.push(
  {
    name: 'Arasan chess engine and NNUE network',
    version: vendoredCommit,
    license: 'MIT',
    kind: 'engine',
    text: read('apps/mobile/modules/react-native-arasan/cpp/arasan/LICENSE'),
  },
  {
    name: 'Fathom tablebase probing code',
    version: 'vendored with Arasan',
    license: 'MIT',
    kind: 'engine',
    text: read('apps/mobile/modules/react-native-arasan/cpp/arasan/syzygy/LICENSE'),
  },
  {
    name: 'react-native-arasan (wrapper forked from @loloof64/react-native-stockfish)',
    version: 'local module',
    license: 'MIT',
    kind: 'engine',
    text: read('apps/mobile/modules/react-native-arasan/LICENSE'),
  },
  {
    name: 'Phosphor Icons (interface icon paths)',
    version: '2.1.1',
    license: 'MIT',
    kind: 'asset',
    text: read('LICENSES/phosphor-icons-MIT.txt'),
  },
  {
    name: 'DM Sans, Space Grotesk, Spectral and Nunito Sans (fonts)',
    version: 'via @expo-google-fonts',
    license: 'OFL-1.1',
    kind: 'asset',
    text: read('LICENSES/OFL-1.1.txt'),
  },
  {
    name: 'Chess piece shapes — "Merida" via Sashité',
    version: 'https://sashite.dev/assets/chess/',
    license: 'CC0-1.0',
    kind: 'content',
    text:
      'The chess piece vector paths are derived from the Sashité chess assets, released into ' +
      'the public domain under CC0 1.0 Universal. No attribution is required; this note is a ' +
      'courtesy. The coloring applied to them is GameExplorer’s own.',
  },
  {
    // Part of RESERVED_USERNAMES (packages/shared/src/username.ts), which ships
    // in the bundle as plain strings a source map attributes to first-party code.
    name: 'The Big Username Blocklist (part of the reserved-username list)',
    version: 'https://github.com/marteinn/The-Big-Username-Blocklist',
    license: 'MIT',
    kind: 'content',
    text: read('LICENSES/big-username-blocklist-MIT.txt'),
  },
  {
    name: 'Lichess open puzzle database (chess puzzles)',
    version: 'https://database.lichess.org/#puzzles',
    license: 'CC0-1.0',
    kind: 'content',
    text:
      'Chess puzzles whose source line names a Lichess puzzle id are derived from the Lichess ' +
      'open puzzle database, released by Lichess under CC0 1.0 Universal. No attribution is ' +
      'required; the credit on each puzzle, and this note, are a courtesy. Every other puzzle ' +
      'was composed or engine-generated for this app.',
  },
);

/**
 * Licence files are hard-wrapped at ~72 columns, which on a phone breaks every
 * line mid-sentence. Plain paragraphs are rejoined so the screen can wrap them;
 * any paragraph with list items, separators or indented layout is left exactly
 * as written. Only whitespace changes — never a word.
 */
function reflow(text) {
  return text
    .split(/\n\s*\n/)
    .map((para) => {
      const lines = para.split('\n');
      // Copyright lines are one holder each; joining them reads as one sentence.
      const structured = lines.some(
        (l) => /^\s*([-*•]|\d+[.)]|\([a-z0-9]+\)|[-=_]{4,}|copyright\b)/i.test(l) || /^\s{4,}\S/.test(l),
      );
      return structured || lines.length === 1 ? para : lines.map((l) => l.trim()).join(' ');
    })
    .join('\n\n');
}

// Store each distinct text once.
const texts = [];
const index = new Map();
const rows = entries.map(({ text: raw, ...rest }) => {
  const text = reflow(raw);
  if (!index.has(text)) {
    index.set(text, texts.length);
    texts.push(text);
  }
  return { ...rest, textIndex: index.get(text) };
});

const header = `/**
 * GENERATED by scripts/generate-mobile-notices.mjs — do not edit by hand.
 *
 * The open-source notices for what the mobile binary actually contains: every
 * third-party package in a production Android bundle (read from its source
 * map), plus the vendored engine, fonts, icons and CC0 content. Regenerate
 * after adding or upgrading a dependency.
 */
`;
const body =
  `${header}\n` +
  `export type NoticeKind = 'library' | 'engine' | 'asset' | 'content';\n\n` +
  `export interface Notice {\n  name: string;\n  version: string;\n  license: string;\n  kind: NoticeKind;\n  textIndex: number;\n}\n\n` +
  `export const NOTICES: readonly Notice[] = ${JSON.stringify(rows, null, 2)};\n\n` +
  `export const NOTICE_TEXTS: readonly string[] = ${JSON.stringify(texts, null, 2)};\n`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body.replace(/\r?\n/g, '\r\n'));
console.log(
  `${rows.length} notices (${rows.filter((r) => r.kind === 'library').length} libraries), ` +
    `${texts.length} distinct texts, ${Math.round(body.length / 1024)} KB → ${path.relative(ROOT, OUT)}`,
);
if (missing.length) console.warn(`No package.json found for: ${missing.join(', ')}`);
const licenses = {};
for (const r of rows) licenses[r.license] = (licenses[r.license] ?? 0) + 1;
console.log(licenses);
