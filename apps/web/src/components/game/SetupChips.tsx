'use client';

import { useId, useState } from 'react';
import type { SetupField } from '@gameexplorer/client/game/setupFields';
import type { SetupGame } from '@gameexplorer/client/game/localSetup';
import { Icon } from '@gameexplorer/ui';
import { cn } from '@/lib/utils';

export interface SetupChipsProps<G extends SetupGame> {
  fields: readonly SetupField<G>[];
  onChange: (patch: Partial<import('@gameexplorer/client/game/localSetup').SetupFor[G]>) => void;
  className?: string;
}

/**
 * The setup, as a row of chips that are themselves the controls.
 *
 * This replaces a sentence and a *Change* button. The sentence could not be
 * acted on and did not always say enough — Go's board size was printed only
 * when it was not the default — so the choice that defines the game was both
 * invisible and one page away. A chip shows what is chosen and opens its own
 * options underneath; nothing leaves the page.
 *
 * Opening one closes the others: two lists of options open at once on a phone
 * pushes Start off the screen, and only one choice is being made at a time.
 */
export function SetupChips<G extends SetupGame>({ fields, onChange, className }: SetupChipsProps<G>) {
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();
  if (fields.length === 0) return null;

  return (
    <div className={className}>
      <ul className="flex flex-wrap gap-2" aria-label="Game setup">
        {fields.map((field) => {
          const isOpen = open === field.key;
          const panelId = `${baseId}-${field.key}`;
          return (
            <li key={field.key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : field.key)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={cn(
                  'touch-target inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm motion-control',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  isOpen
                    ? 'border-border-strong bg-surface-muted text-fg'
                    : 'border-border bg-surface-alt text-fg hover:border-border-strong hover:bg-surface-muted',
                )}
              >
                <span className="text-fg-muted">{field.label}</span>
                <span className="font-semibold">{field.value}</span>
                {/* The icon set has no down caret; a right one turned is the
                    same glyph and costs nothing. */}
                <Icon
                  name="caret-right"
                  className={cn('text-xs text-fg-subtle motion-control', isOpen ? '-rotate-90' : 'rotate-90')}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {fields.map((field) => {
        if (open !== field.key) return null;
        const panelId = `${baseId}-${field.key}`;
        return (
          <div
            key={field.key}
            id={panelId}
            className="mt-2 rounded-xl border border-border bg-surface-alt p-2"
          >
            <ul className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label={field.label}>
              {field.options.map((option) => {
                const selected = option.value === field.selected;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!!field.locked && !selected}
                      onClick={() => {
                        onChange(field.apply(option.value));
                        setOpen(null);
                      }}
                      className={cn(
                        'touch-target w-full rounded-lg border px-3 py-2 text-left motion-control',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        selected
                          ? 'border-accent bg-accent-muted'
                          : 'border-transparent hover:bg-surface-muted',
                      )}
                    >
                      <span className="block text-sm font-semibold text-fg">{option.label}</span>
                      {option.detail && (
                        <span className="block text-caption text-fg-muted">{option.detail}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {field.locked && (
              // Why the choice cannot be made. A disabled control with no
              // explanation reads as a bug.
              <p className="px-2 pt-1.5 text-caption text-fg-muted">{field.locked}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
