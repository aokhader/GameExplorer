import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS_NATIVE, SHADOWS_NATIVE } from '@gameexplorer/ui';

import { FONTS } from '@/theme/typography';
import { getLastPlayed } from '@/lib/lastPlayed';

/** How far the gold Play button rises above the tab-bar plate. */
const PLAY_OVERLAP = 24;

const TAB_ICONS: Record<string, string> = {
  index: '🏠',
  profile: '👤',
};

/**
 * The "Deck" tab bar: Home · ▶ Play · You. The center Play button is an
 * action (jumps into the last-played game's setup), not a route. The chrome
 * plate starts `PLAY_OVERLAP` below the container top so the button can rise
 * above the bar while staying inside the touchable bounds (Android ignores
 * touches outside a parent's box).
 */
function DeckTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openPlay = () => {
    getLastPlayed().then((game) => {
      router.push({ pathname: '/play/[game]', params: { game } } as never);
    });
  };

  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const label = options.title ?? route.name;
    const focused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        hitSlop={8}
        style={{
          alignItems: 'center',
          gap: 3,
          paddingHorizontal: 18,
          paddingVertical: 6,
        }}
      >
        <Text style={{ fontSize: 19, opacity: focused ? 1 : 0.55 }}>{TAB_ICONS[route.name] ?? '•'}</Text>
        <Text
          style={{
            fontFamily: focused ? FONTS.bodyBold : FONTS.bodySemi,
            fontSize: 11,
            color: focused ? COLORS.fg : COLORS.fgSubtle,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View>
      {/* Chrome plate — inset so the Play button pokes above the bar edge. */}
      <View
        style={{
          position: 'absolute',
          top: PLAY_OVERLAP,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          paddingHorizontal: 12,
          paddingTop: 2,
          paddingBottom: Math.max(insets.bottom, 14),
        }}
      >
        {tabs[0]}
        <Pressable
          onPress={openPlay}
          accessibilityRole="button"
          accessibilityLabel="Play — jump into a game"
          hitSlop={6}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <LinearGradient
            {...GRADIENTS_NATIVE.accent}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              ...SHADOWS_NATIVE.glowAccent,
            }}
          >
            <Text style={{ color: COLORS.onAccent, fontSize: 21, marginLeft: 3 }}>▶</Text>
          </LinearGradient>
        </Pressable>
        {tabs[1]}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <DeckTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
