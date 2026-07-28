import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, apiFetch } from '@gameexplorer/client';
import { supabase } from '@gameexplorer/db';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Card, Button, TextField } from '@/components/ui';

const CONFIRM_WORD = 'DELETE';

/**
 * Danger Zone — permanent account deletion. Reuses the same `DELETE /api/users/me`
 * endpoint the web Danger Zone calls (Apple 5.1.1 / Play data-deletion). Two-step
 * + type-to-confirm because this is irreversible. Only rendered when signed in.
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

  if (loading || !user) return null;

  const canConfirm = confirmText.trim() === CONFIRM_WORD && !busy;

  async function handleDelete() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/users/me', { method: 'DELETE' });
      await supabase.auth.signOut();
      router.replace('/' as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Card style={{ padding: 16, borderColor: COLORS.danger, marginTop: 8 }}>
      <Text
        style={{
          color: COLORS.dangerHover,
          fontSize: 12,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 12,
        }}
      >
        Danger zone
      </Text>

      {!expanded ? (
        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700' }}>Delete account</Text>
            <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 2 }}>
              Permanently remove your account and all associated data.
            </Text>
          </View>
          <Button label="Delete account…" variant="danger" onPress={() => setExpanded(true)} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={{ color: COLORS.fg, fontSize: 14, fontWeight: '700' }}>
            This permanently deletes your account. It cannot be undone.
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 13, lineHeight: 20 }}>
            Erased across all games: your profile and sign-in; all ratings, stats, and saved games;
            friends, blocks, and reports.
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 13 }}>
            Type <Text style={{ color: COLORS.fg, fontWeight: '700' }}>{CONFIRM_WORD}</Text> to confirm.
          </Text>

          <TextField
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_WORD}
            autoCapitalize="characters"
            autoCorrect={false}
            invalid={confirmText.length > 0 && confirmText.trim() !== CONFIRM_WORD}
          />

          {error && <Text style={{ color: COLORS.dangerHover, fontSize: 14 }}>{error}</Text>}

          <Button
            label={busy ? 'Deleting…' : 'Permanently delete'}
            variant="danger"
            onPress={handleDelete}
            disabled={!canConfirm}
            loading={busy}
          />
          <Button
            label="Cancel"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setExpanded(false);
              setConfirmText('');
              setError(null);
            }}
          />
        </View>
      )}
    </Card>
  );
}
