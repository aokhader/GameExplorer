import { describe, expect, it } from 'vitest';
import {
  applyLessonReply,
  continueLesson,
  currentStep,
  isLessonAtLive,
  lessonBoard,
  lessonFraction,
  lessonHint,
  lessonHintText,
  markHintShown,
  offerMove,
  retryStep,
  seekLesson,
  startLesson,
} from './runtime';
import { chessPuzzleRules, reversiPuzzleRules } from '../puzzles/rules';
import type { Lesson } from './types';
import type { ChessGameState } from '../types/chess.types';
import type { ReversiGameState } from '../game-logic/reversi/types';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Read → any pawn move → an exact move with a scripted reply. */
const WALK: Lesson = {
  id: 'chess-l90',
  game: 'chess',
  title: 'A walk through the loop',
  summary: 'Three steps, one of each kind.',
  position: START_FEN,
  learnerColor: 'white',
  steps: [
    {
      id: 's1',
      instruction: 'White moves first.',
      expect: { kind: 'read' },
      marks: [{ square: 'e2', kind: 'origin' }],
    },
    {
      id: 's2',
      instruction: 'Move any pawn.',
      expect: { kind: 'any', match: { piece: 'pawn' } },
      success: 'That is a pawn move.',
      misses: [
        { when: ['g1f3'], say: 'That is the knight — try a pawn.' },
        { match: { piece: 'knight' }, say: 'Still a knight.' },
        { say: 'Pawns only for now.' },
      ],
    },
    {
      id: 's3',
      // A reset, so the reply below is legal whichever pawn was pushed above.
      position: START_FEN,
      instruction: 'Play e4.',
      expect: { kind: 'move', moves: ['e2e4'] },
      success: 'The classical first move.',
      reply: 'e7e5',
      hint: 'The pawn in front of the king.',
    },
  ],
  outro: 'That is the loop.',
  estimatedMinutes: 3,
};

describe('startLesson', () => {
  it('opens on the first step with the lesson summary already said', () => {
    const run = startLesson<ChessGameState>(WALK, chessPuzzleRules);
    expect(run.phase).toBe('reading');
    expect(run.stepIndex).toBe(0);
    expect(run.say).toBe('White moves first.');
    expect(run.sayKind).toBe('instruction');
    expect(run.marks).toEqual([{ square: 'e2', kind: 'origin' }]);
    expect(run.misses).toBe(0);
    expect(run.completed).toBe(0);
    expect(currentStep(run)?.id).toBe('s1');
  });

  it('lands straight on done for a lesson with no steps', () => {
    const empty = { ...WALK, steps: [] };
    const run = startLesson<ChessGameState>(empty, chessPuzzleRules);
    expect(run.phase).toBe('done');
    expect(run.say).toBe(empty.outro);
  });
});

describe('continueLesson', () => {
  it('advances a read step and opens the next one', () => {
    const run = continueLesson(startLesson<ChessGameState>(WALK, chessPuzzleRules), chessPuzzleRules);
    expect(run.stepIndex).toBe(1);
    expect(run.phase).toBe('acting');
    expect(run.completed).toBe(1);
    expect(run.say).toBe('Move any pawn.');
  });

  it('is a no-op while a move is owed, so a double tap cannot skip a step', () => {
    const acting = continueLesson(startLesson<ChessGameState>(WALK, chessPuzzleRules), chessPuzzleRules);
    expect(continueLesson(acting, chessPuzzleRules)).toBe(acting);
  });
});

describe('offerMove', () => {
  const acting = () =>
    continueLesson(startLesson<ChessGameState>(WALK, chessPuzzleRules), chessPuzzleRules);

  it('accepts any move matching the shape and keeps the success line', () => {
    const { run, result } = offerMove(acting(), chessPuzzleRules, { from: 'a2', to: 'a3' });
    expect(result).toBe('accepted');
    expect(run.say).toBe('That is a pawn move.');
    expect(run.sayKind).toBe('success');
    // The step advanced, and the new step's instruction is carried separately.
    expect(run.stepIndex).toBe(2);
    expect(currentStep(run)?.instruction).toBe('Play e4.');
  });

  it('rejects a wrong move without moving the board', () => {
    const before = acting();
    const { run, result } = offerMove(before, chessPuzzleRules, { from: 'g1', to: 'f3' });
    expect(result).toBe('missed');
    expect(run.phase).toBe('missed');
    expect(run.misses).toBe(1);
    expect(run.stepIndex).toBe(1);
    // Board untouched — no branch, no extra timeline entry.
    expect(run.timeline).toEqual(before.timeline);
    expect(chessPuzzleRules.encode(run.state)).toBe(START_FEN);
  });

  it('picks miss copy in order: named move, then shape, then catch-all', () => {
    const named = offerMove(acting(), chessPuzzleRules, { from: 'g1', to: 'f3' }).run;
    expect(named.say).toBe('That is the knight — try a pawn.');

    const shaped = offerMove(acting(), chessPuzzleRules, { from: 'b1', to: 'c3' }).run;
    expect(shaped.say).toBe('Still a knight.');

    // Illegal: nothing on e4 to move. The catch-all takes it, because the step
    // wrote one — the "not legal" default only applies when it did not.
    const other = offerMove(acting(), chessPuzzleRules, { from: 'e4', to: 'e5' }).run;
    expect(other.say).toBe('Pawns only for now.');
  });

  it('lets the learner move again straight after a miss', () => {
    const missed = offerMove(acting(), chessPuzzleRules, { from: 'g1', to: 'f3' }).run;
    const { run, result } = offerMove(missed, chessPuzzleRules, { from: 'e2', to: 'e4' });
    expect(result).toBe('accepted');
    expect(run.misses).toBe(1);
  });

  it('waits for the reply on a step that scripts one', () => {
    const step3 = offerMove(acting(), chessPuzzleRules, { from: 'a2', to: 'a3' }).run;
    const { run, result } = offerMove(step3, chessPuzzleRules, { from: 'e2', to: 'e4' });
    expect(result).toBe('accepted');
    expect(run.phase).toBe('replying');
    expect(run.state.currentTurn).toBe('black');
    expect(run.say).toBe('The classical first move.');
  });

  it('reports done when the accepted move was the last thing owed', () => {
    const step3 = offerMove(acting(), chessPuzzleRules, { from: 'a2', to: 'a3' }).run;
    const replying = offerMove(step3, chessPuzzleRules, { from: 'e2', to: 'e4' }).run;
    const finished = applyLessonReply(replying, chessPuzzleRules);
    expect(finished.phase).toBe('done');
    expect(finished.say).toBe('That is the loop.');
    expect(finished.sayKind).toBe('outro');
    expect(lessonFraction(finished)).toBe(1);
  });

  it('ignores input on a read step', () => {
    const reading = startLesson<ChessGameState>(WALK, chessPuzzleRules);
    const { run, result } = offerMove(reading, chessPuzzleRules, { from: 'e2', to: 'e4' });
    expect(result).toBe('ignored');
    expect(run).toBe(reading);
  });

  it('ignores input while the board is scrolled back', () => {
    const step3 = offerMove(acting(), chessPuzzleRules, { from: 'a2', to: 'a3' }).run;
    const scrolled = seekLesson(step3, 0);
    expect(isLessonAtLive(scrolled)).toBe(false);
    expect(offerMove(scrolled, chessPuzzleRules, { from: 'e2', to: 'e4' }).result).toBe('ignored');
  });

  it('ignores input during the reply beat', () => {
    const step3 = offerMove(acting(), chessPuzzleRules, { from: 'a2', to: 'a3' }).run;
    const replying = offerMove(step3, chessPuzzleRules, { from: 'e2', to: 'e4' }).run;
    expect(offerMove(replying, chessPuzzleRules, { from: 'd2', to: 'd4' }).result).toBe('ignored');
  });
});

describe('board resets', () => {
  it('records a segment boundary rather than implying a move made the jump', () => {
    const acting = continueLesson(
      startLesson<ChessGameState>(WALK, chessPuzzleRules),
      chessPuzzleRules,
    );
    // a2a3 is played, then step 3 resets to the opening.
    const run = offerMove(acting, chessPuzzleRules, { from: 'a2', to: 'a3' }).run;
    expect(run.timeline).toHaveLength(3);
    expect(run.segmentStarts).toEqual([0, 2]);
    expect(chessPuzzleRules.encode(run.state)).toBe(START_FEN);
  });

  it('does not append a reset that lands on the position already showing', () => {
    const same: Lesson = {
      ...WALK,
      steps: [
        { id: 'a', instruction: 'Read.', expect: { kind: 'read' } },
        {
          id: 'b',
          position: START_FEN,
          instruction: 'Play e4.',
          expect: { kind: 'move', moves: ['e2e4'] },
          success: 'Done.',
        },
      ],
    };
    const run = continueLesson(startLesson<ChessGameState>(same, chessPuzzleRules), chessPuzzleRules);
    expect(run.timeline).toHaveLength(1);
    expect(run.segmentStarts).toEqual([0]);
  });
});

describe('retryStep', () => {
  it('restores the instruction without advancing', () => {
    const acting = continueLesson(
      startLesson<ChessGameState>(WALK, chessPuzzleRules),
      chessPuzzleRules,
    );
    const missed = offerMove(acting, chessPuzzleRules, { from: 'g1', to: 'f3' }).run;
    const retried = retryStep(missed, chessPuzzleRules);
    expect(retried.stepIndex).toBe(1);
    expect(retried.phase).toBe('acting');
    expect(retried.say).toBe('Move any pawn.');
    expect(retried.sayKind).toBe('instruction');
    // Getting it wrong still happened.
    expect(retried.misses).toBe(1);
  });
});

describe('hints', () => {
  it('draws the first accepted move, and carries the written nudge beside it', () => {
    const acting = continueLesson(
      startLesson<ChessGameState>(WALK, chessPuzzleRules),
      chessPuzzleRules,
    );
    const step3 = offerMove(acting, chessPuzzleRules, { from: 'a2', to: 'a3' }).run;
    expect(lessonHint(step3, chessPuzzleRules)).toMatchObject({ from: 'e2', to: 'e4' });
    expect(lessonHintText(step3)).toBe('The pawn in front of the king.');
    expect(markHintShown(step3).hintShown).toBe(true);
  });

  it('has nothing to point at on a read step', () => {
    const reading = startLesson<ChessGameState>(WALK, chessPuzzleRules);
    expect(lessonHint(reading, chessPuzzleRules)).toBeNull();
    expect(lessonHintText(reading)).toBeNull();
  });
});

describe('seekLesson', () => {
  it('clamps and leaves the run alone when nothing moves', () => {
    const run = startLesson<ChessGameState>(WALK, chessPuzzleRules);
    expect(seekLesson(run, -5)).toBe(run);
    expect(lessonBoard(seekLesson(run, 99))).toBe(run.state);
  });
});

describe('reversi', () => {
  /**
   * A position where white, having moved, has no legal reply and must pass —
   * the settling rule the puzzle runtime already has, which a lesson needs for
   * exactly the same reason: no lesson spells a pass out.
   */
  const FORCED_PASS: Lesson = {
    id: 'reversi-l90',
    game: 'reversi',
    title: 'A pass',
    summary: 'White will have nothing to play.',
    position: 'XXXXXXXX/XXXXXXXX/XXXXXXXX/XXXXXXXX/XXXXXXXX/XXXXXXXX/XXXXOXOX/XXXX...X b',
    learnerColor: 'black',
    steps: [
      {
        id: 's1',
        instruction: 'Take e1.',
        expect: { kind: 'move', moves: ['e1'] },
        success: 'White has nothing to play — the turn comes straight back.',
      },
      {
        id: 's2',
        instruction: 'Now take g1.',
        expect: { kind: 'move', moves: ['g1'] },
        success: 'Two moves in a row, because the rules said so.',
      },
    ],
    outro: 'That is a forced pass.',
    estimatedMinutes: 2,
  };

  it('settles the auto-pass so the learner is never asked to play for the opponent', () => {
    const run = startLesson<ReversiGameState>(FORCED_PASS, reversiPuzzleRules);
    expect(run.phase).toBe('acting');

    const { run: after, result } = offerMove(run, reversiPuzzleRules, { from: 'e1', to: 'e1' });
    expect(result).toBe('accepted');
    // Black moved, white had nothing, and the turn came back to black without
    // the lesson ever scripting a pass.
    expect(after.state.currentTurn).toBe('black');
    expect(after.phase).toBe('acting');

    const done = offerMove(after, reversiPuzzleRules, { from: 'g1', to: 'g1' });
    expect(done.result).toBe('done');
  });
});
