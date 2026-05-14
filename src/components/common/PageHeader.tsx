import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PageHeaderBackAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type PageHeaderVariant = 'dashboard' | 'workspace' | 'plain';

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  backAction?: PageHeaderBackAction;
  children?: ReactNode;
  className?: string;
  variant?: PageHeaderVariant;
};

function BackActionButton({ action }: { action: PageHeaderBackAction }) {
  const content = (
    <>
      <ArrowLeft size={15} />
      <span>{action.label}</span>
    </>
  );

  if (action.href) {
    return (
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to={action.href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={action.onClick} className="w-fit">
      {content}
    </Button>
  );
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  backAction,
  children,
  className,
  variant = 'workspace',
}: PageHeaderProps) {
  const isDashboard = variant === 'dashboard';
  const isPlain = variant === 'plain';

  return (
    <section className={cn('space-y-3', className)}>
      {backAction ? <BackActionButton action={backAction} /> : null}

      <div
        className={cn(
          'relative overflow-hidden border border-border bg-card shadow-soft',
          isDashboard ? 'rounded-3xl px-5 py-5 sm:px-6 sm:py-6' : 'rounded-2xl px-4 py-4 sm:px-5',
          isPlain && 'border-transparent bg-transparent p-0 shadow-none'
        )}
      >
        {isDashboard ? (
          <div className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-45">
            <div className="absolute -left-24 -top-24 h-52 w-52 rounded-full bg-primary-soft blur-3xl" />
            <div className="absolute -right-20 top-0 h-48 w-48 rounded-full bg-secondary-soft blur-3xl" />
          </div>
        ) : null}

        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3">
            {eyebrow ? (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-muted bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                {eyebrow}
              </div>
            ) : null}

            <div className="flex min-w-0 items-start gap-3">
              {icon ? (
                <div
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary',
                    isDashboard ? 'h-12 w-12' : 'h-10 w-10'
                  )}
                >
                  {icon}
                </div>
              ) : null}

              <div className="min-w-0">
                <h1
                  className={cn(
                    'text-balance font-bold tracking-tight text-foreground',
                    isDashboard ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'
                  )}
                >
                  {title}
                </h1>

                {description ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
              {actions}
            </div>
          ) : null}
        </div>

        {children ? (
          <div className="relative mt-4 rounded-2xl border border-border bg-surface-soft/70 p-3 shadow-inner-soft">
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}
