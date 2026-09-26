import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

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
 * Which JavaScript this install is running: `2.0.0`, or `2.0.0 · update
 * 1a2b3c4d` once an over-the-air update has replaced the bundle the binary
 * shipped with. The id's first eight characters match `eas update:list`.
 *
 * Updates are not code-signed (security audit v2, GX-08: Expo offers signing
 * only on a paid plan), so the Expo account is what stands between a bad
 * update and every install. If one ever ships, this is how a user's report says
 * whether they are running it.
 */
export function appVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? 'unknown';
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) return version;
  return `${version} · update ${Updates.updateId.slice(0, 8)}`;
}

/**
 * mailto: URL for a support email, pre-filled with the context a bug report
 * needs (app version, the update it is running, platform) so users don't have
 * to know to include it.
 */
export function supportMailtoUrl(topic = 'Bug report / feedback'): string {
  const subject = `GameExplorer — ${topic}`;
  const body = [
    '',
    '',
    '—',
    `App version: ${appVersionLabel()}`,
    `Platform: ${Platform.OS} ${Platform.Version}`,
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
