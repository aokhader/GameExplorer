import { describe, expect, it } from 'vitest';
import { BOT_TIERS, botStrengthLabel, type RatedGameId } from './botTiers';

const GAMES: RatedGameId[] = ['chess', 'checkers', 'reversi', 'go'];

describe('botStrengthLabel', () => {
  it('calls a preset tier what the setup screen called it', () => {
    // The bug this closes: every preset renamed itself on the board, because
    // the custom ladder's bands start above each tier's number.
    for (const game of GAMES) {
      for (const tier of BOT_TIERS[game]) {
        expect(botStrengthLabel(game, tier.elo)).toBe(tier.label);
      }
    }
  });

  it('describes a custom strength between the tiers', () => {
    expect(botStrengthLabel('chess', 750)).toBe('Novice');
    expect(botStrengthLabel('chess', 1300)).toBe('Intermediate');
    expect(botStrengthLabel('chess', 2500)).toBe('International Master');
  });

  it('names the strongest bots even above the ladder', () => {
    expect(botStrengthLabel('chess', 2700)).toBe('Grandmaster');
    expect(botStrengthLabel('chess', 4000)).toBe('Grandmaster');
  });

  it('never returns an empty name', () => {
    for (const game of GAMES) {
      for (let elo = 100; elo <= 3000; elo += 50) {
        expect(botStrengthLabel(game, elo)).toBeTruthy();
      }
    }
  });
});
