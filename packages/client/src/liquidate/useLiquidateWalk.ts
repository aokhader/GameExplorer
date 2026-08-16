import { useEffect, useMemo, useRef, useState } from 'react';
import { LIQUIDATE_TIMING, type LiquidatePlayer } from '@gameexplorer/shared';

const {
  diceRollMs: DICE_ROLL_MS,
  noRollStartMs: NO_ROLL_START_MS,
  postRollBeatMs: POST_ROLL_BEAT_MS,
  stepMs: STEP_MS,
  walkMax: WALK_MAX,
} = LIQUIDATE_TIMING;

export interface PlacedToken {
  tile: number;
  /** This move was a teleport, so it glides rather than hops. */
  jumped: boolean;
}

export interface LiquidateWalk {
  /** Where each piece IS on screen, which lags the engine during a move. */
  placed: Record<string, PlacedToken>;
  /** True while any piece is still catching up to the engine. */
  moving: boolean;
}

const NO_PLAYERS: LiquidatePlayer[] = [];

/**
 * The board's own clock: where each piece is *shown*, as distinct from where the
 * engine has already put it.
 *
 * This is not only about drawing, which is why it sits beside the game hook
 * rather than inside a board component. A roll and the move it causes land in
 * the SAME engine update, so without a notion of "the board has caught up", the
 * property card appears while the piece is still walking toward it, and a bot
 * takes its next turn over the top of its own animation. Both wait on `moving`.
 *
 * Only the placement is tracked here; the tween itself belongs to whatever draws
 * the tokens (CSS transitions on web, Reanimated on native). This hook just says
 * which tile each piece is on *right now* — which is exactly why it could be
 * shared: it had been written twice, identically apart from `window.setTimeout`
 * and where `reducedMotion` came from.
 */
export function useLiquidateWalk(
  players: LiquidatePlayer[] | undefined,
  dice: [number, number] | null,
  total: number,
  /**
   * Effective reduced motion. Passed in rather than read from a settings hook:
   * that hook is a per-platform React context (localStorage on web, AsyncStorage
   * on native), and it is the only thing that stopped this file being shared.
   */
  reducedMotion: boolean,
): LiquidateWalk {
  const seats = players ?? NO_PLAYERS;

  const seatKey = seats.map((p) => p.id).join('|');
  const [knownSeats, setKnownSeats] = useState(seatKey);
  const [placed, setPlaced] = useState<Record<string, PlacedToken>>(() =>
    Object.fromEntries(seats.map((p) => [p.id, { tile: p.tile, jumped: false }])),
  );

  // A changed roster means a new game or a resumed save: every piece starts
  // where the engine says it is, because there is no prior position to animate
  // from. Adjusted during render rather than in an effect — React re-runs this
  // component before committing, so the pieces never paint at a stale spot.
  if (seatKey !== knownSeats) {
    setKnownSeats(seatKey);
    setPlaced(Object.fromEntries(seats.map((p) => [p.id, { tile: p.tile, jumped: false }])));
  }

  // True once a walk is under way, so only the FIRST hop waits for the dice.
  const walking = useRef(false);
  /** The last roll this hook has already waited out. */
  const settledDice = useRef(dice);

  useEffect(() => {
    // Reduced motion has no walk to run, so there is nothing to schedule; the
    // engine's positions are used directly below rather than copied into state.
    if (reducedMotion) return;

    const lagging = seats.filter((p) => placed[p.id] !== undefined && placed[p.id]!.tile !== p.tile);
    if (lagging.length === 0) {
      walking.current = false;
      // A roll that moved nobody (failed doubles in Impound) is consumed here,
      // so the NEXT move does not mistake it for dice still in the air.
      settledDice.current = dice;
      return;
    }

    const first = !walking.current;
    const afterRoll = dice !== settledDice.current;
    const lead = afterRoll ? DICE_ROLL_MS + POST_ROLL_BEAT_MS : NO_ROLL_START_MS;
    const timer = setTimeout(
      () => {
        walking.current = true;
        settledDice.current = dice;
        setPlaced((prev) => {
          const next = { ...prev };
          for (const p of seats) {
            const from = prev[p.id]?.tile ?? p.tile;
            if (from === p.tile) continue;
            const forward = (p.tile - from + total) % total;
            next[p.id] =
              forward > 0 && forward <= WALK_MAX
                ? { tile: (from + 1) % total, jumped: false }
                : { tile: p.tile, jumped: true };
          }
          return next;
        });
      },
      first ? lead : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [seats, placed, total, reducedMotion, dice]);

  // With motion suppressed the pieces simply ARE where the engine says, so the
  // stored placement is bypassed rather than kept in sync with it.
  const shown = useMemo(
    () =>
      reducedMotion
        ? Object.fromEntries(seats.map((p) => [p.id, { tile: p.tile, jumped: true }]))
        : placed,
    [reducedMotion, seats, placed],
  );

  // Derived synchronously rather than stored, so it is already correct on the
  // render that receives a move — the bot loop reads it in an effect on that
  // same render and must not act on a stale value. Always false under reduced
  // motion: there is no walk, so nothing waits.
  const moving =
    !reducedMotion &&
    seats.some((p) => placed[p.id] !== undefined && placed[p.id]!.tile !== p.tile);

  return { placed: shown, moving };
}
