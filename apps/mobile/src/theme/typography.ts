/**
 * Brand font families (loaded in the root layout via expo-font).
 *
 * Mirrors web's pairing: Space Grotesk for display/headings, DM Sans for body
 * (`apps/web/src/app/layout.tsx`). Each weight is its own family name on
 * native — set `fontFamily` from here and do NOT also set `fontWeight`, or
 * Android will synthesize a fake bold on top of the real cut.
 */
export const FONTS = {
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
