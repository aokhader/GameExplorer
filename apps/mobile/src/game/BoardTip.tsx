import { Pressable, Text, View } from 'react-native';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Icon } from '@/components/ui';
import { FONTS } from '@/theme/typography';

/**
 * A one-time tip laid over the top edge of the board — the far side, so it never
 * covers the player's own pieces, which is where a check or a refused move is —
 * and without pushing the game bar down.
 */
export function BoardTip({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useThemeName();
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        top: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[2],
        paddingLeft: 12,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
      }}
    >
      <Icon name="lightbulb" size={FONT_SIZES.base} color={COLORS.fgMuted} />
      <Text style={{ flex: 1, paddingVertical: 10, color: COLORS.fg, fontFamily: FONTS.body, fontSize: FONT_SIZES.label }}>
        {message}
      </Text>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        hitSlop={8}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
      >
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.label }}>Got it</Text>
      </Pressable>
    </View>
  );
}
