import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Hint text shown under the field when there is no error. */
  hint?: string;
}

/**
 * The field surface, shared with `Select`.
 *
 * Focus uses `focus-visible:`, the one focus idiom motion-spec.md §5.3 settles
 * on. On a text field it matches every focus, pointer or keyboard, so nothing is
 * lost against `focus:`. The ring is a box-shadow, which `transition-colors`
 * does not list, so it appears at once — focus is never animated.
 */
const fieldBase =
  'w-full h-10 px-3 rounded-lg bg-surface-muted text-fg placeholder:text-fg-subtle ' +
  'border border-border transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-transparent ' +
  'disabled:opacity-50 disabled:pointer-events-none';

let idCounter = 0;
function useFieldId(provided?: string) {
  const [generated] = React.useState(() => `gx-field-${++idCounter}`);
  return provided ?? generated;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...props },
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
        className={cn(fieldBase, error && 'border-danger focus-visible:ring-danger', className)}
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
