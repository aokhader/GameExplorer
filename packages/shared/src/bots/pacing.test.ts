import { describe, expect, it, vi } from 'vitest';
import { BOT_THINK_JITTER_MS, BOT_THINK_MIN_MS, botThinkMs } from './pacing';

describe('botThinkMs', () => {
  it('never replies sooner than two seconds', () => {
    expect(BOT_THINK_MIN_MS).toBe(2000);
    expect(botThinkMs(() => 0)).toBe(2000);
  });

  it('stays under the floor plus the jitter', () => {
    expect(BOT_THINK_JITTER_MS).toBe(1000);
    expect(botThinkMs(() => 0.9999)).toBe(2999);
  });

  it('returns whole milliseconds inside the window with the real random source', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const ms = botThinkMs();
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(BOT_THINK_MIN_MS);
      expect(ms).toBeLessThan(BOT_THINK_MIN_MS + BOT_THINK_JITTER_MS);
      seen.add(ms);
    }
    // It actually varies — a stuck generator would still pass the bounds.
    expect(seen.size).toBeGreaterThan(100);
  });

  it('never draws from Math.random, which the bots and the pinned e2e lines share', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      for (let i = 0; i < 50; i++) botThinkMs();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
