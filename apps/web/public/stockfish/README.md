# Stockfish.js engine assets

The files in this directory are **unmodified builds of Stockfish.js 18.0.8**
(lite, multi-threaded and single-threaded WASM variants) — Copyright (c) 2026
**Chess.com, LLC**, licensed under the **GNU General Public License v3.0 or
later**.

Stockfish.js is an Emscripten port of Stockfish, and it — not upstream
Stockfish — is the work actually conveyed to every visitor. GPLv3 §6 requires
that recipients be offered the corresponding source **for the work they
receive, at the version they receive**, so the offer below names Stockfish.js.
Pointing at upstream Stockfish would send recipients to a repository that does
not contain the corresponding source for these artifacts.

- Conveyed work, version 18.0.8, and its complete corresponding source:
  <https://github.com/nmrugg/stockfish.js>
- License text: <https://www.gnu.org/licenses/gpl-3.0.txt>

Upstream attribution, as carried in the artifacts' own banner: Stockfish is
Copyright (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other
contributors (<https://github.com/official-stockfish/Stockfish>). The bundled
NNUE network is by Linmiao Xu (linrock).

The web app runs these builds as separate Web Worker programs, communicating
over the UCI text protocol; they are aggregated with — not linked into — the
web application, which is MIT-licensed (see the repository root `LICENSE.md`).

These notices are surfaced to users at `/licenses`
(`apps/web/src/app/licenses/page.tsx`) — keep the two in sync.
