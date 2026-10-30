// Retry an async call on a fixed backoff schedule.
//
// Deliberately small: no jitter and no retry-on-some-errors filter, because its
// one caller (the boot-time database check) wants neither. `sleep` is injectable
// so tests can run the whole schedule without waiting.

export interface RetryOptions {
  /** Wait before each retry. There are `delaysMs.length + 1` attempts in all. */
  delaysMs: readonly number[];
  /** Called after a failed attempt that will be retried, before the wait. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves with the first attempt that succeeds. When every attempt throws,
 * rejects with the LAST error — the one that best describes the state the
 * caller is giving up in.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { delaysMs, onRetry, sleep = realSleep } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delayMs = delaysMs[attempt - 1];
      if (delayMs === undefined) throw error;
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
