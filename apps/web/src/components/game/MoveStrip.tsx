'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface MoveStripItem {
  /** "12. Nf3", or "Nf6" for the second move of a pair. */
  label: string;
  /** The timeline position this move leads to. */
  index: number;
}

/**
 * A game's moves in order, numbered in pairs the way every move list here
 * numbers them — "1. e4", "e5", "2. Nf3". Move *n* leads to timeline position
 * *n + 1*.
 */
export function numberedStripItems(labels: readonly string[]): MoveStripItem[] {
  return labels.map((label, i) => ({
    label: i % 2 === 0 ? `${i / 2 + 1}. ${label}` : label,
    index: i + 1,
  }));
}

/**
 * The move list on a phone, as one line (`project-docs/ux-fix-ideas.md` §8.2).
 *
 * Below `lg` the full list used to sit between the board and the controls and
 * grow with the game, so by move twenty keeping Resign on screen meant
 * scrolling a third of the board away. The strip is one row that scrolls
 * sideways and keeps the newest move in view; tapping a move steps the board to
 * it, and *All moves* goes to the full list further down the page.
 */
export function MoveStrip({
  items,
  current,
  onJump,
  fullListId,
}: {
  items: MoveStripItem[];
  current: number;
  onJump: (index: number) => void;
  /** The full list's element id, for *All moves*. */
  fullListId?: string;
}) {
  const scroller = useRef<HTMLOListElement>(null);

  // Keep the move on screen in view — the newest, unless the player has stepped
  // back. Scrolled by hand rather than with `scrollIntoView`, which would also
  // scroll the page back up to the strip whenever the bot moved.
  useEffect(() => {
    const list = scroller.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>('[aria-current="step"]');
    list.scrollLeft = el ? el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2 : list.scrollWidth;
  }, [items.length, current]);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface-alt pl-2" data-testid="move-strip">
      <ol
        ref={scroller}
        aria-label="Moves"
        className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap font-mono text-sm [scrollbar-width:none]"
      >
        {items.length === 0 ? (
          <li className="px-1 font-sans text-fg-subtle">No moves yet</li>
        ) : (
          items.map((item) => (
            <li key={item.index}>
              <button
                type="button"
                onClick={() => onJump(item.index)}
                aria-current={item.index === current ? 'step' : undefined}
                className={cn(
                  'min-h-9 rounded-md px-2',
                  item.index === current ? 'bg-accent-muted font-semibold text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {item.label}
              </button>
            </li>
          ))
        )}
      </ol>
      {fullListId && (
        <a
          href={`#${fullListId}`}
          className="touch-target flex h-11 shrink-0 items-center border-l border-border px-3 text-sm font-medium text-fg-muted hover:text-fg"
        >
          All moves
        </a>
      )}
    </div>
  );
}
