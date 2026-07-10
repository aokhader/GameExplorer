import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '@gameexplorer/ui';
import { signInWithOAuthNative } from '@/lib/oauth';

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

function FacebookIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#ffffff"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </Svg>
  );
}

/**
 * Google + Facebook sign-in buttons. Both drive the same native OAuth round-trip
 * (`signInWithOAuthNative`); on success the shared `onAuthStateChange` updates the
 * store and the caller's redirect fires. Errors bubble up via `onError`.
 */
export function OAuthButtons({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<null | 'google' | 'facebook'>(null);

  const run = async (provider: 'google' | 'facebook') => {
    onError('');
    setBusy(provider);
    try {
      const { error, cancelled } = await signInWithOAuthNative(provider);
      if (error) onError(error);
      else if (!cancelled) onSuccess();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Pressable
        onPress={() => run('google')}
        disabled={busy !== null}
        style={({ pressed }) => ({
          height: 48,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceMuted,
          opacity: busy !== null ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        {busy === 'google' ? <ActivityIndicator size="small" color={COLORS.fg} /> : <GoogleIcon />}
        <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '600' }}>
          Continue with Google
        </Text>
      </Pressable>

      <Pressable
        onPress={() => run('facebook')}
        disabled={busy !== null}
        style={({ pressed }) => ({
          height: 48,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: '#1877F2',
          opacity: busy !== null ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        {busy === 'facebook' ? <ActivityIndicator size="small" color="#fff" /> : <FacebookIcon />}
        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>
          Continue with Facebook
        </Text>
      </Pressable>
    </View>
  );
}

/** "or" divider used between OAuth and email/password. */
export function OrDivider() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
      <Text style={{ color: COLORS.fgSubtle, fontSize: 12 }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: COLORS.border }} />
    </View>
  );
}
