import { Pressable, Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { useGameSfx } from '@/audio/useGameSfx.native';
import type { GameAccent } from '@/game/GameScreenLayout';

export interface PuzzleBarProps {
  accent: GameAccent;
  /** Index of the position on the board; 0 is the puzzle's starting position. */
  viewIndex: number;
  /** How many positions there are to step through. */
  total: number;
  /** Seek to a position. Callers don't need to clamp; the bar does. */
  onSeek: (index: number) => void;
  /** Whether the player is on the clock — a hint has nothing to answer otherwise. */
  canHint: boolean;
  /** The last move missed; the retry is the action the player wants. */
  wrong: boolean;
  /** The line is finished; the next puzzle is the action the player wants. */
  solved: boolean;
  onHint: () => void;
  onRetry: () => void;
  onNext: () => void;
}

/**
 * The pinned control bar for a puzzle run.
 *
 * Built as a trimmed `GameBar` rather than its own thing: same glyph buttons,
 * same hairline splitting actions from history, same two-thirds/one-third feel,
 * so a player moving between a game and a puzzle finds the controls where they
 * left them. What is missing is what a puzzle has no use for — resign, agree a
 * draw, flip the board, and the overflow sheet holding them. There is nobody to
 * concede to.
 *
 * The history controls earn their place here for a reason they don't have in a
 * game: after a wrong move the board runs on to show the opponent's refutation,
 * and ◀ is how the player gets back to the position they misplayed to compare
 * the two.
 */
export function PuzzleBar({
  accent,
  viewIndex,
  total,
  onSeek,
  canHint,
  wrong,
  solved,
  onHint,
  onRetry,
  onNext,
}: PuzzleBarProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { play } = useGameSfx();

  const last = total - 1;
  const seek = (index: number) => {
    const next = Math.max(0, Math.min(last, index));
    if (next === viewIndex) return;
    play('select');
    onSeek(next);
  };

  return (
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
      <BarButton
        glyph="💡"
        label="Hint"
        hint="Shows the move you are looking for — a hinted solve does not extend your streak"
        onPress={onHint}
        disabled={!canHint}
        accent={accent}
      />
      <BarButton
        glyph="↺"
        label={wrong ? 'Try again' : 'Retry'}
        hint="Put the pieces back and start the line over"
        onPress={onRetry}
        disabled={solved}
        primary={wrong}
        accent={accent}
      />
      <BarButton
        glyph="⏭"
        label="Next puzzle"
        hint="Skip to another puzzle"
        onPress={onNext}
        primary={solved}
        accent={accent}
      />

      {/* Hairline between the puzzle actions and the history controls, exactly
          as the game bar splits its own two halves. */}
      <View style={{ width: 1, marginVertical: 6, backgroundColor: COLORS.border }} />

      <BarButton
        glyph="◀"
        label="Previous position"
        onPress={() => seek(viewIndex - 1)}
        disabled={viewIndex <= 0}
        accent={accent}
      />
      <BarButton
        glyph="▶"
        label="Next position"
        onPress={() => seek(viewIndex + 1)}
        disabled={viewIndex >= last}
        accent={accent}
      />
    </View>
  );
}

function BarButton({
  glyph,
  label,
  hint,
  onPress,
  disabled = false,
  primary = false,
  accent,
}: {
  glyph: string;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  /** The action the current phase is asking for — takes the accent treatment. */
  primary?: boolean;
  accent: GameAccent;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  // The selected-tile treatment the setup screens use: accent border, accent
  // glyph, accent *tint* behind it. Not a solid accent fill — `COLORS.onAccent`
  // is the ink for the brand gold/forest fill only, and it is near-black in one
  // theme, so painting it on a per-game accent (chess is blue) would be
  // unreadable in exactly one of the two themes and fine in the other.
  const { base: accentColor, tintBg } = GAME_ACCENTS[accent];

  // `style` stays a plain object and the pressed state is read from the children
  // function: a function-form `style` is silently dropped on this app's
  // Pressable (NativeWind wraps it), which shows up as buttons with no
  // background and no width. Same reasoning as `GameBar`'s BarButton.
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
            borderWidth: primary ? 2 : 1,
            borderColor: primary ? accentColor : COLORS.border,
            backgroundColor: primary
              ? tintBg
              : pressed
                ? COLORS.surfaceHover
                : COLORS.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
          }}
        >
          <Text style={{ color: primary ? accentColor : COLORS.fg, fontSize: 16 }}>{glyph}</Text>
        </View>
      )}
    </Pressable>
  );
}
