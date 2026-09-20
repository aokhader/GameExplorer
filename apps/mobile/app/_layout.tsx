import { useEffect, useMemo } from 'react';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Spectral_600SemiBold,
  Spectral_700Bold,
  Spectral_800ExtraBold,
} from '@expo-google-fonts/spectral';
import {
  NunitoSans_400Regular,
  NunitoSans_500Medium,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import { COLORS, getActiveTheme, useThemeName } from '@gameexplorer/ui';

import { bootstrapConfig } from '@/config/env';
import { SettingsProvider, useFeedbackPrefs } from '@/providers/SettingsProvider';
import { AuthBootstrap } from '@/providers/AuthBootstrap';
import { EngineHost } from '@/engine/EngineHost';
import { navigationTheme } from '@/theme/navigationTheme';

// SDK 54+ no longer auto-hides the splash on first render — hide it explicitly
// once the root has mounted, or the app sits on the splash forever.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout. Order matters:
 *   - GestureHandlerRootView must wrap everything (board drag gestures in M2+).
 *   - SafeAreaProvider feeds notch/home-indicator insets to every screen.
 *   - bootstrapConfig() injects the API URL + OAuth redirect into the shared
 *     layer before any screen tries to connect or authenticate.
 *   - SettingsProvider exposes device preferences (sound/haptics/motion/board).
 *   - AuthBootstrap mounts the shared `useAuth` once so the auth store stays
 *     populated for every screen for the whole session.
 *
 * The brand faces (Space Grotesk display / DM Sans body — same pairing as web)
 * load before first paint; the splash stays up until they resolve so text
 * never flashes from the system font.
 */
/**
 * The root stack. A pushed screen slides in from the right and swipes back the
 * way it came, so going deeper and coming back read as directions; sign-in rises
 * from the bottom, over whatever asked for it. Every push used to cross-fade,
 * which said nothing about where the new screen sat. Tab switches are instant
 * (the tab bar's default). Reduced motion cuts straight to the new screen.
 *
 * `ThemeProvider` is what the stack is drawn *on*: without it React Navigation
 * keeps its light default, which shows through the display's rounded corners
 * for the length of every transition — see `theme/navigationTheme.ts`. The
 * `contentStyle` below still paints each screen; the two are different layers.
 */
function RootStack() {
  // Repaint when the theme changes; the surface colour below is a live view.
  const themeName = useThemeName();
  const { reducedMotion } = useFeedbackPrefs();
  const navTheme = useMemo(() => navigationTheme(themeName), [themeName]);
  return (
    <ThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.surface },
          animation: reducedMotion ? 'none' : 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        {/* Auth screens present modally over the hub. */}
        <Stack.Screen
          name="(auth)"
          options={{ presentation: 'modal', animation: reducedMotion ? 'none' : 'slide_from_bottom' }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Repaint when the theme changes; the tokens below are live views.
  const themeName = useThemeName();

  // Both themes' faces load up front, so switching has nothing to wait for and
  // never flashes a system font mid-session.
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Spectral_600SemiBold,
    Spectral_700Bold,
    Spectral_800ExtraBold,
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });
  const fontsReady = fontsLoaded || fontError != null;

  useEffect(() => {
    bootstrapConfig();
  }, []);

  useEffect(() => {
    // Reveal the app once fonts are in (or failed — never brick the boot).
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  // The window itself, below everything React draws. `backgroundColor` in
  // app.config fixes it to Arcade Glow's page colour at build time, which is
  // right for a cold start and wrong the moment someone picks the light Cozy
  // theme — so follow the active theme here too. The static value still matters:
  // it is what the very first frame of every launch is painted on, before any
  // JS runs.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(COLORS.surface).catch(() => {});
  }, [themeName]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthBootstrap>
            {/* Never unmounts — the native chess engine cannot survive a
                stop/restart cycle, so its host lives at the root (see
                src/engine/chessEngineNative.ts). */}
            <EngineHost />
            {/* Cozy is a light theme — light status-bar glyphs would vanish
                against parchment, so the style follows the active theme. */}
            <StatusBar style={getActiveTheme() === 'cozy' ? 'dark' : 'light'} />
            <RootStack />
          </AuthBootstrap>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
