import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-8 w-full rounded-md border border-border bg-zinc-900/80 px-2.5 text-[12.5px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/60 disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';
