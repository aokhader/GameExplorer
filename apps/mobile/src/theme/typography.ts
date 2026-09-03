/**
 * Brand font families (loaded in the root layout via expo-font).
 *
 * Mirrors web's per-theme pairing (`apps/web/src/app/layout.tsx` + the
 * `--font-body` / `--font-display` vars in globals.css):
 *   - Arcade Glow — Space Grotesk display over DM Sans body (geometric, arcade);
 *   - Cozy Tabletop — Spectral display over Nunito Sans body (a book serif over
 *     a humanist sans), the design doc's voice.
 *
 * Each weight is its own family name on native — set `fontFamily` from here and
 * do NOT also set `fontWeight`, or Android will synthesize a fake bold on top of
 * the real cut.
 *
 * `FONTS` is a live view like the color tokens (see `packages/ui/src/themeRuntime`),
 * so `FONTS.body` returns the active theme's face and call sites never change.
 * Every family is loaded up front, so a switch has nothing to wait for.
 */
import { liveView } from '@finesse/ui';

const ARCADE_FONTS = {
  /** Space Grotesk 700 — headlines, wordmark, big numbers. */
  display: 'SpaceGrotesk_700Bold',
  /** Space Grotesk 600 — section labels, card titles. */
  displaySemi: 'SpaceGrotesk_600SemiBold',
  /** Space Grotesk 500 — quieter display text. */
  displayMedium: 'SpaceGrotesk_500Medium',
  /** DM Sans 400 — body copy. */
  body: 'DMSans_400Regular',
  /** DM Sans 500 — emphasized body. */
  bodyMedium: 'DMSans_500Medium',
  /** DM Sans 600 — labels, buttons-secondary. */
  bodySemi: 'DMSans_600SemiBold',
  /** DM Sans 700 — CTAs, tab labels, strong UI text. */
  bodyBold: 'DMSans_700Bold',
} as const;

const COZY_FONTS = {
  // Spectral is a text serif, so its bold runs lighter than Space Grotesk's at
  // the same nominal weight — display steps up one cut to keep headings as loud.
  display: 'Spectral_800ExtraBold',
  displaySemi: 'Spectral_700Bold',
  displayMedium: 'Spectral_600SemiBold',
  body: 'NunitoSans_400Regular',
  bodyMedium: 'NunitoSans_500Medium',
  bodySemi: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',
} as const;

export const FONTS = liveView({ dark: ARCADE_FONTS, cozy: COZY_FONTS });
