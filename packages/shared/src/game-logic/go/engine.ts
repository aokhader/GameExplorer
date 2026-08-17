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
import { neighborPositions, playStone } from './moves';

/**
 * The Go rules, as a pure static class — the same shape as `ReversiEngine` and
 * `CheckersEngine`, so the platform adapters stay thin.
 *
 * The ruleset is **Tromp-Taylor with suicide forbidden**: positional superko,
 * area scoring, two consecutive passes end the game, komi to White. Area
 * scoring is what lets the game end with no dead-stone negotiation — the score
 * is a pure function of the final position — at the price that dead groups must
 * actually be captured before passing. The tutorial says so in as many words.
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
   * Pass the turn. Two in a row end the game and the board is scored as it
   * stands — no dead-stone step, which is the deal area scoring makes.
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
      next.isGameOver = true;
      next.winner = this.determineWinner(next);
    }
    return next;
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
    if (state.isGameOver) return [];
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
    if (state.isGameOver) return false;
    return this.getAllLegalMoves(state).length === 0;
  }

  /**
   * Tromp-Taylor area score: each colour counts its stones on the board plus
   * every empty point reachable only by that colour, and White adds komi.
   *
   * "Reachable only by one colour" is computed by flooding each empty region
   * and looking at which colours border it. A region touching both is neutral
   * (dame, or the boundary of a seki) and scores for nobody — which is why seki
   * needs no special case here.
   */
  static score(state: GoGameState): GoScore {
    const { board, size, komi } = state;
    let black = 0;
    let white = 0;

    const visited = new Set<string>();

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const stone = board[row][col];
        if (stone === 'black') { black++; continue; }
        if (stone === 'white') { white++; continue; }

        const start = coordinatesToPosition({ row, col });
        if (visited.has(start)) continue;

        // Flood the empty region, collecting the colours on its border.
        const region: string[] = [];
        const borders = new Set<GoColor>();
        const queue = [start];
        visited.add(start);

        while (queue.length > 0) {
          const current = queue.pop() as string;
          region.push(current);
          for (const neighbor of neighborPositions(current, size)) {
            const neighborStone = getStoneAt(board, neighbor);
            if (neighborStone !== null) {
              borders.add(neighborStone);
            } else if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }

        if (borders.size === 1) {
          if (borders.has('black')) black += region.length;
          else white += region.length;
        }
      }
    }

    white += komi;
    return { black, white, komi, lead: black - white };
  }

  /**
   * The winner of a scored position. Null only on an exact tie, which fractional
   * komi rules out — it exists so an integer komi (a future setup option) still
   * has a defined answer.
   */
  static determineWinner(state: GoGameState): GoColor | null {
    const { lead } = this.score(state);
    if (lead > 0) return 'black';
    if (lead < 0) return 'white';
    return null;
  }
}
