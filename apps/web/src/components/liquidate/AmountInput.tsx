'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
  className?: string;
  /** Overrides for callers on the board's own chrome rather than the page. */
  style?: React.CSSProperties;
  'aria-label'?: string;
}

/**
 * A Credits field.
 *
 * Backed by a **string**, not the numeric value, which is the whole point: a
 * controlled `<input type="number" value={someNumber}>` re-formats after every
 * keystroke, so an empty box snaps back to "0" and typing "210" fights the
 * caret. Here the raw text is kept as typed and only parsed on the way out, so
 * a three-digit bid is three keypresses.
 *
 * Clamping is deliberately NOT applied while typing — "2" on the way to "210"
 * is below a min of 50, and rewriting it to "50" mid-word is exactly the
 * behaviour that made the field unusable. The caller gates its submit button on
 * the range instead; the field only reports what the player meant.
 */
export function AmountInput({
  value,
  onChange,
  min,
  max,
  id,
  className,
  style,
  'aria-label': ariaLabel,
}: AmountInputProps) {
  const [text, setText] = React.useState(() => String(value));

  // Follow the value when it changes from the outside (a new round of bidding,
  // a quick-bid chip), without clobbering what is being typed.
  React.useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      value={text}
      onChange={(e) => {
        // Digits only — no exponent/sign soup, and no silent NaN.
        const next = e.target.value.replace(/[^\d]/g, '');
        setText(next);
        onChange(next === '' ? 0 : Number(next));
      }}
      onBlur={() => setText(String(value))}
      style={style}
      className={cn(
        'w-full rounded-lg border border-border bg-surface px-3 py-2 text-fg tabular-nums',
        'outline-none focus:border-accent',
        className,
      )}
    />
  );
}
