import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const labelVariants = cva(
  [
    'font-medium leading-none',
    'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  ].join(' '),
  {
    variants: {
      tone: {
        default: 'text-foreground',
        muted: 'text-muted-foreground',
        primary: 'text-primary',
        danger: 'text-destructive',
      },
      size: {
        default: 'text-sm',
        sm: 'text-xs',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      tone: 'default',
      size: 'default',
    },
  }
);

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, tone, size, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ tone, size }), className)}
    {...props}
  />
));

Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants };