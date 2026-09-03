import React from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Subpath import, not the barrel: `@finesse/client`'s index pulls in
// `useSocket` → `@finesse/db` → the Supabase client, which constructs
// itself at import time and needs env that a settings provider has no business
// requiring. Reaching straight for the hook keeps that whole tree out.
import {
  useSettingsStore,
  type SettingsStorage,
} from '@finesse/client/hooks/useSettingsStore';
import type { Settings, ThemeChoice } from '@finesse/shared';
import { setActiveTheme, type ThemeName } from '@finesse/ui';

/**
 * App-wide user preferences (device-local, persisted to AsyncStorage).
 *
 * The model, hydration and persistence live in `@finesse/shared` and
 * `@finesse/client`, shared verbatim with web. What stays here is the part
 * that genuinely differs: AsyncStorage, OS reduced-motion from
 * `AccessibilityInfo` rather than a media query, and applying the theme by
 * pushing it into the shared token runtime rather than setting a DOM attribute.
 */

export type { Settings };

/**
 * The theme union is declared in two packages that cannot import each other —
 * `packages/shared` has no dependencies, and `packages/ui` is where the runtime
 * lives. This app imports both, so it is the right place to make the compiler
 * check they agree; a member added to one and not the other fails here.
 */
type ThemeUnionsAgree = ThemeChoice extends ThemeName
  ? ThemeName extends ThemeChoice
    ? true
    : never
  : never;
const _themeUnionsAgree: ThemeUnionsAgree = true;
void _themeUnionsAgree;

/** AsyncStorage is already promise-based, so it satisfies the interface as-is. */
const nativeStorage: SettingsStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
};

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
  const { settings, setSetting, hydrated } = useSettingsStore({
    storage: nativeStorage,
    // The token runtime is what actually repaints the app; context state just
    // keeps the picker in sync and persists the choice.
    onTheme: setActiveTheme,
  });
  const [osReduceMotion, setOsReduceMotion] = React.useState(false);

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
