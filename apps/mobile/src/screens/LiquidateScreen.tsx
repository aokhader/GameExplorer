import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LIQUIDATE_BOT_LABELS,
  LIQUIDATE_BOT_LEVELS,
  LIQUIDATE_CONFIGS,
  LIQUIDATE_MAX_PLAYERS,
  LIQUIDATE_MIN_PLAYERS,
  formatCredits,
  type DebtRule,
  type LiquidateBotLevel,
  type LiquidateSeat,
} from '@finesse/shared';
import { COLORS, GAME_ACCENTS, useThemeName } from '@finesse/ui';
import { Screen, BackHeader, Button, GlowBackdrop } from '@/components/ui';
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
    glyph: '🤖',
    label: 'Vs bots',
    sub: 'You against 1–5 rivals',
  },
  {
    key: 'local' as const,
    glyph: '👥',
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
  const [mode, setMode] = useState<'bot' | 'local'>('bot');
  const [playerCount, setPlayerCount] = useState(3);
  const [boardMode, setBoardMode] = useState<'full' | 'quick'>('quick');
  const [debtRule, setDebtRule] = useState<DebtRule>('allow-negative');
  const [botLevel, setBotLevel] = useState<LiquidateBotLevel>('steady');

  const game = useLiquidateGame({ storageKey: mode, botLevel });
  const accent = GAME_ACCENTS.liquidate;

  const start = () => {
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
    return <LiquidateGame game={game} mode={mode} onQuit={game.quit} />;
  }

  const config = LIQUIDATE_CONFIGS[boardMode];
  const counts = Array.from(
    { length: LIQUIDATE_MAX_PLAYERS - LIQUIDATE_MIN_PLAYERS + 1 },
    (_, i) => LIQUIDATE_MIN_PLAYERS + i,
  );

  return (
    <Screen>
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
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 14, color: accent.base }}>
          New to Liquidate? How to play →
        </Text>
      </Pressable>

      {/* Resume — only once the saved slot has actually been read, so the card
          never appears a frame after the screen has already said there is none. */}
      {game.hydrated && game.savedGame && (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            padding: 16,
            marginBottom: 24,
            backgroundColor: accent.tintBg,
            borderColor: accent.tintBorder,
          }}
        >
          <Text style={{ fontFamily: FONTS.displaySemi, fontSize: 15, color: COLORS.fg }}>
            Match in progress
          </Text>
          <Text
            style={{
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.fgMuted,
              marginTop: 4,
              marginBottom: 14,
            }}
          >
            {game.savedGame.state.players.length} players · round {game.savedGame.state.round} ·{' '}
            {game.savedGame.state.config.mode === 'quick' ? 'Quick' : 'Full'} board
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Resume" onPress={game.resume} glow style={{ flex: 1 }} />
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
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
        {MODES.map((m) => (
          <SelectTile
            key={m.key}
            selected={mode === m.key}
            onPress={() => setMode(m.key)}
            label={m.label}
            sub={m.sub}
            glyph={m.glyph}
            accessibilityLabel={`${m.label} — ${m.sub}`}
          />
        ))}
      </View>

      <SectionLabel>Players</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {counts.map((n) => {
          const selected = playerCount === n;
          return (
            <Pressable
              key={n}
              onPress={() => setPlayerCount(n)}
              accessibilityRole="button"
              accessibilityLabel={`${n} players`}
              accessibilityState={{ selected }}
              style={{
                flexGrow: 1,
                flexBasis: '14%',
                minWidth: 46,
                borderRadius: 12,
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
                  fontSize: 17,
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
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
        {BOARD_MODES.map((b) => (
          <SelectTile
            key={b.key}
            selected={boardMode === b.key}
            onPress={() => setBoardMode(b.key)}
            label={b.label}
            sub={b.sub}
            accessibilityLabel={`${b.label} board — ${b.sub}`}
          />
        ))}
      </View>
      <Text
        style={{
          fontFamily: FONTS.body,
          fontSize: 12,
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            {LIQUIDATE_BOT_LEVELS.map((level) => (
              <SelectTile
                key={level}
                selected={botLevel === level}
                onPress={() => setBotLevel(level)}
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
      <View style={{ gap: 10, marginBottom: 28 }}>
        {DEBT_RULES.map((r) => (
          <SelectTile
            key={r.key}
            selected={debtRule === r.key}
            onPress={() => setDebtRule(r.key)}
            label={r.label}
            sub={r.sub}
            basis="100%"
            accessibilityLabel={`${r.label} — ${r.sub}`}
          />
        ))}
      </View>

      <Button label="Start Match" onPress={start} glow />
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
        fontSize: 15,
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
  glyph,
  basis = '47%',
  accessibilityLabel,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  sub: string;
  glyph?: string;
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
        borderRadius: 14,
        borderWidth: 2,
        padding: 12,
        backgroundColor: selected ? accent.tintBg : COLORS.surfaceAlt,
        borderColor: selected ? accent.base : COLORS.border,
      }}
    >
      {glyph && <Text style={{ fontSize: 20, marginBottom: 4 }}>{glyph}</Text>}
      <Text
        style={{
          color: selected ? accent.base : COLORS.fg,
          fontFamily: FONTS.bodyBold,
          fontSize: 14,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: COLORS.fgMuted,
          fontFamily: FONTS.body,
          fontSize: 11,
          marginTop: 2,
        }}
      >
        {sub}
      </Text>
    </Pressable>
  );
}
