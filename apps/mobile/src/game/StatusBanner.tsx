import { Text, View, type ViewStyle } from 'react-native';
import { COLORS, useThemeName, type ThemeName } from '@gameexplorer/ui';
import type { GameAccent } from '@/game/GameScreenLayout';

export type { GameAccent };

export interface StatusBannerProps {
  /** Which game's neon accent tints the banner. Omit for the neutral gold state. */
  accent?: GameAccent;
  /** Bold headline — "Your move", "Bot is thinking…". */
  title: string;
  /** Optional supporting line under the title. */
  description?: string;
  style?: ViewStyle;
}

/**
 * Per-accent tint (bg / border / title), mirroring web's StatusBanner ACCENTS.
 *
 * Spelled out per theme rather than read off `GAME_ACCENTS`, because the banner
 * runs a weaker tint than the accent ramp does (0.08 against `tintBg`'s 0.16) —
 * this is a wash behind text, not a card face. The `dark` row is the original
 * Arcade Glow literal set, unchanged.
 *
 * The title hue also flips which end of the ramp it takes: on near-black the
 * *light* shade is the readable one, on cream it is the base.
 */
const ACCENTS: Record<
  ThemeName,
  Record<GameAccent | 'gold', { bg: string; border: string; title: string }>
> = {
  dark: {
    chess: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', title: '#7db1ff' },
    checkers: { bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.3)', title: '#ff8fc4' },
    reversi: { bg: 'rgba(163,230,53,0.08)', border: 'rgba(163,230,53,0.3)', title: '#bef264' },
    go: { bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.3)', title: '#67e8f9' },
    liquidate: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.3)', title: '#b39bf5' },
    gold: { bg: 'rgba(205,164,63,0.15)', border: 'rgba(205,164,63,0.35)', title: '#cda43f' },
  },
  cozy: {
    chess: { bg: 'rgba(139,90,43,0.07)', border: 'rgba(169,116,63,0.35)', title: '#8b5a2b' },
    checkers: { bg: 'rgba(47,110,78,0.07)', border: 'rgba(47,110,78,0.32)', title: '#2f6e4e' },
    reversi: { bg: 'rgba(59,46,33,0.06)', border: 'rgba(59,46,33,0.28)', title: '#3b2e21' },
    go: { bg: 'rgba(44,99,96,0.07)', border: 'rgba(44,99,96,0.32)', title: '#2c6360' },
    liquidate: { bg: 'rgba(184,114,74,0.08)', border: 'rgba(184,114,74,0.32)', title: '#b8724a' },
    gold: { bg: 'rgba(47,110,78,0.09)', border: 'rgba(47,110,78,0.30)', title: '#2f6e4e' },
  },
};

/**
 * The accent-tinted status card at the top of the in-game sidebar — native port
 * of web's `StatusBanner`. A fixed min height reserves both the one- and two-line
 * states so bot-driven transitions don't shift the layout below.
 */
export function StatusBanner({ accent, title, description, style }: StatusBannerProps) {
  // Subscribe: without this the banner keeps whichever palette was live when it
  // last rendered for another reason, which is the wrong-palette trap.
  const theme = useThemeName();
  const c = ACCENTS[theme][accent ?? 'gold'];
  return (
    <View
      // Announce turn/status changes to screen readers as they happen.
      accessible
      accessibilityLiveRegion="polite"
      style={[
        {
          minHeight: 66,
          borderRadius: 12,
          borderWidth: 1,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: c.bg,
          borderColor: c.border,
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: c.title, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      {description && (
        <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 4 }}>{description}</Text>
      )}
    </View>
  );
}
