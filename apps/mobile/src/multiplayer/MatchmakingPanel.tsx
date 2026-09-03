import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName } from '@finesse/ui';
import type { TimeControl } from '@finesse/shared';
import { Button, Toggle } from '@/components/ui';
import { FONTS } from '@/theme/typography';
import type { GameAccent } from '@/game/GameScreenLayout';
import type { GameSession } from './session';

export interface TimeControlOption {
  id: TimeControl;
  label: string;
  desc: string;
}

export interface MatchmakingPanelProps {
  session: GameSession;
  accent: GameAccent;
  timeControls: TimeControlOption[];
  /** Called when the player backs out of online mode entirely. */
  onExit: () => void;
}

/**
 * The pre-game half of online play — native counterpart to the `MatchmakingPanel`
 * inside web's `GameLayout`: time control, Rated/Casual, Find Game, and the
 * "play a friend" invite link.
 *
 * Two things differ from web by platform necessity. The invite link is handed to
 * the OS share sheet (`Share.share`) rather than written to the clipboard behind
 * a toast — sharing a link to a person is the phone's native verb, and it covers
 * copy as one of its options, so it needs no clipboard dependency of its own.
 * And the queue state is a full-panel replacement rather than a card swap, since
 * there is no second column to keep the form visible in.
 */
export function MatchmakingPanel({ session: s, accent, timeControls, onExit }: MatchmakingPanelProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const accentColor = GAME_ACCENTS[accent].base;
  const tint = GAME_ACCENTS[accent].tintBg;

  const shareInvite = () => {
    if (!s.inviteUrl) return;
    // Fire-and-forget: a dismissed share sheet rejects on iOS, and a player
    // changing their mind is not an error worth surfacing.
    void Share.share({ message: s.inviteUrl, url: s.inviteUrl }).catch(() => {});
  };

  // ── Queued ────────────────────────────────────────────────────────────────
  if (s.status === 'queued') {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
        <ActivityIndicator size="large" color={accentColor} />
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 18, marginTop: 12 }}
        >
          Finding opponent…
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13, marginBottom: 20 }}>
          The rating window widens every 15s
        </Text>
        <Button label="Cancel" variant="secondary" onPress={s.cancelQueue} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 10 }}>
        Time control
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {timeControls.map((tc) => {
          const selected = s.timeControl === tc.id;
          return (
            <Pressable
              key={tc.id}
              onPress={() => s.setTimeControl(tc.id)}
              accessibilityRole="button"
              accessibilityLabel={`${tc.label} — ${tc.desc}`}
              accessibilityState={{ selected }}
              style={{
                flexGrow: 1,
                flexBasis: '47%',
                borderRadius: 14,
                borderWidth: 2,
                padding: 12,
                backgroundColor: selected ? tint : COLORS.surfaceAlt,
                borderColor: selected ? accentColor : COLORS.border,
              }}
            >
              <Text
                style={{
                  color: selected ? accentColor : COLORS.fg,
                  fontFamily: FONTS.displaySemi,
                  fontSize: 14,
                }}
              >
                {tc.label}
              </Text>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 }}>
                {tc.desc}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Same Rated card as the bot setup, so the switch means the same thing
          wherever a game is configured. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}>Rated</Text>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 }}>
            {s.rated ? 'Updates both players’ ratings' : 'Casual — no rating change'}
          </Text>
        </View>
        <Toggle value={s.rated} onValueChange={s.setRated} label="Rated" />
      </View>

      <Button
        label={s.connected ? 'Find Game' : s.connectionError ? 'Connection failed' : 'Connecting…'}
        onPress={s.joinQueue}
        disabled={!s.connected}
        glow
      />

      {s.connectionError && !s.connected && (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: COLORS.dangerHover,
            fontFamily: FONTS.body,
            fontSize: 13,
            textAlign: 'center',
            marginTop: 12,
          }}
        >
          {s.connectionError}
        </Text>
      )}

      {/* ── Challenge a friend ───────────────────────────────────────────── */}
      <View
        style={{
          marginTop: 24,
          paddingTop: 24,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          gap: 10,
        }}
      >
        {!s.inviteUrl ? (
          <Button
            label={s.creating ? 'Creating link…' : 'Play a Friend'}
            variant="secondary"
            onPress={s.createInvite}
            disabled={!s.connected || s.creating}
            loading={s.creating}
          />
        ) : (
          <>
            <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
              Send this link to a friend:
            </Text>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceMuted,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text
                // Selectable so the link is still recoverable if the share
                // sheet is unavailable (some managed devices disable it).
                selectable
                numberOfLines={2}
                style={{ color: COLORS.fg, fontFamily: FONTS.body, fontSize: 12 }}
              >
                {s.inviteUrl}
              </Text>
            </View>
            <Button label="Share link" onPress={shareInvite} />
            <Text style={{ color: COLORS.fgSubtle, fontFamily: FONTS.body, fontSize: 12 }}>
              Waiting for your friend to join — the link expires in 10 minutes.
            </Text>
          </>
        )}

        {s.inviteError && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' }}
          >
            {s.inviteError}
          </Text>
        )}
      </View>

      <Pressable
        onPress={onExit}
        accessibilityRole="button"
        accessibilityLabel="Back to game setup"
        style={{ paddingVertical: 16, marginTop: 8 }}
      >
        <Text
          style={{
            color: COLORS.fgMuted,
            fontFamily: FONTS.body,
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          Back to setup
        </Text>
      </Pressable>
    </>
  );
}
