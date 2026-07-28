import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { signInWithIdentifier } from '@gameexplorer/client';
import { Button, Screen, BackHeader, TextField } from '@/components/ui';
import { OAuthButtons, OrDivider } from '@/components/auth/OAuthButtons';

/**
 * Email/password + OAuth sign-in. Mirrors the web `/auth/signin` page. On success
 * we route to `next` (defaults to /profile). The shared `onAuthStateChange`
 * (mounted by AuthBootstrap) updates the store; the redirect just moves the UI.
 */
export default function SignInScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = next ?? '/profile';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const done = () => router.replace(target as never);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    // One field, either kind of credential — emails go straight to Supabase,
    // usernames via the API (only it may resolve a username to an email).
    const { error } = await signInWithIdentifier(identifier, password);
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      done();
    }
  };

  return (
    <Screen>
      <BackHeader fallbackHref="/" />
      <Text style={{ color: COLORS.fg, fontSize: 28, fontWeight: '800', marginBottom: 24 }}>
        Sign in
      </Text>

      <View style={{ gap: 16 }}>
        <OAuthButtons onSuccess={done} onError={(m) => setError(m || null)} />
        <OrDivider />

        <TextField
          label="Username or email"
          placeholder="Your username or you@example.com"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          onSubmitEditing={handleSignIn}
          returnKeyType="go"
        />

        {error && <Text style={{ color: COLORS.dangerHover, fontSize: 14 }}>{error}</Text>}

        <Button
          label="Sign in"
          onPress={handleSignIn}
          loading={loading}
          disabled={!identifier || !password}
          glow
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 }}>
          <Text style={{ color: COLORS.fgMuted, fontSize: 14 }}>No account?</Text>
          <Pressable onPress={() => router.replace('/(auth)/sign-up' as never)}>
            <Text style={{ color: COLORS.accent, fontSize: 14, fontWeight: '600' }}>Sign up</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
