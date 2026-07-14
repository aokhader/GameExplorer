# License

The first-party source code in this directory is licensed under the
**MIT License** — see the repository root [`LICENSE.md`](../../LICENSE.md)
(note the branding exclusion there).

## Third-party notices — all MIT

The app statically links the
[Arasan chess engine](https://github.com/jdart1/arasan-chess) and bundles its
NNUE network (Copyright 1994-2026 by Jon Dart, MIT-style license) together
with the [Fathom](https://github.com/jdart1/Fathom) tablebase probing code
(MIT), via the local module
[`modules/react-native-arasan`](modules/react-native-arasan/LICENSE) — a fork
of the MIT wrapper
[@loloof64/react-native-stockfish](https://github.com/loloof64/ReactNativeStockfish)
with the engine replaced.

The whole app binary is therefore MIT-licensed (no GPL conveyance). Arasan
replaced the previously-linked GPL Stockfish in July 2026 so the same engine
can ship on Google Play **and** the Apple App Store, whose terms are
incompatible with the GPL.

Source for the app is available at <https://github.com/aokhader/GameExplorer>.
