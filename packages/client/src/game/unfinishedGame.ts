/**
 * An unfinished local game, kept so it can be resumed — or, if it was rated,
 * resigned — instead of vanishing when the tab or app closes.
 *
 * The owner's decision (`project-docs/ux-fix-ideas.md` §2.4): **an unfinished
 * rated game stays open until it is finished or resigned.** Results are written
 * when a game *ends*, so before this a losing rated game could simply be walked
 * away from and nothing was recorded. Now it waits on the device as *Continue*,
 * and discarding it is a resignation.
 *
 * **What is stored is the moves, not the positions.** A chess timeline of eighty
 * full positions runs to hundreds of kilobytes, rewritten on every move; the
 * actions that produced it are a few kilobytes and the engines are deterministic,
 * so replaying them rebuilds the same timeline — history scrubbing and review
 * included. A replay that hits an illegal action (a snapshot from a build whose
 * rules have since changed) is treated as corrupt and dropped rather than
 * resumed into a position no engine agrees with.
 *
 * **One slot per game type, per account.** A second chess game replaces the
 * first only after asking, and a guest's casual game never shares a slot with an
 * account's rated one: signing out must not let a guest game overwrite a rated
 * game that is waiting to be resigned.
 *
 * Pure: no storage, no database. The loop writes these through a `LocalStore`,
 * and `localResult.ts` settles them.
 */

import { MODE_COPY, type GameOutcome } from '@gameexplorer/shared';
import type { Color, LocalGameMode } from '../hooks/useLocalGame';

/** The four games that run through `useLocalGame`. Liquidate keeps its own snapshot. */
export type UnfinishedGameType = 'chess' | 'checkers' | 'reversi' | 'go';

/**
 * One transition of the timeline. A move is whatever `validateMove` was called
 * with — including Go's pass, resume and finalize sentinels, which ride that
 * channel — and `pass` is the loop's own `executePass` (reversi's forced pass).
 */
export type LocalAction = { from: string; to: string; promotion?: string } | { pass: true };

/**
 * How a game ended, recorded when it has ended but its rated result has not yet
 * been written (the connection dropped at the end). Such a snapshot is not
 * resumable — there is nothing left to play — but its result is still owed.
 */
export type LocalGameEnd = 'over' | 'resign' | 'draw';

export interface UnfinishedGame {
  v: 1;
  game: UnfinishedGameType;
  mode: LocalGameMode;
  /** The account the game belongs to; null for a guest. */
  userId: string | null;
  /** Whether the result counts. Fixed when the game started, whatever the toggle says now. */
  rated: boolean;
  playerColor: Color;
  /**
   * The strength the bot was playing at. In training that is the player's own
   * rating when the game was last saved, which is also what a resignation is
   * scored against.
   */
  botElo: number;
  /**
   * The setup the game was started with, in `localSetup`'s shape for this game.
   * Go's board size, komi and scoring live here, and a replay needs them.
   */
  setup: Record<string, unknown>;
  actions: LocalAction[];
  /** Training hints already taken; each costs rating when the game is scored. */
  hintsUsed: number;
  startedAt: number;
  savedAt: number;
  end?: LocalGameEnd;
}

export const UNFINISHED_GAME_TYPES: readonly UnfinishedGameType[] = ['chess', 'checkers', 'reversi', 'go'];

export function isUnfinishedGameType(v: unknown): v is UnfinishedGameType {
  return v === 'chess' || v === 'checkers' || v === 'reversi' || v === 'go';
}

export function unfinishedGameKey(game: UnfinishedGameType, userId: string | null): string {
  return `gx:inprogress:${game}:${userId ?? 'guest'}`;
}

function isAction(v: unknown): v is LocalAction {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  if (a.pass === true) return true;
  return (
    typeof a.from === 'string' &&
    typeof a.to === 'string' &&
    (a.promotion === undefined || typeof a.promotion === 'string')
  );
}

/**
 * Read a stored snapshot. Never throws; anything incomplete is null.
 *
 * `expect` guards against a snapshot filed under the wrong key — a hand edit, or
 * a future key scheme — being resumed as the wrong game or for the wrong account.
 */
export function parseUnfinishedGame(
  raw: string | null | undefined,
  expect?: { game: UnfinishedGameType; userId: string | null },
): UnfinishedGame | null {
  if (!raw) return null;
  let p: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    p = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (p.v !== 1 || !isUnfinishedGameType(p.game)) return null;
  if (p.mode !== 'bot' && p.mode !== 'training' && p.mode !== 'pass-and-play') return null;
  if (p.userId !== null && typeof p.userId !== 'string') return null;
  if (typeof p.rated !== 'boolean') return null;
  if (p.playerColor !== 'white' && p.playerColor !== 'black') return null;
  if (typeof p.botElo !== 'number' || !Number.isFinite(p.botElo)) return null;
  if (!p.setup || typeof p.setup !== 'object' || Array.isArray(p.setup)) return null;
  if (!Array.isArray(p.actions) || p.actions.length === 0 || !p.actions.every(isAction)) return null;
  if (typeof p.hintsUsed !== 'number' || p.hintsUsed < 0) return null;
  if (typeof p.startedAt !== 'number' || typeof p.savedAt !== 'number') return null;
  if (p.end !== undefined && p.end !== 'over' && p.end !== 'resign' && p.end !== 'draw') return null;
  // A guest can never have a rated game: rated play needs an account to write to.
  if (p.rated && p.userId === null) return null;

  const game = p as unknown as UnfinishedGame;
  if (expect && (game.game !== expect.game || game.userId !== expect.userId)) return null;
  return game;
}

export function serializeUnfinishedGame(game: UnfinishedGame): string {
  return JSON.stringify(game);
}

/** The slice of a game's rules a replay needs — satisfied by every `LocalGameAdapter`. */
export interface ReplayRules<S> {
  newGame(): S;
  validateMove(state: S, from: string, to: string, promotion?: string): { valid: boolean; resultingState?: S };
  executePass?(state: S): S;
}

/**
 * Rebuild a timeline from its actions. Null if any action is not legal where it
 * was played, which means the snapshot no longer describes a game these rules
 * can reach.
 */
export function replayActions<S>(rules: ReplayRules<S>, actions: readonly LocalAction[]): S[] | null {
  const timeline: S[] = [rules.newGame()];
  for (const action of actions) {
    const current = timeline[timeline.length - 1];
    if ('pass' in action) {
      if (!rules.executePass) return null;
      timeline.push(rules.executePass(current));
      continue;
    }
    const result = rules.validateMove(current, action.from, action.to, action.promotion);
    if (!result.valid || !result.resultingState) return null;
    timeline.push(result.resultingState);
  }
  return timeline;
}

/**
 * The recorded result of a finished local game, from the human's side.
 *
 * The one place this rule lives: the loop's save effect and a resignation from a
 * Continue card both call it, so a game resigned from the launcher is scored
 * exactly as one resigned on the board.
 */
export function localGameResult(args: {
  playerColor: Color;
  /** The engine's winner for a natural end; ignored for a manual one. */
  winner: Color | null;
  end: LocalGameEnd;
}): { result: Color | 'draw'; outcome: GameOutcome } {
  const { playerColor: pc, winner, end } = args;
  const other: Color = pc === 'white' ? 'black' : 'white';
  const result: Color | 'draw' =
    end === 'draw' ? 'draw'
    : end === 'resign' ? other
    : winner === null ? 'draw'
    : winner === pc ? pc
    : other;
  const outcome: GameOutcome = result === 'draw' ? 'draw' : result === pc ? 'win' : 'loss';
  return { result, outcome };
}

const GAME_NAMES: Record<UnfinishedGameType, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
};

export function unfinishedGameName(game: UnfinishedGameType): string {
  return GAME_NAMES[game];
}

/**
 * One line saying which game this is: "vs Bot 1500 · Rated · You play White · move 12".
 *
 * Shared so a Continue card reads the same on both platforms. It leads with what
 * the player chose, and says *Rated* whenever the game is, because that is the
 * fact that changes what Discard does. Rated practice says it in its name.
 */
export function unfinishedGameSummary(game: UnfinishedGame): string {
  const parts: string[] = [];
  if (game.mode === 'pass-and-play') parts.push(MODE_COPY.local.label);
  else if (game.mode === 'training') parts.push(MODE_COPY.training.label);
  else parts.push(`vs Bot ${game.botElo}`);

  if (game.rated && game.mode !== 'training') parts.push('Rated');
  if (game.game === 'go' && typeof game.setup.size === 'number' && game.setup.size !== 9) {
    parts.push(`${game.setup.size}×${game.setup.size}`);
  }
  if (game.mode !== 'pass-and-play') {
    parts.push(`You play ${game.playerColor === 'white' ? 'White' : 'Black'}`);
  }

  const n = game.actions.length;
  // Chess and checkers number a move per pair of turns; reversi and Go count
  // every disc and stone.
  parts.push(
    game.game === 'chess' || game.game === 'checkers'
      ? `move ${Math.floor(n / 2) + 1}`
      : `${n} ${n === 1 ? 'move' : 'moves'} in`,
  );
  return parts.join(' · ');
}
