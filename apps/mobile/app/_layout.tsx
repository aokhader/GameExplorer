import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '@gameexplorer/ui';

import { bootstrapConfig } from '@/config/env';
import { SettingsProvider } from '@/providers/SettingsProvider';
import { AuthBootstrap } from '@/providers/AuthBootstrap';

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
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const fontsReady = fontsLoaded || fontError != null;

  useEffect(() => {
    bootstrapConfig();
  }, []);

  useEffect(() => {
    // Reveal the app once fonts are in (or failed — never brick the boot).
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthBootstrap>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.surface },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="(tabs)" />
              {/* Auth screens present modally over the hub. */}
              <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
              <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            </Stack>
          </AuthBootstrap>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
