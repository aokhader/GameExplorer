import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '@gameexplorer/ui';

import { bootstrapConfig } from '@/config/env';

// SDK 54+ no longer auto-hides the splash on first render — hide it explicitly
// once the root has mounted, or the app sits on the splash forever.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout. Order matters:
 *   - GestureHandlerRootView must wrap everything (board drag gestures in M2+).
 *   - SafeAreaProvider feeds notch/home-indicator insets to every screen.
 *   - bootstrapConfig() injects the API URL + OAuth redirect into the shared
 *     layer before any screen tries to connect or authenticate.
 *
 * The Auth/Settings providers are added in M1; the auth-aware redirect from the
 * (auth) group lives there too.
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
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.surface },
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
