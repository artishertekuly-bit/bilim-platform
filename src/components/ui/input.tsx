import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          [
            'flex h-11 w-full rounded-2xl border border-input bg-card px-4 py-2',
            'text-base text-foreground shadow-inner-soft transition-all duration-200 ease-soft',
            'placeholder:text-muted-foreground',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
            'hover:border-primary-muted',
            'focus-visible:border-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70',
            'read-only:bg-muted/60 read-only:text-muted-foreground',
            'md:text-sm',
          ].join(' '),
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };