'use client';

import { useInsertionEffect, useRef, type RefObject } from 'react';

/**
 * A ref that holds the value from the latest committed render, for code that
 * runs later and must not see the value its closure captured: a bot reply
 * landing after an `await`, a premove fired from a timer, a pointer handler
 * mid-drag.
 *
 * Replaces `xRef.current = x` written in the component body. That assignment
 * also ran for renders React later threw away, and it is a ref write during
 * render, which `react-hooks/refs` rejects.
 *
 * Synced in an insertion effect, the first thing a commit runs, before any
 * layout effect, ref callback or passive effect anywhere in the tree. So every
 * effect, timer and event handler reads the value the screen is showing, as
 * the render-body assignment did. The two differ only when a render is
 * time-sliced or discarded (a transition), and then this one is right: it
 * never holds a value the screen did not show.
 *
 * Read `.current` only outside render. The ref may still be written by hand
 * (a drag sets it ahead of its state); the next commit puts it back in step.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}
