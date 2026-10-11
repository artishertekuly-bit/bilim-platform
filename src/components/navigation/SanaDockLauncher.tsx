import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_TITLE_CHARS = 100;
const MAX_DESCRIPTION_CHARS = 240;
const MAX_BADGE_CHARS = 60;
const MAX_PATH_CHARS = 2_000;

export type SanaLauncherTool = {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  featured?: boolean;
};

export type SanaDockLauncherProps = {
  open: boolean;
  eyebrow?: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  tools: SanaLauncherTool[];
  emptyTitle?: string;
  emptyText?: string;
  onOpenChange: (open: boolean) => void;
};

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit: number): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanPath(value: unknown): string {
  const path = cleanText(value, MAX_PATH_CHARS);

  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return '/dashboard';
  }

  return path;
}

export default function SanaDockLauncher({
  open,
  eyebrow,
  title,
  description,
  icon: HeaderIcon,
  tools,
  emptyTitle = 'Қолжетімді бөлім жоқ',
  emptyText = 'Бұл аккаунт үшін бөлімдер кейін қосылады.',
  onOpenChange,
}: SanaDockLauncherProps) {
  const navigate = useNavigate();
  const titleId = useId();
  const descriptionId = useId();
  const firstToolRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      firstToolRef.current?.focus();
    }, 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;

      window.setTimeout(() => {
        returnFocusRef.current?.focus();
      }, 0);
    };
  }, [onOpenChange, open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const selectTool = (tool: SanaLauncherTool) => {
    onOpenChange(false);
    navigate(cleanPath(tool.path));
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onOpenChange(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 backdrop-blur-md sm:items-center sm:p-6"
      onMouseDown={closeFromBackdrop}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative max-h-[92dvh] w-full overflow-y-auto bg-background',
          'rounded-t-3xl p-4 shadow-2xl',
          'animate-slide-up sm:max-w-4xl sm:rounded-3xl sm:p-7 sm:animate-scale-in',
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-44 rounded-t-[inherit] bg-gradient-to-b from-muted/60 to-transparent"
        />

        <div className="relative">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-foreground/15 sm:hidden" />

          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-xs">
              <HeaderIcon size={20} strokeWidth={2.2} />
            </div>

            <div className="min-w-0 flex-1">
              {eyebrow ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {cleanText(eyebrow, MAX_BADGE_CHARS)}
                </p>
              ) : null}

              <h2
                id={titleId}
                className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl"
              >
                {cleanText(title, MAX_TITLE_CHARS)}
              </h2>

              {description ? (
                <p
                  id={descriptionId}
                  className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground"
                >
                  {cleanText(description, MAX_DESCRIPTION_CHARS)}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Жабу"
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/50',
                'text-muted-foreground shadow-xs transition-all duration-200',
                'hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              )}
            >
              <X size={17} />
            </button>
          </div>

          {tools.length > 0 ? (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {tools.map((tool, index) => {
                const Icon = tool.icon;
                const toolTitle = cleanText(tool.title, MAX_TITLE_CHARS);
                const toolDescription = cleanText(
                  tool.description,
                  MAX_DESCRIPTION_CHARS,
                );
                const badge = cleanText(tool.badge, MAX_BADGE_CHARS);

                return (
                  <button
                    key={tool.id}
                    ref={index === 0 ? firstToolRef : undefined}
                    type="button"
                    onClick={() => selectTool(tool)}
                    className={cn(
                      'group relative min-h-36 overflow-hidden rounded-2xl p-4 text-left shadow-xs',
                      'transition-all duration-200',
                      'hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                      tool.featured
                        ? 'bg-foreground text-background'
                        : 'bg-muted/40 text-foreground hover:bg-muted/65',
                    )}
                  >
                    <div className="relative flex h-full flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-2xl',
                            tool.featured
                              ? 'bg-background/15 text-background'
                              : 'bg-card text-foreground shadow-xs',
                          )}
                        >
                          <Icon size={18} />
                        </span>

                        {badge ? (
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-[10px] font-medium',
                              tool.featured
                                ? 'bg-background/15 text-background/80'
                                : 'bg-card text-muted-foreground shadow-xs',
                            )}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex-1">
                        <h3
                          className={cn(
                            'text-base font-bold tracking-tight',
                            tool.featured
                              ? 'text-background'
                              : 'text-foreground',
                          )}
                        >
                          {toolTitle}
                        </h3>

                        <p
                          className={cn(
                            'mt-1 text-xs leading-5',
                            tool.featured
                              ? 'text-background/70'
                              : 'text-muted-foreground',
                          )}
                        >
                          {toolDescription}
                        </p>
                      </div>

                      <div
                        className={cn(
                          'mt-5 flex items-center gap-2 text-xs font-semibold',
                          tool.featured
                            ? 'text-background'
                            : 'text-foreground',
                        )}
                      >
                        Ашу
                        <ArrowRight
                          size={14}
                          className="transition-transform duration-200 group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-7 rounded-[1.75rem] border border-dashed border-border bg-muted/35 p-8 text-center">
              <p className="text-sm font-semibold text-foreground">
                {cleanText(emptyTitle, MAX_TITLE_CHARS)}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {cleanText(emptyText, MAX_DESCRIPTION_CHARS)}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
