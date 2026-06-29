/**
 * Conditional className joiner. Filters out falsy values and joins with spaces.
 * Lightweight stand-in for `clsx` — no dependency, sufficient for our needs.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
