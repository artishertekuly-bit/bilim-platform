import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  [
    'inline-flex w-fit items-center gap-1.5 rounded-full border',
    'px-2.5 py-1 text-xs font-semibold leading-none',
    'focus:outline-none focus:ring-2 focus:ring-ring/35 focus:ring-offset-2 focus:ring-offset-background',
    '[&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'border-primary-muted bg-primary-soft text-primary',

        secondary:
          'border-secondary-muted bg-secondary-soft text-secondary-foreground',

        destructive:
          'border-destructive-muted bg-destructive-soft text-destructive',

        outline: 'border-border bg-card text-foreground',

        muted: 'border-border bg-muted text-muted-foreground',

        success:
          'border-success-muted bg-success-soft text-success-foreground',

        warning:
          'border-warning-muted bg-warning-soft text-warning-foreground',

        ai: 'border-ai-border bg-ai-soft text-ai-foreground',
      },
    },

    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };