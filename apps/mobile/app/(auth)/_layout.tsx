import { Stack } from 'expo-router';
import { COLORS } from '@gameexplorer/ui';

/** Auth group — sign in / sign up, presented as a modal stack over the hub. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    />
  );
}
