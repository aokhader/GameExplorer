import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GLOWS_NATIVE, GRADIENTS_NATIVE, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';

import { useAuth } from '@gameexplorer/client';
import { Icon, PressableScale, TAB_BAR_OVERLAP, type IconName } from '@/components/ui';
import { FONTS } from '@/theme/typography';
import { getLastPlayed } from '@/lib/lastPlayed';
import { continueRoute, readContinueItems } from '@/lib/continueGame';

const PLAY_BUTTON = 56;
const PLAY_ICON = FONT_SIZES['2xl'];

/**
 * Where the play triangle sits in the gold circle. The glyph (Phosphor's
 * `play-fill`) is drawn right of its own box's centre, by 24 of its 256 units,
 * to balance a triangle whose weight is at its flat side. Its bounding box
 * centred would look pushed left; its centroid centred, pushed right. Halfway
 * between the two is the usual optical centre. Measured on a Pixel 8 screenshot,
 * that is 1.1 points left of where the glyph lands on its own, which leaves the
 * box 1.1 right of the circle's centre and the centroid 1.1 left. (It used to
 * be nudged 3 points right, on top of the glyph's own offset: the box sat nearly
 * 4 points right of centre, which read as off-centre at a glance.)
 */
const PLAY_ICON_SHIFT = -1.1;

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
 * already filled in with what was chosen last time.
 *
 * The chrome plate starts `TAB_BAR_OVERLAP` below the bar's top so the button
 * can rise above the plate while staying inside the touchable bounds (Android
 * ignores touches outside a parent's box). The bar is pulled up by the same
 * amount, over the bottom of the screen, so the screen's content runs to the
 * plate's edge; the strip beside the button lets touches through to it.
 *
 * The Home and You tabs start at the plate's edge, so the plate is as tall as
 * they are. Bottom-aligned with the button, as they used to be, their icons
 * rose above the plate's edge — invisible over an empty strip, but drawn across
 * the content once it scrolled under the bar.
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
          marginTop: TAB_BAR_OVERLAP,
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
    // Pulled up over the screen, and see-through beside the button: only the
    // plate and the buttons take touches.
    <View pointerEvents="box-none" style={{ marginTop: -TAB_BAR_OVERLAP }}>
      {/* Chrome plate — inset so the Play button pokes above the bar edge. */}
      <View
        style={{
          position: 'absolute',
          top: TAB_BAR_OVERLAP,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-around',
          paddingHorizontal: 12,
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
              width: PLAY_BUTTON,
              height: PLAY_BUTTON,
              borderRadius: RADIUS.full,
              alignItems: 'center',
              justifyContent: 'center',
              // Gold bloom + the design's dark lift off the tab plate. Uses
              // boxShadow, not SHADOWS_NATIVE.glowAccent: on a full circle the
              // elevation shadow traces the outline as a hard gold ring.
              boxShadow: `${GLOWS_NATIVE.glowAccent}, 0 8px 18px -6px rgba(0,0,0,0.6)`,
            }}
          >
            <Icon
              name="play-fill"
              size={PLAY_ICON}
              color={COLORS.onAccent}
              style={{ transform: [{ translateX: PLAY_ICON_SHIFT }] }}
            />
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
