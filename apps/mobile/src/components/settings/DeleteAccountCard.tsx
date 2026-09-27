import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  useAuth,
  apiFetch,
  confirmPassword,
  currentReauthMethod,
  currentUserId,
  needsReauth,
  type ReauthMethod,
  type SocialProvider,
} from '@gameexplorer/client';
import { supabase } from '@gameexplorer/db';
import { COLORS, useThemeName, FONT_SIZES, SPACING } from '@gameexplorer/ui';
import { Card, Button, TextField } from '@/components/ui';
import { signInWithAppleNative, signInWithOAuthNative, type OAuthResult } from '@/lib/oauth';
import { FONTS } from '@/theme/typography';

const CONFIRM_WORD = 'DELETE';

const PROVIDER_NAMES: Record<SocialProvider, string> = { google: 'Google', facebook: 'Facebook', apple: 'Apple' };

/**
 * How this phone can run the provider's sign-in, or null when it cannot: Sign
 * in with Apple is native and iOS-only here.
 */
function providerSignIn(provider: SocialProvider): (() => Promise<OAuthResult>) | null {
  if (provider === 'apple') return Platform.OS === 'ios' ? signInWithAppleNative : null;
  return () => signInWithOAuthNative(provider);
}

/**
 * Danger Zone — permanent account deletion. Reuses the same `DELETE /api/users/me`
 * endpoint the web Danger Zone calls (Apple 5.1.1 / Play data-deletion). Two-step
 * + type-to-confirm because this is irreversible. Only rendered when signed in.
 *
 * The API also wants a sign-in from the last ten minutes (security audit v2,
 * GX-19). When the session is older, the card asks for the password, or runs
 * the account's sign-in provider again, and then deletes.
 */
export function DeleteAccountCard() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user, loading } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<ReauthMethod | null>(null);
  const [password, setPassword] = useState('');

  if (loading || !user) return null;

  const canConfirm = confirmText.trim() === CONFIRM_WORD && !busy;

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/users/me', { method: 'DELETE' });
      await supabase.auth.signOut();
      router.replace('/' as never);
    } catch (err) {
      if (needsReauth(err)) {
        const method = await currentReauthMethod();
        // Apple on a phone that cannot run it has nothing to offer in place.
        setReauth(method.kind === 'provider' && !providerSignIn(method.provider) ? { kind: 'sign-out' } : method);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  }

  async function handlePassword() {
    if (reauth?.kind !== 'password' || !password || busy) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await confirmPassword(reauth.email, password);
    if (signInError) {
      setError(signInError);
      setBusy(false);
      return;
    }
    setPassword('');
    await handleDelete();
  }

  async function handleProvider(provider: SocialProvider) {
    const run = providerSignIn(provider);
    if (!run || busy) return;
    setBusy(true);
    setError(null);
    const expected = user!.id;
    const result = await run();
    if (result.error || result.cancelled) {
      setError(result.error);
      setBusy(false);
      return;
    }
    // The provider may have signed in a different account than the one this
    // card is for. Deleting that one would be the worst possible mistake.
    if ((await currentUserId()) !== expected) {
      setError('That signed in to a different account, so nothing was deleted.');
      setBusy(false);
      return;
    }
    await handleDelete();
  }

  function reset() {
    setExpanded(false);
    setConfirmText('');
    setError(null);
    setReauth(null);
    setPassword('');
  }

  return (
    <Card variant="danger" style={{ padding: 16, marginTop: 8 }}>
      <Text
        style={{
          color: COLORS.dangerHover,
          fontSize: FONT_SIZES.xs,
          fontFamily: FONTS.bodyBold,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 12,
        }}
      >
        Danger zone
      </Text>

      {!expanded ? (
        <View style={{ gap: SPACING[3] }}>
          <View>
            <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.body, fontFamily: FONTS.bodyBold }}>Delete account</Text>
            <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, marginTop: 2 }}>
              Permanently remove your account and all associated data.
            </Text>
          </View>
          <Button label="Delete account…" variant="danger" onPress={() => setExpanded(true)} />
        </View>
      ) : reauth ? (
        <View style={{ gap: SPACING[3] }}>
          <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>
            Confirm it&apos;s you
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, lineHeight: 20 }}>
            {reauth.kind === 'password'
              ? `For your security, enter your password to delete ${reauth.email}.`
              : reauth.kind === 'provider'
                ? `For your security, sign in again with ${PROVIDER_NAMES[reauth.provider]} to delete your account.`
                : 'For your security, sign out and sign in again, then delete your account within ten minutes.'}
          </Text>

          {reauth.kind === 'password' && (
            <TextField
              label="Password"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={handlePassword}
            />
          )}

          {error && <Text style={{ color: COLORS.dangerHover, fontSize: FONT_SIZES.sm }}>{error}</Text>}

          {reauth.kind === 'password' && (
            <Button
              label={busy ? 'Deleting…' : 'Confirm and delete'}
              variant="danger"
              haptic="warning"
              onPress={handlePassword}
              disabled={!password || busy}
              loading={busy}
            />
          )}
          {reauth.kind === 'provider' && (
            <Button
              label={busy ? 'Deleting…' : `Sign in with ${PROVIDER_NAMES[reauth.provider]}`}
              variant="danger"
              haptic="warning"
              onPress={() => handleProvider(reauth.provider)}
              disabled={busy}
              loading={busy}
            />
          )}
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={reset} />
        </View>
      ) : (
        <View style={{ gap: SPACING[3] }}>
          <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>
            {user.email
              ? `This permanently deletes the account ${user.email}. It cannot be undone.`
              : 'This permanently deletes your account. It cannot be undone.'}
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, lineHeight: 20 }}>
            Erased across all games: your profile and sign-in; all ratings, stats, and saved games;
            friends, blocks, and reports.
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label }}>
            Type <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodyBold }}>{CONFIRM_WORD}</Text> to confirm.
          </Text>

          <TextField
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_WORD}
            autoCapitalize="characters"
            autoCorrect={false}
            invalid={confirmText.length > 0 && confirmText.trim() !== CONFIRM_WORD}
          />

          {error && <Text style={{ color: COLORS.dangerHover, fontSize: FONT_SIZES.sm }}>{error}</Text>}

          <Button
            label={busy ? 'Deleting…' : 'Permanently delete'}
            variant="danger"
            haptic="warning"
            onPress={() => canConfirm && handleDelete()}
            disabled={!canConfirm}
            loading={busy}
          />
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={reset} />
        </View>
      )}
    </Card>
  );
}
