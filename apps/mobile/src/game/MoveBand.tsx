import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import type { GameAccent } from '@/game/GameScreenLayout';
import { GRADE_META } from '@/analysis/grades';
import type { MoveGrade } from '@/analysis/types';
import { FONTS } from '@/theme/typography';

export interface MoveBandProps {
  /**
   * The moves played, already in the game's own notation — SAN for chess, PDN
   * for checkers, Othello squares for reversi. The band is deliberately
   * notation-agnostic; each screen formats its own.
   */
  moves: string[];
  /** Which position is on the board (0 = start, so no chip is active). */
  viewIndex: number;
  /** Jump to a timeline index. */
  onSeek: (index: number) => void;
  accent: GameAccent;
  /**
   * Review only — one entry per move, aligned with `moves`. A graded chip is
   * tinted and carries the grade's mark (?!, ?, ??, ★); null entries (ungraded
   * yet, or a reversi pass) render exactly as they do during play.
   */
  grades?: (MoveGrade | null)[];
}

/**
 * The move ribbon — one horizontal line of the game's moves, the way Lichess
 * and chess.com print them under the board. Tapping a move jumps the board to
 * it, and the band scrolls itself so the current move stays visible as the game
 * runs on.
 *
 * This replaced the status banner, which spent most of the game saying "Your
 * move" — something the player cards already show. Stepping controls live on
 * the bottom `GameBar`, so the band is display + jump only.
 */
export function MoveBand({ moves: san, viewIndex, onSeek, accent, grades }: MoveBandProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const accentColor = GAME_ACCENTS[accent].base;
  const scrollRef = useRef<ScrollView>(null);
  // Chip x-offsets, captured on layout, so the auto-scroll can centre one.
  const offsets = useRef<number[]>([]);

  // Keep the active move visible. `viewIndex` is a timeline index (1-based over
  // moves), so chip `viewIndex - 1` produced the position on the board.
  //
  // The live tail scrolls to the end rather than to a measured offset: when a
  // move is appended, this runs before the new chip's onLayout has recorded its
  // x, so an offset lookup would miss and the newest move would sit half-clipped
  // off the right edge until the next render. scrollToEnd needs no measurement.
  const scrollToActive = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    if (viewIndex <= 0) {
      scroll.scrollTo({ x: 0, animated: true });
    } else if (viewIndex >= san.length) {
      scroll.scrollToEnd({ animated: true });
    } else {
      const x = offsets.current[viewIndex - 1];
      if (x !== undefined) scroll.scrollTo({ x: Math.max(0, x - 90), animated: true });
    }
  };

  // Seeking within the existing moves (tapping a chip, stepping in history) fires
  // this; appends are handled by the ScrollView's onContentSizeChange below,
  // which runs *after* the new chip has been laid out and measured.
  useEffect(() => {
    scrollToActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewIndex]);

  if (san.length === 0) {
    return (
      <View style={bandStyle()}>
        <Text style={{ color: COLORS.fgSubtle, fontSize: 13, paddingHorizontal: 10 }}>
          No moves yet — make your first move
        </Text>
      </View>
    );
  }

  return (
    <View style={bandStyle()}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 10, gap: 2 }}
        accessibilityLabel="Moves played"
        // Fires once the appended chips have been laid out, so the tail is fully
        // measured before we chase it — see scrollToActive.
        onContentSizeChange={scrollToActive}
      >
        {san.map((text, i) => {
          const stateIdx = i + 1;
          const isActive = viewIndex === stateIdx;
          // Every game's moveHistory strictly alternates (reversi records a pass
          // as its own entry), so the first ply of each pair — white/gold, or
          // black in reversi where it moves first — carries the move number.
          const startsPair = i % 2 === 0;
          const grade = grades?.[i] ?? null;
          const meta = grade ? GRADE_META[grade] : null;
          // 'good' is the unremarkable majority — marking it would drown the
          // few moves that actually want attention.
          const marked = meta && grade !== 'good';
          return (
            <View
              key={i}
              onLayout={(e) => {
                offsets.current[i] = e.nativeEvent.layout.x;
              }}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              {startsPair && (
                <Text style={{ color: COLORS.fgSubtle, fontSize: 13, marginLeft: i === 0 ? 0 : 8 }}>
                  {i / 2 + 1}.
                </Text>
              )}
              <Pressable
                onPress={() => onSeek(stateIdx)}
                accessibilityRole="button"
                accessibilityLabel={
                  marked ? `Move ${stateIdx}, ${text}, ${meta!.label}` : `Move ${stateIdx}, ${text}`
                }
                accessibilityState={{ selected: isActive }}
                style={{ marginLeft: 4 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: isActive ? GAME_ACCENTS[accent].tintBg : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? accentColor : marked ? meta!.color() : COLORS.fg,
                      fontSize: 14,
                      fontFamily: isActive ? FONTS.bodyBold : FONTS.bodySemi,
                    }}
                  >
                    {text}
                  </Text>
                  {marked && (
                    <Text style={{ color: meta!.color(), fontSize: 12, fontFamily: FONTS.bodyBold }}>
                      {meta!.glyph}
                    </Text>
                  )}
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const bandStyle = () =>
  ({
    height: 44,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 4,
  }) as const;
