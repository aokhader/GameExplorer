/**
 * The key-value store the client layer's persistent hooks are written against.
 *
 * One interface for both platforms, async because React Native's AsyncStorage is.
 * Web wraps its synchronous store in resolved promises — the same trade
 * `SettingsStorage` makes, and a structural superset of it, so a settings store
 * with `remove` added satisfies this one too.
 *
 * `getSync` is the one concession to the synchronous store. A setup screen that
 * can read its remembered choices before the first paint should, or it paints the
 * defaults and then visibly snaps to what the player picked last time. Native
 * leaves it out and its screens wait a frame for the read instead.
 *
 * Every method is allowed to fail. Callers treat a failed read as "nothing
 * stored" and a failed write as "not remembered this time": storage that is full,
 * disabled or private must never stop a game from being played.
 */
export interface LocalStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Synchronous read, for stores that have one (web). */
  getSync?(key: string): string | null;
}
