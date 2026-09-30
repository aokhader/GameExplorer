import { createContext, useContext, type RefObject } from 'react';
import type { ScrollView } from 'react-native-gesture-handler';

/**
 * The page scroll a board sits in, so the board's drag can claim the touch.
 *
 * Every in-game screen stacks its board inside one vertical scroll
 * (`GameScreenLayout`). With no relation between the two, a drag that starts
 * vertically — a pawn push, a rook up a file — races the page scroll, whose
 * threshold is about the board Pan's 8px. On the Android emulator the board
 * already won every time (0 of 8 slow vertical drags scrolled the page, with or
 * without this, Sep 2026); iOS, where UIScrollView's own pan recognizer takes
 * part, is unverified. So this is a guard, not a proven fix: it makes the
 * outcome defined on every platform instead of left to recognizer timing.
 *
 * The layout renders gesture-handler's `ScrollView` (a drop-in for React
 * Native's) and provides its ref here; each board's Pan then calls
 * `blocksExternalGesture(ref)`, so a touch that starts on an interactive board
 * belongs to the board, while a swipe anywhere else still scrolls. Outside a provider the ref is null and boards set no
 * relation, which is today's behaviour on any screen that doesn't scroll.
 */
export type BoardScrollRef = RefObject<ScrollView | null>;

export const BoardScrollContext = createContext<BoardScrollRef | null>(null);

export function useBoardScrollRef(): BoardScrollRef | null {
  return useContext(BoardScrollContext);
}
