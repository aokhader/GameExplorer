import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLastSetupMode, useRememberedSetup } from '@gameexplorer/client/hooks/useRememberedSetup';
import { nativeLocalStore } from '@/lib/localStore';
import { markPlayed } from '@/lib/lastPlayed';
import {
  LIQUIDATE_BOT_LABELS,
  LIQUIDATE_BOT_LEVELS,
  LIQUIDATE_CONFIGS,
  LIQUIDATE_MAX_PLAYERS,
  LIQUIDATE_MIN_PLAYERS,
  formatCredits,
  type LiquidateBotLevel,
  type LiquidateSeat,
} from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, GlowBackdrop, Icon, type IconName } from '@/components/ui';
import { SetupHero } from '@/game/SetupHero';
import { useLiquidateGame } from '@/liquidate/useLiquidateGame';
import { LiquidateGame } from '@/liquidate/LiquidateGame';
import { FONTS } from '@/theme/typography';

/**
 * Names, never token values — the accent objects are live views and a
 * module-scope read would freeze them at import (see `noFrozenTokens`).
 */
const MODES = [
  {
    key: 'bot' as const,
    icon: 'robot' as const,
    label: 'Vs bots',
    sub: 'You against 1–5 rivals',
  },
  {
    key: 'local' as const,
    icon: 'users' as const,
    label: 'Pass & play',
    sub: 'Everyone on this device',
  },
];

const BOARD_MODES = [
  { key: 'quick' as const, label: 'Quick', sub: '28 tiles · ~20 rounds' },
  { key: 'full' as const, label: 'Full', sub: '44 tiles · to the last baron' },
];

const DEBT_RULES = [
  {
    key: 'allow-negative' as const,
    label: 'Trade your way out',
    sub: 'Go below zero, then mortgage or sell to settle up',
  },
  {
    key: 'never-negative' as const,
    label: 'Sudden death',
    sub: 'Miss a payment and you fold on the spot',
  },
];

/** Bot seat names, in the order they fill. Matches web. */
const BOT_NAMES = ['Vega', 'Orin', 'Kessa', 'Dax', 'Nyra'];

/**
 * Liquidate's route entry: setup, then the game shell.
 *
 * The in-game views live in `LiquidateGame` rather than here, because a
 * property game's board is only one of six screens and the shell that switches
 * between them needs to own that state without this component re-running its
 * setup form.
 */
export function LiquidateScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  // The launcher's Continue opens a saved match directly: `?resume=bot|local`.
  const params = useLocalSearchParams<{ resume?: string }>();
  const resumeSlot = params.resume === 'bot' || params.resume === 'local' ? params.resume : null;

  // The form remembers each mode's choices, and which mode was used last
  // (`ux-fix-ideas.md` §2.1). Both modes are read up front, so switching between
  // them never waits on storage.
  const last = useLastSetupMode(nativeLocalStore, 'liquidate');
  const [picked, setPicked] = useState<'bot' | 'local' | null>(resumeSlot);
  const mode: 'bot' | 'local' = picked ?? (last.mode === 'pass-and-play' ? 'local' : 'bot');
  const bySlot = {
    bot: useRememberedSetup({ store: nativeLocalStore, game: 'liquidate', mode: 'bot' }),
    local: useRememberedSetup({ store: nativeLocalStore, game: 'liquidate', mode: 'pass-and-play' }),
  };
  const { setup, update } = bySlot[mode];
  const { players: playerCount, board: boardMode, debtRule, botLevel } = setup;
  const setMode = (next: 'bot' | 'local') => {
    setPicked(next);
    last.remember(next === 'local' ? 'pass-and-play' : 'bot');
  };
  const setupReady = (picked !== null || last.hydrated) && bySlot.bot.hydrated && bySlot.local.hydrated;

  const game = useLiquidateGame({ storageKey: mode, botLevel });
  const accent = GAME_ACCENTS.liquidate;

  // Resume the saved match the link named, once it has been read. Until then the
  // screen stays blank rather than flashing the form; with no match saved, the
  // form shows. Quitting a match discards its save, which is what ends the wait.
  const resumeSaved = game.resume;
  const savedMatch = game.savedGame;
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!resumeSlot || !game.hydrated || !savedMatch || resumedRef.current) return;
    resumedRef.current = true;
    resumeSaved();
    markPlayed('liquidate');
  }, [resumeSlot, game.hydrated, savedMatch, resumeSaved]);
  const awaitingResume = resumeSlot !== null && (!game.hydrated || (!!savedMatch && !game.state));

  const start = () => {
    markPlayed('liquidate');
    const seats: LiquidateSeat[] = Array.from({ length: playerCount }, (_, i) => {
      if (mode === 'local') return { name: `Player ${i + 1}` };
      // A proper name, not "You": the engine writes third-person log lines
      // ("<name> rolls 3+3"), which "You" would turn into "You rolls".
      return i === 0
        ? { name: 'Captain' }
        : { name: BOT_NAMES[(i - 1) % BOT_NAMES.length]!, isBot: true };
    });
    game.newGame({ players: seats, mode: boardMode, debtRule });
  };

  if (game.state) {
    return <LiquidateGame game={game} mode={mode} onQuit={game.quit} onRematch={start} />;
  }

  // Nothing to show until the remembered setup is known, or while a link is about
  // to open a saved match.
  if (!setupReady || awaitingResume) {
    return <Screen scroll={false}>{null}</Screen>;
  }

  const config = LIQUIDATE_CONFIGS[boardMode];
  const counts = Array.from(
    { length: LIQUIDATE_MAX_PLAYERS - LIQUIDATE_MIN_PLAYERS + 1 },
    (_, i) => LIQUIDATE_MIN_PLAYERS + i,
  );

  return (
    // Start pinned under the scrolling form rather than at its end.
    <Screen footer={<Button label="Start Match" onPress={start} glow />}>
      <GlowBackdrop
        blooms={[{ cx: '50%', cy: '-8%', rx: '80%', ry: '30%', color: accent.base, opacity: 0.16 }]}
      />
      <BackHeader fallbackHref="/" />
      <SetupHero game="liquidate" />

      <Pressable
        onPress={() => router.push('/learn/liquidate' as never)}
        accessibilityRole="link"
        accessibilityLabel="How to play Liquidate"
        hitSlop={8}
        style={{ alignSelf: 'center', marginTop: -12, marginBottom: 22 }}
      >
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.sm, color: accent.base }}>
          New to Liquidate? How to play →
        </Text>
      </Pressable>

      {/* Resume — only once the saved slot has actually been read, so the card
          never appears a frame after the screen has already said there is none. */}
      {game.hydrated && game.savedGame && (
        <View
          style={{
            borderRadius: RADIUS['2xl'],
            borderWidth: 1,
            padding: 16,
            marginBottom: 24,
            backgroundColor: accent.tintBg,
            borderColor: accent.tintBorder,
          }}
        >
          <Text style={{ fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body, color: COLORS.fg }}>
            Match in progress
          </Text>
          <Text
            style={{
              fontFamily: FONTS.body,
              fontSize: FONT_SIZES.label,
              color: COLORS.fgMuted,
              marginTop: 4,
              marginBottom: 14,
            }}
          >
            {game.savedGame.state.players.length} players · round {game.savedGame.state.round} ·{' '}
            {game.savedGame.state.config.mode === 'quick' ? 'Quick' : 'Full'} board
          </Text>
          <View style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
            <Button
              label="Resume"
              onPress={() => {
                game.resume();
                markPlayed('liquidate');
              }}
              glow
              style={{ flex: 1 }}
            />
            <Button
              label="Discard"
              variant="secondary"
              onPress={game.discardSave}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      <SectionLabel>Opponents</SectionLabel>
      <View style={{ flexDirection: 'row', gap: SPACING['2.5'], marginBottom: 24 }}>
        {MODES.map((m) => (
          <SelectTile
            key={m.key}
            selected={mode === m.key}
            onPress={() => setMode(m.key)}
            label={m.label}
            sub={m.sub}
            icon={m.icon}
            accessibilityLabel={`${m.label} — ${m.sub}`}
          />
        ))}
      </View>

      <SectionLabel>Players</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2], marginBottom: 24 }}>
        {counts.map((n) => {
          const selected = playerCount === n;
          return (
            <Pressable
              key={n}
              onPress={() => update({ players: n })}
              accessibilityRole="button"
              accessibilityLabel={`${n} players`}
              accessibilityState={{ selected }}
              style={{
                flexGrow: 1,
                flexBasis: '14%',
                minWidth: 46,
                borderRadius: RADIUS.xl,
                borderWidth: 2,
                paddingVertical: 12,
                alignItems: 'center',
                backgroundColor: selected ? accent.tintBg : COLORS.surfaceAlt,
                borderColor: selected ? accent.base : COLORS.border,
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.display,
                  fontSize: FONT_SIZES.lg,
                  color: selected ? accent.base : COLORS.fg,
                }}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Board</SectionLabel>
      <View style={{ flexDirection: 'row', gap: SPACING['2.5'], marginBottom: 8 }}>
        {BOARD_MODES.map((b) => (
          <SelectTile
            key={b.key}
            selected={boardMode === b.key}
            onPress={() => update({ board: b.key })}
            label={b.label}
            sub={b.sub}
            accessibilityLabel={`${b.label} board — ${b.sub}`}
          />
        ))}
      </View>
      <Text
        style={{
          fontFamily: FONTS.body,
          fontSize: FONT_SIZES.xs,
          color: COLORS.fgMuted,
          marginBottom: 24,
        }}
      >
        Everyone starts on {formatCredits(config.startingCredits)}, collecting{' '}
        {formatCredits(config.stipend)} each time they pass Home Station.
      </Text>

      {mode === 'bot' && (
        <>
          <SectionLabel>Bot temperament</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING['2.5'], marginBottom: 24 }}>
            {LIQUIDATE_BOT_LEVELS.map((level) => (
              <SelectTile
                key={level}
                selected={botLevel === level}
                onPress={() => update({ botLevel: level })}
                label={LIQUIDATE_BOT_LABELS[level]}
                sub={BOT_BLURB[level]}
                basis="47%"
                accessibilityLabel={`${LIQUIDATE_BOT_LABELS[level]} bots — ${BOT_BLURB[level]}`}
              />
            ))}
          </View>
        </>
      )}

      <SectionLabel>Going broke</SectionLabel>
      <View style={{ gap: SPACING['2.5'], marginBottom: 28 }}>
        {DEBT_RULES.map((r) => (
          <SelectTile
            key={r.key}
            selected={debtRule === r.key}
            onPress={() => update({ debtRule: r.key })}
            label={r.label}
            sub={r.sub}
            basis="100%"
            accessibilityLabel={`${r.label} — ${r.sub}`}
          />
        ))}
      </View>
    </Screen>
  );
}

/** One line per level, in the same voice as the other games' bot blurbs. */
const BOT_BLURB: Record<LiquidateBotLevel, string> = {
  cautious: 'Hoards credits, bids shyly',
  steady: 'Buys sensibly, builds on time',
  shrewd: 'Corners systems and presses rent',
  ruthless: 'Overbids to deny, squeezes hard',
};

function SectionLabel({ children }: { children: string }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  return (
    <Text
      style={{
        color: COLORS.fg,
        fontFamily: FONTS.displaySemi,
        fontSize: FONT_SIZES.body,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function SelectTile({
  selected,
  onPress,
  label,
  sub,
  icon,
  basis = '47%',
  accessibilityLabel,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  sub: string;
  icon?: IconName;
  basis?: `${number}%`;
  accessibilityLabel: string;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const accent = GAME_ACCENTS.liquidate;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={{
        flexGrow: 1,
        flexBasis: basis,
        borderRadius: RADIUS['2xl'],
        borderWidth: 2,
        padding: 12,
        backgroundColor: selected ? accent.tintBg : COLORS.surfaceAlt,
        borderColor: selected ? accent.base : COLORS.border,
      }}
    >
      {icon && (
        <Icon
          name={icon}
          size={FONT_SIZES.xl}
          color={selected ? accent.base : COLORS.fgMuted}
          style={{ marginBottom: 4 }}
        />
      )}
      <Text
        style={{
          color: selected ? accent.base : COLORS.fg,
          fontFamily: FONTS.bodyBold,
          fontSize: FONT_SIZES.sm,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: COLORS.fgMuted,
          fontFamily: FONTS.body,
          fontSize: FONT_SIZES.caption,
          marginTop: 2,
        }}
      >
        {sub}
      </Text>
    </Pressable>
  );
}
