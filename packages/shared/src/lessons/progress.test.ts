import { describe, expect, it } from 'vitest';
import {
  EMPTY_LESSON_PROGRESS,
  clearLesson,
  completedAmong,
  furthestStep,
  isLessonCompleted,
  parseLessonProgress,
  recordLessonCompleted,
  recordLessonSeen,
  recordStep,
  serializeLessonProgress,
} from './progress';

describe('recordStep', () => {
  it('remembers the furthest step, not the latest one', () => {
    const at5 = recordStep(EMPTY_LESSON_PROGRESS, 'chess-l01', 5);
    expect(furthestStep(at5, 'chess-l01')).toBe(5);

    // Scrolling back through a finished lesson must not un-learn it.
    const backTo2 = recordStep(at5, 'chess-l01', 2);
    expect(backTo2).toBe(at5);
    expect(furthestStep(backTo2, 'chess-l01')).toBe(5);
  });

  it('reports 0 for a lesson never opened', () => {
    expect(furthestStep(EMPTY_LESSON_PROGRESS, 'go-l07')).toBe(0);
  });
});

describe('completion', () => {
  it('records once and does not duplicate', () => {
    const once = recordLessonCompleted(EMPTY_LESSON_PROGRESS, 'go-l01');
    const twice = recordLessonCompleted(once, 'go-l01');
    expect(twice).toBe(once);
    expect(once.completed).toEqual(['go-l01']);
    expect(isLessonCompleted(once, 'go-l01')).toBe(true);
  });

  it('counts only the ids asked about', () => {
    let progress = recordLessonCompleted(EMPTY_LESSON_PROGRESS, 'chess-l01');
    progress = recordLessonCompleted(progress, 'go-l01');
    expect(completedAmong(progress, ['chess-l01', 'chess-l02'])).toBe(1);
  });
});

describe('recordLessonSeen', () => {
  it('returns the record unchanged when nothing moved', () => {
    const seen = recordLessonSeen(EMPTY_LESSON_PROGRESS, 'chess', 'chess-l01');
    expect(recordLessonSeen(seen, 'chess', 'chess-l01')).toBe(seen);
    expect(seen.lastSeen.chess).toBe('chess-l01');
  });
});

describe('clearLesson', () => {
  it('forgets one lesson and leaves the rest alone', () => {
    let progress = recordStep(EMPTY_LESSON_PROGRESS, 'chess-l01', 4);
    progress = recordLessonCompleted(progress, 'chess-l01');
    progress = recordStep(progress, 'chess-l02', 2);

    const cleared = clearLesson(progress, 'chess-l01');
    expect(furthestStep(cleared, 'chess-l01')).toBe(0);
    expect(isLessonCompleted(cleared, 'chess-l01')).toBe(false);
    expect(furthestStep(cleared, 'chess-l02')).toBe(2);
  });

  it('is a no-op for a lesson that was never started', () => {
    expect(clearLesson(EMPTY_LESSON_PROGRESS, 'go-l01')).toBe(EMPTY_LESSON_PROGRESS);
  });
});

describe('parseLessonProgress', () => {
  it('round-trips a real record', () => {
    let progress = recordStep(EMPTY_LESSON_PROGRESS, 'chess-l01', 3);
    progress = recordLessonCompleted(progress, 'chess-l01');
    progress = recordLessonSeen(progress, 'chess', 'chess-l01');
    expect(parseLessonProgress(serializeLessonProgress(progress))).toEqual(progress);
  });

  it('never throws — every bad input comes back empty', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '"a string"', '42']) {
      expect(parseLessonProgress(raw)).toEqual(EMPTY_LESSON_PROGRESS);
    }
  });

  it('discards a record from a schema it does not know', () => {
    expect(parseLessonProgress(JSON.stringify({ v: 2, steps: { a: 1 }, completed: [] }))).toEqual(
      EMPTY_LESSON_PROGRESS,
    );
  });

  it('drops junk inside an otherwise valid record rather than the whole record', () => {
    const parsed = parseLessonProgress(
      JSON.stringify({
        v: 1,
        steps: { 'chess-l01': 3, 'chess-l02': 'nope', 'chess-l03': -1 },
        completed: ['chess-l01', 7],
        lastSeen: { chess: 'chess-l01' },
        updatedAt: 5,
        // A field a later version added. An old client must not choke on it.
        somethingNew: { deep: true },
      }),
    );
    expect(parsed.steps).toEqual({ 'chess-l01': 3 });
    expect(parsed.completed).toEqual(['chess-l01']);
    expect(parsed.lastSeen.chess).toBe('chess-l01');
    expect(parsed.updatedAt).toBe('');
  });
});
