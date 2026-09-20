import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

export interface GameActionsProps {
  /** Agree a draw (vs bot). Omit for games without draws (reversi). */
  onDraw?: () => void;
  drawLabel?: string;
  /** Forfeit the game. */
  onResign?: () => void;
  /**
   * Cancel the game instead of conceding it, leaving nothing behind.
   * Rendered in the resign slot while the game is young enough for the
   * screen to offer it (`ABORT_MOVE_LIMIT`); Resign takes over after that.
   */
  onAbort?: () => void;
  resignLabel?: string;
  /** Disables both buttons (e.g. once the game is over). */
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * The Arcade Glow in-game action row — native port of web's `GameActions`.
 * "½ Draw / Resign" split pair. Resign asks for a second tap within 3s so a
 * stray touch never throws a game.
 */
export function GameActions({
  onDraw,
  drawLabel = '½ Draw',
  onResign,
  onAbort,
  resignLabel = 'Resign',
  disabled = false,
  style,
}: GameActionsProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Source of truth for the two-tap confirm, read synchronously. `confirming`
  // state alone races on a fast double-tap: both taps' handlers close over
  // confirming=false (React hasn't re-rendered between them), so the second tap
  // starts a *new* confirm instead of firing onResign — the resign never lands.
  const confirmingRef = useRef(false);

  const stopTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  useEffect(() => () => stopTimer(), []);

  const handleResign = () => {
    if (!onResign) return;
    if (confirmingRef.current) {
      stopTimer();
      confirmingRef.current = false;
      setConfirming(false);
      onResign();
      return;
    }
    confirmingRef.current = true;
    setConfirming(true);
    timeoutRef.current = setTimeout(() => {
      confirmingRef.current = false;
      setConfirming(false);
    }, 3000);
  };

  const buttonBase: ViewStyle = {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <View style={[{ flexDirection: 'row', gap: SPACING['2.5'] }, style]}>
      {onDraw && (
        <Pressable
          onPress={onDraw}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Offer draw"
          accessibilityState={{ disabled }}
          style={[
            buttonBase,
            { backgroundColor: COLORS.surfaceMuted, borderColor: COLORS.border },
          ]}
        >
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>{drawLabel}</Text>
        </Pressable>
      )}
      {onAbort ? (
        // One tap, and neutral: nothing is being conceded and nothing is
        // written, so there is no question worth asking twice.
        <Pressable
          onPress={onAbort}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Abort"
          accessibilityHint="Cancel this game — nothing is saved"
          accessibilityState={{ disabled }}
          style={[buttonBase, { backgroundColor: COLORS.surfaceMuted, borderColor: COLORS.border }]}
        >
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>
            Abort
          </Text>
        </Pressable>
      ) : (
        onResign && (
        <Pressable
          onPress={handleResign}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={confirming ? 'Confirm resign' : 'Resign'}
          accessibilityHint={confirming ? undefined : 'Tap twice to resign the game'}
          accessibilityState={{ disabled }}
          style={[
            buttonBase,
            confirming
              ? { backgroundColor: COLORS.danger, borderColor: COLORS.danger }
              : { backgroundColor: COLORS.dangerMuted, borderColor: 'rgba(244,63,94,0.4)' },
          ]}
        >
          <Text
            style={{
              color: confirming ? '#fff' : COLORS.dangerHover,
              fontSize: FONT_SIZES.sm,
              fontFamily: FONTS.bodyBold,
            }}
          >
            {confirming ? `${resignLabel}?` : resignLabel}
          </Text>
        </Pressable>
        )
      )}
    </View>
  );
}
