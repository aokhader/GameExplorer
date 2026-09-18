import { describe, expect, it } from 'vitest';
import {
  lastModeStorageKey,
  parseLastMode,
  parseSetup,
  serializeSetup,
  setupDefaults,
  setupStorageKey,
  setupSummary,
} from '../game/localSetup';

const raw = (v: unknown) => JSON.stringify(v);

describe('localSetup — defaults and keys', () => {
  it('matches the values the setup screens used to seed', () => {
    expect(setupDefaults('chess', 'bot')).toEqual({ elo: 1200, color: 'white', rated: true, custom: false });
    expect(setupDefaults('checkers', 'bot')).toEqual({ elo: 1100, color: 'white', rated: true });
    expect(setupDefaults('reversi', 'bot')).toEqual({ elo: 1100, color: 'black', rated: true });
    expect(setupDefaults('go', 'bot')).toMatchObject({ elo: 1100, color: 'black', size: 9, komi: 7.5, scoring: 'area' });
  });

  it('opens Liquidate pass-and-play on two seats and the bot form on three', () => {
    expect(setupDefaults('liquidate', 'pass-and-play').players).toBe(2);
    expect(setupDefaults('liquidate', 'bot').players).toBe(3);
  });

  it('keys per game and mode, under the gx: prefix', () => {
    expect(setupStorageKey('chess', 'training')).toBe('gx:setup:chess:training');
    expect(lastModeStorageKey('go')).toBe('gx:setup:go:mode');
  });
});

describe('localSetup — parsing', () => {
  it('falls back to the defaults for nothing, garbage, and non-objects', () => {
    const d = setupDefaults('chess', 'bot');
    expect(parseSetup('chess', 'bot', null)).toEqual(d);
    expect(parseSetup('chess', 'bot', '{not json')).toEqual(d);
    expect(parseSetup('chess', 'bot', '[1,2]')).toEqual(d);
    expect(parseSetup('chess', 'bot', '"white"')).toEqual(d);
  });

  it('round-trips a valid setup', () => {
    const setup = { elo: 2000, color: 'black' as const, rated: false, custom: false };
    expect(parseSetup('chess', 'bot', serializeSetup(setup))).toEqual(setup);
  });

  it('keeps each good field and replaces only the bad one', () => {
    expect(parseSetup('reversi', 'bot', raw({ elo: 1700, color: 'purple', rated: false }))).toEqual({
      elo: 1700,
      color: 'black',
      rated: false,
    });
  });

  it('snaps a tier game to its nearest tile, so a tile is always selected', () => {
    expect(parseSetup('checkers', 'bot', raw({ elo: 1234 })).elo).toBe(1100);
    expect(parseSetup('go', 'bot', raw({ elo: 99999 })).elo).toBe(2000);
  });

  it('snaps a preset chess strength to a tile but keeps a custom one exact', () => {
    expect(parseSetup('chess', 'bot', raw({ elo: 1350, custom: false })).elo).toBe(1200);
    const custom = parseSetup('chess', 'bot', raw({ elo: 1337, custom: true }));
    expect(custom).toMatchObject({ elo: 1325, custom: true });
  });

  it("clamps chess to the widest range either platform offers, leaving the binary's cap to the screen", () => {
    expect(parseSetup('chess', 'bot', raw({ elo: 3000, custom: true })).elo).toBe(3000);
    expect(parseSetup('chess', 'bot', raw({ elo: 9000, custom: true })).elo).toBe(3000);
    expect(parseSetup('chess', 'bot', raw({ elo: 10, custom: true })).elo).toBe(400);
  });

  it('only accepts Go rules the setup card offers', () => {
    const go = parseSetup('go', 'pass-and-play', raw({ size: 13, komi: 6.5, scoring: 'territory' }));
    expect(go).toMatchObject({ size: 13, komi: 6.5, scoring: 'territory' });
    const bad = parseSetup('go', 'bot', raw({ size: 11, komi: 3, scoring: 'japanese' }));
    expect(bad).toMatchObject({ size: 9, komi: 7.5, scoring: 'area' });
  });

  it('clamps Liquidate seats and rejects unknown enums', () => {
    expect(parseSetup('liquidate', 'bot', raw({ players: 40, board: 'huge', debtRule: 'x', botLevel: 'ruthless' }))).toEqual({
      players: 6,
      board: 'quick',
      debtRule: 'allow-negative',
      botLevel: 'ruthless',
    });
    expect(parseSetup('liquidate', 'bot', raw({ players: 0 })).players).toBe(2);
  });

  it('names a remembered setup in one line', () => {
    expect(setupSummary('chess', 'bot', { elo: 1200, color: 'white', rated: true, custom: false })).toBe(
      'vs Bot 1200 · White · Rated',
    );
    expect(setupSummary('reversi', 'training', { elo: 1100, color: 'black', rated: true })).toBe('Training · Black');
    expect(
      setupSummary('go', 'pass-and-play', { elo: 1100, color: 'black', rated: true, size: 13, komi: 6.5, scoring: 'area' }),
    ).toBe('Pass & Play · 13×13');
    expect(
      setupSummary('liquidate', 'bot', { players: 3, board: 'full', debtRule: 'allow-negative', botLevel: 'steady' }),
    ).toBe('vs 2 bots · 3 players · Full board');
  });

  it('reads a remembered mode, but never puzzles', () => {
    expect(parseLastMode('training')).toBe('training');
    expect(parseLastMode('online')).toBe('online');
    expect(parseLastMode('puzzles')).toBeNull();
    expect(parseLastMode(null)).toBeNull();
  });
});
