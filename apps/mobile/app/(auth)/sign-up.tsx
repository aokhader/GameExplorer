import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@gameexplorer/ui';
import { supabase } from '@gameexplorer/db';
import { Button, Screen, BackHeader, TextField } from '@/components/ui';
import { OAuthButtons, OrDivider } from '@/components/auth/OAuthButtons';

/**
 * Email/password + OAuth sign-up. Mirrors the web `/auth/signup` page: create the
 * auth user and let the `on_auth_user_created` database trigger build the profile
 * row from `options.data.username`. The profile can't be inserted from here — with
 * email confirmation on, signUp returns no session, so RLS sees an anonymous
 * caller. See project-docs/sql-queries/supabase-profile-trigger.sql.
 */
export default function SignUpScreen() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Return-key focus chaining, so reaching the password never depends on being
  // able to scroll past the keyboard.
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const done = () => router.replace('/profile' as never);

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() } },
    });
    if (error || !data.user) {
      setError(error?.message ?? 'Sign up failed');
      setLoading(false);
      return;
    }

    // No session means Supabase is waiting on email confirmation.
    if (!data.session) {
      setConfirmSent(true);
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
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <TextField
          ref={emailRef}
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
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
          onSubmitEditing={handleSignUp}
          returnKeyType="go"
        />

        {confirmSent && (
          <Text style={{ color: COLORS.fgMuted, fontSize: 14 }}>
            Check {email.trim()} for a confirmation link, then sign in.
          </Text>
        )}

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
