import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
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
 */
export default function RootLayout() {
  useEffect(() => {
    bootstrapConfig();
    // Root has mounted and providers are wired — reveal the app.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

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
