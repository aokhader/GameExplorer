# Stockfish engine assets

The files in this directory are **unmodified builds of Stockfish 18** (lite,
multi-threaded and single-threaded WASM variants), licensed under the
**GNU General Public License v3.0 or later**.

- Upstream project and complete source code:
  <https://github.com/official-stockfish/Stockfish>
- License text: <https://www.gnu.org/licenses/gpl-3.0.txt>

The web app runs these builds as separate Web Worker programs, communicating
over the UCI text protocol; they are aggregated with — not linked into — the
web application, which carries its own license (see `apps/web/LICENSE.md`).
