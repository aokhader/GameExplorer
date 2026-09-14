import type React from 'react';
import { Icon, type IconName } from '@gameexplorer/ui';
import { cn } from '@/lib/utils';

export interface StatePanelProps {
  icon: IconName;
  /** `danger` tints the icon disc for a failure; everything else is `neutral`. */
  tone: 'neutral' | 'danger';
  title: string;
  body?: React.ReactNode;
  /** At most one action. */
  action?: React.ReactNode;
  /** Announce on arrival. Errors do; empty states do not. */
  announce?: boolean;
  className?: string;
}

const TONES = {
  neutral: 'bg-surface-muted text-fg-muted',
  danger: 'bg-danger-muted text-danger-hover',
} as const;

/**
 * The layout `EmptyState` and `ErrorState` share, so the two read as one family
 * — and as the same family as mobile's pair: an icon disc, a title, a sentence
 * and at most one action. Not exported from the barrel; use one of the two.
 *
 * It enters with motion-spec.md §5.5. These states appear after a client-side
 * load, which is why that is safe; a state rendered on the server for first
 * paint would delay what the visitor sees, which the spec rules out.
 */
export function StatePanel({ icon, tone, title, body, action, announce = false, className }: StatePanelProps) {
  return (
    <div
      role={announce ? 'alert' : undefined}
      className={cn('flex flex-col items-center px-6 py-10 text-center motion-safe:animate-enter', className)}
    >
      <div className={cn('mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl', TONES[tone])}>
        <Icon name={icon} />
      </div>
      <p className="text-lg font-semibold text-fg">{title}</p>
      {body ? <p className="mt-2 max-w-sm text-body text-fg-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
