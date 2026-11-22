// What each entry point may load, checked by walking the real import graph.
//
//   - The root (`.`) is imported by both clients: no zod, no engines. Metro
//     does not tree-shake, so anything reachable from it ships on every boot.
//   - `./schemas` may load zod and the protocol types, nothing more.
//   - `./adapters` may add the three engines' own modules, and nothing else
//     from packages/shared: the barrel carries the puzzle and lesson data and
//     fails the Workers typecheck (edge migration Phase 0, Q2).
//   - Source runs in a Worker, so no Node APIs, timers or wall clock; the
//     clock takes `now`, and the adapters must replay identically.
//
// Type-only imports are erased, so they are not followed, except that nothing
// may name the `@gameexplorer/shared` barrel even as a type: under the
// Worker's alias a type import still makes the typechecker load it.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_SRC = resolve(SRC, '../../shared/src');

interface Edge { specifier: string; typeOnly: boolean }

function importsOf(file: string): Edge[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const edges: Edge[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : null;
      const typeOnly = !!clause && (clause.isTypeOnly || (!clause.name && !!named && named.length > 0 && named.every(e => e.isTypeOnly)));
      edges.push({ specifier: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : null;
      const typeOnly = node.isTypeOnly || (!!named && named.length > 0 && named.every(e => e.isTypeOnly));
      edges.push({ specifier: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      edges.push({ specifier: arg && ts.isStringLiteral(arg) ? arg.text : '<dynamic>', typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

function resolveRelative(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(candidate)) return candidate;
  throw new Error(`cannot resolve ${specifier} from ${from}`);
}

/** Every file and bare package an entry loads at runtime. */
function runtimeGraph(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const stack = [resolve(SRC, entry)];
  while (stack.length) {
    const file = stack.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const { specifier, typeOnly } of importsOf(file)) {
      if (typeOnly) continue;
      if (specifier.startsWith('.')) stack.push(resolveRelative(file, specifier));
      else packages.add(specifier);
    }
  }
  const shared = [...files].filter(f => f.startsWith(SHARED_SRC)).map(f => relative(SHARED_SRC, f).replace(/\\/g, '/'));
  return { files, packages: [...packages].sort(), shared: shared.sort() };
}

/** Source files of this package, tests and test support excluded. */
function sourceFiles(): string[] {
  const all = runtimeGraph('index.ts').files;
  for (const entry of ['schemas.ts', 'adapters/index.ts']) for (const f of runtimeGraph(entry).files) all.add(f);
  return [...all].filter(f => f.startsWith(SRC));
}

describe('entry points load only what they should', () => {
  it('the root loads no zod, no engines, and nothing from packages/shared', () => {
    const { packages, shared, files } = runtimeGraph('index.ts');
    expect(packages).toEqual([]);
    expect(shared).toEqual([]);
    expect([...files].map(f => relative(SRC, f).replace(/\\/g, '/')).sort()).toEqual(['clock.ts', 'frames.ts', 'index.ts', 'timeControls.ts']);
  });

  it('./schemas loads zod and the protocol types only', () => {
    const { packages, shared } = runtimeGraph('schemas.ts');
    expect(packages).toEqual(['zod']);
    expect(shared).toEqual(['types/socket.types.ts']);
  });

  it('./adapters loads zod, the protocol types and the three engines’ own modules', () => {
    const { packages, shared } = runtimeGraph('adapters/index.ts');
    expect(packages).toEqual(['zod']);
    for (const file of shared) {
      expect(file).toMatch(/^(types\/socket\.types\.ts|game-logic\/(chess|checkers|reversi)\/(engine|utils|moves)\.ts)$/);
    }
    expect(shared).toContain('game-logic/reversi/engine.ts');
  });

  it('nothing names the @gameexplorer/shared barrel, even as a type', () => {
    const everything = [...sourceFiles(), ...runtimeGraph('adapters/index.ts').files];
    for (const file of everything) {
      for (const { specifier } of importsOf(file)) expect(specifier, file).not.toBe('@gameexplorer/shared');
    }
  });

  it('the conformance suite is not part of any entry point', () => {
    for (const f of sourceFiles()) expect(f).not.toMatch(/conformance\.ts$/);
  });
});

describe('source runs anywhere and replays identically', () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['wall clock', /\bDate\.now\s*\(|\bnew Date\s*\(/],
    ['randomness', /\bMath\.random\s*\(|\bcrypto\./],
    ['timers', /\bset(Timeout|Interval|Immediate)\s*\(/],
    ['Node globals', /\bprocess\.|\bBuffer\.|\brequire\s*\(|\b__dirname\b/],
    ['Node modules', /from\s+['"]node:/],
  ];
  const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(FORBIDDEN)('no %s in this package’s source or the engine modules it loads', (_label, pattern) => {
    const files = [...sourceFiles(), ...runtimeGraph('adapters/index.ts').files];
    for (const file of files) expect(strip(readFileSync(file, 'utf8')), relative(SRC, file)).not.toMatch(pattern);
  });
});
