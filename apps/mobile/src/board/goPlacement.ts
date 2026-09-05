/**
 * The aim-then-confirm rule for placing a Go stone, as a pure function.
 *
 * Extracted from `GoBoard` so it can be tested at all: the board draws through
 * `BoardFrame`'s measure callback, and there is no layout under Jest, so the
 * gesture can never be driven in a component test. The interesting part is not
 * the drawing anyway — it is exactly when a press plays a stone, in a game where
 * a stone cannot be taken back.
 */

/** What a release should do. `hold` means the aim stands and nothing is played. */
export type PlacementOutcome = 'commit' | 'hold';

export interface PlacementRelease {
  /** Is this board asking for confirmation? See `confirmPlacementFor`. */
  confirm: boolean;
  /** The intersection the finger was over when it lifted. */
  released: string;
  /** What was already aimed when this press BEGAN — not what is aimed now. */
  aimAtPress: string | null;
}

/**
 * Whether lifting the finger here plays a stone.
 *
 * The rule is deliberately "the press *began* on the aimed point", not "the
 * press *ended* on it". Dragging onto the aimed point must not play it: the
 * whole purpose of the drag is to let the player move the ghost around and look
 * at it, and a rule that commits wherever the finger happens to stop would fire
 * on the one gesture the feature exists to make safe.
 */
export function placementOnRelease({
  confirm,
  released,
  aimAtPress,
}: PlacementRelease): PlacementOutcome {
  if (!confirm) return 'commit';
  return aimAtPress === released ? 'commit' : 'hold';
}
