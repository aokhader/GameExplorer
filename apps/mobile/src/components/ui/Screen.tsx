import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, useThemeName } from '@finesse/ui';
import { FONTS } from '@/theme/typography';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). Set false for full-bleed screens. */
  scroll?: boolean;
  edges?: Edge[];
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
 * the keyboard open — see `useKeyboardHeight`.
 */
export function Screen({ children, scroll = true, edges = ['top', 'bottom'] }: ScreenProps) {
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
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingHorizontal: 20, paddingTop: 8 }, column]}>{children}</View>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: COLORS.fgMuted, fontSize: 24, lineHeight: 24 }}>‹</Text>
      </Pressable>
      {title && (
        <Text style={{ color: COLORS.fg, fontSize: 18, fontFamily: FONTS.display }}>{title}</Text>
      )}
    </View>
  );
}
