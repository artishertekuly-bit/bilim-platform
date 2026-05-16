import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type PageHeaderBackAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  backAction?: PageHeaderBackAction;
  children?: ReactNode;
  className?: string;
};

const MAX_BACK_LABEL_CHARS = 80;
const MAX_HREF_CHARS = 500;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_BACK_LABEL_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeInternalHref(value: unknown): string | null {
  const href = cleanText(value, MAX_HREF_CHARS);

  if (!href) return null;
  if (!href.startsWith('/')) return null;
  if (href.startsWith('//')) return null;

  return href;
}

function BackActionButton({ action }: { action: PageHeaderBackAction }) {
  const label = cleanText(action.label) || 'Артқа';
  const href = normalizeInternalHref(action.href);

  const content = (
    <>
      <ArrowLeft size={15} />
      <span>{label}</span>
    </>
  );

  const className =
    '-ml-2 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  if (href) {
    return (
      <Link to={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      className={className}
      disabled={!action.onClick}
    >
      {content}
    </button>
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
}: PageHeaderProps) {
  return (
    <section className={cn('space-y-4', className)}>
      {backAction ? <BackActionButton action={backAction} /> : null}

      <div className="rounded-3xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3">
            {eyebrow ? (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/45 px-3 py-1 text-xs font-semibold text-muted-foreground">
                {eyebrow}
              </div>
            ) : null}

            <div className="flex min-w-0 items-start gap-3">
              {icon ? (
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                  {icon}
                </div>
              ) : null}

              <div className="min-w-0">
                <h1 className="text-balance text-xl font-bold tracking-tight text-foreground md:text-2xl">
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
          <div className="mt-4 rounded-3xl border border-border bg-muted/25 p-3">
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}