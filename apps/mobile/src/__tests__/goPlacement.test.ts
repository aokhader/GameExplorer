import { placementOnRelease } from '@/board/goPlacement';
import { SETTINGS_DEFAULTS, confirmPlacementFor, parseSettings } from '@gameexplorer/shared';

/**
 * When a press plays a Go stone.
 *
 * A stone cannot be taken back, so the cost of the two failure modes is not
 * symmetric: refusing to place when the player meant to is an annoyance, and
 * placing when they did not is a lost game. Every case below is chosen with
 * that asymmetry in mind.
 */

describe('confirmPlacementFor', () => {
  it('leaves 9×9 alone unless the player asks', () => {
    expect(confirmPlacementFor(9, { confirmMove: false })).toBe(false);
    expect(confirmPlacementFor(9, { confirmMove: true })).toBe(true);
  });

  it('forces confirmation above 9×9 whatever the setting says', () => {
    // Not a preference at 13×13 and 19×19: a point is smaller than a fingertip,
    // and a player who has never opened settings must not lose a game to that.
    for (const size of [13, 19]) {
      expect(confirmPlacementFor(size, { confirmMove: false })).toBe(true);
      expect(confirmPlacementFor(size, { confirmMove: true })).toBe(true);
    }
  });

  it('is off by default, so the shipped 9×9 tap is unchanged', () => {
    expect(SETTINGS_DEFAULTS.confirmMove).toBe(false);
    expect(confirmPlacementFor(9, SETTINGS_DEFAULTS)).toBe(false);
  });

  it('survives a stored blob written before the setting existed', () => {
    // Every install has one of these. `parseSettings` merges over the defaults,
    // so an older blob must come back usable rather than undefined.
    const older = JSON.stringify({ sound: true, showCoordinates: false });
    expect(parseSettings(older).confirmMove).toBe(false);
    expect(parseSettings(null).confirmMove).toBe(false);
  });
});

describe('placementOnRelease', () => {
  it('plays immediately when confirmation is off', () => {
    expect(placementOnRelease({ confirm: false, released: 'd4', aimAtPress: null })).toBe('commit');
  });

  it('only aims on the first press', () => {
    expect(placementOnRelease({ confirm: true, released: 'd4', aimAtPress: null })).toBe('hold');
  });

  it('plays on a second press of the same point', () => {
    expect(placementOnRelease({ confirm: true, released: 'd4', aimAtPress: 'd4' })).toBe('commit');
  });

  it('re-aims rather than playing when the second press lands elsewhere', () => {
    expect(placementOnRelease({ confirm: true, released: 'q16', aimAtPress: 'd4' })).toBe('hold');
  });

  it('does NOT play when the finger drags onto the aimed point', () => {
    /*
     * The case the whole feature exists for. The press began somewhere else and
     * slid onto the aimed point — the player is looking at where the stone would
     * go, not asking for it. `aimAtPress` is what was aimed when the press
     * began, so this correctly reads as a fresh aim.
     *
     * A rule written against where the finger *ended* would fire here, on the
     * one gesture that must be safe.
     */
    expect(placementOnRelease({ confirm: true, released: 'd4', aimAtPress: 'q16' })).toBe('hold');
  });

  it('needs two presses on the same point, in sequence, and nothing less', () => {
    // The full sequence a player performs, as the board would drive it.
    let aim: string | null = null;
    const press = (point: string): string => {
      const aimAtPress = aim;
      aim = point; // pressing always re-aims
      const outcome = placementOnRelease({ confirm: true, released: point, aimAtPress });
      if (outcome === 'commit') aim = null;
      return outcome;
    };

    expect(press('d4')).toBe('hold');
    expect(press('q16')).toBe('hold');
    expect(press('q16')).toBe('commit');
    // And after committing, the next press starts a fresh aim rather than
    // playing again at the point that was just used.
    expect(press('q16')).toBe('hold');
  });
});
