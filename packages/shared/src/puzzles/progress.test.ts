import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROGRESS,
  clearGame,
  clearPuzzles,
  isSolved,
  solvedAmong,
  parseProgress,
  recordBand,
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

describe('solvedAmong', () => {
  const progress = {
    ...EMPTY_PROGRESS,
    solved: ['chess-001', 'chess-002', 'chess-014', 'go-003'],
  };

  it('counts only the ids handed to it', () => {
    expect(solvedAmong(progress, ['chess-001', 'chess-002', 'chess-003'])).toBe(2);
  });

  it('is the fix for the "3 / 1" progress line', () => {
    // Two solves in one band and one in another. The whole-game count is 3; a
    // band holding one puzzle must report 1 of 1, not 3 of 1.
    const clubIds = ['chess-014'];
    expect(solvedCount(progress, 'chess')).toBe(3);
    expect(solvedAmong(progress, clubIds)).toBe(1);
    expect(solvedAmong(progress, clubIds)).toBeLessThanOrEqual(clubIds.length);
  });

  it('never exceeds the set it was given, whatever is in the record', () => {
    expect(solvedAmong(progress, [])).toBe(0);
    expect(solvedAmong(progress, ['nothing-here'])).toBe(0);
  });

  it('does not double-count a duplicated id', () => {
    expect(solvedAmong({ ...EMPTY_PROGRESS, solved: ['chess-001'] }, ['chess-001'])).toBe(1);
  });
});

describe('clearPuzzles', () => {
  const progress = {
    ...EMPTY_PROGRESS,
    solved: ['chess-001', 'chess-002', 'chess-014'],
    streak: 2,
  };

  it('clears only the ids given, leaving other bands intact', () => {
    // The reason this exists: `clearGame` would take chess-014 with it, so a
    // player restarting Beginner would silently lose their Club progress.
    const cleared = clearPuzzles(progress, ['chess-001', 'chess-002']);
    expect(cleared.solved).toEqual(['chess-014']);
  });

  it('returns the same object when nothing matched', () => {
    expect(clearPuzzles(progress, ['chess-999'])).toBe(progress);
    expect(clearPuzzles(progress, [])).toBe(progress);
  });

  it('leaves lastSeen alone — clearing a band does not change what was last seen', () => {
    const seen = { ...progress, lastSeen: { chess: 'chess-002' } as const };
    expect(clearPuzzles(seen, ['chess-002']).lastSeen).toEqual({ chess: 'chess-002' });
  });
});

describe('recordBand', () => {
  it('remembers the band per game', () => {
    let p = recordBand(EMPTY_PROGRESS, 'chess', 'club');
    p = recordBand(p, 'go', 'strong');
    expect(p.bands).toEqual({ chess: 'club', go: 'strong' });
  });

  it('returns the same object when nothing moved', () => {
    // The picker re-reports its band on every render; a fresh `updatedAt` each
    // time would make the store write on every paint.
    const p = recordBand(EMPTY_PROGRESS, 'chess', 'club');
    expect(recordBand(p, 'chess', 'club')).toBe(p);
  });

  it('does not disturb solves or the streak', () => {
    const solved = { ...EMPTY_PROGRESS, solved: ['chess-001'], streak: 3, bestStreak: 5 };
    const p = recordBand(solved, 'chess', 'master');
    expect(p.solved).toEqual(['chess-001']);
    expect(p.streak).toBe(3);
    expect(p.bestStreak).toBe(5);
  });
});

describe('the band field is a compatible addition', () => {
  it('reads a v1 record written before bands existed', () => {
    // The whole reason `v` stayed 1: an older record must keep its solves and
    // its streak, not be discarded to introduce a UI preference.
    const parsed = parseProgress(
      '{"v":1,"solved":["chess-001"],"streak":4,"bestStreak":9,"lastSeen":{"chess":"chess-001"},"updatedAt":"x"}',
    );
    expect(parsed.solved).toEqual(['chess-001']);
    expect(parsed.streak).toBe(4);
    expect(parsed.bestStreak).toBe(9);
    expect(parsed.bands).toEqual({});
  });

  it('survives a round trip through the store format', () => {
    const p = recordBand(EMPTY_PROGRESS, 'reversi', 'expert');
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });

  it('ignores a bands field of the wrong shape rather than throwing', () => {
    expect(parseProgress('{"v":1,"solved":[],"bands":"club"}').bands).toEqual({});
  });
});
