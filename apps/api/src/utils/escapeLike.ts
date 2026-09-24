/**
 * Escape the LIKE metacharacters so a username of `%` can't match every row.
 * (A wildcard that matched exactly one user would still need that user's
 * password, but there is no reason to hand out the pattern match at all.)
 *
 * `_` is a legal username character, so this is load-bearing and not just
 * defence in depth: unescaped, a lookup for `b_b` would match `bob`.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
