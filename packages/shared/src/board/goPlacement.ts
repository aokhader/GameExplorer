/**
 * When a press plays a Go stone — the aim-then-confirm rule and the two
 * misclick guards, as pure functions both boards call.
 *
 * Pure because the boards cannot be driven in a test: the native board draws
 * through `BoardFrame`'s measure callback and there is no layout under Jest, and
 * the web board's hit-testing needs real geometry. The interesting part is not
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
  /**
   * Milliseconds since that aim was set. Omit where the caller cannot know;
   * the bounce guard below then stands aside.
   */
  msSinceAim?: number;
}

/**
 * A confirming press this soon after the aim is a bounce, not a decision —
 * one tap registering twice, or a double-tap that meant to look rather than
 * play. OGS ignores its Submit for the same 50 ms after a stone is placed.
 */
export const GO_CONFIRM_BOUNCE_MS = 50;

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
  msSinceAim,
}: PlacementRelease): PlacementOutcome {
  if (!confirm) return 'commit';
  if (aimAtPress !== released) return 'hold';
  if (msSinceAim !== undefined && msSinceAim < GO_CONFIRM_BOUNCE_MS) return 'hold';
  return 'commit';
}

/**
 * The share of a point's width, at each edge, where a mouse is between two
 * intersections rather than on one. OGS draws no preview there (about a tenth
 * of a point), so a click that would land on the neighbour is never offered.
 */
export const GO_POINT_DEAD_ZONE = 0.1;

/**
 * Is a pointer at this spot inside a point's cell too close to its edge to
 * claim the point? `fx` and `fy` are the pointer's position within the cell,
 * 0 at its left/top edge and 1 at its right/bottom.
 *
 * Only for a hovering mouse, which shows a preview before it commits: a stone
 * appears under the pointer exactly when a click there would play it. A finger
 * has no preview to withhold, and on touch the aim step does this job.
 */
export function inGoPointDeadZone(fx: number, fy: number, zone = GO_POINT_DEAD_ZONE): boolean {
  return Math.min(fx, 1 - fx, fy, 1 - fy) < zone;
}
