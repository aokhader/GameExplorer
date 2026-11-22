import { describe, it, expect } from 'vitest';
import { withGameLock, lockedGameCount } from '../gameLock';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('withGameLock', () => {
  it('runs one game\'s work one at a time, in the order it was queued', async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => withGameLock('g1', async () => {
      log.push(`${name} start`);
      await sleep(ms);
      log.push(`${name} end`);
      return name;
    });
    const results = await Promise.all([job('a', 30), job('b', 1), job('c', 10)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
  });

  it('does not hold one game up for another', async () => {
    const log: string[] = [];
    const slow = withGameLock('g-slow', async () => { await sleep(50); log.push('slow'); });
    const fast = withGameLock('g-fast', async () => { log.push('fast'); });
    await Promise.all([slow, fast]);
    expect(log).toEqual(['fast', 'slow']);
  });

  it('a job that throws rejects its own caller and does not block the next', async () => {
    const failing = withGameLock('g2', async () => { throw new Error('boom'); });
    const next = withGameLock('g2', async () => 'ran');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ran');
  });

  it('forgets a game once its queue is empty', async () => {
    await Promise.all([
      withGameLock('g3', async () => sleep(5)),
      withGameLock('g4', async () => { throw new Error('x'); }).catch(() => {}),
    ]);
    await sleep(0);
    expect(lockedGameCount()).toBe(0);
  });
});
