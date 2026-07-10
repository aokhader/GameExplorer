import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@gameexplorer/ui';
import { supabase } from '@gameexplorer/db';
import { Button, Screen, BackHeader, TextField } from '@/components/ui';
import { OAuthButtons, OrDivider } from '@/components/auth/OAuthButtons';

/**
 * Email/password + OAuth sign-up. Mirrors the web `/auth/signup` page: create the
 * auth user, then insert a minimal profile row (id + username — the encrypted-email
 * columns aren't required for a client insert). On success, route to /profile.
 */
export default function SignUpScreen() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const done = () => router.replace('/profile' as never);

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error || !data.user) {
      setError(error?.message ?? 'Sign up failed');
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, username: username.trim() });

    if (profileError) {
      setError('Account created but profile setup failed: ' + profileError.message);
      setLoading(false);
      return;
    }

    done();
  };

  return (
    <Screen>
      <BackHeader fallbackHref="/" />
      <Text style={{ color: COLORS.fg, fontSize: 28, fontWeight: '800', marginBottom: 24 }}>
        Create account
      </Text>

      <View style={{ gap: 16 }}>
        <OAuthButtons onSuccess={done} onError={(m) => setError(m || null)} />
        <OrDivider />

        <TextField
          label="Username"
          placeholder="Your display name"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
        />
        <TextField
          label="Password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          onSubmitEditing={handleSignUp}
          returnKeyType="go"
        />

        {error && <Text style={{ color: COLORS.dangerHover, fontSize: 14 }}>{error}</Text>}

        <Button
          label="Create account"
          onPress={handleSignUp}
          loading={loading}
          disabled={!email || !password || !username}
          glow
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 }}>
          <Text style={{ color: COLORS.fgMuted, fontSize: 14 }}>Already have an account?</Text>
          <Pressable onPress={() => router.replace('/(auth)/sign-in' as never)}>
            <Text style={{ color: COLORS.accent, fontSize: 14, fontWeight: '600' }}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
