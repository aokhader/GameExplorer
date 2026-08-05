import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROGRESS,
  clearGame,
  isSolved,
  parseProgress,
  recordFailed,
  recordSeen,
  recordSolved,
  serializeProgress,
  solvedCount,
} from './progress';

describe('recordSolved', () => {
  it('records the solve and extends the streak on a clean one', () => {
    let progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    expect(isSolved(progress, 'chess-001')).toBe(true);
    expect(progress.streak).toBe(1);
    expect(progress.bestStreak).toBe(1);

    progress = recordSolved(progress, 'chess-002', true);
    expect(progress.streak).toBe(2);
    expect(progress.bestStreak).toBe(2);
  });

  it('still records a scrappy solve, but ends the streak', () => {
    let progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    progress = recordSolved(progress, 'chess-002', false);

    expect(isSolved(progress, 'chess-002')).toBe(true);
    expect(progress.streak).toBe(0);
    expect(progress.bestStreak).toBe(1);
  });

  it('keeps bestStreak once earned', () => {
    let progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    progress = recordSolved(progress, 'chess-002', true);
    progress = recordSolved(progress, 'chess-003', false);
    progress = recordSolved(progress, 'chess-004', true);

    expect(progress.streak).toBe(1);
    expect(progress.bestStreak).toBe(2);
  });

  it('does not duplicate an id, or pay a streak twice for the same puzzle', () => {
    let progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    progress = recordSolved(progress, 'chess-001', true);

    expect(progress.solved).toEqual(['chess-001']);
    expect(progress.streak).toBe(0);
  });

  it('leaves the input untouched', () => {
    const before = { ...EMPTY_PROGRESS };
    recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    expect(EMPTY_PROGRESS).toEqual(before);
    expect(EMPTY_PROGRESS.solved).toEqual([]);
  });
});

describe('recordFailed', () => {
  it('ends the streak without touching the solves', () => {
    let progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    progress = recordFailed(progress);

    expect(progress.streak).toBe(0);
    expect(progress.bestStreak).toBe(1);
    expect(progress.solved).toEqual(['chess-001']);
  });

  it('is a no-op when there is no streak to lose', () => {
    expect(recordFailed(EMPTY_PROGRESS)).toBe(EMPTY_PROGRESS);
  });
});

describe('solvedCount', () => {
  it('counts per game off the id prefix', () => {
    let progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    progress = recordSolved(progress, 'chess-002', true);
    progress = recordSolved(progress, 'reversi-001', true);

    expect(solvedCount(progress, 'chess')).toBe(2);
    expect(solvedCount(progress, 'reversi')).toBe(1);
    expect(solvedCount(progress, 'checkers')).toBe(0);
  });
});

describe('recordSeen', () => {
  it('tracks the last puzzle per game', () => {
    let progress = recordSeen(EMPTY_PROGRESS, 'chess', 'chess-004');
    progress = recordSeen(progress, 'reversi', 'reversi-002');

    expect(progress.lastSeen).toEqual({ chess: 'chess-004', reversi: 'reversi-002' });
  });

  it('is a no-op when nothing changed, so it cannot churn a save loop', () => {
    const progress = recordSeen(EMPTY_PROGRESS, 'chess', 'chess-004');
    expect(recordSeen(progress, 'chess', 'chess-004')).toBe(progress);
  });
});

describe('clearGame', () => {
  it('forgets one game and leaves the others alone', () => {
    let progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    progress = recordSolved(progress, 'reversi-001', true);
    progress = recordSeen(progress, 'chess', 'chess-001');
    progress = clearGame(progress, 'chess');

    expect(progress.solved).toEqual(['reversi-001']);
    expect(progress.lastSeen.chess).toBeUndefined();
    // The streak is a record of play, not of what is currently unsolved.
    expect(progress.bestStreak).toBe(2);
  });
});

describe('parseProgress', () => {
  it('round-trips a real record', () => {
    const progress = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  it('falls back to empty on anything it cannot trust', () => {
    expect(parseProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('')).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('not json')).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('[1,2,3]')).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('null')).toEqual(EMPTY_PROGRESS);
    // A future schema is discarded, not guessed at.
    expect(parseProgress('{"v":2,"solved":["chess-001"]}')).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('{"v":1}')).toEqual(EMPTY_PROGRESS);
  });

  it('repairs a partially-wrong record instead of dropping it', () => {
    const parsed = parseProgress('{"v":1,"solved":["chess-001",7,null],"streak":"lots"}');
    expect(parsed.solved).toEqual(['chess-001']);
    expect(parsed.streak).toBe(0);
    expect(parsed.bestStreak).toBe(0);
  });
});
