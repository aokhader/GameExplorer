import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { apiFetch } from '@finesse/client';
import { COLORS, useThemeName } from '@finesse/ui';
import { Sheet } from '@/components/ui/Sheet';
import { Button, TextField } from '@/components/ui';
import { MenuRow } from '@/game/MenuRow';
import { FONTS } from '@/theme/typography';

/** Mirrors web's `OpponentMenu` list, which the server validates against. */
const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'cheating', label: 'Cheating' },
  { value: 'spam', label: 'Spam' },
  { value: 'offensive_language', label: 'Offensive language' },
  { value: 'other', label: 'Other' },
] as const;

export interface OpponentSheetProps {
  open: boolean;
  onClose: () => void;
  opponentId: string;
  opponentName: string;
  /** Attached to a report so moderation can find the game. */
  gameId: string | null;
  /** Accent for the menu rows' SOON badge; unused today but kept for parity. */
  accent?: string;
}

/**
 * Block / report an opponent — the native counterpart to web's `OpponentMenu`,
 * against the same `POST /users/blocks` and `/users/reports` endpoints through
 * the shared `apiFetch`.
 *
 * Web can afford a dropdown plus a separate modal; on a phone both steps live in
 * one sheet that swaps its contents, so reporting never stacks a modal on top of
 * a sheet on top of a game. Outcomes are stated in the sheet rather than in a
 * toast — the app has no toast host, and "did that work?" is exactly the
 * question a moderation action must answer.
 */
export function OpponentSheet({
  open,
  onClose,
  opponentId,
  opponentName,
  gameId,
  accent = COLORS.accent,
}: OpponentSheetProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const close = () => {
    // Reset so the next open starts on the menu, not on a stale result.
    setReporting(false);
    setContext('');
    setOutcome(null);
    onClose();
  };

  const handleBlock = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      await apiFetch('/users/blocks', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: opponentId, targetUsername: opponentName }),
      });
      setOutcome({ ok: true, text: `Blocked ${opponentName}. You won't be matched again.` });
    } catch (err) {
      // The server's message is the useful one here — a full block list and a
      // network failure need different responses from the player.
      setOutcome({ ok: false, text: err instanceof Error ? err.message : 'Could not block.' });
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      await apiFetch('/users/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: opponentId,
          reason,
          context: context.trim() || undefined,
          gameId: gameId ?? undefined,
        }),
      });
      setReporting(false);
      setContext('');
      setOutcome({ ok: true, text: 'Report submitted. Thank you.' });
    } catch (err) {
      setOutcome({ ok: false, text: err instanceof Error ? err.message : 'Could not report.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} closeLabel="Close opponent menu">
      <Text
        style={{
          color: COLORS.fg,
          fontFamily: FONTS.displaySemi,
          fontSize: 16,
          paddingHorizontal: 12,
          marginBottom: 6,
        }}
      >
        {opponentName}
      </Text>

      {outcome && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            marginHorizontal: 12,
            marginBottom: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: outcome.ok ? COLORS.success : COLORS.danger,
            backgroundColor: outcome.ok ? COLORS.surfaceMuted : COLORS.dangerMuted,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: outcome.ok ? COLORS.successHover : COLORS.dangerHover,
              fontFamily: FONTS.body,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {outcome.text}
          </Text>
        </View>
      )}

      {!reporting ? (
        <>
          <MenuRow
            glyph="🚩"
            label="Report player"
            detail="Files a record for moderation"
            onPress={() => {
              setOutcome(null);
              setReporting(true);
            }}
            disabled={busy}
            accent={accent}
          />
          <MenuRow
            glyph="🚫"
            label={busy ? 'Blocking…' : 'Block player'}
            detail="Excludes them from your matchmaking and invites"
            danger
            onPress={() => void handleBlock()}
            disabled={busy}
            accent={accent}
          />
        </>
      ) : (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 12 }}>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
            Help us keep games fair and friendly.
          </Text>

          <View>
            <Text
              style={{ color: COLORS.fgMuted, fontSize: 13, fontFamily: FONTS.bodySemi, marginBottom: 8 }}
            >
              Reason
            </Text>
            {/* A native picker would need another dependency and a platform
                split; five tappable rows are clearer on a phone anyway. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REPORT_REASONS.map((r) => {
                const selected = reason === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setReason(r.value)}
                    accessibilityRole="button"
                    accessibilityLabel={r.label}
                    accessibilityState={{ selected }}
                    style={{
                      minHeight: 44,
                      justifyContent: 'center',
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? COLORS.accent : COLORS.border,
                      backgroundColor: selected ? COLORS.accentMuted : COLORS.surfaceMuted,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? COLORS.accentHover : COLORS.fg,
                        fontFamily: FONTS.body,
                        fontSize: 14,
                      }}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField
            label="Details (optional)"
            value={context}
            onChangeText={setContext}
            placeholder="What happened?"
            maxLength={1000}
            accessibilityLabel="Report details"
          />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setReporting(false)}
              disabled={busy}
              style={{ flex: 1 }}
            />
            <Button
              label="Submit report"
              variant="danger"
              onPress={() => void handleReport()}
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}
