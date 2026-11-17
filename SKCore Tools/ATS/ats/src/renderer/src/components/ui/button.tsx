import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0 cursor-default',
  {
    variants: {
      variant: {
        default: 'bg-accent text-zinc-950 hover:bg-sky-300 shadow-sm shadow-sky-500/20',
        secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700/60',
        outline: 'border border-border bg-transparent hover:bg-zinc-800/70 text-zinc-200',
        ghost: 'hover:bg-zinc-800/70 text-zinc-300',
        destructive: 'bg-rose-600/90 text-white hover:bg-rose-500',
        warning: 'bg-amber-500 text-zinc-950 hover:bg-amber-400',
      },
      size: { default: 'h-8 px-3', sm: 'h-7 px-2.5 text-xs', xs: 'h-6 px-2 text-[11px]', lg: 'h-10 px-5 text-sm', icon: 'h-7 w-7' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
