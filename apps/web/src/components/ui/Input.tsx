import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Hint text shown under the field when there is no error. */
  hint?: string;
  /**
   * `md` (40px) matches `Button`'s md. `lg` (44px) is for forms whose other
   * controls are 44px touch targets — the auth pages — so the fields do not
   * sit shorter than the buttons around them.
   */
  fieldSize?: 'md' | 'lg';
}

/**
 * The field surface, without a height or a colour for its border and ring.
 *
 * Focus uses `focus-visible:`, the one focus idiom motion-spec.md §5.3 settles
 * on. On a text field it matches every focus, pointer or keyboard, so nothing is
 * lost against `focus:`. The ring is a box-shadow, which `transition-colors`
 * does not list, so it appears at once — focus is never animated.
 */
const fieldSurface =
  'w-full px-3 rounded-lg bg-surface-muted text-fg placeholder:text-fg-subtle ' +
  'border transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:border-transparent ' +
  'disabled:opacity-50 disabled:pointer-events-none';

// Height and tone are CHOSEN here, never appended over a default: `cn` joins,
// it does not merge, so `ring-focus` followed by `ring-danger` leaves the
// winner to stylesheet order — and the focus gold was winning, which drew an
// invalid field with a gold ring instead of a red one.
const FIELD_HEIGHT = { md: 'h-10', lg: 'h-11' } as const;
const FIELD_TONE = {
  normal: 'border-border focus-visible:ring-focus',
  error: 'border-danger focus-visible:ring-danger',
} as const;

/** The md field, shared with `Select`. Same classes it always had. */
const fieldBase = `h-10 ${fieldSurface} ${FIELD_TONE.normal}`;

// `useId`, not a module counter: the server and the browser count separately,
// so a counter hands the server-rendered label and input different ids from the
// hydrated ones — a hydration mismatch on every server-rendered field, and an
// aria-describedby that can point at an id that is not in the DOM.
function useFieldId(provided?: string) {
  const generated = `gx-field-${React.useId()}`;
  return provided ?? generated;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, fieldSize = 'md', className, id, ...props },
  ref,
) {
  const fieldId = useFieldId(id);
  const describedById = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-fg-muted">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          FIELD_HEIGHT[fieldSize],
          fieldSurface,
          error ? FIELD_TONE.error : FIELD_TONE.normal,
          className,
        )}
        {...props}
      />
      {error ? (
        // Keyed on the message so a new error replays its entrance. Errors enter
        // like content and never shake — motion-spec.md §5.14.
        <p key={error} id={`${fieldId}-error`} className="text-xs text-danger-hover motion-safe:animate-enter">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export { fieldBase };
