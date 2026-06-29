import React from 'react';
import { cn } from '@/lib/utils';
import { fieldBase } from './Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

let idCounter = 0;
function useFieldId(provided?: string) {
  const [generated] = React.useState(() => `gx-select-${++idCounter}`);
  return provided ?? generated;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className, id, children, ...props },
  ref,
) {
  const fieldId = useFieldId(id);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-fg-muted">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(fieldBase, 'pr-8 cursor-pointer', error && 'border-danger focus:ring-danger', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-danger-hover">{error}</p>}
    </div>
  );
});
