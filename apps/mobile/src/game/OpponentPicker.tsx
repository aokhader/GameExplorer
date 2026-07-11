import { Pressable, Text, View } from 'react-native';
import { COLORS } from '@gameexplorer/ui';
import { Toggle } from '@/components/ui';
import { useSettings } from '@/providers/SettingsProvider';
import type { LocalGameMode } from '@/engine/useLocalGame';

export interface OpponentPickerProps {
  value: LocalGameMode;
  onChange: (mode: LocalGameMode) => void;
  /** Game accent for the selected tile (border + label). */
  accent: string;
  /** Translucent accent for the selected tile background. */
  tint: string;
}

const OPTIONS: { mode: LocalGameMode; icon: string; label: string; description: string }[] = [
  { mode: 'bot', icon: '🤖', label: 'vs Bot', description: 'Challenge the computer' },
  {
    mode: 'pass-and-play',
    icon: '👥',
    label: 'Pass & Play',
    description: 'Two players, one device',
  },
];

/**
 * Setup-screen opponent selector — vs Bot or Pass & Play. Shared by all three
 * game screens so the tiles look identical; only the accent differs per game.
 */
export function OpponentPicker({ value, onChange, accent, tint }: OpponentPickerProps) {
  return (
    <>
      <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700', marginBottom: 10 }}>
        Opponent
      </Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        {OPTIONS.map((opt) => {
          const selected = value === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => onChange(opt.mode)}
              style={{
                flex: 1,
                borderRadius: 14,
                borderWidth: 2,
                padding: 12,
                backgroundColor: selected ? tint : COLORS.surfaceAlt,
                borderColor: selected ? accent : COLORS.border,
              }}
            >
              <Text style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</Text>
              <Text
                style={{ color: selected ? accent : COLORS.fg, fontSize: 14, fontWeight: '800' }}
              >
                {opt.label}
              </Text>
              <Text style={{ color: COLORS.fgMuted, fontSize: 11, marginTop: 2 }}>
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
        <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700' }}>
          Flip board between turns
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
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
