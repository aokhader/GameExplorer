import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SETTINGS_DEFAULTS,
  SETTINGS_STORAGE_KEY,
  parseSettings,
  serializeSettings,
  type Settings,
  type ThemeChoice,
} from '@gameexplorer/shared';

/**
 * The narrow slice of a key-value store this hook needs.
 *
 * Async on purpose, even though web's `localStorage` is synchronous: React
 * Native's `AsyncStorage` is not, and an interface that can only express the
 * synchronous case cannot describe both. Web wraps its sync calls in resolved
 * promises, which costs a microtask on mount and buys one implementation.
 */
export interface SettingsStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface UseSettingsStoreOptions {
  storage: SettingsStorage;
  /**
   * Apply the theme to whatever actually repaints on this platform — the
   * `[data-theme]` attribute on web, the token runtime on native. Called on
   * hydration (before the state update, so the first painted frame is already
   * correct) and on every later change.
   */
  onTheme?: (theme: ThemeChoice) => void;
}

export interface UseSettingsStoreResult {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** False until persisted settings have been read back. */
  hydrated: boolean;
}

/**
 * Load, hold and persist device preferences.
 *
 * This is the half of the old `SettingsProvider` that was identical on both
 * platforms: read once on mount, merge over the defaults, write back on every
 * change, and treat the in-session state as the source of truth so a failed
 * write never blocks the UI. What is left in each app is the genuinely
 * platform-bound part — the storage itself, the OS reduced-motion source, and
 * what "apply the theme" means.
 */
export function useSettingsStore({
  storage,
  onTheme,
}: UseSettingsStoreOptions): UseSettingsStoreResult {
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Read through refs so the load effect runs exactly once. A caller passing an
  // inline `{ get, set }` object or an arrow `onTheme` — which is the natural
  // way to write the call site — would otherwise re-run it on every render.
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const onThemeRef = useRef(onTheme);
  onThemeRef.current = onTheme;

  useEffect(() => {
    let cancelled = false;
    storageRef.current
      .get(SETTINGS_STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const stored = parseSettings(raw);
        // Applied before the state update so the first painted frame is already
        // in the right theme, with no flash of the default.
        onThemeRef.current?.(stored.theme);
        setSettings(stored);
      })
      .catch(() => {
        /* unavailable storage — keep defaults */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'theme') onThemeRef.current?.(next.theme);
      // Fire-and-forget: the UI state is authoritative for this session, so a
      // storage failure costs the next launch, not this one.
      void storageRef.current.set(SETTINGS_STORAGE_KEY, serializeSettings(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, setSetting, hydrated };
}
