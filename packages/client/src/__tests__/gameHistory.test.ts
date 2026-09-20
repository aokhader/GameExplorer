import { describe, expect, it } from 'vitest';
import { opponentLabel } from '../game/gameHistory';

describe('opponentLabel', () => {
  it('names a bot by its strength', () => {
    expect(opponentLabel('bot', 'Elo-600')).toBe('Bot (600)');
    expect(opponentLabel('bot', 'Elo-2800')).toBe('Bot (2800)');
  });

  it('reads the rows chess already wrote as Stockfish', () => {
    // The engine's name leaked into history; those rows stay in the database.
    expect(opponentLabel('stockfish', 'Elo-1200')).toBe('Bot (1200)');
    expect(opponentLabel('Stockfish', 'Elo-1200')).toBe('Bot (1200)');
  });

  it('falls back to the bare word with no strength to show', () => {
    expect(opponentLabel('bot', null)).toBe('Bot');
    expect(opponentLabel('bot', 'training')).toBe('Bot');
    expect(opponentLabel('bot', undefined)).toBe('Bot');
  });

  it('leaves a person’s name alone', () => {
    expect(opponentLabel('AppleReviewTest', 'Elo-600')).toBe('AppleReviewTest');
    expect(opponentLabel('robotnik', null)).toBe('robotnik');
  });

  it('says something for a row with no opponent at all', () => {
    expect(opponentLabel(null)).toBe('Opponent');
    expect(opponentLabel('   ')).toBe('Opponent');
  });
});
