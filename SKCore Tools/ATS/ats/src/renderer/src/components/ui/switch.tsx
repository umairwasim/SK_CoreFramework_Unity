import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40 data-[state=checked]:bg-accent data-[state=unchecked]:bg-zinc-700',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow ring-0 transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-0.5" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
