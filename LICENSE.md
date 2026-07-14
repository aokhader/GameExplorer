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
  identity.

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

## Contributions

By submitting a contribution you agree it is licensed under MIT.
