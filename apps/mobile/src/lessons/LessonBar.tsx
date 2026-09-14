import { Pressable, View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { GameAccent } from '@/game/GameScreenLayout';

export interface LessonBarProps {
  accent: GameAccent;
  /** True on a `read` step — Continue is the action the step is asking for. */
  canAdvance: boolean;
  /** False during the reply beat and once the lesson is done. */
  canHint: boolean;
  hintShown: boolean;
  /** The last answer missed — "Try again" is what the learner wants. */
  missed: boolean;
  done: boolean;
  onAdvance: () => void;
  onHint: () => void;
  onRetry: () => void;
  onNext: () => void;
}

/**
 * The pinned control bar for a lesson, mirroring `PuzzleBar`.
 *
 * Same icon buttons and the same "the action this phase is asking for takes
 * the accent" rule, so a learner moving between a lesson and a puzzle finds the
 * controls where they left them.
 *
 * What is missing is the history pair. A puzzle earns previous and next because
 * a wrong move runs the board on to show a refutation and the player needs to
 * walk back to compare. A lesson never does that — a miss leaves the board
 * exactly where it was — so there is no history to step through and two dead
 * buttons would only crowd the row.
 */
export function LessonBar({
  accent,
  canAdvance,
  canHint,
  hintShown,
  missed,
  done,
  onAdvance,
  onHint,
  onRetry,
  onNext,
}: LessonBarProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: SPACING[1],
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
      }}
    >
      <BarButton
        icon="lightbulb"
        label={hintShown ? 'Hint shown' : 'Hint'}
        hint="Marks the move the step is looking for"
        onPress={onHint}
        disabled={!canHint}
        accent={accent}
        testID="lesson-hint"
      />
      <BarButton
        icon="arrow-counter-clockwise"
        label={missed ? 'Try again' : 'Reset step'}
        hint="Put the board back to the start of this step"
        onPress={onRetry}
        disabled={done}
        primary={missed}
        accent={accent}
        testID="lesson-retry"
      />
      {done ? (
        <BarButton
          icon="skip-forward"
          label="Next lesson"
          hint="Move on to the next lesson"
          onPress={onNext}
          primary
          accent={accent}
          testID="lesson-next"
        />
      ) : (
        <BarButton
          icon="arrow-right"
          label="Continue"
          hint="Move on to the next step"
          onPress={onAdvance}
          disabled={!canAdvance}
          primary={canAdvance}
          accent={accent}
          testID="lesson-continue"
        />
      )}
    </View>
  );
}

function BarButton({
  icon,
  label,
  hint,
  onPress,
  disabled = false,
  primary = false,
  accent,
  testID,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  /** The action the current phase is asking for — takes the accent treatment. */
  primary?: boolean;
  accent: GameAccent;
  testID: string;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { play } = useGameSfx();
  const { base: accentColor, tintBg } = GAME_ACCENTS[accent];

  // `style` stays a plain object and the pressed state is read from the children
  // function — the way every control in this app is written. Same pattern as
  // `GameBar`'s BarButton.
  return (
    <Pressable
      onPress={() => {
        play('select');
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      testID={testID}
      style={{ flex: 1 }}
    >
      {({ pressed }) => (
        <View
          style={{
            flex: 1,
            minHeight: 46,
            borderRadius: RADIUS.xl,
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
          <Icon name={icon} size={FONT_SIZES.xl} color={primary ? accentColor : COLORS.fg} />
        </View>
      )}
    </Pressable>
  );
}
