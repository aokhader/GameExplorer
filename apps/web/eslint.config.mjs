import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ── Design-system guards ─────────────────────────────────────────────────────

/**
 * No arbitrary pixel font sizes or radii. Every step the product uses has a
 * name — Tailwind's own, plus the `text-3xs`, `text-2xs`, `text-caption`,
 * `text-label`, `text-body` and `text-display` steps declared in globals.css
 * from `FONT_SIZES` in packages/ui. An arbitrary value is how 26 font sizes
 * happened. Only fixed lengths (px, rem) are banned: a percentage like the
 * lesson marks' `rounded-[15%]` scales with the board, the way mobile's
 * `sq * 0.14` does, and has no business on a fixed scale.
 * `text-[color:var(--x)]` and `rounded-[inherit]` are untouched.
 */
const SCALE_MESSAGE =
  "Use a named type or radius step (text-caption, text-label, rounded-2xl…) instead of an arbitrary pixel value.";
const SCALE_GUARDS = [
  {
    selector: "Literal[value=/\\b(text|rounded(-[trblse]{1,2})?)-\\[\\d+(\\.\\d+)?(px|rem)\\]/]",
    message: SCALE_MESSAGE,
  },
  {
    selector: "TemplateElement[value.raw=/\\b(text|rounded(-[trblse]{1,2})?)-\\[\\d+(\\.\\d+)?(px|rem)\\]/]",
    message: SCALE_MESSAGE,
  },
];

/**
 * No emoji in interface text. They draw differently on every platform, cannot
 * take a theme colour, and were the site's icon system until the vendored
 * Phosphor set in packages/ui replaced them. The ranges are emoji-presentation
 * pictographs and symbols; typographic marks such as arrows and geometric shapes
 * are left alone, and comments are not checked.
 */
const EMOJI = String.raw`/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{23E9}-\u{23FA}]/u`;
const EMOJI_MESSAGE = "Use Icon from @gameexplorer/ui instead of an emoji or symbol glyph in interface text.";
const EMOJI_GUARDS = [
  { selector: `Literal[value=${EMOJI}]`, message: EMOJI_MESSAGE },
  { selector: `TemplateElement[value.raw=${EMOJI}]`, message: EMOJI_MESSAGE },
  { selector: `JSXText[value=${EMOJI}]`, message: EMOJI_MESSAGE },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party bundles served as static assets — not our code to lint
    "public/**",
    // Pre-refactor layout snapshots kept for reference — not live code
    "reference-layouts/**",
  ]),
  {
    rules: {
      // react-hooks v7 added set-state-in-effect which flags calling setState
      // synchronously inside useEffect. These patterns are intentional in our
      // board animation components (e.g. resetting selection on turn change).
      // Downgrade from error to warn so CI doesn't block; clean up in a future pass.
      "react-hooks/set-state-in-effect": "warn",
      // react-hooks v7 also promoted `refs` (read/write of a ref during render)
      // to an error. PageTransition intentionally sets a render-time ref to gate
      // first-paint animations behind `data-animate` so statically-prerendered
      // HTML paints visible on first load (tech spec v4.11 / commit 270c9bc — the
      // server render and first client render both omit the marker, so hydration
      // matches). Keep it visible as a warning rather than block CI on the pattern.
      "react-hooks/refs": "warn",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...SCALE_GUARDS, ...EMOJI_GUARDS],
    },
  },
  {
    // Exempt from the emoji guard only. Liquidate's dock, panels and tiles speak
    // a deliberate glyph language shared with the mobile app, carried over from
    // its design mock — revisit it as a whole, on both platforms, rather than
    // piecemeal. The scale guard still applies: a flat-config override replaces
    // the whole rule, so it is restated here.
    files: ["src/components/liquidate/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...SCALE_GUARDS],
    },
  },
]);

export default eslintConfig;
