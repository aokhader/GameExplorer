'use client';

import React from 'react';
// Subpath import, not the barrel: `@gameexplorer/client`'s index pulls in
// `useSocket` → `@gameexplorer/db` → the Supabase client, which constructs
// itself at import time and needs env that a settings provider has no business
// requiring. Reaching straight for the hook keeps that whole tree out.
import {
  useSettingsStore,
  type SettingsStorage,
} from '@gameexplorer/client/hooks/useSettingsStore';
import type { Settings, ThemeChoice } from '@gameexplorer/shared';

/**
 * App-wide user preferences (client-only, persisted to localStorage).
 *
 * The model, hydration and persistence now live in `@gameexplorer/shared` and
 * `@gameexplorer/client` — this file is the web half that genuinely cannot be
 * shared: localStorage, the `prefers-reduced-motion` media query, and mirroring
 * the theme onto `<html data-theme>` for the `[data-theme]` blocks in
 * globals.css.
 *
 * Hydration-safe: SSR and the first client render use the defaults, then the
 * store reads localStorage and re-renders. That avoids a server/client mismatch
 * while keeping the stored value authoritative once mounted.
 */

export type { Settings, ThemeChoice };

/**
 * localStorage behind the async interface the shared store expects. The
 * promises resolve immediately; the cost is one microtask on mount, and the
 * benefit is that web and native run the same hydration code.
 */
const webStorage: SettingsStorage = {
  get: async (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: async (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore persist failure */
    }
  },
};

/**
 * The inline bootstrap script in layout.tsx has already set this for the first
 * paint; this keeps it in step with later changes and with what was stored.
 */
function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === 'dark') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** Effective reduced-motion: the user toggle OR the OS `prefers-reduced-motion`. */
  reducedMotion: boolean;
  /** False until persisted settings have been read back. */
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
  const { settings, setSetting, hydrated } = useSettingsStore({
    storage: webStorage,
    onTheme: applyTheme,
  });
  const [osReduceMotion, setOsReduceMotion] = React.useState(false);

  // Track the OS reduced-motion preference.
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setOsReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReduceMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
