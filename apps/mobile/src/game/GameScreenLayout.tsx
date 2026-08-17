import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';

export type GameAccent = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

export interface GameScreenLayoutProps {
  accent?: GameAccent;
  /** Where the header back arrow points when there's no navigation history. */
  backHref: string;
  title?: string;
  /** Right-aligned header content (New Game, Live jump, …). */
  headerActions?: ReactNode;
  /** Card above the board — the bot/opponent. */
  topCard?: ReactNode;
  /** Card below the board — you. */
  bottomCard?: ReactNode;
  /** The board element (self-sizes via BoardFrame). */
  board: ReactNode;
  /** Status / info / move-list / controls stacked under the board. */
  sidebar?: ReactNode;
  /**
   * Pinned below the scroll area, above the bottom safe-area inset — chess uses
   * it for the move-history bar. Anything here stays reachable no matter how far
   * the page is scrolled, so reserve it for controls needed throughout the game.
   */
  bottomBar?: ReactNode;
}

/**
 * The single-player in-game shell — native port of web's `GameScreenLayout`.
 * Web splits into a board column + side rail on large screens; on a phone that
 * is always one scrolling column: header, opponent card, board, your card, then
 * the sidebar contents (status, info, moves, actions). A thin ambient accent
 * bar at the top stands in for web's `page-glow-*`.
 */
export function GameScreenLayout({
  accent,
  backHref,
  title,
  headerActions,
  topCard,
  bottomCard,
  board,
  sidebar,
  bottomBar,
}: GameScreenLayoutProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const accentColor = accent ? GAME_ACCENTS[accent].base : COLORS.accent;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(backHref as never);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={['top', 'bottom']}>
      {/* Ambient accent line — the per-game neon signature. */}
      <View style={{ height: 3, backgroundColor: accentColor, opacity: 0.9 }} />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <Pressable
          onPress={goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ color: COLORS.fgMuted, fontSize: 22, lineHeight: 22 }}>‹</Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 15, fontWeight: '600' }}>
            {title ?? 'Back'}
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{headerActions}</View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {topCard}
        {board}
        {bottomCard}
        {sidebar}
      </ScrollView>

      {bottomBar}
    </SafeAreaView>
  );
}
