import type React from 'react';
import { Icon } from '@gameexplorer/ui';
import { Button } from './Button';
import { StatePanel } from './StatePanel';

export interface ErrorStateProps {
  /**
   * What failed, in plain words: "Couldn't load live games". Never an
   * exception's own message — that names the code's problem, not the visitor's.
   */
  title: string;
  /** What to do about it, or, offline, what still works. */
  body?: React.ReactNode;
  /** Omit when there is nothing a retry could fix. */
  onRetry?: () => void;
  retryLabel?: string;
  /** A retry is in flight. */
  retrying?: boolean;
  /** No network: a neutral icon rather than a warning, because nothing is broken. */
  offline?: boolean;
  className?: string;
}

/**
 * Loading failed and can be retried — the Error and Offline states in
 * `project-docs/design/screen-archetypes.md` §1. It enters like content, is
 * announced, and never shakes (motion-spec.md §5.14).
 */
export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel = 'Try again',
  retrying = false,
  offline = false,
  className,
}: ErrorStateProps) {
  return (
    <StatePanel
      icon={offline ? 'wifi-slash' : 'warning'}
      tone={offline ? 'neutral' : 'danger'}
      title={title}
      body={body}
      announce
      className={className}
      action={
        onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            loading={retrying}
            leftIcon={<Icon name="arrows-clockwise" />}
          >
            {retryLabel}
          </Button>
        ) : undefined
      }
    />
  );
}
