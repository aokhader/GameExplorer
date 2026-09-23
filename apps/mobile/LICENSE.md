# License

The first-party source code in this directory is licensed under the
**MIT License** — see the repository root [`LICENSE.md`](../../LICENSE.md)
(note the branding exclusion there).

## Third-party notices

The full notice for everything the app contains is shown in the app itself,
at **Settings → Open source**. That screen is generated from a production
bundle by [`scripts/generate-mobile-notices.mjs`](../../scripts/generate-mobile-notices.mjs)
into [`src/legal/notices.generated.ts`](src/legal/notices.generated.ts);
regenerate it after adding or upgrading a dependency. In summary:

- **Chess engine — MIT.** The app statically links the
  [Arasan chess engine](https://github.com/jdart1/arasan-chess) and bundles its
  NNUE network (Copyright 1994-2026 by Jon Dart, MIT-style license) together
  with the [Fathom](https://github.com/jdart1/Fathom) tablebase probing code
  (MIT; Copyright 2013-2018 Ronald de Man, 2015 basil00, 2016-2025 Jon Dart),
  via the local module
  [`modules/react-native-arasan`](modules/react-native-arasan/LICENSE) — a fork
  of the MIT wrapper
  [@loloof64/react-native-stockfish](https://github.com/loloof64/ReactNativeStockfish)
  with the engine replaced.
- **Libraries — MIT, ISC, BSD, 0BSD and Apache-2.0.** React Native, Expo and
  the other packages in the JavaScript bundle, each under its own license.
- **Fonts — SIL Open Font License 1.1.** DM Sans, Space Grotesk, Spectral and
  Nunito Sans, bundled through `@expo-google-fonts` (full text at
  [`LICENSES/OFL-1.1.txt`](../../LICENSES/OFL-1.1.txt)).
- **Interface icons — MIT.** Phosphor Icons path data (Copyright (c) 2023
  Phosphor Icons).
- **Content — CC0 1.0.** The chess piece shapes ("Merida" via Sashité) and the
  chess puzzles credited to the Lichess open puzzle database.

No GPL code is linked into the app. Arasan replaced the previously-linked GPL
Stockfish in July 2026 so the same engine can ship on Google Play **and** the
Apple App Store, whose terms are incompatible with the GPL.

Source for the app is available at <https://github.com/aokhader/GameExplorer>.
