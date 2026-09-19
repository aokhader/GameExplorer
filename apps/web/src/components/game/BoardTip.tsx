'use client';

import { Icon } from '@gameexplorer/ui';

/**
 * A one-time tip laid over the top edge of the board — the far side, so it never
 * covers the player's own pieces, which is where a check or a refused move is —
 * and without pushing the action row down a phone's screen the way a banner
 * above or below the board would.
 */
export function BoardTip({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      data-testid="board-tip"
      className="absolute inset-x-2 top-2 z-30 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-fg shadow-lg"
    >
      <Icon name="lightbulb" className="shrink-0 text-base text-fg-muted" />
      <p className="min-w-0 flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="touch-target shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-fg-muted hover:text-fg"
      >
        Got it
      </button>
    </div>
  );
}
