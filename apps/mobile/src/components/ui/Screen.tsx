import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { Entrance } from './Entrance';
import { Icon } from './Icon';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). Set false for full-bleed screens. */
  scroll?: boolean;
  edges?: Edge[];
  /**
   * How the content arrives — `motion-spec.md` §5.5. `rise` for content screens;
   * `fade`, opacity only, for a screen centred on a board, so the board lands
   * where the eye expects it; `none` where something inside owns its entrance.
   */
  entrance?: 'rise' | 'fade' | 'none';
  /**
   * Pinned below the content, outside the scroll — a setup screen's Start
   * button. At the end of a form it sat about a screen-height down on a phone,
   * so every game began with a scroll to find it.
   */
  footer?: ReactNode;
}

/**
 * Height of the on-screen keyboard, 0 while it's hidden.
 *
 * Needed because Android is edge-to-edge from SDK 54 on, which retires the old
 * `adjustResize` window shrink: the window keeps its full height when the
 * keyboard opens. A ScrollView whose content already fits therefore has nothing
 * to scroll, so fields behind the keyboard can't be dragged into view — the
 * content just springs back. Padding the scroll content by the keyboard height
 * gives it somewhere to go.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS reports the keyboard before it animates in; Android only after.
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setHeight(0)
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/**
 * Page shell: safe-area inset + surface background, optional scroll. Content is
 * capped at a phone-ish column width and centered so tablets don't stretch
 * cards edge-to-edge (no effect on phones). Scrolling screens stay usable with
 * the keyboard open — see `useKeyboardHeight`. The content enters on mount, as
 * `entrance` says.
 */
export function Screen({ children, scroll = true, edges = ['top', 'bottom'], entrance = 'rise', footer }: ScreenProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const column = { width: '100%' as const, maxWidth: 560, alignSelf: 'center' as const };
  const keyboardHeight = useKeyboardHeight();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 + keyboardHeight },
            column,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {entrance === 'none' ? children : <Entrance variant={entrance}>{children}</Entrance>}
        </ScrollView>
      ) : entrance === 'none' ? (
        <View style={[{ flex: 1, paddingHorizontal: 20, paddingTop: 8 }, column]}>{children}</View>
      ) : (
        // The entrance is the column itself here, so children that take `flex: 1` still fill it.
        <Entrance variant={entrance} style={[{ flex: 1, paddingHorizontal: 20, paddingTop: 8 }, column]}>
          {children}
        </Entrance>
      )}
      {footer && (
        <View
          style={[
            {
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 12,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
              backgroundColor: COLORS.surface,
            },
            column,
          ]}
        >
          {footer}
        </View>
      )}
    </SafeAreaView>
  );
}

/**
 * A back chevron + optional title row. Uses `router.back()` when it can, else
 * falls back to a caller-supplied route (deep-link cold starts have no history).
 */
export function BackHeader({ title, fallbackHref }: { title?: string; fallbackHref?: string }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (fallbackHref) router.replace(fallbackHref as never);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[2], marginBottom: 16 }}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={{
          width: 36,
          height: 36,
          borderRadius: RADIUS.full,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="caret-left" size={FONT_SIZES.xl} color={COLORS.fgMuted} />
      </Pressable>
      {title && (
        <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.lg, fontFamily: FONTS.display }}>{title}</Text>
      )}
    </View>
  );
}
