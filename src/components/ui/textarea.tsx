import * as React from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          [
            'flex min-h-[96px] w-full resize-y rounded-2xl border border-input bg-card px-4 py-3',
            'text-sm leading-6 text-foreground shadow-inner-soft transition-all duration-200 ease-soft',
            'placeholder:text-muted-foreground',
            'hover:border-primary-muted',
            'focus-visible:border-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70',
          ].join(' '),
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };