import { describe, expect, it } from 'vitest';
import {
  SETTINGS_DEFAULTS,
  parseSettings,
  serializeSettings,
  type Settings,
} from './settings';

/**
 * `parseSettings` is the one piece of the old duplicated providers that could
 * actually break an app rather than just look wrong: it runs on every launch,
 * against whatever a previous build wrote, and its failure mode is a screen that
 * renders with no palette at all.
 */
describe('parseSettings', () => {
  it('falls back to defaults when nothing is stored', () => {
    expect(parseSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(parseSettings(undefined)).toEqual(SETTINGS_DEFAULTS);
    expect(parseSettings('')).toEqual(SETTINGS_DEFAULTS);
  });

  it('survives corrupt storage instead of taking the app down on launch', () => {
    for (const raw of ['{', 'null', 'not json', '[]']) {
      expect(() => parseSettings(raw)).not.toThrow();
    }
    expect(parseSettings('{')).toEqual(SETTINGS_DEFAULTS);
  });

  /**
   * A blob written before a setting existed is the normal case after any
   * release, not an edge case — every install upgrades through one.
   */
  it('merges an older blob over the defaults rather than using it as-is', () => {
    const old = JSON.stringify({ sound: true });
    const parsed = parseSettings(old);
    expect(parsed.sound).toBe(true);
    expect(parsed.flipBoardPassAndPlay).toBe(SETTINGS_DEFAULTS.flipBoardPassAndPlay);
    expect(parsed.showCoordinates).toBe(SETTINGS_DEFAULTS.showCoordinates);
  });

  /**
   * The failure this guards against is not cosmetic: on web an unknown theme
   * sets a `data-theme` no CSS block matches and the page renders unstyled; on
   * native every token resolves to undefined. Both are worse than ignoring the
   * stored value.
   */
  it('rejects a theme this build does not know', () => {
    expect(parseSettings(JSON.stringify({ theme: 'neon' })).theme).toBe('dark');
    expect(parseSettings(JSON.stringify({ theme: null })).theme).toBe('dark');
    expect(parseSettings(JSON.stringify({ theme: 'cozy' })).theme).toBe('cozy');
  });

  it('never hands back the shared defaults object for a caller to mutate', () => {
    const a = parseSettings(null);
    a.sound = true;
    expect(SETTINGS_DEFAULTS.sound).toBe(false);
    expect(parseSettings(null).sound).toBe(false);
  });

  it('round-trips through serialize', () => {
    const settings: Settings = { ...SETTINGS_DEFAULTS, sound: true, theme: 'cozy' };
    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
  });
});
