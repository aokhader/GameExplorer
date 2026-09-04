import type { GoBoard, GoColor, GoGameState, GoMoveResult, GoScore } from './types';
import {
  boardKey,
  cloneGameState,
  coordinatesToPosition,
  createInitialGameState,
  getOpponentColor,
  getStoneAt,
  isValidPosition,
  type NewGoGameOptions,
} from './utils';
import { getGroup, playStone } from './moves';
import { boardWithoutStones, scoreBoard } from './scoring';
import { passAliveChains } from './benson';

/**
 * The Go rules, as a pure static class — the same shape as `ReversiEngine` and
 * `CheckersEngine`, so the platform adapters stay thin.
 *
 * The ruleset is **positional superko, suicide forbidden**, komi to White, and
 * a scoring method (area or territory) chosen at setup.
 *
 * Two consecutive passes do NOT end the game. They open the **dead-stone
 * review**: `phase` becomes `marking` while `isGameOver` stays false, the
 * players agree which stones are dead, and only `finalize` counts the board.
 * `resumePlay` is the other way out — the dispute path, straight back to the
 * board. Keeping `isGameOver` false through the review is deliberate and load
 * bearing: the shared local-game loop saves and rates on that flag, and a score
 * nobody has agreed to yet must not reach the database.
 */
export class GoEngine {
  static newGame(options: NewGoGameOptions = {}): GoGameState {
    return createInitialGameState(options);
  }

  /** Validate and execute a placement. */
  static validateMove(state: GoGameState, position: string): GoMoveResult {
    if (state.isGameOver) {
      return { valid: false, reason: 'Game is already over' };
    }
    if (state.phase !== 'playing') {
      return { valid: false, reason: 'Both players have passed — the board is being counted' };
    }
    if (!isValidPosition(position, state.size)) {
      return { valid: false, reason: 'Not a point on the board' };
    }
    if (getStoneAt(state.board, position) !== null) {
      return { valid: false, reason: 'Point is already occupied' };
    }

    const played = playStone(state.board, position, state.currentTurn, state.size);
    if (!played) {
      return { valid: false, reason: 'Self-capture is not allowed' };
    }

    const key = boardKey(played.board);
    if (state.positionKeys.includes(key)) {
      return { valid: false, reason: 'Ko — that would repeat an earlier position' };
    }

    return {
      valid: true,
      resultingState: this.applyPlacement(state, position, played.board, played.captures, key),
    };
  }

  /** Execute a placement without re-validating (use after validateMove). */
  static executeMove(state: GoGameState, position: string): GoGameState {
    const result = this.validateMove(state, position);
    if (!result.valid || !result.resultingState) {
      throw new Error(result.reason ?? 'Illegal move');
    }
    return result.resultingState;
  }

  /**
   * Pass the turn. Two in a row open the dead-stone review — they do not end
   * the game, and `isGameOver` stays false until `finalize`.
   */
  static executePass(state: GoGameState): GoGameState {
    const next = cloneGameState(state);
    next.moveHistory = [
      ...next.moveHistory,
      { position: null, color: state.currentTurn, captures: [] },
    ];
    next.consecutivePasses = state.consecutivePasses + 1;
    next.currentTurn = getOpponentColor(state.currentTurn);

    if (next.consecutivePasses >= 2) {
      next.phase = 'marking';
    }
    return next;
  }

  /**
   * Leave the review and play on — the dispute path. Whoever is to move plays
   * next, and the two passes are forgotten so a single further pass does not
   * end the game again.
   */
  static resumePlay(state: GoGameState): GoGameState {
    const next = cloneGameState(state);
    next.phase = 'playing';
    next.consecutivePasses = 0;
    next.deadStones = [];
    return next;
  }

  /**
   * Agree the marked stones are dead, take them off, and count the board.
   *
   * Removed stones are credited to the opponent's capture count, which is what
   * makes them prisoners under territory scoring. Under area scoring they score
   * nothing directly and the empty points they leave behind do the work — the
   * same asymmetry as a capture made in play, resolved in the same place.
   */
  static finalize(state: GoGameState, dead: readonly string[] = state.deadStones): GoGameState {
    const marked = this.validMarks(state, dead);
    const next = cloneGameState(state);

    for (const position of marked) {
      const color = getStoneAt(state.board, position);
      if (color === null) continue;
      next.captured[getOpponentColor(color)] += 1;
    }

    next.board = boardWithoutStones(state.board, marked);
    next.deadStones = marked;
    next.phase = 'scored';
    next.isGameOver = true;
    next.winner = this.determineWinner(next);
    return next;
  }

  /**
   * The mark set, cleaned: real stones only, de-duplicated, whole chains, and
   * sorted so a state has one canonical form.
   *
   * Marking any single stone marks its whole chain — a chain lives or dies
   * together, and letting half of one come off would produce a score no Go
   * player would recognise. Unconditionally alive chains are refused outright
   * (see `benson.ts`): a group with two real eyes cannot be captured by anyone
   * playing any number of moves, so agreeing it is dead is not a judgement the
   * review is allowed to make.
   */
  static validMarks(state: GoGameState, dead: readonly string[]): string[] {
    const { board, size } = state;
    const aliveByColor = new Map<string, Set<string>>();
    const marked = new Set<string>();

    for (const position of dead) {
      const color = getStoneAt(board, position);
      if (color === null) continue;

      let alive = aliveByColor.get(color);
      if (!alive) {
        alive = passAliveChains(board, size, color);
        aliveByColor.set(color, alive);
      }
      if (alive.has(position)) continue;

      const group = getGroup(board, position, size);
      if (!group) continue;
      for (const stone of group.stones) marked.add(stone);
    }

    return [...marked].sort();
  }

  private static applyPlacement(
    state: GoGameState,
    position: string,
    board: GoBoard,
    captures: string[],
    key: string,
  ): GoGameState {
    const color = state.currentTurn;
    const next = cloneGameState(state);

    next.board = board;
    next.moveHistory = [...next.moveHistory, { position, color, captures }];
    next.captured = {
      ...next.captured,
      [color]: next.captured[color] + captures.length,
    };
    next.positionKeys = [...next.positionKeys, key];
    next.consecutivePasses = 0;
    next.currentTurn = getOpponentColor(color);

    return next;
  }

  /**
   * Every legal placement for the side to move — playable by the placement
   * rules AND not a superko repetition. Passing is always available on top of
   * this and is never listed here.
   */
  static getAllLegalMoves(state: GoGameState): string[] {
    if (state.phase !== 'playing') return [];
    const { board, size, currentTurn } = state;
    // A Set, not `positionKeys.includes`: this runs the superko test once per
    // empty point, and both boards call it every time the position changes.
    const seen = new Set(state.positionKeys);
    const legal: string[] = [];

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (board[row][col] !== null) continue;
        const position = coordinatesToPosition({ row, col });
        const played = playStone(board, position, currentTurn, size);
        if (!played) continue;
        if (seen.has(boardKey(played.board))) continue;
        legal.push(position);
      }
    }
    return legal;
  }

  /**
   * True when the side to move has no legal placement at all and can only pass.
   *
   * Unlike reversi this is a rarity rather than a routine turn — it needs a
   * board where every empty point is self-capture or ko — but the local-game
   * loop needs the hook to auto-pass a player who genuinely cannot move.
   */
  static mustPass(state: GoGameState): boolean {
    if (state.phase !== 'playing') return false;
    return this.getAllLegalMoves(state).length === 0;
  }

  /**
   * The score of the position as it stands, under the state's own ruleset and
   * whatever is already marked dead.
   */
  static score(state: GoGameState): GoScore {
    return this.scoreWith(state, state.deadStones);
  }

  /**
   * The score this position WOULD have with `dead` taken off — what the review
   * screen shows live as marks are toggled, before anything is committed.
   *
   * Marks are cleaned through `validMarks` first, so the preview and the number
   * `finalize` eventually produces agree by construction rather than by two
   * call sites remembering to stay in step.
   */
  static scoreWith(state: GoGameState, dead: readonly string[]): GoScore {
    const marked = this.validMarks(state, dead);
    const board: GoBoard = boardWithoutStones(state.board, marked);

    const prisoners = { black: state.captured.black, white: state.captured.white };
    for (const position of marked) {
      const color = getStoneAt(state.board, position);
      if (color === null) continue;
      prisoners[getOpponentColor(color)] += 1;
    }

    return scoreBoard(board, state.size, state.komi, state.scoring, prisoners);
  }

  /**
   * The winner of a scored position. Null on an exact tie — impossible at the
   * default 7.5 komi, and genuinely reachable at the integer presets the setup
   * screen offers, where a drawn game (jigo) is the correct Go answer.
   */
  static determineWinner(state: GoGameState): GoColor | null {
    const { lead } = this.score(state);
    if (lead > 0) return 'black';
    if (lead < 0) return 'white';
    return null;
  }
}
