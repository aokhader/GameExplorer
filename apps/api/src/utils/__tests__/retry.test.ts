// retry(): the boot-time database check depends on it giving up at the right
// moment with the right error. `sleep` is injected, so no test actually waits.
import { describe, it, expect, vi } from 'vitest';
import { retry } from '../retry';

/** A call that fails `failures` times, then resolves with 'ok'. */
function flaky(failures: number) {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    if (calls <= failures) throw new Error(`failure ${calls}`);
    return 'ok';
  });
}

describe('retry', () => {
  it('resolves on the first try without sleeping', async () => {
    const sleep = vi.fn(async () => {});
    const fn = flaky(0);

    await expect(retry(fn, { delaysMs: [10, 20], sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('waits each delay in order before the attempt that succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const fn = flaky(2);

    await expect(retry(fn, { delaysMs: [10, 20, 40], sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it('makes delays + 1 attempts, then rejects with the LAST error', async () => {
    const sleep = vi.fn(async () => {});
    const fn = flaky(Infinity);

    await expect(retry(fn, { delaysMs: [10, 20], sleep })).rejects.toThrow('failure 3');
    expect(fn).toHaveBeenCalledTimes(3);
    // No wait after the final attempt: giving up is immediate.
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it('reports each retried failure with its attempt number and the coming wait', async () => {
    const onRetry = vi.fn();
    const fn = flaky(Infinity);

    await expect(retry(fn, { delaysMs: [10, 20], onRetry, sleep: async () => {} })).rejects.toThrow();
    expect(onRetry.mock.calls.map(([error, attempt, delayMs]) => [(error as Error).message, attempt, delayMs]))
      .toEqual([
        ['failure 1', 1, 10],
        ['failure 2', 2, 20],
      ]);
  });

  it('with no delays, is a single attempt', async () => {
    const fn = flaky(Infinity);

    await expect(retry(fn, { delaysMs: [], sleep: async () => {} })).rejects.toThrow('failure 1');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
