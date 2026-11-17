import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-medium leading-4 tracking-wide', {
  variants: {
    variant: {
      default: 'bg-zinc-800 text-zinc-300',
      accent: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30',
      green: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30',
      amber: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30',
      red: 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30',
      violet: 'bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30',
      outline: 'ring-1 ring-inset ring-zinc-700 text-zinc-400',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
