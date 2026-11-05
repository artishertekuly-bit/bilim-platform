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
    <section className={cn('space-y-3 pb-2', className)}>
      {backAction ? <BackActionButton action={backAction} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}

          <div className="flex min-w-0 items-center gap-3">
            {icon ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                {icon}
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <h1 className="break-words text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                {title}
              </h1>

              {description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>

      {children ? (
        <div className="mt-3 rounded-2xl bg-muted/40 p-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}