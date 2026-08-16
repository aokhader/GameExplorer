import { Pressable, Text, View } from 'react-native';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Toggle } from '@/components/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';
import type { LocalGameMode } from '@/engine/useLocalGame';

/**
 * What the setup screen can be configuring.
 *
 * Two of these are modes here but not `LocalGameMode`s, for the same reason:
 * neither runs a local game, so neither reaches `useLocalGame`.
 *  - **Puzzles** doesn't run a game at all; picking it turns the Start button
 *    into a link to the puzzle route.
 *  - **Online** runs a game, but the server owns it — `useGameSession` drives
 *    the loop, the clock and the result.
 *
 * That split is deliberate: modelling either as a `LocalGameMode` would put a
 * value into that hook which none of its branches can answer for.
 */
export type SetupMode = LocalGameMode | 'puzzles' | 'online';

export interface OpponentPickerProps {
  value: SetupMode;
  onChange: (mode: SetupMode) => void;
  /** Game accent for the selected tile (border + label). */
  accent: string;
  /** Translucent accent for the selected tile background. */
  tint: string;
}

const OPTIONS: { mode: SetupMode; icon: string; label: string; description: string }[] = [
  { mode: 'bot', icon: '🤖', label: 'vs Bot', description: 'Challenge the computer' },
  {
    mode: 'online',
    icon: '🌐',
    label: 'Online',
    description: 'Real opponent, live clock',
  },
  {
    mode: 'training',
    icon: '🎯',
    label: 'Training',
    description: 'Rated, matched to you',
  },
  {
    mode: 'pass-and-play',
    icon: '👥',
    label: 'Pass & Play',
    description: 'Two players, one device',
  },
  {
    mode: 'puzzles',
    icon: '🧩',
    label: 'Puzzles',
    description: 'Set positions, one answer',
  },
];

/**
 * Setup-screen mode selector — vs Bot, Online, Training, Pass & Play, or
 * Puzzles. Shared by all three game screens so the tiles look identical; only
 * the accent differs per game. The tiles wrap 2-up like the bot strength grid
 * below them; the fifth grows to fill its row rather than sitting in a half-
 * width gap, which is `flexGrow: 1` doing its job.
 *
 * Online sits second rather than last: it is the mode with a person on the
 * other end, and burying it under the solo modes is how mobile ended up feeling
 * like a different product from web.
 */
export function OpponentPicker({ value, onChange, accent, tint }: OpponentPickerProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <>
      <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 10 }}>
        Mode
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {OPTIONS.map((opt) => {
          const selected = value === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => onChange(opt.mode)}
              accessibilityRole="button"
              accessibilityLabel={`${opt.label} — ${opt.description}`}
              accessibilityState={{ selected }}
              style={{
                flexGrow: 1,
                flexBasis: '47%',
                borderRadius: 14,
                borderWidth: 2,
                padding: 12,
                backgroundColor: selected ? tint : COLORS.surfaceAlt,
                borderColor: selected ? accent : COLORS.border,
              }}
            >
              <Text style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</Text>
              <Text
                style={{ color: selected ? accent : COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 14 }}
              >
                {opt.label}
              </Text>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 }}>
                {opt.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/**
 * Pass-and-play "flip board between turns" toggle — the setup-screen mirror of
 * the Settings row, bound to the same persisted `flipBoardPassAndPlay` setting.
 * Chess/checkers only; the reversi board never flips.
 */
export function FlipBoardCard() {
  const { settings, setSetting } = useSettings();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}>
          Flip board between turns
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 }}>
          {"Rotate the board to face whoever's turn it is."}
        </Text>
      </View>
      <Toggle
        value={settings.flipBoardPassAndPlay}
        onValueChange={(next) => setSetting('flipBoardPassAndPlay', next)}
        label="Flip board between turns"
      />
    </View>
  );
}
