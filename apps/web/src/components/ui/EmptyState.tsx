import type React from 'react';
import type { IconName } from '@gameexplorer/ui';
import { StatePanel } from './StatePanel';

export interface EmptyStateProps {
  icon: IconName;
  /** What is missing, plainly: "No games yet". */
  title: string;
  /** What would be here, and why it is not yet. */
  body?: React.ReactNode;
  /** The one action that fills the space — a `Button`, or a `Link` styled as one. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Loaded, and there is genuinely nothing to show — the Empty state in
 * `project-docs/design/screen-archetypes.md` §1. Not for a failure: a failed
 * load dressed as empty is indistinguishable from an account with no games.
 * Use `ErrorState` for that.
 */
export function EmptyState(props: EmptyStateProps) {
  return <StatePanel tone="neutral" {...props} />;
}
