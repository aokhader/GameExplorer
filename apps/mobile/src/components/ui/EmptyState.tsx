import type { StyleProp, ViewStyle } from 'react-native';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Button } from './Button';
import type { IconName } from './Icon';
import { StatePanel } from './StatePanel';

export interface EmptyStateProps {
  icon: IconName;
  /** What is missing, plainly: "No games yet". */
  title: string;
  /** What would be here, and why it is not yet. */
  body?: string;
  /** The one action that fills the space. */
  action?: { label: string; onPress: () => void };
  /** Take the remaining space and centre in it. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Loaded, and there is genuinely nothing to show — the Empty state in
 * `project-docs/design/screen-archetypes.md` §1. Not for a failure: a load that
 * failed and shows this instead is indistinguishable from an account with no
 * games, which is exactly the Profile defect that document records. Use
 * `ErrorState` for that.
 */
export function EmptyState({ icon, title, body, action, fill, style }: EmptyStateProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <StatePanel
      icon={icon}
      iconColor={COLORS.fgMuted}
      iconBackground={COLORS.surfaceMuted}
      title={title}
      body={body}
      fill={fill}
      style={style}
    >
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </StatePanel>
  );
}
