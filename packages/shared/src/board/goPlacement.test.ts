import { describe, expect, it } from 'vitest';
import {
  GO_CONFIRM_BOUNCE_MS,
  GO_POINT_DEAD_ZONE,
  inGoPointDeadZone,
  placementOnRelease,
} from './goPlacement';

/**
 * The two misclick guards, beside the aim-then-confirm rule they protect. The
 * rule's own cases live with the native board's suite
 * (`apps/mobile/src/__tests__/goPlacement.test.ts`), which has driven it since
 * before the rule moved here.
 */
describe('the confirm bounce guard', () => {
  it('ignores a confirming press that lands within the bounce window', () => {
    // One tap registering twice, or a double-tap meant to look: not a decision.
    expect(
      placementOnRelease({ confirm: true, released: 'd4', aimAtPress: 'd4', msSinceAim: 10 }),
    ).toBe('hold');
    expect(
      placementOnRelease({
        confirm: true,
        released: 'd4',
        aimAtPress: 'd4',
        msSinceAim: GO_CONFIRM_BOUNCE_MS - 1,
      }),
    ).toBe('hold');
  });

  it('plays once the window has passed', () => {
    expect(
      placementOnRelease({
        confirm: true,
        released: 'd4',
        aimAtPress: 'd4',
        msSinceAim: GO_CONFIRM_BOUNCE_MS,
      }),
    ).toBe('commit');
  });

  it('stands aside when the caller cannot time the aim', () => {
    expect(placementOnRelease({ confirm: true, released: 'd4', aimAtPress: 'd4' })).toBe('commit');
  });

  it('never delays a board that is not confirming', () => {
    expect(
      placementOnRelease({ confirm: false, released: 'd4', aimAtPress: null, msSinceAim: 0 }),
    ).toBe('commit');
  });
});

describe('inGoPointDeadZone', () => {
  it('claims the point across its middle', () => {
    expect(inGoPointDeadZone(0.5, 0.5)).toBe(false);
    expect(inGoPointDeadZone(0.2, 0.8)).toBe(false);
    expect(inGoPointDeadZone(GO_POINT_DEAD_ZONE * 1.5, 1 - GO_POINT_DEAD_ZONE * 1.5)).toBe(false);
  });

  it('withholds the point near any of its four edges', () => {
    const edge = GO_POINT_DEAD_ZONE / 2;
    expect(inGoPointDeadZone(edge, 0.5)).toBe(true);
    expect(inGoPointDeadZone(1 - edge, 0.5)).toBe(true);
    expect(inGoPointDeadZone(0.5, edge)).toBe(true);
    expect(inGoPointDeadZone(0.5, 1 - edge)).toBe(true);
  });
});
