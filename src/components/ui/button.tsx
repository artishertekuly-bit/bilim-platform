import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-2xl text-sm font-medium',
    'transition-colors duration-200 ease-soft',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60',
    'active:scale-[0.99]',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',

        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',

        outline:
          'border border-border bg-card text-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary',

        secondary:
          'bg-secondary-soft text-secondary-foreground hover:bg-secondary-muted',

        ghost:
          'text-muted-foreground hover:bg-primary-soft hover:text-primary',

        link:
          'h-auto rounded-none px-0 py-0 text-primary underline-offset-4 hover:text-primary hover:underline active:scale-100',

        success:
          'bg-success-soft text-success-foreground hover:bg-success-muted',

        warning:
          'bg-warning-soft text-warning-foreground hover:bg-warning-muted',

        ai:
          'border border-ai-border bg-ai-soft text-ai-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary',
      },

      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-xl px-3 text-xs',
        lg: 'h-11 rounded-2xl px-6',
        xl: 'h-12 rounded-2xl px-7 text-base',
        icon: 'h-10 w-10 rounded-2xl',
        'icon-sm': 'h-9 w-9 rounded-xl',
      },
    },

    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...(!asChild ? { type: type || 'button' } : {})}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };