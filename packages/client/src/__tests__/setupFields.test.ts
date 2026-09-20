import { describe, expect, it } from 'vitest';
import { setupFields } from '../game/setupFields';
import { setupDefaults } from '../game/localSetup';

const signedIn = { signedIn: true };
const guest = { signedIn: false };

const keys = (game: Parameters<typeof setupDefaults>[0], mode: 'bot' | 'training' | 'pass-and-play', opts = signedIn) =>
  setupFields(game, mode, setupDefaults(game, mode), opts).map((f) => f.key);

describe('setupFields', () => {
  it('names the board size Go is about to be played on', () => {
    // The bug: the old summary printed the size only when it was not 9×9, so
    // the default said nothing at all.
    const fields = setupFields('go', 'bot', setupDefaults('go', 'bot'), signedIn);
    const board = fields.find((f) => f.key === 'size');
    expect(board?.value).toBe('9×9');
    expect(board?.options.map((o) => o.label)).toEqual(['9×9', '13×13', '19×19']);
  });

  it('offers strength, side and rated for a bot game', () => {
    expect(keys('chess', 'bot')).toEqual(['elo', 'color', 'rated']);
    expect(keys('checkers', 'bot')).toEqual(['elo', 'color', 'rated']);
  });

  it('offers Go its rules as well', () => {
    expect(keys('go', 'bot')).toEqual(['elo', 'color', 'size', 'scoring', 'komi', 'rated']);
  });

  it('drops strength and rated where they are not a choice', () => {
    // Pass-and-play has no bot and nothing to rate; training matches the bot to
    // the player's rating and is rated by definition.
    expect(keys('chess', 'pass-and-play')).toEqual(['color']);
    expect(keys('chess', 'training')).toEqual(['color']);
  });

  it('locks rated for a guest, with a reason', () => {
    const rated = setupFields('chess', 'bot', setupDefaults('chess', 'bot'), guest).find(
      (f) => f.key === 'rated',
    );
    expect(rated?.locked).toBe('Sign in to play rated games');
  });

  it('locks rated on a Go board that cannot be rated, and says why', () => {
    const setup = { ...setupDefaults('go', 'bot'), size: 19 };
    const rated = setupFields('go', 'bot', setup, signedIn).find((f) => f.key === 'rated');
    expect(rated?.locked).toMatch(/9×9/);
  });

  it('leaves rated alone on a standard Go board', () => {
    const rated = setupFields('go', 'bot', setupDefaults('go', 'bot'), signedIn).find(
      (f) => f.key === 'rated',
    );
    expect(rated?.locked).toBeUndefined();
  });

  it('applies a chosen option as a patch to the setup', () => {
    const setup = setupDefaults('chess', 'bot');
    const strength = setupFields('chess', 'bot', setup, signedIn).find((f) => f.key === 'elo')!;
    expect({ ...setup, ...strength.apply('2800') }).toMatchObject({ elo: 2800, custom: false });

    const rated = setupFields('chess', 'bot', setup, signedIn).find((f) => f.key === 'rated')!;
    expect({ ...setup, ...rated.apply('off') }).toMatchObject({ rated: false });
  });

  it('marks the option the setup is currently on', () => {
    const setup = { ...setupDefaults('chess', 'bot'), elo: 2800 };
    const strength = setupFields('chess', 'bot', setup, signedIn).find((f) => f.key === 'elo')!;
    expect(strength.selected).toBe('2800');
    expect(strength.options.some((o) => o.value === strength.selected)).toBe(true);
  });

  it('shows a custom rating as its number rather than a tier it is not on', () => {
    const setup = { ...setupDefaults('chess', 'bot'), elo: 1350, custom: true };
    const strength = setupFields('chess', 'bot', setup, signedIn).find((f) => f.key === 'elo')!;
    expect(strength.value).toBe('1350');
  });

  it('gives Liquidate the choices that define its game', () => {
    expect(keys('liquidate', 'bot')).toEqual(['players', 'botLevel', 'board', 'debtRule']);
    // Nobody to configure when both seats are human.
    expect(keys('liquidate', 'pass-and-play')).toEqual(['players', 'board', 'debtRule']);
  });

  it('always has a selected option among its own options', () => {
    const games = ['chess', 'checkers', 'reversi', 'go', 'liquidate'] as const;
    for (const game of games) {
      for (const mode of ['bot', 'pass-and-play'] as const) {
        for (const field of setupFields(game, mode, setupDefaults(game, mode), signedIn)) {
          expect(
            field.options.some((o) => o.value === field.selected),
            `${game}/${mode}/${field.key}`,
          ).toBe(true);
          expect(field.value).toBeTruthy();
        }
      }
    }
  });
});
