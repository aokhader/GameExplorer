import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
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
        gap: 12,
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
          borderRadius: 12,
          borderWidth: 1,
          borderColor: P.line,
          backgroundColor: P.panel,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 18, lineHeight: 22, color: P.ink }}>‹</Text>
      </Pressable>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONTS.display, fontSize: 16, color: P.ink }}>
          {title}
        </Text>
        {sub && (
          <Text
            numberOfLines={1}
            style={{ fontFamily: FONTS.bodySemi, fontSize: 10.5, color: P.soft, marginTop: 1 }}
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
        fontSize: 10,
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
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
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
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: P.accent,
            opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
            boxShadow: disabled ? undefined : '0 8px 22px rgba(231,182,78,0.32)',
          }}
        >
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: P.accentInk }}>
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
  const tint = danger ? '#ef5f6b' : P.dim;

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
            borderRadius: 14,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: danger ? 'rgba(239,95,107,0.4)' : P.line,
            opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: tint }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
