import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS } from '@gameexplorer/ui';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). Set false for full-bleed screens. */
  scroll?: boolean;
  edges?: Edge[];
}

/** Page shell: safe-area inset + surface background, optional scroll. */
export function Screen({ children, scroll = true, edges = ['top', 'bottom'] }: ScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8 }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/**
 * A back chevron + optional title row. Uses `router.back()` when it can, else
 * falls back to a caller-supplied route (deep-link cold starts have no history).
 */
export function BackHeader({ title, fallbackHref }: { title?: string; fallbackHref?: string }) {
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
        <Text style={{ color: COLORS.fg, fontSize: 18, fontWeight: '700' }}>{title}</Text>
      )}
    </View>
  );
}
