'use client';

import React from 'react';

/**
 * App-wide user preferences (client-only, persisted to localStorage).
 *
 * These are *device* preferences, not account settings — sound, haptics, motion
 * and board niceties. Sound + haptics default OFF (opt-in, surfaced in Settings).
 *
 * Hydration-safe: SSR + first client render use DEFAULTS, then we read
 * localStorage in an effect and re-render. This avoids a server/client mismatch
 * while keeping the stored value authoritative once mounted.
 */

export interface Settings {
  /** Play game sound effects (default off — opt-in). */
  sound: boolean;
  /** Vibrate on key events where supported, e.g. mobile (default off — opt-in). */
  haptics: boolean;
  /** User override that forces reduced motion regardless of OS setting. */
  reduceMotion: boolean;
  /** Show rank/file coordinate labels on boards. */
  showCoordinates: boolean;
}

const DEFAULTS: Settings = {
  sound: false,
  haptics: false,
  reduceMotion: false,
  showCoordinates: true,
};

const STORAGE_KEY = 'gx:settings';

interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** Effective reduced-motion: the user toggle OR the OS `prefers-reduced-motion`. */
  reducedMotion: boolean;
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

  // Load persisted settings once on mount (client only).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* corrupt/unavailable storage — keep defaults */
    }
  }, []);

  // Track OS reduced-motion preference.
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setOsReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReduceMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setSetting = React.useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore persist failure */
        }
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
    }),
    [settings, setSetting, osReduceMotion],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
