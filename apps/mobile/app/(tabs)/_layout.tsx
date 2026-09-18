import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GLOWS_NATIVE, GRADIENTS_NATIVE, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';

import { useAuth } from '@gameexplorer/client';
import { Icon, PressableScale, type IconName } from '@/components/ui';
import { FONTS } from '@/theme/typography';
import { getLastPlayed } from '@/lib/lastPlayed';
import { continueRoute, readContinueItems } from '@/lib/continueGame';

/** How far the gold Play button rises above the tab-bar plate. */
const PLAY_OVERLAP = 24;

/**
 * Each tab's icon, idle and selected. Filling on selection says "you are here"
 * without leaning on colour alone. Keyed by the route names declared at the
 * bottom of this file; a tab added there without an entry here falls back to a
 * visible question mark rather than rendering nothing.
 */
const TAB_ICONS: Record<string, { idle: IconName; selected: IconName }> = {
  index: { idle: 'house', selected: 'house-fill' },
  profile: { idle: 'user', selected: 'user-fill' },
};

/**
 * The "Deck" tab bar: Home · ▶ Play · You. The center Play button is an
 * action, not a route: it resumes the game the player was last in the middle of
 * (`ux-fix-ideas.md` §2.4), and otherwise opens the last-played game's setup,
 * already filled in with what was chosen last time. The chrome
 * plate starts `PLAY_OVERLAP` below the container top so the button can rise
 * above the bar while staying inside the touchable bounds (Android ignores
 * touches outside a parent's box).
 */
function DeckTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();

  const openPlay = async () => {
    // Before auth resolves the account is unknown, and a guest's game must not
    // stand in for it.
    const [next] = loading ? [] : await readContinueItems(user?.id ?? null);
    if (next) {
      router.push(continueRoute(next) as never);
      return;
    }
    const game = await getLastPlayed();
    router.push({ pathname: '/play/[game]', params: { game } } as never);
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
          gap: SPACING[1],
          paddingHorizontal: 18,
          paddingVertical: 6,
        }}
      >
        <Icon
          name={TAB_ICONS[route.name] ? TAB_ICONS[route.name][focused ? 'selected' : 'idle'] : 'question'}
          size={FONT_SIZES['2xl']}
          color={focused ? COLORS.fg : COLORS.fgSubtle}
        />
        <Text
          style={{
            fontFamily: focused ? FONTS.bodyBold : FONTS.bodySemi,
            fontSize: FONT_SIZES.caption,
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
        <PressableScale
          onPress={openPlay}
          accessibilityRole="button"
          accessibilityLabel="Play — jump into a game"
          hitSlop={6}
          haptic="impact"
        >
          <LinearGradient
            {...GRADIENTS_NATIVE.accent}
            style={{
              width: 56,
              height: 56,
              borderRadius: RADIUS.full,
              alignItems: 'center',
              justifyContent: 'center',
              // Gold bloom + the design's dark lift off the tab plate. Uses
              // boxShadow, not SHADOWS_NATIVE.glowAccent: on a full circle the
              // elevation shadow traces the outline as a hard gold ring.
              boxShadow: `${GLOWS_NATIVE.glowAccent}, 0 8px 18px -6px rgba(0,0,0,0.6)`,
            }}
          >
            {/* Nudged right: a play triangle's visual centre sits left of its box. */}
            <Icon name="play-fill" size={FONT_SIZES['2xl']} color={COLORS.onAccent} style={{ marginLeft: 3 }} />
          </LinearGradient>
        </PressableScale>
        {tabs[1]}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

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
