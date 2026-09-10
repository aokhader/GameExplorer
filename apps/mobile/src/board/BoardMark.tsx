import React from 'react';
import { Text, View } from 'react-native';
import { COLORS } from '@gameexplorer/ui';
import type { LessonMark } from '@gameexplorer/shared';
import { FONTS } from '@/theme/typography';

/**
 * One coached annotation, drawn over a board square or intersection.
 *
 * The native twin of `apps/web/src/components/board/BoardMark.tsx`, and it has
 * to say the same thing: the point of a shared mark vocabulary is that `danger`
 * means "do not play here" on a chess square and on a Go point, on both
 * platforms.
 *
 * Sized in pixels rather than percentages because these boards lay their
 * squares out absolutely from a computed `size`, which is also why the caller
 * passes it in.
 *
 * **The ring and the label are drawn in different layers, on purpose.** A tint
 * or a ring belongs *under* the piece standing on the square — covering the
 * piece with it would hide the thing the mark is about. A written label
 * belongs *over* it, because a number on a stone is the oldest teaching device
 * in Go and it is worth nothing if a stone is drawn on top of it. So this
 * renders the ring, the boards render it inside the square, and
 * `BoardMarkLabel` below is rendered by the same boards after their pieces.
 *
 * **Tokens are read inside the component**, never captured at module scope:
 * `COLORS` is a live view onto the active theme, and a module-level copy would
 * freeze whichever theme happened to be active when Metro first parsed this
 * file. That has bitten this app before.
 */
export function BoardMark({
  mark,
  size,
  round = false,
}: {
  mark: LessonMark;
  /** Square edge in pixels. */
  size: number;
  /** Round the outline — right for reversi discs and Go stones. */
  round?: boolean;
}) {
  const stroke: Record<LessonMark['kind'], string> = {
    target: COLORS.success,
    origin: COLORS.warning,
    danger: COLORS.danger,
    capture: COLORS.dangerHover,
    move: COLORS.success,
  };
  const fill: Partial<Record<LessonMark['kind'], string>> = {
    target: COLORS.successHover + '33',
    origin: COLORS.warningHover + '33',
    danger: COLORS.dangerMuted,
  };

  const inset = size * 0.06;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {mark.kind === 'move' ? (
        <View
          style={{
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: stroke.move,
            opacity: 0.75,
          }}
        />
      ) : (
        <View
          style={{
            position: 'absolute',
            left: inset,
            top: inset,
            right: inset,
            bottom: inset,
            borderRadius: round ? size : size * 0.15,
            borderWidth: 2,
            borderColor: stroke[mark.kind],
            backgroundColor: fill[mark.kind],
          }}
        />
      )}
    </View>
  );
}

/**
 * The written half of a mark — one or two characters over the square.
 *
 * Rendered by the boards *after* their piece layer, which is the whole reason
 * it is a separate component: nested inside the square it would be drawn under
 * whatever is standing there, and a liberty count nobody can read is worse than
 * no liberty count.
 */
export function BoardMarkLabel({
  mark,
  size,
  left,
  top,
}: {
  mark: LessonMark;
  size: number;
  left: number;
  top: number;
}) {
  if (!mark.text) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: Math.max(9, size * 0.36),
          fontFamily: FONTS.bodyBold,
          color: COLORS.fg,
          textShadowColor: 'rgba(0,0,0,0.95)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        }}
      >
        {mark.text}
      </Text>
    </View>
  );
}

/** Marks keyed by square, so a board looks one up per cell. Last one wins. */
export function markMap(marks: readonly LessonMark[] | undefined): Map<string, LessonMark> {
  const map = new Map<string, LessonMark>();
  for (const mark of marks ?? []) map.set(mark.square, mark);
  return map;
}
