/**
 * The measured chess bot ladder: what each rating actually runs.
 *
 * Data only, per this directory's contract. The reasoning lives in
 * `../../game-logic/chess/strength.ts`; the numbers here were produced by
 * `scripts/bots/` and must not be hand-edited on intuition. Re-measure instead:
 *
 *   ./node_modules/.bin/tsx scripts/bots/blunders.mjs --shipped
 *   ./node_modules/.bin/tsx scripts/bots/match.mjs --a=uci:2400@4 --b=sf:1500
 *
 * **Two dials, fitted together.** `UCI_Elo` sets average strength; `depth` sets
 * how much variance comes with it. Fitting either alone goes wrong in a
 * different way, and both failures are measured:
 *
 * - `UCI_Elo` alone. Arasan's curve is too steep — at 1500 it plays ~1160
 *   (5W-0D-35L vs Stockfish 1500) and at 2000 it plays ~2070. A remap fixes the
 *   *rating*, but the setting that yields genuine 1500 play (`UCI_Elo` ~1700,
 *   strength 28) still bypasses its own quality bound on ~8% of moves and drops
 *   a queen on 6.7% — barely better than the broken ladder's 9.7%. Correct
 *   number, same ugly feel.
 * - `depth` alone, from a high strength. Clean, but far too strong: at
 *   `UCI_Elo` 2400 even depth 1 measures ~1741 and depth 2 ~2020.
 *
 * So each rung sets strength high enough that catastrophic moves are rare, then
 * trims depth to land on the target rating. Both numbers are measured per rung;
 * neither is derived from the other.
 *
 * **The 1500 rung, fitted.** Candidates measured on both axes — strength over 40
 * games against Stockfish 1500, error profile over self-play:
 *
 * | candidate | strength | >= a piece | >= a queen |
 * |---|---|---|---|
 * | `UCI_Elo` 1500 (what shipped) | ~1160 | 16.5% | 9.7% |
 * | `UCI_Elo` 1700, no depth cap | ~1465 | 11.3% | 6.7% |
 * | **`UCI_Elo` 2000, depth 3** | **~1539** | **7.8%** | **2.2%** |
 * | `UCI_Elo` 2400, depth 1 | ~1741 | 5.8% | 2.3% |
 * | `UCI_Elo` 2400, depth 4 | >=1880 | 3.5% | 0.0% |
 *
 * The old ladder also measured 356 mean cp loss and 36.5% piece-losses at 1200.
 *
 * Error rates at these sample sizes move by a few points between runs. A later
 * six-game run of the shipped ladder put this rung at 7.8% piece-losses and 4.6%
 * queen-losses: still half what shipped, but not the quarter the table suggests.
 *
 * **Why the in-house engine keeps everything below 1400.** Not preference —
 * Arasan measurably cannot go there. At the lowest strength whose queen-drop rate
 * is tolerable, a *one-ply* search still measures ~1409 (25W-0D-15L vs Stockfish
 * 1320) and two plies ~1488. The in-house engine measures ~1273 at its 1200
 * setting and ~1415 at its ceiling, covering exactly the band Arasan cannot. It is
 * also far cheaper, which matters because mobile runs it on the JavaScript thread
 * rather than in a worker — its depth-4 band costs about half a second per move
 * on a desktop and several times that on a handset.
 *
 * **Every rung here is fitted** against a Stockfish rung over 40 games or more.
 * The in-house tiles below the seam are fitted as well, but not against Stockfish:
 * its `UCI_Elo` floor is 1320 and its weakest `Skill Level` measured ~1418, so
 * nothing external reaches that low. They are chained instead, from a 60-game
 * anchor through 40-game matches between adjacent settings. The numbers and the
 * method live beside the bands, in `../../game-logic/chess/weakEngine.ts`.
 *
 * **Read the absolute numbers with about ±100 of systematic slack.** Every rung
 * measures slightly strong and the overshoot grows with rating (+39, +70, +9
 * after refitting the top), which is the signature of a small bias in the anchor
 * rather than three independent mis-fits — Stockfish's `UCI_Elo` is calibrated
 * for longer time controls than it gets here, and a handicapped engine short of
 * time reads weak. The relative ordering and the error rates do not depend on
 * that and are solid.
 */

export interface ChessLadderRung {
  /** The rating shown to the player. */
  elo: number;
  /** `UCI_Elo` to send. Sets average strength and the shape of the mistakes. */
  uciElo: number;
  /** Plies to search. Trims playing strength without changing the error shape. */
  depth: number;
  /**
   * What this rung actually measured, over 40+ games against the Stockfish rung
   * named in its comment.
   *
   * Recorded rather than derived because it is the only thing that is monotone.
   * Neither `uciElo` nor `depth` is: the top rung searches *shallower* than the
   * one below it (6 plies against 7) and is far stronger anyway, because its
   * strength is 73 against 40. A test asserts monotonicity on this field, and
   * would be wrong to assert it on either dial alone.
   */
  measuredElo: number;
}

export interface ChessBotLadder {
  /** Below this rating the in-house engine plays instead of Arasan. */
  tsCeilingElo: number;
  /**
   * Wall-clock ceiling per move, enforced by the caller sending `stop` rather
   * than by a UCI limit — Arasan's `go` takes only one search type and the last
   * limit on the line wins, so a depth and a movetime cannot be combined.
   *
   * A safety net for a slow handset, never a strength lever: tying strength to
   * wall-clock time is what made the old ladder weaker on slower phones.
   */
  ceilingMs: number;
  rungs: readonly ChessLadderRung[];
}

export const CHESS_BOT_LADDER: ChessBotLadder = {
  // Measured: Arasan's floor with a clean error shape is ~1409 (one ply at the
  // lowest tolerable strength) and the in-house engine's ceiling is ~1415.
  tsCeilingElo: 1400,
  ceilingMs: 2000,
  rungs: [
    // 44W-1D-35L vs Stockfish 1500 over 80 games (95% band 1463..1619).
    { elo: 1500, uciElo: 2000, depth: 3, measuredElo: 1539 },
    // 24W-0D-16L vs Stockfish 2000. Strength 40 caps the search at 7 plies on
    // its own, so this rung is simply uncapped.
    { elo: 2000, uciElo: 2000, depth: 7, measuredElo: 2070 },
    // 19W-3D-18L vs Stockfish 2800 (95% band 2698..2921) — level with it.
    // Depth is a weak lever up here, worth only 30-50 Elo a ply: 11 plies
    // measured ~3003, 9 -> ~2968, 8 -> ~2908, 7 -> ~2898, 6 -> ~2809.
    { elo: 2800, uciElo: 2800, depth: 6, measuredElo: 2809 },
  ],
};
