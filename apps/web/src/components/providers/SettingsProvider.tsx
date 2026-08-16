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

/**
 * Visual themes. `dark` is Arcade Glow (the default identity); `cozy` is Cozy
 * Tabletop. Each is a `[data-theme]` block of `--c-*` overrides in globals.css
 * paired with a `THEMES` entry in `packages/ui/src/tokens.ts`.
 */
export type ThemeChoice = 'dark' | 'cozy';

export interface Settings {
  /** Play game sound effects (default off — opt-in). */
  sound: boolean;
  /** Vibrate on key events where supported, e.g. mobile (default off — opt-in). */
  haptics: boolean;
  /** User override that forces reduced motion regardless of OS setting. */
  reduceMotion: boolean;
  /** Show rank/file coordinate labels on boards. */
  showCoordinates: boolean;
  /**
   * Pass-and-play: turn the board around between turns so the player to move is
   * always at the bottom. Defaults ON, matching mobile — two people sharing one
   * screen expect the board to face whoever is thinking.
   */
  flipBoardPassAndPlay: boolean;
  /** Active visual theme. */
  theme: ThemeChoice;
}

const DEFAULTS: Settings = {
  sound: false,
  haptics: false,
  reduceMotion: false,
  showCoordinates: true,
  flipBoardPassAndPlay: true,
  theme: 'dark',
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
      if (raw) {
        const stored = { ...DEFAULTS, ...JSON.parse(raw) } as Settings;
        // A theme written by a newer build (or hand-edited storage) would set an
        // unknown `data-theme` and render an unstyled page — fall back instead.
        if (stored.theme !== 'cozy') stored.theme = 'dark';
        setSettings(stored);
      }
    } catch {
      /* corrupt/unavailable storage — keep defaults */
    }
  }, []);

  // Mirror the active theme onto <html> so the `[data-theme]` blocks in
  // globals.css take over. The inline bootstrap script in layout.tsx has already
  // done this for the first paint; this keeps it in step with later changes.
  React.useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

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
