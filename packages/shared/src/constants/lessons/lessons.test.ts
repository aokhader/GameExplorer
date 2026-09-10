/**
 * The lesson gate.
 *
 * Every assertion here is a real proof against a real engine, run over the real
 * content — the same standard `constants/puzzles/puzzles.test.ts` holds, and for
 * the same reason: a lesson that tells a learner a legal move is wrong, or asks
 * for a move the position refuses, is worse than no lesson.
 *
 * **Per-game loop-and-collect, not `describe.each` per lesson.** Twenty-six
 * lessons at ~200 steps would be a thousand cases whose reporter output nobody
 * reads, and a regression would surface as one red line among them rather than
 * as a list. Collecting failures and asserting the list is empty reports every
 * broken step at once, with the lesson and step id in the message.
 */

import { describe, expect, it } from 'vitest';
import { ALL_LESSONS, LESSONS } from './index';
import { TUTORIALS } from '../tutorials';
import { enumerateAccepted, matchesExpectation } from '../../lessons/matching';
import { puzzleRulesFor } from '../../puzzles/rules';
import type { PuzzleMove, PuzzleRules } from '../../puzzles/types';
import type { Lesson, LessonGame, LessonStep } from '../../lessons/types';

const GAMES: LessonGame[] = ['chess', 'checkers', 'reversi', 'go'];
const ID_PATTERN = /^(chess|checkers|reversi|go)-l\d{2}$/;

/** Deepest a lesson may go before it should have been two lessons. */
const MAX_STEPS = 14;

/**
 * Walk one lesson exactly as `runtime.ts` does, handing each step's position to
 * a visitor.
 *
 * Shared by nearly every check below, because "is this move legal" is only
 * answerable in the position the previous step actually produced — and the only
 * honest way to know that position is to play the lesson.
 *
 * The line followed is the **first** accepted move at each step. Where a step
 * accepts several, the reply check below re-walks it against every one of them;
 * this walk is about getting to the next step.
 */
function walk<S>(
  lesson: Lesson,
  rules: PuzzleRules<S>,
  visit: (step: LessonStep, index: number, state: S, accepted: PuzzleMove[]) => void,
): void {
  let state = settle(rules.decode(lesson.position), rules);

  lesson.steps.forEach((step, index) => {
    if (step.position !== undefined) state = settle(rules.decode(step.position), rules);

    const accepted = enumerateAccepted(rules, state, step.expect);
    visit(step, index, state, accepted);

    if (step.expect.kind === 'read') return;
    const played = accepted[0];
    if (!played) return; // already reported by the "accepts something" check
    const after = rules.validateMove(state, played);
    if (!after.valid || !after.resultingState) return; // reported by the legality check
    state = settle(after.resultingState, rules);

    if (step.reply !== undefined) {
      const reply = rules.validateMove(state, rules.parseMove(step.reply));
      if (!reply.valid || !reply.resultingState) return; // reported by the reply check
      state = settle(reply.resultingState, rules);
    }
  });
}

/** Reversi's auto-pass, exactly as the runtime applies it. */
function settle<S>(state: S, rules: PuzzleRules<S>): S {
  const { mustPass, executePass } = rules;
  if (!mustPass || !executePass) return state;
  let next = state;
  for (let i = 0; i < 2; i++) {
    if (rules.isGameOver(next) || !mustPass(next)) break;
    next = executePass(next);
  }
  return next;
}

/** Board edge for a Go position, so marks can be checked against it. */
function goSize(position: string): number {
  return position.trim().split(/\s+/)[0].split('/').length;
}

function squareOnBoard(game: LessonGame, square: string, size: number): boolean {
  if (game === 'go') {
    const match = /^([a-z])(\d{1,2})$/.exec(square);
    if (!match) return false;
    const col = match[1].charCodeAt(0) - 97;
    const row = Number(match[2]) - 1;
    return col >= 0 && col < size && row >= 0 && row < size;
  }
  return /^[a-h][1-8]$/.test(square);
}

describe('lesson content', () => {
  it('ships lessons for every game', () => {
    for (const game of GAMES) {
      expect(LESSONS[game].game, `${game} set is mislabelled`).toBe(game);
      expect(LESSONS[game].lessons.length, `${game} ships no lessons`).toBeGreaterThan(0);
    }
  });

  it('has unique, well-formed ids that agree with their game', () => {
    const seen = new Set<string>();
    const failures: string[] = [];
    for (const lesson of ALL_LESSONS) {
      if (!ID_PATTERN.test(lesson.id)) failures.push(`${lesson.id}: malformed id`);
      if (seen.has(lesson.id)) failures.push(`${lesson.id}: duplicate id`);
      seen.add(lesson.id);
      if (!lesson.id.startsWith(`${lesson.game}-`)) {
        failures.push(`${lesson.id}: id does not agree with game '${lesson.game}'`);
      }
      const stepIds = new Set<string>();
      for (const step of lesson.steps) {
        if (stepIds.has(step.id)) failures.push(`${lesson.id}/${step.id}: duplicate step id`);
        stepIds.add(step.id);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('survives a JSON round trip — this is a database row in waiting', () => {
    expect(JSON.parse(JSON.stringify(LESSONS))).toEqual(LESSONS);
  });

  it('links only to tutorial sections that exist', () => {
    const failures: string[] = [];
    for (const lesson of ALL_LESSONS) {
      if (!lesson.teaches) continue;
      const ids = TUTORIALS[lesson.game].sections.map((s) => s.id);
      if (!ids.includes(lesson.teaches)) {
        failures.push(`${lesson.id}: teaches '${lesson.teaches}', which is not a ${lesson.game} section`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe.each(GAMES)('%s lessons', (game) => {
  const rules = puzzleRulesFor<unknown>(game);
  const lessons = LESSONS[game].lessons;

  it('declares every position in a form the engine round-trips', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      const positions: Array<[string, string]> = [['opening', lesson.position]];
      for (const step of lesson.steps) {
        if (step.position !== undefined) positions.push([step.id, step.position]);
      }
      for (const [where, position] of positions) {
        try {
          const state = rules.decode(position);
          const encoded = rules.encode(state);
          if (encoded !== position) {
            failures.push(`${lesson.id}/${where}: re-encodes as '${encoded}'`);
          }
          if (rules.isGameOver(state)) {
            failures.push(`${lesson.id}/${where}: position is already over`);
          }
        } catch (error) {
          failures.push(`${lesson.id}/${where}: ${(error as Error).message}`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('asks for moves that are legal in the position the previous step produced', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      walk(lesson, rules, (step, index, state, accepted) => {
        if (step.expect.kind === 'read') return;
        if (accepted.length === 0) {
          failures.push(`${lesson.id}/${step.id} (step ${index}): accepts no move at all`);
          return;
        }
        for (const move of accepted) {
          if (!rules.validateMove(state, move).valid) {
            failures.push(
              `${lesson.id}/${step.id}: '${rules.formatMove(move)}' is not legal here`,
            );
          }
        }
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('never poses an "any" step that accepts every legal move', () => {
    // A step that accepts everything is a Continue button wearing a board.
    const failures: string[] = [];
    for (const lesson of lessons) {
      walk(lesson, rules, (step, _index, state, accepted) => {
        if (step.expect.kind !== 'any') return;
        const total = rules.legalMoves(state).length;
        if (accepted.length >= total) {
          failures.push(
            `${lesson.id}/${step.id}: accepts all ${total} legal moves — it teaches nothing`,
          );
        }
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('re-proves every cached engine answer', () => {
    // `kind: 'best'` ships the engine's answer so the runtime never searches on
    // a phone. Re-running the search here is what stops a retuned engine
    // silently teaching a move that is no longer best.
    const failures: string[] = [];
    for (const lesson of lessons) {
      walk(lesson, rules, (step, _index, state) => {
        if (step.expect.kind !== 'best') return;
        const { bestMove } = rules.analyze(state, step.expect.depth);
        if (!bestMove) {
          failures.push(`${lesson.id}/${step.id}: the engine returns no best move here`);
          return;
        }
        if (!matchesExpectation(rules, state, bestMove, step.expect)) {
          failures.push(
            `${lesson.id}/${step.id}: engine plays '${rules.formatMove(bestMove)}', ` +
              `which is not in [${step.expect.moves.join(', ')}]`,
          );
        }
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('scripts a reply that is legal after EVERY accepted move, not just the first', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      walk(lesson, rules, (step, _index, state, accepted) => {
        if (step.reply === undefined) return;
        for (const move of accepted) {
          const after = rules.validateMove(state, move);
          if (!after.valid || !after.resultingState) continue; // reported above
          const settled = settle(after.resultingState, rules);
          const reply = rules.validateMove(settled, rules.parseMove(step.reply));
          if (!reply.valid) {
            failures.push(
              `${lesson.id}/${step.id}: reply '${step.reply}' is illegal after ` +
                `'${rules.formatMove(move)}'`,
            );
          }
        }
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('coaches wrong answers that are playable and actually wrong', () => {
    // A named miss nobody can play is dead copy; one that is actually right is
    // a contradiction the learner would meet as a bug.
    const failures: string[] = [];
    for (const lesson of lessons) {
      walk(lesson, rules, (step, _index, state) => {
        for (const miss of step.misses ?? []) {
          for (const move of miss.when ?? []) {
            let parsed: PuzzleMove;
            try {
              parsed = rules.parseMove(move);
            } catch (error) {
              failures.push(`${lesson.id}/${step.id}: miss '${move}': ${(error as Error).message}`);
              continue;
            }
            if (!rules.validateMove(state, parsed).valid) {
              failures.push(`${lesson.id}/${step.id}: miss '${move}' is not playable here`);
            }
            if (matchesExpectation(rules, state, parsed, step.expect)) {
              failures.push(`${lesson.id}/${step.id}: miss '${move}' is an ACCEPTED answer`);
            }
          }
        }
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('marks squares that are on the board', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      let size = goSize(lesson.position);
      for (const step of lesson.steps) {
        if (step.position !== undefined) size = goSize(step.position);
        for (const mark of step.marks ?? []) {
          if (!squareOnBoard(game, mark.square, size)) {
            failures.push(`${lesson.id}/${step.id}: mark '${mark.square}' is off the board`);
          }
          if (mark.text !== undefined && mark.text.length > 2) {
            failures.push(
              `${lesson.id}/${step.id}: mark text '${mark.text}' is longer than two characters`,
            );
          }
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('writes the copy every step needs', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      if (!lesson.title.trim()) failures.push(`${lesson.id}: no title`);
      if (!lesson.summary.trim()) failures.push(`${lesson.id}: no summary`);
      if (!lesson.outro.trim()) failures.push(`${lesson.id}: no outro`);

      for (const step of lesson.steps) {
        if (!step.instruction.trim()) failures.push(`${lesson.id}/${step.id}: no instruction`);
        if (step.expect.kind !== 'read' && !step.success?.trim()) {
          failures.push(`${lesson.id}/${step.id}: no success line on a step that asks for a move`);
        }
        const misses = step.misses ?? [];
        if (misses.length > 0) {
          const last = misses[misses.length - 1];
          if (last.when || last.match) {
            failures.push(
              `${lesson.id}/${step.id}: the last miss is conditional — there is no catch-all`,
            );
          }
          for (const miss of misses.slice(0, -1)) {
            if (!miss.when && !miss.match) {
              failures.push(`${lesson.id}/${step.id}: a catch-all miss sits before other entries`);
            }
          }
        }
        for (const miss of misses) {
          if (!miss.say.trim()) failures.push(`${lesson.id}/${step.id}: an empty miss line`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('stays a lesson rather than becoming a course', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      if (lesson.steps.length === 0) failures.push(`${lesson.id}: no steps`);
      if (lesson.steps.length > MAX_STEPS) {
        failures.push(`${lesson.id}: ${lesson.steps.length} steps — split it (max ${MAX_STEPS})`);
      }
      if (lesson.estimatedMinutes < 2 || lesson.estimatedMinutes > 12) {
        failures.push(`${lesson.id}: estimatedMinutes ${lesson.estimatedMinutes} is outside 2–12`);
      }
      if (lesson.learnerColor !== 'white' && lesson.learnerColor !== 'black') {
        failures.push(`${lesson.id}: learnerColor '${lesson.learnerColor}'`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('opens every segment on the learner’s turn', () => {
    // A step that resets the board and then asks the learner to move has to
    // hand them the move. Getting this wrong is invisible until a board sits
    // there refusing every piece.
    const failures: string[] = [];
    for (const lesson of lessons) {
      walk(lesson, rules, (step, _index, state) => {
        if (step.expect.kind === 'read') return;
        if (rules.currentTurn(state) !== lesson.learnerColor) {
          failures.push(
            `${lesson.id}/${step.id}: it is ${rules.currentTurn(state)} to move, but the ` +
              `learner is ${lesson.learnerColor}`,
          );
        }
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
