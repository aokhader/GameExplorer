import { useMemo, type RefObject } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { useBoardScrollRef } from './BoardScrollContext';
import { DRAG_LIFT } from './dragFeedback';

export interface BoardGestureHandlers {
  /** A motionless touch, at board px. */
  onTap: (x: number, y: number) => void;
  /**
   * The finger moved far enough to be a drag. `x, y` is where it went DOWN, so
   * the piece under the original touch is the one picked up. The board decides
   * whether there is anything to pick up, and sets `active` if there is.
   */
  onDragStart: (x: number, y: number) => void;
  /** The finger lifted after a drag, at board px (may be off the board). */
  onDrop: (x: number, y: number) => void;
  /** The drag was taken away (the board went inert, the system claimed the touch). */
  onDragCancel: () => void;
}

/**
 * The touch handling shared by the chess and checkers boards: one `Pan` + `Tap`
 * race serving tap-to-move and drag-to-move.
 *
 * - A motionless touch is a Tap (`maxDistance` keeps a slow drag from counting
 *   as one); movement past 8px activates the Pan, which wins the race.
 * - The Pan blocks the page scroll the board sits in (see `BoardScrollContext`),
 *   so a vertical drag is always the board's, never the page's.
 * - It is disabled while the board is inert. A non-interactive board (review,
 *   spectate, game over, a puzzle's reply beat) then scrolls with the page like
 *   any other content, and disabling it mid-drag cancels the drag. The rule: a
 *   drag survives the position changing, never the board going inert.
 *
 * Everything the finger drives runs on the UI thread: `fingerX/Y` (board px),
 * and `lift`, the 0→1 growth of the dragged piece, started in the worklet so it
 * never waits on — or gets stuck behind — the JS thread. `active` (the hover
 * disc's switch) is set by the board's JS once it has actually picked something
 * up, and cleared by the worklet the moment the finger leaves.
 *
 * Handlers are read through `handlers` (a ref the board refreshes every render)
 * at fire time, so the gesture is rebuilt only when its configuration changes,
 * never because a closure did. A ref rather than a value because the handlers
 * need `active`, which this hook creates.
 */
export function useBoardGesture(
  handlers: RefObject<BoardGestureHandlers | null>,
  { interactive, reducedMotion }: { interactive: boolean; reducedMotion: boolean },
) {
  const fingerX = useSharedValue(0);
  const fingerY = useSharedValue(0);
  const lift = useSharedValue(0);
  const active = useSharedValue(0);
  const scrollRef = useBoardScrollRef();

  const gesture = useMemo(() => {
    // Plain JS trampolines: `runOnJS` needs a function created on the JS
    // thread, and these read the handlers current at fire time.
    const callTap = (x: number, y: number) => handlers.current?.onTap(x, y);
    const callDragStart = (x: number, y: number) => handlers.current?.onDragStart(x, y);
    const callDrop = (x: number, y: number) => handlers.current?.onDrop(x, y);
    const callCancel = () => handlers.current?.onDragCancel();

    const tap = Gesture.Tap()
      .maxDuration(400)
      .maxDistance(10)
      .onEnd((e) => {
        'worklet';
        runOnJS(callTap)(e.x, e.y);
      });

    const pan = Gesture.Pan()
      .enabled(interactive)
      .maxPointers(1)
      .minDistance(8)
      .onStart((e) => {
        'worklet';
        fingerX.value = e.x;
        fingerY.value = e.y;
        lift.value = 0;
        lift.value = reducedMotion ? 1 : withTiming(1, DRAG_LIFT);
        runOnJS(callDragStart)(e.x - e.translationX, e.y - e.translationY);
      })
      .onUpdate((e) => {
        'worklet';
        fingerX.value = e.x;
        fingerY.value = e.y;
      })
      .onEnd((e, success) => {
        'worklet';
        // A cancelled pan is not a drop: the finger may be anywhere.
        if (success) runOnJS(callDrop)(e.x, e.y);
        else runOnJS(callCancel)();
      })
      .onFinalize(() => {
        'worklet';
        // The dragged piece is left where the finger lifted; the board's JS
        // unmounts it in the same render that shows the move, so it never
        // flies back to its square first.
        active.value = 0;
      });
    if (scrollRef) pan.blocksExternalGesture(scrollRef);

    return Gesture.Race(pan, tap);
    // Shared values are stable; handlers are read through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers, interactive, reducedMotion, scrollRef]);

  return { gesture, fingerX, fingerY, lift, active };
}
