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

- **Mobile app — Stockfish (GPL).** `apps/mobile` statically links the
  [Stockfish](https://github.com/official-stockfish/Stockfish) chess engine
  (GPL-3.0-or-later, full text at
  [`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt)) via
  [@loloof64/react-native-stockfish](https://github.com/loloof64/ReactNativeStockfish).
  The first-party code remains MIT (MIT is GPL-compatible), but the mobile app
  binary **as a whole** is conveyed under GPL-3.0-or-later terms; the complete
  corresponding source for it is this repository. See
  [`apps/mobile/LICENSE.md`](apps/mobile/LICENSE.md).
- **Web app — Stockfish WASM.** `apps/web` serves unmodified Stockfish builds
  as separate Web Worker programs (mere use, not linking) — see
  `apps/web/public/stockfish/README.md`.

## Contributions

By submitting a contribution you agree it is licensed under MIT.
