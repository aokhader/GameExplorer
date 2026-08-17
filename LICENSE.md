# License — MIT

Copyright (c) 2026 Abdulaziz Khader

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Scope

- The MIT license above covers all first-party source code in this repository.
- **Branding is excluded.** The "GameExplorer" name, logo, and brand assets are
  not covered by this license — forks must ship under their own name and
  identity. This covers the app icon set (`apps/mobile/assets/icon.png` and its
  adaptive/monochrome/splash variants) and the web icon
  ([`apps/web/src/app/icon.svg`](apps/web/src/app/icon.svg)) with the Open Graph
  card generated from it.
  - The web icon is **first-party**, authored as committed SVG source from the
    `packages/ui` color tokens (August 2026). It replaced the untouched
    `create-next-app` default, which was **Vercel's** logo and had been the
    site's only icon since the first commit — a third party's mark sitting
    inside a carve-out that claimed it as GameExplorer branding.

## Third-party engines

- **Mobile app — Arasan (MIT).** `apps/mobile` statically links the
  [Arasan](https://github.com/jdart1/arasan-chess) chess engine and its NNUE
  network (Copyright 1994-2026 by Jon Dart, MIT-style license) plus the
  [Fathom](https://github.com/jdart1/Fathom) tablebase probing code (MIT),
  vendored in `apps/mobile/modules/react-native-arasan/` (wrapper forked from
  the MIT [@loloof64/react-native-stockfish](https://github.com/loloof64/ReactNativeStockfish)).
  Everything in the mobile binary is MIT — it replaced GPL Stockfish
  (July 2026) so the same engine can ship on Google Play **and** the Apple
  App Store. See [`apps/mobile/LICENSE.md`](apps/mobile/LICENSE.md).
- **Web app — Stockfish WASM (GPL, mere use).** `apps/web` serves unmodified
  [Stockfish](https://github.com/official-stockfish/Stockfish) builds
  (GPL-3.0-or-later, full text at
  [`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt)) as
  separate Web Worker programs (mere use, not linking) — see
  `apps/web/public/stockfish/README.md`.

## Third-party assets

- **Chess piece shapes — "Merida" via Sashité (CC0 1.0).** The chess piece vector
  paths in [`packages/ui/src/chess/piecePaths.ts`](packages/ui/src/chess/piecePaths.ts)
  are derived from the [Sashité chess assets](https://sashite.dev/assets/chess/),
  released into the public domain under CC0 1.0 Universal (no attribution required;
  recorded here as a courtesy). They carry GameExplorer's own metallic-gradient
  coloring at render time. CC0 is compatible with this repository's MIT license.

## Contributions

By submitting a contribution you agree it is licensed under MIT.
