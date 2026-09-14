import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, FONT_SIZES, RADIUS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { Entrance } from './Entrance';
import { Icon, type IconName } from './Icon';

export interface StatePanelProps {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  title: string;
  body?: string;
  /** The action row, if any. */
  children?: ReactNode;
  /** Take the remaining space and centre in it, for a screen that is nothing but this state. */
  fill?: boolean;
  /** Announce on arrival (Android live region). Errors do; empty states do not. */
  announce?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The layout `EmptyState` and `ErrorState` share, so the two read as one family:
 * an icon disc, a title, a sentence, and at most one action. Not exported from
 * the barrel — use one of the two.
 */
export function StatePanel({
  icon,
  iconColor,
  iconBackground,
  title,
  body,
  children,
  fill = false,
  announce = false,
  style,
}: StatePanelProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Entrance
      style={[
        { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
        fill && { flex: 1, justifyContent: 'center' },
        style,
      ]}
    >
      <View accessibilityLiveRegion={announce ? 'polite' : 'none'} style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: RADIUS.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iconBackground,
            marginBottom: 16,
          }}
        >
          <Icon name={icon} size={FONT_SIZES['2xl']} color={iconColor} />
        </View>
        <Text
          accessibilityRole="header"
          style={{ fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.lg, color: COLORS.fg, textAlign: 'center' }}
        >
          {title}
        </Text>
        {body ? (
          <Text
            style={{
              fontFamily: FONTS.body,
              fontSize: FONT_SIZES.body,
              lineHeight: 22,
              color: COLORS.fgMuted,
              textAlign: 'center',
              marginTop: 8,
              maxWidth: 320,
            }}
          >
            {body}
          </Text>
        ) : null}
      </View>
      {children ? <View style={{ marginTop: 20 }}>{children}</View> : null}
    </Entrance>
  );
}
