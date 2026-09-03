import { Stack } from 'expo-router';
import { COLORS, useThemeName } from '@finesse/ui';

/** Auth group — sign in / sign up, presented as a modal stack over the hub. */
export default function AuthLayout() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    />
  );
}
