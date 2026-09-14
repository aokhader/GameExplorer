import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { solvedCount, staticPuzzleSource } from '@gameexplorer/shared';
import type { PuzzleGame } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { mobilePuzzleProgressStore } from '@/lib/puzzleProgress';
import { FONTS } from '@/theme/typography';
import { Icon } from '@/components/ui/Icon';

interface Summary {
  solved: number;
  total: number;
  streak: number;
}

export interface PuzzlesCardProps {
  game: PuzzleGame;
}

/**
 * What the Puzzles mode gets instead of a strength grid and a colour picker:
 * one card saying what the mode is and how far through the set you are.
 *
 * The other modes are configured before they start; a puzzle has nothing to
 * configure, so this space carries progress instead — which is also the only
 * place in the app that shows it without opening the mode.
 */
export function PuzzlesCard({ game }: PuzzlesCardProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [summary, setSummary] = useState<Summary | null>(null);

  // On focus, not just on mount: the setup screen stays mounted underneath the
  // pushed puzzle route, so a mount-only read would still be showing the count
  // the player had before they solved anything.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([staticPuzzleSource.countPuzzles(game), mobilePuzzleProgressStore.load()])
        .then(([total, progress]) => {
          if (!active) return;
          setSummary({ total, solved: solvedCount(progress, game), streak: progress.streak });
        })
        .catch(() => {
          // The copy below stands on its own without a count.
        });
      return () => {
        active = false;
      };
    }, [game]),
  );

  const accent = GAME_ACCENTS[game];
  const done = summary && summary.total > 0 && summary.solved >= summary.total;
  const fraction = summary && summary.total > 0 ? summary.solved / summary.total : 0;

  return (
    <View
      style={{
        borderRadius: RADIUS['2xl'],
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
        marginBottom: 24,
        gap: SPACING['2.5'],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[2] }}>
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body, flex: 1 }}>
          Puzzle set
        </Text>
        {summary && (
          <Text
            testID="puzzles-card-progress"
            accessibilityLabel={`${summary.solved} of ${summary.total} solved`}
            style={{ color: accent.base, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.label }}
          >
            {summary.solved} / {summary.total}
          </Text>
        )}
      </View>

      <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.xs, lineHeight: 18 }}>
        {done
          ? 'You have solved every one of these. Start the set again from the puzzle screen.'
          : 'Set positions with one right answer. Play the line out to the end — a wrong move shows you what your opponent does about it.'}
      </Text>

      {/* Progress rail. Decorative: the count above already says this, and a
          second announcement of the same number is noise on a screen reader. */}
      {summary && summary.total > 0 && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            height: 6,
            borderRadius: RADIUS.full,
            overflow: 'hidden',
            backgroundColor: COLORS.surfaceMuted,
          }}
        >
          <View
            style={{
              width: `${Math.round(fraction * 100)}%`,
              height: '100%',
              backgroundColor: accent.base,
            }}
          />
        </View>
      )}

      {summary && summary.streak > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[1] }}>
          <Icon name="fire" size={FONT_SIZES.sm} color={COLORS.warningHover} />
          <Text style={{ color: COLORS.fgSubtle, fontFamily: FONTS.body, fontSize: FONT_SIZES.xs }}>
            {`${summary.streak} clean in a row`}
          </Text>
        </View>
      )}
    </View>
  );
}
