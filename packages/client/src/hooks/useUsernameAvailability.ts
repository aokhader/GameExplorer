/**
 * Live username availability for a form field — shared by web and mobile.
 *
 * Feeds `usernameFieldState` (username.ts), which makes every decision; this
 * hook only decides WHEN to ask:
 *   - debounced 300ms (Lichess's number), so a request per keystroke never happens
 *   - never below 3 characters, or for a name local validation already refused
 *   - never for the user's own current name (it is "available" to them)
 *   - cached per name (case-insensitively, like the index), so backspacing to a
 *     name already asked about costs nothing; an `unknown` is not cached, so it
 *     is retried the next time that name comes round
 *   - a newer request supersedes an older one twice over: the older one is
 *     aborted, and a generation counter discards its answer if it lands anyway
 *   - an answer slower than USERNAME_CHECK_TIMEOUT_MS becomes `unknown`, so a
 *     cold-starting API delays the button by seconds, not by the whole cold start
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { validateUsername } from '@gameexplorer/shared';
import {
  checkUsernameAvailability,
  usernameFieldState,
  type UsernameCheck,
  type UsernameCheckSnapshot,
  type UsernameFieldOptions,
  type UsernameFieldState,
} from '../username';

export const USERNAME_CHECK_DEBOUNCE_MS = 300;
export const USERNAME_CHECK_TIMEOUT_MS = 5000;

export interface UseUsernameAvailabilityResult {
  state: UsernameFieldState;
  /**
   * Ask again now, bypassing the cache, and return the answer. For the moment
   * a sign-up has just failed and the form needs to know whether it was the
   * username — someone may have taken it since the last check.
   */
  recheck: () => Promise<UsernameCheck>;
}

export function useUsernameAvailability(
  raw: string,
  options: UsernameFieldOptions = {},
): UseUsernameAvailabilityResult {
  const value = raw.trim();
  const [debounced] = useDebounce(value, USERNAME_CHECK_DEBOUNCE_MS);
  const [check, setCheck] = useState<UsernameCheckSnapshot | null>(null);
  const cache = useRef(new Map<string, Exclude<UsernameCheck, 'unknown'>>());
  const generation = useRef(0);

  const own = options.currentUsername?.trim().toLowerCase() ?? null;

  useEffect(() => {
    // Every run supersedes whatever is in flight — including runs that end up
    // answered from the cache, which is why this is not inside the fetch branch.
    const gen = ++generation.current;

    if (validateUsername(debounced) !== 'ok') return;
    if (own && debounced.toLowerCase() === own) return;

    const key = debounced.toLowerCase();
    const cached = cache.current.get(key);
    if (cached) {
      setCheck({ username: debounced, result: cached });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), USERNAME_CHECK_TIMEOUT_MS);

    void checkUsernameAvailability(debounced, controller.signal).then((result) => {
      clearTimeout(timer);
      if (gen !== generation.current) return;
      if (result !== 'unknown') cache.current.set(key, result);
      setCheck({ username: debounced, result });
    });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [debounced, own]);

  const recheck = useCallback(async (): Promise<UsernameCheck> => {
    if (validateUsername(value) !== 'ok') return 'unknown';
    const gen = ++generation.current;
    const result = await checkUsernameAvailability(value);
    if (result !== 'unknown') cache.current.set(value.toLowerCase(), result);
    if (gen === generation.current) setCheck({ username: value, result });
    return result;
  }, [value]);

  return { state: usernameFieldState(raw, check, options), recheck };
}
