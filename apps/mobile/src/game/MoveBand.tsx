import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { timelineToSan, type ChessGameState } from '@gameexplorer/shared';
import type { GameAccent } from '@/game/GameScreenLayout';

export interface MoveBandProps {
  /** One state per ply — `timeline[i]` is the position before move `i`. */
  timeline: ChessGameState[];
  /** Which position is on the board (0 = start, so no chip is active). */
  viewIndex: number;
  /** Jump to a timeline index. */
  onSeek: (index: number) => void;
  accent: GameAccent;
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
export function MoveBand({ timeline, viewIndex, onSeek, accent }: MoveBandProps) {
  const accentColor = GAME_ACCENTS[accent].base;
  const scrollRef = useRef<ScrollView>(null);
  // Chip x-offsets, captured on layout, so the auto-scroll can centre one.
  const offsets = useRef<number[]>([]);

  // Recomputed only when a move is added (or a new game resets the timeline);
  // SAN needs a legal-move scan per move, too costly to redo every render.
  const san = useMemo(() => timelineToSan(timeline), [timeline]);

  // Follow the active move. `viewIndex` is a timeline index (1-based over
  // moves), so chip `viewIndex - 1` is the move that produced this position.
  useEffect(() => {
    const x = offsets.current[viewIndex - 1];
    if (x === undefined) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 90), animated: true });
  }, [viewIndex, san.length]);

  if (san.length === 0) {
    return (
      <View style={bandStyle}>
        <Text style={{ color: COLORS.fgSubtle, fontSize: 13, paddingHorizontal: 10 }}>
          No moves yet — make your first move
        </Text>
      </View>
    );
  }

  return (
    <View style={bandStyle}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 10, gap: 2 }}
        accessibilityLabel="Moves played"
      >
        {san.map((text, i) => {
          const stateIdx = i + 1;
          const isActive = viewIndex === stateIdx;
          const isWhite = i % 2 === 0;
          return (
            <View
              key={i}
              onLayout={(e) => {
                offsets.current[i] = e.nativeEvent.layout.x;
              }}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              {isWhite && (
                <Text style={{ color: COLORS.fgSubtle, fontSize: 13, marginLeft: i === 0 ? 0 : 8 }}>
                  {i / 2 + 1}.
                </Text>
              )}
              <Pressable
                onPress={() => onSeek(stateIdx)}
                accessibilityRole="button"
                accessibilityLabel={`Move ${stateIdx}, ${text}`}
                accessibilityState={{ selected: isActive }}
                style={{ marginLeft: 4 }}
              >
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: isActive ? GAME_ACCENTS[accent].tintBg : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? accentColor : COLORS.fg,
                      fontSize: 14,
                      fontWeight: isActive ? '800' : '600',
                    }}
                  >
                    {text}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const bandStyle = {
  height: 44,
  justifyContent: 'center',
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.border,
  backgroundColor: COLORS.surfaceAlt,
  paddingHorizontal: 4,
} as const;
