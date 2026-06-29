import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Hint text shown under the field when there is no error. */
  hint?: string;
}

const fieldBase =
  'w-full h-10 px-3 rounded-lg bg-surface-muted text-fg placeholder:text-fg-subtle ' +
  'border border-border transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent ' +
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
        className={cn(fieldBase, error && 'border-danger focus:ring-danger', className)}
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="text-xs text-danger-hover">
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
