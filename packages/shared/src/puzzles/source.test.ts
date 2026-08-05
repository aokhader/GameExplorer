import { describe, expect, it } from 'vitest';
import { createStaticPuzzleSource, staticPuzzleSource } from './source';
import type { Puzzle, PuzzleDifficulty, PuzzleGame } from './types';

function puzzle(
  id: string,
  game: PuzzleGame,
  difficulty: PuzzleDifficulty,
  rating: number,
): Puzzle {
  return {
    id,
    game,
    position: 'x',
    playerColor: 'white',
    goal: 'best-move',
    prompt: 'p',
    difficulty,
    rating,
    themes: ['fork'],
    steps: [{ move: 'a1a2' }],
    explanation: 'e',
  };
}

const FIXTURE = {
  chess: [
    puzzle('chess-003', 'chess', 'hard', 1800),
    puzzle('chess-001', 'chess', 'easy', 900),
    puzzle('chess-002', 'chess', 'easy', 700),
  ],
  checkers: [puzzle('checkers-001', 'checkers', 'medium', 1200)],
  reversi: [],
} satisfies Record<PuzzleGame, Puzzle[]>;

const source = createStaticPuzzleSource(FIXTURE);

describe('createStaticPuzzleSource', () => {
  it('finds a puzzle by id, and reports a miss as null rather than throwing', async () => {
    expect((await source.getPuzzle('chess-001'))?.id).toBe('chess-001');
    expect(await source.getPuzzle('nope-999')).toBeNull();
  });

  it('counts per game, including an empty set', async () => {
    expect(await source.countPuzzles('chess')).toBe(3);
    expect(await source.countPuzzles('reversi')).toBe(0);
  });

  it('orders by difficulty, then rating, then id', async () => {
    const listed = await source.listPuzzles({ game: 'chess' });
    expect(listed.map((p) => p.id)).toEqual(['chess-002', 'chess-001', 'chess-003']);
  });

  it('filters by game, difficulty and theme', async () => {
    expect((await source.listPuzzles({ game: 'checkers' })).map((p) => p.id)).toEqual([
      'checkers-001',
    ]);
    expect((await source.listPuzzles({ difficulty: 'easy' })).map((p) => p.id)).toEqual([
      'chess-002',
      'chess-001',
    ]);
    expect(await source.listPuzzles({ theme: 'pin' })).toEqual([]);
  });

  it('serves the easiest unsolved puzzle first', async () => {
    expect((await source.nextPuzzle('chess'))?.id).toBe('chess-002');
    expect((await source.nextPuzzle('chess', { solvedIds: ['chess-002'] }))?.id).toBe('chess-001');
  });

  it('returns null once a set is exhausted', async () => {
    const solvedIds = ['chess-001', 'chess-002', 'chess-003'];
    expect(await source.nextPuzzle('chess', { solvedIds })).toBeNull();
    expect(await source.nextPuzzle('reversi')).toBeNull();
  });

  it('pages with `after`, even when the anchor has just been solved', async () => {
    expect((await source.nextPuzzle('chess', { after: 'chess-002' }))?.id).toBe('chess-001');
    // The anchor is excluded by `solvedIds` but still orders the page.
    expect(
      (await source.nextPuzzle('chess', { after: 'chess-002', solvedIds: ['chess-002'] }))?.id,
    ).toBe('chess-001');
    expect(await source.nextPuzzle('chess', { after: 'chess-003' })).toBeNull();
  });

  it('falls back to the first puzzle when the anchor is unknown', async () => {
    expect((await source.nextPuzzle('chess', { after: 'chess-999' }))?.id).toBe('chess-002');
  });

  it('honours a difficulty filter in `nextPuzzle`', async () => {
    expect((await source.nextPuzzle('chess', { difficulty: 'hard' }))?.id).toBe('chess-003');
  });

  it('is stable — the same query twice gives the same order', async () => {
    const a = await source.listPuzzles({ game: 'chess' });
    const b = await source.listPuzzles({ game: 'chess' });
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
  });
});

describe('staticPuzzleSource', () => {
  it('is backed by the shipped content', async () => {
    expect(await staticPuzzleSource.countPuzzles('chess')).toBeGreaterThan(0);
    const first = await staticPuzzleSource.nextPuzzle('chess');
    expect(first?.game).toBe('chess');
  });
});
