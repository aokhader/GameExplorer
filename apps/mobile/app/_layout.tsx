import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '@gameexplorer/ui';

import { bootstrapConfig } from '@/config/env';

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
