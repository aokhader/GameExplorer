import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** Where bug reports and concerns go — also shown on the web /privacy page. */
export const SUPPORT_EMAIL = 'gameexploreradmin@gmail.com';

/** The deployed web app (hosts /privacy, /terms, /settings — the store-required URLs). */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://game-explorer-site.vercel.app';

export const PRIVACY_URL = `${WEB_URL}/privacy`;

/**
 * Terms of service. Both stores expect one for an app with accounts, online
 * play and user-generated content; sign-up links here before the account is
 * created. Web-hosted rather than a native screen so a single document covers
 * both platforms and can be corrected without shipping a build.
 */
export const TERMS_URL = `${WEB_URL}/terms`;

/**
 * The public source repo, linked from Settings → Open source. The binary is
 * entirely MIT — Arasan replaced GPL Stockfish in July 2026, so there is no GPL
 * source offer to honour any more; see apps/mobile/LICENSE.md for the notices.
 */
export const SOURCE_REPO_URL = 'https://github.com/aokhader/GameExplorer';

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
