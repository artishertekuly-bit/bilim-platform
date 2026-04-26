import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      [
        'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-3 p-4',
        'sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col',
        'md:max-w-[420px]',
      ].join(' '),
      className
    )}
    {...props}
  />
));

ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  [
    'group pointer-events-auto relative flex w-full items-start justify-between gap-4 overflow-hidden',
    'rounded-3xl border p-4 pr-10 shadow-soft-lg backdrop-blur-xl',
    'transition-all duration-200 ease-soft',
    'data-[swipe=cancel]:translate-x-0',
    'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
    'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
    'data-[swipe=move]:transition-none',
    'data-[state=open]:animate-in',
    'data-[state=closed]:animate-out',
    'data-[swipe=end]:animate-out',
    'data-[state=closed]:fade-out-80',
    'data-[state=closed]:slide-out-to-right-full',
    'data-[state=open]:slide-in-from-top-full',
    'data-[state=open]:sm:slide-in-from-bottom-full',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'border-border bg-card/95 text-foreground',
          'supports-[backdrop-filter]:bg-card/85',
        ].join(' '),

        destructive: [
          'destructive border-destructive-muted bg-destructive-soft/95 text-destructive',
          'supports-[backdrop-filter]:bg-destructive-soft/85',
        ].join(' '),

        success: [
          'border-success-muted bg-success-soft/95 text-success-foreground',
          'supports-[backdrop-filter]:bg-success-soft/85',
        ].join(' '),

        warning: [
          'border-warning-muted bg-warning-soft/95 text-warning-foreground',
          'supports-[backdrop-filter]:bg-warning-soft/85',
        ].join(' '),

        ai: [
          'border-ai-border bg-ai-soft/95 text-ai-foreground',
          'supports-[backdrop-filter]:bg-ai-soft/85',
        ].join(' '),
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});

Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      [
        'inline-flex h-9 shrink-0 items-center justify-center rounded-2xl border border-border',
        'bg-card px-3 text-xs font-semibold text-foreground shadow-soft',
        'transition-all duration-200 ease-soft',
        'hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft hover:text-primary hover:shadow-soft-md',
        'active:translate-y-0 active:scale-[0.99]',
        'focus:outline-none focus:ring-2 focus:ring-ring/35 focus:ring-offset-2 focus:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        'group-[.destructive]:border-destructive-muted group-[.destructive]:bg-card group-[.destructive]:text-destructive',
        'group-[.destructive]:hover:bg-destructive-soft',
      ].join(' '),
      className
    )}
    {...props}
  />
));

ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      [
        'absolute right-3 top-3 rounded-2xl p-1.5 text-muted-foreground opacity-0',
        'transition-all duration-200 ease-soft',
        'hover:-translate-y-0.5 hover:bg-primary-soft hover:text-primary',
        'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/35 focus:ring-offset-2 focus:ring-offset-background',
        'group-hover:opacity-100',
        'group-[.destructive]:text-destructive/80',
        'group-[.destructive]:hover:bg-destructive-soft group-[.destructive]:hover:text-destructive',
      ].join(' '),
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));

ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('text-sm font-semibold leading-5 text-foreground', className)}
    {...props}
  />
));

ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('mt-1 text-xs leading-5 text-muted-foreground', className)}
    {...props}
  />
));

ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};