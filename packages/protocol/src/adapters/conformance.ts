// The rules every online game adapter keeps, as checks any test runner can
// run. Seating a new game online means writing its adapter and a fixture,
// then getting every check here to pass.
//
// Framework-free on purpose: each check is a name and a function that throws
// on failure, so the same suite can run under Node's Vitest today and inside
// the Workers runtime later. Not exported from the adapters index; tests
// import it by path.
import type { GameOver, OnlineGameAdapter } from './types';
import type { PlayerColor } from '../sharedTypes';

export interface ConformanceFixture {
  /** The side the opening position gives the move to. */
  firstToMove: PlayerColor;
  /**
   * Legal games from the opening position, as actions. The mover of each is
   * whoever `sideToMove` names at that point, so forced passes need no entry.
   */
  lines: ReadonlyArray<ReadonlyArray<unknown>>;
  /** Games that end, and the result each must report on its last action. */
  endings: ReadonlyArray<{ line: ReadonlyArray<unknown>; gameOver: GameOver }>;
  /** Well-formed actions the opening position does not allow. */
  illegal: ReadonlyArray<unknown>;
  /**
   * Actions with an off-board square, a missing or extra-typed field, or
   * another game's shape. All must fail `actionSchema`.
   */
  malformed: ReadonlyArray<unknown>;
}

export interface ConformanceCheck {
  name: string;
  run(): void;
}

/** Shapes no adapter may accept, whatever its game. */
export const ALWAYS_MALFORMED: ReadonlyArray<unknown> = [undefined, null, 'x', 7, true, [], {}, { type: 'pass' }];

// ── Helpers ───────────────────────────────────────────────────────────────────

class ConformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConformanceError';
  }
}

function fail(message: string): never {
  throw new ConformanceError(message);
}

function show(value: unknown): string {
  if (value === undefined) return 'undefined';
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

/**
 * A deep copy that keeps `undefined` values and refuses anything JSON cannot
 * hold, so it doubles as the "states are plain JSON" check.
 */
function plainCopy(value: unknown, path = 'state'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || value === undefined) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} is ${value}, which JSON cannot hold`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => {
      if (v === undefined) fail(`${path}[${i}] is undefined, which JSON turns into null`);
      return plainCopy(v, `${path}[${i}]`);
    });
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail(`${path} is a ${proto?.constructor?.name ?? 'non-plain'} object`);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = plainCopy(v, `${path}.${k}`);
    return out;
  }
  return fail(`${path} is a ${typeof value}`);
}

/** Deep equality that tells a missing key from one set to `undefined`. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Object.hasOwn(b, k) && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

interface Step {
  before: unknown;
  action: unknown;
  mover: PlayerColor;
  after: unknown;
  gameOver: GameOver | null;
}

/** Plays `line` from the opening position, failing on the first refused action. */
function play(adapter: OnlineGameAdapter, line: ReadonlyArray<unknown>): Step[] {
  let state = adapter.newGame(adapter.optionsSchema.parse({}));
  const steps: Step[] = [];
  line.forEach((action, i) => {
    const mover = adapter.sideToMove(state);
    if (mover === null) fail(`no side to move before action ${i} ${show(action)}`);
    const r = adapter.apply(state, mover, action);
    if (!r.ok) fail(`action ${i} ${show(action)} for ${mover} was refused: ${r.reason}`);
    steps.push({ before: state, action, mover, after: r.state, gameOver: r.gameOver });
    state = r.state;
  });
  return steps;
}

function finalState(adapter: OnlineGameAdapter, steps: Step[]): unknown {
  return steps.length ? steps[steps.length - 1].after : adapter.newGame(adapter.optionsSchema.parse({}));
}

/** `apply` must refuse `action`, return a reason, and not throw. */
function expectRefused(adapter: OnlineGameAdapter, state: unknown, color: PlayerColor, action: unknown, what: string): string {
  let r: ReturnType<OnlineGameAdapter['apply']>;
  try {
    r = adapter.apply(state, color, action);
  } catch (err) {
    return fail(`${what} ${show(action)} threw instead of being refused: ${String(err)}`);
  }
  if (r.ok) fail(`${what} ${show(action)} was accepted`);
  if (typeof r.reason !== 'string' || r.reason.length === 0) fail(`${what} ${show(action)} was refused with no reason`);
  return r.reason;
}

const other = (c: PlayerColor): PlayerColor => (c === 'white' ? 'black' : 'white');

// ── The checks ────────────────────────────────────────────────────────────────

export function conformanceChecks(adapter: OnlineGameAdapter, fixture: ConformanceFixture): ConformanceCheck[] {
  const fresh = () => adapter.newGame(adapter.optionsSchema.parse({}));
  const allLines = [...fixture.lines, ...fixture.endings.map(e => e.line)];

  return [
    {
      name: 'the default options parse, and two new games are identical',
      run() {
        const parsed = adapter.optionsSchema.safeParse({});
        if (!parsed.success) fail('optionsSchema refuses {}');
        if (!sameValue(plainCopy(fresh()), plainCopy(adapter.newGame(parsed.data)))) fail('newGame is not deterministic');
      },
    },
    {
      name: `a new game has ${fixture.firstToMove} to move and no moves`,
      run() {
        const s = fresh();
        if (adapter.sideToMove(s) !== fixture.firstToMove) fail(`sideToMove is ${adapter.sideToMove(s)}, not ${fixture.firstToMove}`);
        if (adapter.moveCount(s) !== 0) fail(`moveCount is ${adapter.moveCount(s)}`);
        if (adapter.serializeMoves(s).length !== 0) fail('serializeMoves is not empty');
      },
    },
    {
      name: 'every fixture action passes actionSchema, and every malformed one fails it',
      run() {
        for (const line of allLines) {
          for (const a of line) if (!adapter.actionSchema.safeParse(a).success) fail(`actionSchema refuses legal ${show(a)}`);
        }
        for (const a of [...ALWAYS_MALFORMED, ...fixture.malformed]) {
          if (adapter.actionSchema.safeParse(a).success) fail(`actionSchema accepts malformed ${show(a)}`);
        }
      },
    },
    {
      name: 'states and stored moves are plain JSON, and a stored state plays like the original',
      run() {
        for (const line of allLines) {
          const steps = play(adapter, line);
          for (const [i, step] of steps.entries()) {
            plainCopy(step.after, `state after action ${i}`);
            plainCopy(adapter.serializeMoves(step.after), `serializeMoves after action ${i}`);
            // What storage hands back must make the same move the same way.
            // Step by step, so by induction the whole game survives storage.
            const stored = JSON.parse(JSON.stringify(step.before)) as unknown;
            if (adapter.sideToMove(stored) !== step.mover) fail(`a stored state changed the side to move before action ${i}`);
            const r = adapter.apply(stored, step.mover, step.action);
            if (!r.ok) fail(`a stored state refused action ${i} ${show(step.action)}: ${r.reason}`);
            if (JSON.stringify(r.state) !== JSON.stringify(step.after) || !sameValue(r.gameOver, step.gameOver)) {
              fail(`a stored state played action ${i} ${show(step.action)} differently`);
            }
          }
        }
      },
    },
    {
      name: 'apply mutates neither the state nor the action, accepted or refused',
      run() {
        // Walks the game itself rather than through `play`: a state `play`
        // has already handed to `apply` may already be the mutated one.
        const applyChecked = (state: unknown, color: PlayerColor, action: unknown) => {
          const stateBefore = plainCopy(state);
          const actionBefore = plainCopy(action, 'action');
          let r: ReturnType<OnlineGameAdapter['apply']> | null = null;
          try { r = adapter.apply(state, color, action); } catch { /* the refusal checks own throwing */ }
          if (!sameValue(plainCopy(state), stateBefore)) fail(`apply(${show(action)}) mutated the state`);
          if (!sameValue(plainCopy(action, 'action'), actionBefore)) fail(`apply(${show(action)}) mutated the action`);
          return r;
        };
        for (const line of allLines) {
          let state = fresh();
          for (const action of line) {
            const r = applyChecked(state, adapter.sideToMove(state) ?? fixture.firstToMove, action);
            if (!r?.ok) fail(`line action ${show(action)} was refused`);
            state = r.state;
          }
        }
        for (const action of [...fixture.illegal, ...fixture.malformed]) applyChecked(fresh(), fixture.firstToMove, action);
      },
    },
    {
      name: 'replaying the same actions gives byte-identical states',
      run() {
        for (const line of allLines) {
          const a = play(adapter, line).map(s => JSON.stringify(s.after));
          const b = play(adapter, line).map(s => JSON.stringify(s.after));
          a.forEach((text, i) => { if (text !== b[i]) fail(`replay diverges at action ${i}`); });
        }
      },
    },
    {
      name: 'every move counts, and every counted move is stored',
      run() {
        for (const line of allLines) {
          let count = 0;
          for (const [i, step] of play(adapter, line).entries()) {
            const next = adapter.moveCount(step.after);
            if (next <= count) fail(`moveCount did not grow at action ${i} (${count} → ${next})`);
            const stored = adapter.serializeMoves(step.after).length;
            if (stored !== next) fail(`serializeMoves has ${stored} entries at action ${i}, moveCount ${next}`);
            count = next;
          }
        }
      },
    },
    {
      name: 'malformed and off-board actions are refused without throwing',
      run() {
        const states = [fresh(), ...fixture.lines.slice(0, 1).flatMap(line => play(adapter, line).map(s => s.after))];
        for (const state of states) {
          const mover = adapter.sideToMove(state);
          if (mover === null) continue;
          for (const action of [...ALWAYS_MALFORMED, ...fixture.malformed]) {
            const reason = expectRefused(adapter, state, mover, action, 'malformed action');
            if (reason !== 'Malformed move') fail(`malformed ${show(action)} was refused as "${reason}", not as malformed`);
          }
        }
      },
    },
    {
      name: 'illegal actions are refused',
      run() {
        for (const action of fixture.illegal) expectRefused(adapter, fresh(), fixture.firstToMove, action, 'illegal action');
      },
    },
    {
      name: 'only the side to move may move',
      run() {
        for (const line of allLines) {
          for (const step of play(adapter, line)) {
            const reason = expectRefused(adapter, step.before, other(step.mover), step.action, `${other(step.mover)} playing`);
            if (reason !== 'Not your turn') fail(`the wrong side was refused as "${reason}"`);
          }
        }
      },
    },
    {
      name: 'only the last move of a finished game reports a result, and it is the right one',
      run() {
        if (fixture.endings.length === 0) fail('the fixture has no ending');
        for (const line of fixture.lines) {
          for (const [i, step] of play(adapter, line).entries()) {
            if (step.gameOver) fail(`line action ${i} ${show(step.action)} ended the game: ${show(step.gameOver)}`);
          }
        }
        for (const { line, gameOver } of fixture.endings) {
          const steps = play(adapter, line);
          steps.slice(0, -1).forEach((s, i) => { if (s.gameOver) fail(`ending action ${i} ended the game early`); });
          const last = steps[steps.length - 1];
          if (!last || !sameValue(last.gameOver, gameOver)) fail(`the ending reported ${show(last?.gameOver ?? null)}, not ${show(gameOver)}`);
        }
      },
    },
    {
      name: 'a finished game refuses every further action',
      run() {
        const candidates = [...allLines.flat(), ...fixture.illegal];
        for (const { line } of fixture.endings) {
          const end = finalState(adapter, play(adapter, line));
          for (const color of ['white', 'black'] as const) {
            for (const action of candidates) expectRefused(adapter, end, color, action, 'a move after the end');
          }
        }
      },
    },
  ];
}
