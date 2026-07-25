import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { FONTS } from '@/theme/typography';
import type { GameAccent } from '@/game/GameScreenLayout';

export interface GameBarProps {
  /** Index into the timeline currently on the board (0 = starting position). */
  viewIndex: number;
  /** Timeline length — `total - 1` moves have been played. */
  total: number;
  /** Seek to a timeline index. Callers don't need to clamp; the bar does. */
  onSeek: (index: number) => void;
  /** Game accent for the menu highlights. */
  accent: GameAccent;
  /** Turn the board around. */
  onFlipBoard: () => void;
  /** End the game as a draw. */
  onAgreeDraw: () => void;
  /** Abandon this game and go back to setup. */
  onNewGame: () => void;
  /** Forfeit. Asks for a second tap first, so a stray touch can't throw a game. */
  onResign: () => void;
  /** Game already over — nothing left to concede or agree. */
  gameOver?: boolean;
}

/** Seconds the flag stays armed after the first tap. */
const CONFIRM_MS = 3000;

/**
 * The in-game control bar, pinned under the board for the whole game.
 *
 * Everything a player reaches for mid-game lives here rather than scattered
 * between the header and the sidebar: the overflow menu (flip / draw / analysis
 * / new game), the resign flag, hints, and stepping through the history. It
 * replaces the four 28px arrows that used to sit in the move-list header — below
 * the 44pt touch minimum, and scrolled off screen exactly when a player wanted
 * them.
 *
 * Analysis and Hint are placeholders: rendered, visibly disabled, and labelled
 * "coming soon" so they read as unbuilt rather than broken.
 */
export function GameBar({
  viewIndex,
  total,
  onSeek,
  accent,
  onFlipBoard,
  onAgreeDraw,
  onNewGame,
  onResign,
  gameOver = false,
}: GameBarProps) {
  const { play } = useGameSfx();
  const [menuOpen, setMenuOpen] = useState(false);

  const last = total - 1;
  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < last;

  const seek = (index: number) => {
    const next = Math.max(0, Math.min(last, index));
    if (next === viewIndex) return;
    play('select');
    onSeek(next);
  };

  // ── Resign, two-tap ─────────────────────────────────────────────────────────
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Source of truth read synchronously: `confirming` state alone races on a fast
  // double-tap, since both handlers close over confirming=false. Same reasoning
  // as GameActions.
  const confirmingRef = useRef(false);

  const stopTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  useEffect(() => () => stopTimer(), []);

  const handleResign = () => {
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
    }, CONFIRM_MS);
  };

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
        }}
      >
        <BarButton glyph="☰" label="Game menu" onPress={() => setMenuOpen(true)} />
        <BarButton
          glyph="⚑"
          label={confirming ? 'Confirm resign' : 'Resign'}
          hint={confirming ? undefined : 'Tap twice to resign the game'}
          onPress={handleResign}
          disabled={gameOver}
          danger={confirming}
        />
        <BarButton glyph="💡" label="Hint (coming soon)" onPress={() => {}} disabled />

        {/* Hairline between the game actions and the history controls. */}
        <View style={{ width: 1, marginVertical: 6, backgroundColor: COLORS.border }} />

        <BarButton
          glyph="◀"
          label="Previous move"
          onPress={() => seek(viewIndex - 1)}
          disabled={!canGoBack}
        />
        <BarButton
          glyph="▶"
          label="Next move"
          onPress={() => seek(viewIndex + 1)}
          disabled={!canGoForward}
        />
      </View>

      <GameMenu
        open={menuOpen}
        accent={accent}
        gameOver={gameOver}
        onClose={() => setMenuOpen(false)}
        onFlipBoard={onFlipBoard}
        onAgreeDraw={onAgreeDraw}
        onNewGame={onNewGame}
      />
    </>
  );
}

function BarButton({
  glyph,
  label,
  hint,
  onPress,
  disabled = false,
  danger = false,
}: {
  glyph: string;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  // `style` stays a plain object and the pressed state is read from the children
  // function, matching `Button`/`GameActions`. A function-form `style` is
  // silently dropped on this app's Pressable (NativeWind wraps it), which shows
  // up as buttons with no background and no width.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={{ flex: 1 }}
    >
      {({ pressed }) => (
        <View
          style={{
            flex: 1,
            minHeight: 46,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: danger ? COLORS.danger : COLORS.border,
            backgroundColor: danger
              ? COLORS.dangerMuted
              : pressed
                ? COLORS.surfaceHover
                : COLORS.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.35 : 1,
          }}
        >
          <Text style={{ color: danger ? COLORS.dangerHover : COLORS.fg, fontSize: 16 }}>
            {glyph}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * The bar's overflow menu — a bottom sheet over a dim backdrop, matching
 * `GameResultScreen`'s Modal treatment. Actions close the sheet before firing so
 * the screen underneath isn't repainting behind a dismissing modal.
 */
function GameMenu({
  open,
  accent,
  gameOver,
  onClose,
  onFlipBoard,
  onAgreeDraw,
  onNewGame,
}: {
  open: boolean;
  accent: GameAccent;
  gameOver: boolean;
  onClose: () => void;
  onFlipBoard: () => void;
  onAgreeDraw: () => void;
  onNewGame: () => void;
}) {
  const accentColor = GAME_ACCENTS[accent].base;

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        {/* Swallows taps so pressing the sheet itself doesn't dismiss it. */}
        <Pressable onPress={() => {}} accessible={false}>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: COLORS.surfaceAlt }}>
            <View
              style={{
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                borderTopWidth: 1,
                borderColor: COLORS.border,
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 12,
                gap: 4,
              }}
            >
              {/* Grabber */}
              <View
                style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: COLORS.borderStrong,
                  marginBottom: 10,
                }}
              />

              <MenuRow glyph="🔄" label="Flip board" onPress={run(onFlipBoard)} accent={accentColor} />
              <MenuRow
                glyph="🤝"
                label="Agree to a draw"
                onPress={run(onAgreeDraw)}
                disabled={gameOver}
                accent={accentColor}
              />
              <MenuRow glyph="📈" label="Analysis" soon accent={accentColor} />
              <MenuRow glyph="♟️" label="New game" onPress={run(onNewGame)} accent={accentColor} />
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  glyph,
  label,
  onPress,
  soon = false,
  disabled = false,
  accent,
}: {
  glyph: string;
  label: string;
  onPress?: () => void;
  /** Placeholder entry — rendered, disabled, and badged so it reads as unbuilt. */
  soon?: boolean;
  /** Built, but unavailable right now (e.g. the game is already over). */
  disabled?: boolean;
  accent: string;
}) {
  const inactive = soon || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={soon ? `${label} (coming soon)` : label}
      accessibilityState={{ disabled: inactive }}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            minHeight: 52,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: pressed && !inactive ? COLORS.surfaceHover : 'transparent',
            opacity: inactive ? 0.45 : 1,
          }}
        >
          <Text style={{ fontSize: 20 }}>{glyph}</Text>
          <Text style={{ flex: 1, color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 16 }}>
            {label}
          </Text>
          {soon && (
            <Text
              style={{
                color: accent,
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 0.5,
                borderWidth: 1,
                borderColor: accent,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              SOON
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}
