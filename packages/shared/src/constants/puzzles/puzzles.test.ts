/**
 * Every shipped puzzle, replayed against the real engines.
 *
 * This is the load-bearing artifact of the whole feature: it is what makes
 * hand-authoring safe, and it is the gate a mined or database-backed source has
 * to pass unchanged. A puzzle that cannot be solved as written fails the build
 * rather than reaching a player who then cannot solve it either.
 */

import { describe, expect, it } from 'vitest';
import { ALL_PUZZLES, PUZZLES } from './index';
import { PUZZLE_THEMES } from '../../puzzles/types';
import { GoEngine } from '../../game-logic/go/engine';
import { goBoardStringToState } from '../../game-logic/go/boardString';
import { solveTsumego } from '../../game-logic/go/tsumego';
import { getGroup } from '../../game-logic/go/moves';
import { getOpponentColor, getStoneAt } from '../../game-logic/go/utils';
import type { GoColor, GoGameState } from '../../game-logic/go/types';
import type { Puzzle, PuzzleGame } from '../../puzzles/types';
import { puzzleRulesFor } from '../../puzzles/rules';
import { startPuzzle, applyPlayerMove, applyOpponentReply } from '../../puzzles/runtime';
import { ChessEngine } from '../../game-logic/chess/engine';
import { summarizeMaterial } from '../../game-logic/chess/material';
import { fenToState } from '../../game-logic/chess/fen';
import { getPieceAt as getChessPiece } from '../../game-logic/chess/utils';
import { CheckersEngine } from '../../game-logic/checkers/engine';
import { analyzeCheckersPosition } from '../../game-logic/checkers/weakEngine';
import { checkersFenToState } from '../../game-logic/checkers/fen';
import { isDarkSquare, positionToCoordinates } from '../../game-logic/checkers/utils';
import { ReversiEngine } from '../../game-logic/reversi/engine';
import { analyzeReversiPosition } from '../../game-logic/reversi/weakEngine';
import { boardStringToState } from '../../game-logic/reversi/boardString';
import type { ChessGameState } from '../../types/chess.types';

/**
 * Analyzer depth for the key-move check.
 *
 * Deeper than the analyzers' default 4, because a shallow search is exactly
 * what a good puzzle punishes: at depth 2 the reversi parity endgame below
 * picks the losing corner. Both analyzers are deterministic — they take no
 * random blunder the way the bot functions deliberately do — so this comparison
 * is reproducible rather than flaky.
 */
const ANALYZER_DEPTH = 6;

/**
 * Three digits capped the set at 1,000 per game, which the mined and imported
 * content passes. Hand-authored puzzles keep `001`–`099`; generated ones start
 * at `1000`, so the two are separable by eye and by prefix.
 *
 * Note this makes `byProgression`'s `localeCompare` tiebreak order `chess-1000`
 * before `chess-999`. That is harmless — the comparator only has to be total
 * and stable, and difficulty then rating decide long before it — so do not
 * "fix" it by zero-padding, which would renumber the shipped set.
 */
const ID_PATTERN = /^(chess|checkers|reversi|go)-\d{3,6}$/;

/** Play the whole line the way the runtime does, returning every state it passed through. */
function walkLine<S>(puzzle: Puzzle): { states: S[]; final: S } {
  const rules = puzzleRulesFor<S>(puzzle.game);
  let run = startPuzzle(puzzle, rules);
  const states: S[] = [run.state];

  for (let i = 0; i < puzzle.steps.length; i++) {
    const step = puzzle.steps[i];
    const played = applyPlayerMove(run, rules, rules.parseMove(step.move));
    // Not `not.toBe('wrong')` — that would quietly pass on 'ignored' too, which
    // is how a line with a step too many would slip through.
    expect(
      ['correct', 'solved'],
      `${puzzle.id} step ${i + 1} came back '${played.result}'`,
    ).toContain(played.result);
    run = played.run;
    states.push(run.state);

    if (step.reply !== undefined) {
      run = applyOpponentReply(run, rules);
      states.push(run.state);
    }
  }

  expect(run.phase, `${puzzle.id} did not end solved`).toBe('solved');
  return { states, final: run.state };
}

describe('puzzle content', () => {
  it('ships puzzles for every game', () => {
    const games: PuzzleGame[] = ['chess', 'checkers', 'reversi', 'go'];
    for (const game of games) expect(PUZZLES[game].length).toBeGreaterThan(0);
  });

  it('has unique, well-formed ids that agree with their game', () => {
    const seen = new Set<string>();
    for (const puzzle of ALL_PUZZLES) {
      expect(puzzle.id, `${puzzle.id} is not a valid id`).toMatch(ID_PATTERN);
      expect(puzzle.id.startsWith(`${puzzle.game}-`)).toBe(true);
      expect(seen.has(puzzle.id), `${puzzle.id} is duplicated`).toBe(false);
      seen.add(puzzle.id);
    }
  });

  it('survives a JSON round trip — this is a database row in waiting', () => {
    expect(JSON.parse(JSON.stringify(PUZZLES))).toEqual(PUZZLES);
  });

  describe.each(ALL_PUZZLES.map((p) => [p.id, p] as const))('%s', (_id, puzzle) => {
    it('has readable copy and known themes', () => {
      expect(puzzle.prompt.trim().length).toBeGreaterThan(0);
      expect(puzzle.explanation.trim().length).toBeGreaterThan(0);
      expect(puzzle.themes.length).toBeGreaterThan(0);
      for (const theme of puzzle.themes) {
        expect(PUZZLE_THEMES as readonly string[]).toContain(theme);
      }
      expect(puzzle.steps.length).toBeGreaterThan(0);
    });

    it('decodes, round-trips its position, and starts on the player’s turn', () => {
      const rules = puzzleRulesFor<unknown>(puzzle.game);
      const state = rules.decode(puzzle.position);
      // A position that does not re-encode to itself would drift the moment it
      // came back from a database.
      expect(rules.encode(state)).toBe(puzzle.position);
      expect(rules.currentTurn(state)).toBe(puzzle.playerColor);
      expect(rules.isGameOver(state)).toBe(false);
    });

    it('has a legal, solvable line', () => {
      walkLine(puzzle);
    });

    it('never scripts a move the runtime would call wrong', () => {
      const rules = puzzleRulesFor<unknown>(puzzle.game);
      for (const step of puzzle.steps) {
        const parsed = rules.parseMove(step.move);
        expect(rules.sameMove(parsed, parsed)).toBe(true);
        // A step's own move must survive the format/parse round trip, or a
        // board reporting the same move would not match it.
        expect(rules.parseMove(rules.formatMove(parsed))).toEqual(parsed);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Chess-specific
// ---------------------------------------------------------------------------

describe.each(PUZZLES.chess.map((p) => [p.id, p] as const))('chess %s', (_id, puzzle) => {
  it('is a legal chess position', () => {
    const state = fenToState(puzzle.position);
    const kings = { white: 0, black: 0 };
    for (const row of state.board) {
      for (const piece of row) {
        if (piece?.type === 'king') kings[piece.color]++;
      }
    }
    expect(kings).toEqual({ white: 1, black: 1 });

    // The side that just moved must not have left its own king en prise.
    const idle = state.currentTurn === 'white' ? 'black' : 'white';
    const flipped = ChessEngine.withStatusFlags({ ...state, currentTurn: idle });
    expect(flipped.isCheck, 'the side not to move is in check — illegal').toBe(false);

    expect(ChessEngine.getAllLegalMoves(state).length).toBeGreaterThan(0);
  });

  it('spells promotions out, and only on the back rank', () => {
    let state = fenToState(puzzle.position);
    const rules = puzzleRulesFor<ChessGameState>('chess');

    for (const step of puzzle.steps) {
      for (const raw of [step.move, step.reply].filter((m): m is string => m !== undefined)) {
        const move = rules.parseMove(raw);
        const piece = getChessPiece(state.board, move.from);
        const rank = move.to[1];
        const promoting = piece?.type === 'pawn' && (rank === '8' || rank === '1');
        expect(
          move.promotion !== undefined,
          `${raw} ${promoting ? 'must' : 'must not'} carry a promotion piece`,
        ).toBe(promoting);
        state = rules.validateMove(state, move).resultingState!;
      }
    }
  });

  it('delivers on its goal', () => {
    const { final } = walkLine<ChessGameState>(puzzle);

    if (puzzle.goal === 'mate') {
      expect(final.isCheckmate, 'the line does not end in mate').toBe(true);
      expect(final.currentTurn).not.toBe(puzzle.playerColor);
    }

    if (puzzle.goal === 'win-material') {
      const start = summarizeMaterial(fenToState(puzzle.position)).advantage;
      const end = summarizeMaterial(final).advantage;
      const swing = puzzle.playerColor === 'white' ? end - start : start - end;
      expect(swing).toBeGreaterThanOrEqual(puzzle.goalValue ?? 1);
    }
  });

  it('has a unique mating move, when it claims a mate in one', () => {
    if (puzzle.goal !== 'mate' || puzzle.steps.length !== 1) return;

    // Chess has no TS analyzer strong enough to assert "no other move is as
    // good", but mate is decidable, so assert the tractable property instead.
    const state = fenToState(puzzle.position);
    const mates = ChessEngine.getAllLegalMoves(state).filter((move) => {
      const result = ChessEngine.validateMove(state, move.from, move.to, false, 'queen');
      return result.resultingState?.isCheckmate === true;
    });
    expect(mates.map((m) => `${m.from}${m.to}`)).toEqual([puzzle.steps[0].move]);
  });

  it('has no mate in one, when it claims a longer mate', () => {
    if (puzzle.goal !== 'mate' || puzzle.steps.length < 2) return;

    const state = fenToState(puzzle.position);
    const mates = ChessEngine.getAllLegalMoves(state).filter((move) => {
      const result = ChessEngine.validateMove(state, move.from, move.to, false, 'queen');
      return result.resultingState?.isCheckmate === true;
    });
    expect(mates, 'a "mate in two" that mates in one is mis-labelled').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Checkers-specific
// ---------------------------------------------------------------------------

describe.each(PUZZLES.checkers.map((p) => [p.id, p] as const))('checkers %s', (_id, puzzle) => {
  it('is a legal checkers position', () => {
    const state = checkersFenToState(puzzle.position);
    let white = 0;
    let black = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row][col];
        if (!piece) continue;
        expect(isDarkSquare(row, col), 'a piece is sitting on a light square').toBe(true);
        if (piece.color === 'white') white++;
        else black++;
        // A man standing on its own crowning row should already be a king.
        if (piece.type === 'man') {
          expect(row, 'an uncrowned man is on its promotion row').not.toBe(
            piece.color === 'white' ? 7 : 0,
          );
        }
      }
    }

    expect(white).toBeGreaterThan(0);
    expect(black).toBeGreaterThan(0);
    expect(CheckersEngine.getAllLegalMoves(state).length).toBeGreaterThan(0);
  });

  it('never scripts an ambiguous jump chain', () => {
    // `CheckersEngine.validateMove` resolves (from, to) with `.find()`, so two
    // chains between the same pair of squares would silently pick one of them.
    // Such a puzzle has to be promoted to the full path form the parser
    // already accepts.
    const rules = puzzleRulesFor<ReturnType<typeof checkersFenToState>>('checkers');
    let state = checkersFenToState(puzzle.position);

    for (const step of puzzle.steps) {
      for (const raw of [step.move, step.reply].filter((m): m is string => m !== undefined)) {
        const move = rules.parseMove(raw);
        const matching = CheckersEngine.getAllLegalMoves(state).filter(
          (m) => m.from === move.from && m.to === move.to,
        );
        expect(matching.length, `${raw} resolves to ${matching.length} chains`).toBe(1);
        state = rules.validateMove(state, move).resultingState!;
      }
    }
  });

  it('the key move is the engine’s best move', () => {
    const state = checkersFenToState(puzzle.position);
    const best = analyzeCheckersPosition(state, ANALYZER_DEPTH).bestMove;
    const scripted = puzzleRulesFor<unknown>('checkers').parseMove(puzzle.steps[0].move);
    expect(best).not.toBeNull();
    expect({ from: best!.from, to: best!.to }).toEqual({ from: scripted.from, to: scripted.to });
  });

  it('delivers on its goal', () => {
    const { final } = walkLine<ReturnType<typeof checkersFenToState>>(puzzle);
    if (puzzle.goal === 'win-game') {
      expect(final.isGameOver).toBe(true);
      expect(final.winner).toBe(puzzle.playerColor);
    }
  });
});

// ---------------------------------------------------------------------------
// Reversi-specific
// ---------------------------------------------------------------------------

describe.each(PUZZLES.reversi.map((p) => [p.id, p] as const))('reversi %s', (_id, puzzle) => {
  it('is a plausible reversi position with a move available', () => {
    const state = boardStringToState(puzzle.position);
    const discs = state.board.flat().filter(Boolean).length;
    expect(discs).toBeGreaterThanOrEqual(4);
    expect(ReversiEngine.getAllLegalMoves(state).length).toBeGreaterThan(0);
    expect(ReversiEngine.mustPass(state), 'the puzzle opens on a forced pass').toBe(false);
  });

  it('never scripts a pass — the runtime handles those itself', () => {
    for (const step of puzzle.steps) {
      expect(step.move).not.toMatch(/pass/i);
      if (step.reply !== undefined) expect(step.reply).not.toMatch(/pass/i);
    }
  });

  it('the key move is the engine’s best move', () => {
    const state = boardStringToState(puzzle.position);
    const best = analyzeReversiPosition(state, ANALYZER_DEPTH).bestMove;
    expect(best?.position).toBe(puzzle.steps[0].move);
  });

  it('delivers on its goal', () => {
    const { final } = walkLine<ReturnType<typeof boardStringToState>>(puzzle);
    if (puzzle.goal === 'win-game') {
      expect(final.isGameOver).toBe(true);
      expect(final.winner).toBe(puzzle.playerColor);
    }
    if (puzzle.goal === 'best-move') {
      const state = boardStringToState(puzzle.position);
      const played = ReversiEngine.executeMove(state, puzzle.steps[0].move);
      const forPlayer = (score: number) => (puzzle.playerColor === 'white' ? score : -score);
      // The claimed best move has to actually be good for the solver, not just
      // the least bad of a losing set.
      expect(forPlayer(analyzeReversiPosition(played, ANALYZER_DEPTH).score)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Go-specific
// ---------------------------------------------------------------------------

/**
 * Go's forcing proof, and why it looks different from the other three.
 *
 * Chess proves a mate. Checkers and reversi ask a depth-limited analyzer for
 * its best move and refuse anything else. Go can do neither: its playing engine
 * is Monte-Carlo and would sometimes disagree with itself. What it can do —
 * exactly, synchronously, and with no evaluation function anywhere — is settle
 * life and death inside a stated boundary, which is what `region` on the puzzle
 * is for and what makes these puzzles provable at all.
 *
 * So the standard here is the strongest of the four: not "the engine agrees
 * with this move" but "**this is the only move that works**", established by
 * searching every legal first move to the end.
 */
describe('go puzzles', () => {
  const goPuzzles = PUZZLES.go;

  it('ships some', () => {
    expect(goPuzzles.length).toBeGreaterThan(0);
  });

  describe.each(goPuzzles.map((p) => [p.id, p] as const))('%s', (_id, puzzle) => {
    /** Every Go puzzle must carry its own boundary; nothing is provable without one. */
    function spec(state: GoGameState) {
      expect(puzzle.region?.length, `${puzzle.id} has no region`).toBeGreaterThan(0);
      expect(puzzle.target, `${puzzle.id} has no target`).toBeTruthy();
      const target = puzzle.target as string;
      const defender = getStoneAt(state.board, target);
      expect(defender, `${puzzle.id} target ${target} is empty`).not.toBeNull();
      return { region: puzzle.region as string[], target, defender: defender as GoColor };
    }

    it('states a goal only a life-and-death puzzle can have', () => {
      expect(['kill', 'live']).toContain(puzzle.goal);
      expect(puzzle.goalValue, 'goalValue is a chess field').toBeUndefined();
    });

    it('starts from a position that could occur in a game', () => {
      const state = goBoardStringToState(puzzle.position);
      expect(state.size).toBe(9);
      // Nothing on the board may already be captured — a group with no
      // liberties standing is a diagram, not a position.
      for (let row = 0; row < state.size; row++) {
        for (let col = 0; col < state.size; col++) {
          if (state.board[row][col] === null) continue;
          const point = String.fromCharCode(97 + col) + (row + 1);
          expect(
            getGroup(state.board, point, state.size)!.liberties.length,
            `${puzzle.id}: the group at ${point} has no liberties`,
          ).toBeGreaterThan(0);
        }
      }
      expect(GoEngine.getAllLegalMoves(state).length).toBeGreaterThan(0);
    });

    it('draws its boundary around the fight', () => {
      const state = goBoardStringToState(puzzle.position);
      const { region, target, defender } = spec(state);

      // The solver searches this region exhaustively. A region big enough to be
      // slow is a region too big to be a life-and-death problem.
      expect(region.length, `${puzzle.id} region is too wide`).toBeLessThanOrEqual(12);
      expect(new Set(region).size, `${puzzle.id} region repeats a point`).toBe(region.length);

      // The group under discussion must be sealed in: if it has a liberty
      // outside the region it can simply run away, and the answer would depend
      // on a part of the board the puzzle never drew.
      const group = getGroup(state.board, target, state.size)!;
      const escapes = group.liberties.filter((l) => !region.includes(l));
      expect(escapes, `${puzzle.id}: ${target} can escape via ${escapes}`).toEqual([]);

      // The solver is the attacker in a kill and the defender in a live.
      const mover = puzzle.goal === 'kill' ? getOpponentColor(defender) : defender;
      expect(state.currentTurn, `${puzzle.id} has the wrong side to move`).toBe(mover);
      expect(puzzle.playerColor).toBe(mover);
    });

    it('has a key move that is the ONLY move that works', () => {
      const state = goBoardStringToState(puzzle.position);
      const { region, target } = spec(state);

      const solved = solveTsumego(state, {
        region,
        target,
        goal: puzzle.goal as 'kill' | 'live',
      });

      expect(solved.solved, `${puzzle.id} is not solvable as stated`).toBe(true);
      expect(
        solved.winningMoves,
        `${puzzle.id}: the answer is not forced — ${solved.winningMoves.join(', ')} all work`,
      ).toEqual([puzzle.steps[0].move]);
    });

    it('delivers the goal at the end of the line', () => {
      const { final } = walkLine<GoGameState>(puzzle);
      const { region, target, defender } = spec(goBoardStringToState(puzzle.position));

      // "Dead" does not mean "already captured" — a settled group can still be
      // standing. What is asserted is that the result can no longer change, by
      // handing the opponent the move and finding they cannot alter it.
      const opponentGoal = puzzle.goal === 'kill' ? 'live' : 'kill';
      const opponent = puzzle.goal === 'kill' ? defender : getOpponentColor(defender);

      if (getStoneAt(final.board, target) === null) {
        // Already off the board. Only a kill can end that way.
        expect(puzzle.goal, `${puzzle.id}: the target was captured in a 'live' puzzle`).toBe('kill');
        return;
      }

      const rebuttal = solveTsumego(
        { ...final, currentTurn: opponent },
        { region, target, goal: opponentGoal },
      );
      expect(
        rebuttal.solved,
        `${puzzle.id}: after the line, ${opponent} can still ${opponentGoal} with ${rebuttal.winningMoves.join(', ')}`,
      ).toBe(false);
    });

    it('never scripts a pass', () => {
      // Go's pass is voluntary and the runtime never inserts one, so a pass in
      // the data would be a move the board cannot offer.
      for (const step of puzzle.steps) {
        expect(step.move).not.toBe('pass');
        if (step.reply !== undefined) expect(step.reply).not.toBe('pass');
      }
    });
  });
});
