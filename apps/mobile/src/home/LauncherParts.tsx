import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GAME_CATALOG, type GameId } from '@gameexplorer/shared';
import type { PlayerStats } from '@gameexplorer/client/game/playerStats';
import { RATED_GAME_TYPES } from '@gameexplorer/client/game/playerStats';
import type { SavedLiquidateGame } from '@gameexplorer/client/liquidate/useLiquidateGame';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Button, Icon, PressableScale, Skeleton, type IconName } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';

/**
 * The launcher's pieces, in the Quiet Arcade direction (`ux-fix-ideas.md` §6.4):
 * flat surfaces and one-pixel borders, the piece art as each game's identity,
 * and no glows or gradients. The one gold element on the screen is whichever
 * primary action the top card holds.
 */

/** A quiet surface, one step rounder than the controls inside it. */
function Panel({ children, gap = SPACING[3] }: { children: ReactNode; gap?: number }) {
  useThemeName();
  return (
    <View
      style={{
        borderRadius: RADIUS['2xl'],
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
        gap,
      }}
    >
      {children}
    </View>
  );
}

function Title({ children }: { children: ReactNode }) {
  useThemeName();
  return <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body }}>{children}</Text>;
}

function Detail({ children }: { children: ReactNode }) {
  useThemeName();
  return (
    <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.label, marginTop: 2 }}>
      {children}
    </Text>
  );
}

export function PlayAgainCard({
  game,
  summary,
  onPlay,
  onChange,
}: {
  game: GameId;
  summary: string | null;
  onPlay: () => void;
  /** Open the form instead. Absent where Play already opens it. */
  onChange?: () => void;
}) {
  useThemeName();
  const name = GAME_CATALOG[game].name;
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[3] }}>
        <GamePieceIcon game={game} size={30} />
        <View style={{ flex: 1 }}>
          <Title>{onChange ? `Play ${name} again` : `Play ${name}`}</Title>
          {summary && <Detail>{summary}</Detail>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
        <Button label="Play" onPress={onPlay} style={{ flex: 1 }} />
        {onChange && <Button label="Change setup" variant="secondary" onPress={onChange} style={{ flex: 1 }} />}
      </View>
    </Panel>
  );
}

export function FirstGameCard({ onStart }: { onStart: () => void }) {
  return (
    <Panel>
      <View>
        <Title>Start a game</Title>
        <Detail>No account needed to start.</Detail>
      </View>
      <Button label="Play chess" onPress={onStart} />
    </Panel>
  );
}

export function LiquidateContinueCard({
  save,
  onResume,
  onDiscard,
}: {
  save: SavedLiquidateGame;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const { state } = save;
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[3] }}>
        <GamePieceIcon game="liquidate" size={30} />
        <View style={{ flex: 1 }}>
          <Title>Continue Liquidate</Title>
          <Detail>
            {state.players.length} players · round {state.round} · {state.config.mode === 'quick' ? 'Quick' : 'Full'} board
          </Detail>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
        <Button label="Resume" onPress={onResume} style={{ flex: 1 }} />
        <Button label="Discard" variant="secondary" onPress={onDiscard} style={{ flex: 1 }} />
      </View>
    </Panel>
  );
}

/** One of the other unfinished games, under the main Continue card. */
export function AlsoUnfinishedRow({ game, detail, onPress }: { game: GameId; detail: string; onPress: () => void }) {
  useThemeName();
  const name = GAME_CATALOG[game].name;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`Continue ${name}: ${detail}`}>
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING[3],
            minHeight: 48,
            paddingHorizontal: 14,
            borderRadius: RADIUS.xl,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surface,
          }}
        >
          <GamePieceIcon game={game} size={22} />
          <Text numberOfLines={1} style={{ flex: 1, color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.label }}>
            {name} <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body }}>· {detail}</Text>
          </Text>
          <Icon name="caret-right" size={FONT_SIZES.base} color={COLORS.fgMuted} />
        </View>
      )}
    </PressableScale>
  );
}

function Chip({ icon, game, label, sub, subColor }: { icon?: IconName; game?: GameId; label: string; sub?: string; subColor?: string }) {
  useThemeName();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING['1.5'],
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: RADIUS.full,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
      }}
    >
      {game ? <GamePieceIcon game={game} size={18} /> : icon ? <Icon name={icon} size={FONT_SIZES.base} color={COLORS.fgMuted} /> : null}
      <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.label }}>{label}</Text>
      {sub && <Text style={{ color: subColor ?? COLORS.fgMuted, fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.label }}>{sub}</Text>}
    </View>
  );
}

/**
 * The player's own numbers (`ux-fix-ideas.md` §4.3, P6): a rating and its last
 * change for each game played rated, the current win streak, puzzles solved.
 * Only numbers that exist are shown — an untouched 1200 is not a rating.
 */
export function NumbersRow({
  signedIn,
  stats,
  loading,
  error,
  onRetry,
  puzzlesSolved,
  finishedGame,
  onSignIn,
}: {
  signedIn: boolean;
  stats: PlayerStats | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  puzzlesSolved: number;
  finishedGame: boolean;
  onSignIn: () => void;
}) {
  useThemeName();

  if (signedIn && loading && !stats) {
    return (
      <View accessibilityLabel="Loading your numbers" accessibilityState={{ busy: true }} style={{ flexDirection: 'row', gap: SPACING[2] }}>
        <Skeleton width={110} height={36} radius="full" />
        <Skeleton width={96} height={36} radius="full" />
        <Skeleton width={90} height={36} radius="full" />
      </View>
    );
  }

  const chips: ReactNode[] = [];
  if (stats) {
    for (const type of RATED_GAME_TYPES) {
      const g = stats.perGame[type];
      if (g.ratedGames === 0) continue;
      const delta = g.lastDelta;
      chips.push(
        <Chip
          key={type}
          game={type}
          label={String(g.rating)}
          sub={delta ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : undefined}
          subColor={delta && delta > 0 ? COLORS.successHover : COLORS.dangerHover}
        />,
      );
    }
    if (stats.currentStreak >= 2) {
      chips.push(<Chip key="streak" icon="fire" label={`${stats.currentStreak} wins in a row`} />);
    }
  }
  if (puzzlesSolved > 0) {
    chips.push(<Chip key="puzzles" icon="puzzle-piece" label={String(puzzlesSolved)} sub={puzzlesSolved === 1 ? 'puzzle' : 'puzzles'} />);
  }

  return (
    <View style={{ gap: SPACING[2] }}>
      {chips.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] }}>{chips}</View>}
      {signedIn && error && (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8} style={{ paddingVertical: 6 }}>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.label }}>
            Couldn&apos;t load your ratings. <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi }}>Try again</Text>
          </Text>
        </Pressable>
      )}
      {!signedIn && finishedGame && (
        <Pressable onPress={onSignIn} accessibilityRole="button" hitSlop={8} style={{ paddingVertical: 6 }}>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.label }}>
            A rating needs an account. <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi }}>Sign in</Text>
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  useThemeName();
  return (
    <Text style={{ fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.label, letterSpacing: 0.8, color: COLORS.fgSubtle }}>
      {children}
    </Text>
  );
}

/** The five games in one compact row, the most recently played first. */
export function GamesRow({ games, onOpen }: { games: readonly GameId[]; onOpen: (game: GameId) => void }) {
  useThemeName();
  return (
    <View style={{ flexDirection: 'row', gap: SPACING[2] }}>
      {games.map((game) => (
        <PressableScale
          key={game}
          onPress={() => onOpen(game)}
          accessibilityRole="button"
          accessibilityLabel={`Play ${GAME_CATALOG[game].name}`}
          style={{ flex: 1 }}
        >
          {({ pressed }) => (
            <View
              style={{
                alignItems: 'center',
                gap: SPACING['1.5'],
                paddingVertical: 12,
                borderRadius: RADIUS.xl,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceAlt,
              }}
            >
              <GamePieceIcon game={game} size={28} />
              <Text numberOfLines={1} style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.caption }}>
                {GAME_CATALOG[game].name}
              </Text>
            </View>
          )}
        </PressableScale>
      ))}
    </View>
  );
}

/** A plain navigation row: icon, two lines, chevron. */
export function LinkRow({
  icon,
  game,
  title,
  detail,
  onPress,
}: {
  icon?: IconName;
  game?: GameId;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  useThemeName();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${detail}`}>
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING[3],
            minHeight: 56,
            paddingHorizontal: 16,
            borderRadius: RADIUS['2xl'],
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceAlt,
          }}
        >
          {game ? <GamePieceIcon game={game} size={24} /> : icon ? <Icon name={icon} size={FONT_SIZES.xl} color={COLORS.fgMuted} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.body, color: COLORS.fg }}>{title}</Text>
            <Text style={{ fontFamily: FONTS.body, fontSize: FONT_SIZES.xs, color: COLORS.fgMuted }}>{detail}</Text>
          </View>
          <Icon name="caret-right" size={FONT_SIZES.lg} color={COLORS.fgMuted} />
        </View>
      )}
    </PressableScale>
  );
}
