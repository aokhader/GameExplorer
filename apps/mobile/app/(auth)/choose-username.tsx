import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, useThemeName, FONT_SIZES, SPACING } from '@gameexplorer/ui';
import {
  canSubmitUsername,
  claimUsername,
  getProfileState,
  useUsernameAvailability,
} from '@gameexplorer/client';
import { USERNAME_MAX_LENGTH, usernameReasonMessage } from '@gameexplorer/shared';
import { Button, Screen, TextField } from '@/components/ui';
import { FONTS } from '@/theme/typography';

/**
 * Choose (or confirm) a username after an OAuth sign-in — the native twin of
 * web's `/auth/choose-username`.
 *
 * Every OAuth sign-up gets a name built by the database trigger from the
 * provider's display name or email. We always ask before it becomes a public
 * handle (chess.com does the same): the field is pre-filled with that name, so
 * keeping it is one tap.
 *
 * Claimed once. `games.opponent` stores the username as text, so a later
 * rename would detach a player from their own history — the API refuses a
 * second claim, and this screen says so up front.
 *
 * Where it goes afterwards: `next` when a sign-in screen sent it, otherwise
 * back to wherever it was pushed from (the post-game save-progress prompt).
 */
export default function ChooseUsernameScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  // This screen is reachable by deep link, so `next` is untrusted: an in-app
  // path only — never a URL, never protocol-relative.
  const next =
    typeof params.next === 'string' && params.next.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : undefined;

  const [username, setUsername] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = () => {
    if (next) router.replace(next as never);
    else if (router.canGoBack()) router.back();
    else router.replace('/profile' as never);
  };

  useEffect(() => {
    let cancelled = false;
    void getProfileState().then((state) => {
      if (cancelled) return;
      // Already chosen (a second device, a stale link): nothing to ask.
      if (state.status === 'ok') {
        finish();
        return;
      }
      const derived = state.status === 'needs-username' ? state.username : null;
      setCurrent(derived);
      setUsername(derived ?? '');
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // Runs once on arrival; `finish` reads params that do not change here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pre-filled name is theirs, so it counts as available to them.
  const { state: nameState } = useUsernameAvailability(username, { currentUsername: current });
  const canSubmit = ready && !saving && canSubmitUsername(nameState) && !claimError;

  const handleContinue = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const result = await claimUsername(username.trim());
    setSaving(false);
    if (result.ok) {
      finish();
    } else if (result.reason === 'error') {
      setError(result.error);
    } else {
      // The database refused a name the live check had allowed — lost a race,
      // or the profanity filter, which only the server runs.
      setClaimError(usernameReasonMessage(result.reason));
    }
  };

  return (
    <Screen>
      <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.display, fontFamily: FONTS.display, marginBottom: 8 }}>
        Choose your username
      </Text>
      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.body, lineHeight: 22, marginBottom: 24 }}>
        This is the name other players see. You can’t change it later.
      </Text>

      <View style={{ gap: SPACING[4] }}>
        <TextField
          label="Username"
          value={username}
          onChangeText={(text) => {
            setUsername(text);
            setClaimError(null);
          }}
          hint={nameState.hint}
          error={claimError ?? nameState.error}
          maxLength={USERNAME_MAX_LENGTH}
          editable={ready && !saving}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          returnKeyType="go"
          onSubmitEditing={handleContinue}
        />

        {error && <Text style={{ color: COLORS.dangerHover, fontSize: FONT_SIZES.sm }}>{error}</Text>}

        <Button label="Continue" onPress={handleContinue} loading={saving} disabled={!canSubmit} />
      </View>
    </Screen>
  );
}
