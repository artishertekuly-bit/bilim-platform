import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function BackActionButton({ action }: { action: PageHeaderBackAction }) {
  const content = (
    <>
      <ArrowLeft size={15} />
      <span>{action.label}</span>
    </>
  );

  const className =
    '-ml-2 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

  if (action.href) {
    return (
      <Link to={action.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
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
    <section className={cx('space-y-4', className)}>
      {backAction ? <BackActionButton action={backAction} /> : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              {eyebrow}
            </div>
          ) : null}

          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-primary shadow-sm">
                {icon}
              </div>
            ) : null}

            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                {title}
              </h1>

              {description ? (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>

      {children ? <div>{children}</div> : null}
    </section>
  );
}