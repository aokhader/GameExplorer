import type { StyleProp, ViewStyle } from 'react-native';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Button } from './Button';
import { StatePanel } from './StatePanel';

export interface ErrorStateProps {
  /**
   * What failed, in plain words: "Couldn't load your games". Never an
   * exception's own message — that names the code's problem, not the player's.
   */
  title: string;
  /** What to do about it, or, offline, what still works. */
  body?: string;
  /** Omit when there is nothing a retry could fix, rather than offering a button that fails again. */
  onRetry?: () => void;
  retryLabel?: string;
  /** A retry is in flight. */
  retrying?: boolean;
  /** No network: a neutral icon rather than a warning, because nothing is broken. */
  offline?: boolean;
  /** Take the remaining space and centre in it. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Loading failed and can be retried — the Error and Offline states in
 * `project-docs/design/screen-archetypes.md` §1. It enters like any content and
 * never shakes (`motion-spec.md` §5.14).
 */
export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel = 'Try again',
  retrying = false,
  offline = false,
  fill,
  style,
}: ErrorStateProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <StatePanel
      icon={offline ? 'wifi-slash' : 'warning'}
      iconColor={offline ? COLORS.fgMuted : COLORS.dangerHover}
      iconBackground={offline ? COLORS.surfaceMuted : COLORS.dangerMuted}
      title={title}
      body={body}
      fill={fill}
      announce
      style={style}
    >
      {onRetry ? (
        <Button label={retryLabel} onPress={onRetry} variant="secondary" loading={retrying} />
      ) : null}
    </StatePanel>
  );
}
