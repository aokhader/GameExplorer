import React from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * App-wide user preferences (device-local, persisted to AsyncStorage).
 *
 * The native mirror of the web `SettingsProvider` — same `Settings` shape and
 * `useSettings()` contract so screens read the exact same semantic vocabulary.
 * Differences from web:
 *   - persistence is AsyncStorage (async) instead of localStorage (sync), so we
 *     load in an effect and re-render, exactly like web's hydration pass;
 *   - OS reduced-motion comes from `AccessibilityInfo` instead of a matchMedia
 *     query.
 *
 * Sound + haptics default OFF (opt-in), matching web.
 */

export interface Settings {
  /** Play game sound effects (default off — opt-in). */
  sound: boolean;
  /** Vibrate on key events (default off — opt-in). */
  haptics: boolean;
  /** User override that forces reduced motion regardless of the OS setting. */
  reduceMotion: boolean;
  /** Show rank/file coordinate labels on boards. */
  showCoordinates: boolean;
  /** Flip the board between turns in pass-and-play (M4). Kept here so the store
   *  shape is stable; unused until pass-and-play ships. */
  flipBoardPassAndPlay: boolean;
}

const DEFAULTS: Settings = {
  sound: false,
  haptics: false,
  reduceMotion: false,
  showCoordinates: true,
  flipBoardPassAndPlay: true,
};

const STORAGE_KEY = 'gx:settings';

interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** Effective reduced-motion: the user toggle OR the OS accessibility setting. */
  reducedMotion: boolean;
  /** False until persisted settings have been read from AsyncStorage. */
  hydrated: boolean;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

/** Read user preferences. Must be used under <SettingsProvider>. */
export function useSettings(): SettingsContextValue {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a <SettingsProvider>');
  return ctx;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<Settings>(DEFAULTS);
  const [osReduceMotion, setOsReduceMotion] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  // Load persisted settings once on mount.
  React.useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
          } catch {
            /* corrupt storage — keep defaults */
          }
        }
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

  // Track the OS reduced-motion accessibility preference.
  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setOsReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setOsReduceMotion(enabled),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const setSetting = React.useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        // Fire-and-forget persist; UI state is the source of truth in-session.
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const value = React.useMemo<SettingsContextValue>(
    () => ({
      settings,
      setSetting,
      reducedMotion: settings.reduceMotion || osReduceMotion,
      hydrated,
    }),
    [settings, setSetting, osReduceMotion, hydrated],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
