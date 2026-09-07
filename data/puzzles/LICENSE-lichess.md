# Lichess open puzzle database

The chess puzzles in `chess.jsonl` whose `source` names a Lichess puzzle id are
derived from the Lichess open puzzle database, released by Lichess under the
**CC0 1.0 Universal** public domain dedication. Attribution is a courtesy rather
than a requirement; it is given on every imported puzzle and at `/licenses`.

The positions come from games played by Lichess users. What this project adds is
the band assignment, the calibration, and the generated prompt and explanation.

- Source file: `lichess_db_puzzle.csv`
- SHA-256: `75e267c3131b4b253d66e726d9f294c935592599e8c0ece300523583e271e46e`
- Imported: 2026-09-06
- Rows read: 6100960
- Puzzles emitted: 10627

The raw CSV is deliberately not committed; `data/puzzles/*.csv` is gitignored.
