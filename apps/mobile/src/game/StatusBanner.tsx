import { Text, View, type ViewStyle } from 'react-native';
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

/** Per-accent tint (bg / border / title), mirroring web's StatusBanner ACCENTS. */
const ACCENTS: Record<GameAccent | 'gold', { bg: string; border: string; title: string }> = {
  chess: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', title: '#7db1ff' },
  checkers: { bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.3)', title: '#ff8fc4' },
  reversi: { bg: 'rgba(163,230,53,0.08)', border: 'rgba(163,230,53,0.3)', title: '#bef264' },
  liquidate: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.3)', title: '#b39bf5' },
  gold: { bg: 'rgba(205,164,63,0.15)', border: 'rgba(205,164,63,0.35)', title: '#cda43f' },
};

/**
 * The accent-tinted status card at the top of the in-game sidebar — native port
 * of web's `StatusBanner`. A fixed min height reserves both the one- and two-line
 * states so bot-driven transitions don't shift the layout below.
 */
export function StatusBanner({ accent, title, description, style }: StatusBannerProps) {
  const c = ACCENTS[accent ?? 'gold'];
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
        <Text style={{ color: '#9aa6bd', fontSize: 13, marginTop: 4 }}>{description}</Text>
      )}
    </View>
  );
}
