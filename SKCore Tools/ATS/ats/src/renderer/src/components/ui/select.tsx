import * as React from 'react';
import { cn } from '@/lib/utils';

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

/** Native <select> styled like shadcn – keyboard-friendly and zero-JS popovers (good for dense inspectors). */
export function Select<T extends string | number>({
  value, onChange, options, className, disabled,
}: { value: T; onChange: (v: T) => void; options: Option<T>[]; className?: string; disabled?: boolean }) {
  return (
    <div className={cn('relative', className)}>
      <select
        disabled={disabled}
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
        className="h-7 w-full appearance-none rounded-md border border-border bg-zinc-900/80 pl-2 pr-7 text-[12px] text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-40"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-zinc-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 4.5 6 7.5 9 4.5" />
      </svg>
    </div>
  );
}

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn('text-[12px] text-zinc-400', className)} {...p} />;
