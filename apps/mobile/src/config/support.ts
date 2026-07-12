import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** Where bug reports and concerns go — also shown on the web /privacy page. */
export const SUPPORT_EMAIL = 'gameexploreradmin@gmail.com';

/** The deployed web app (hosts /privacy, /settings — the store-required URLs). */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://game-explorer-site.vercel.app';

export const PRIVACY_URL = `${WEB_URL}/privacy`;

/**
 * mailto: URL for a support email, pre-filled with the context a bug report
 * needs (app version + platform) so users don't have to know to include it.
 */
export function supportMailtoUrl(topic = 'Bug report / feedback'): string {
  const subject = `GameExplorer — ${topic}`;
  const body = [
    '',
    '',
    '—',
    `App version: ${Constants.expoConfig?.version ?? 'unknown'}`,
    `Platform: ${Platform.OS} ${Platform.Version}`,
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
