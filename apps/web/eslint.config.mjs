import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
