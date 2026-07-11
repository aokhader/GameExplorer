import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { COLORS } from '@gameexplorer/ui';

export interface GameActionsProps {
  /** Agree a draw (vs bot). Omit for games without draws (reversi). */
  onDraw?: () => void;
  drawLabel?: string;
  /** Forfeit the game. */
  onResign?: () => void;
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
  resignLabel = 'Resign',
  disabled = false,
  style,
}: GameActionsProps) {
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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <View style={[{ flexDirection: 'row', gap: 10 }, style]}>
      {onDraw && (
        <Pressable
          onPress={onDraw}
          disabled={disabled}
          style={[
            buttonBase,
            { backgroundColor: COLORS.surfaceMuted, borderColor: COLORS.border },
          ]}
        >
          <Text style={{ color: COLORS.fgMuted, fontSize: 14, fontWeight: '700' }}>{drawLabel}</Text>
        </Pressable>
      )}
      {onResign && (
        <Pressable
          onPress={handleResign}
          disabled={disabled}
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
              fontSize: 14,
              fontWeight: '700',
            }}
          >
            {confirming ? `${resignLabel}?` : resignLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
