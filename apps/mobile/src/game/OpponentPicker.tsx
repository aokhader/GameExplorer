import { Pressable, Text, View } from 'react-native';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Toggle } from '@/components/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';
import type { LocalGameMode } from '@/engine/useLocalGame';

/**
 * What the setup screen can be configuring.
 *
 * Puzzles is a mode here but not a `LocalGameMode`: it doesn't run a game at
 * all, so it never reaches `useLocalGame`. Picking it turns the Start button
 * into a link to the puzzle route (see any of the three game screens). That
 * split is deliberate — modelling it as a fourth `LocalGameMode` would put a
 * value into that hook which none of its branches can answer for.
 */
export type SetupMode = LocalGameMode | 'puzzles';

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
 * Setup-screen mode selector — vs Bot, Training, Pass & Play, or Puzzles.
 * Shared by all three game screens so the tiles look identical; only the accent
 * differs per game. The tiles wrap 2-up like the bot strength grid below them,
 * which the fourth option fills out into an even 2×2.
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
