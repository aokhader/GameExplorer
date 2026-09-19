import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LIQUIDATE_PANEL_COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

/**
 * The two-line back header every sub-view wears.
 *
 * The app's `BackHeader` cannot express this: it is a single title on the page
 * surface, and these sit on the board's own art with a subtitle carrying the
 * match's context ("Quick match · 28 tiles").
 */
export function ViewHeader({
  title,
  sub,
  onBack,
  right,
}: {
  title: string;
  sub?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[3],
        paddingHorizontal: 18,
        paddingTop: 8,
        paddingBottom: 14,
      }}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to the board"
        hitSlop={8}
        style={{
          width: 38,
          height: 38,
          borderRadius: RADIUS.xl,
          borderWidth: 1,
          borderColor: P.line,
          backgroundColor: P.panel,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: FONT_SIZES.lg, lineHeight: 22, color: P.ink }}>‹</Text>
      </Pressable>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONTS.display, fontSize: FONT_SIZES.base, color: P.ink }}>
          {title}
        </Text>
        {sub && (
          <Text
            numberOfLines={1}
            style={{ fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.caption, color: P.soft, marginTop: 1 }}
          >
            {sub}
          </Text>
        )}
      </View>

      {right}
    </View>
  );
}

/** The design's small uppercase section label. */
export function ViewSection({ children }: { children: string }) {
  useThemeName();
  return (
    <Text
      style={{
        fontFamily: FONTS.bodyBold,
        fontSize: FONT_SIZES['2xs'],
        letterSpacing: 1,
        color: LIQUIDATE_PANEL_COLORS.dim,
        marginHorizontal: 2,
        marginBottom: 8,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

/** The pinned action bar the auction and trade views share. */
export function ViewActionBar({ children }: { children: ReactNode }) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;
  return (
    <View
      style={{
        backgroundColor: P.panel2,
        borderTopWidth: 1,
        borderTopColor: P.line,
        borderTopLeftRadius: RADIUS['3xl'],
        borderTopRightRadius: RADIUS['3xl'],
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 22,
        boxShadow: '0 -12px 30px rgba(0,0,0,0.28)',
      }}
    >
      {children}
    </View>
  );
}

/** A filled accent button — the design's primary action. */
export function AccentButton({
  label,
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
  accessibilityLabel?: string;
}) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={style}
    >
      {({ pressed }) => (
        <View
          style={{
            paddingVertical: 14,
            borderRadius: RADIUS['2xl'],
            alignItems: 'center',
            backgroundColor: P.accent,
            // Flat: the gold is already the one action on the view.
            opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          }}
        >
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.body, color: P.accentInk }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** An outlined button — Pass, Cancel, and the rest of the quiet actions. */
export function GhostButton({
  label,
  onPress,
  disabled = false,
  danger = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  style?: object;
  accessibilityLabel?: string;
}) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;
  const tint = danger ? P.danger : P.dim;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={style}
    >
      {({ pressed }) => (
        <View
          style={{
            paddingVertical: 12,
            borderRadius: RADIUS['2xl'],
            alignItems: 'center',
            borderWidth: 1,
            borderColor: danger ? 'rgba(239,95,107,0.4)' : P.line,
            opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.label, color: tint }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
