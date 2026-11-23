// Bilim UI жинағы: «Bilim — телефон прототипі» канвасындағы өлшемдер мен түстер.
// Фон #F6F5F2, карта ақ + #E2E0DB жиек (16px), негізгі батырма #121212 (52px, 14px),
// өріс #CFCBC3 жиек (52px, 14px), сегмент #ECE9E3 жолақ + ақ таңдау.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import { AlertIcon, BackIcon, CheckIcon, ChevronIcon, CloseIcon } from '@/components/bl/icons';
import { buttonClass, type ButtonSize, type ButtonVariant } from '@/components/bl/styles';
import { cn } from '@/lib/utils';

/* ───────── Экран қаңқасы ───────── */

/** Қабықсыз экран (кіру, сессия): телефон бағаны, ноутбукта ортада. */
export function BareScreen({
  children,
  footer,
  header,
  dark,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-h-[100dvh] font-sans', dark ? 'bg-bl-ink text-white' : 'bg-bl-bg text-bl-ink')}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">
        {header}
        <main className={cn('flex flex-1 flex-col', className)}>{children}</main>
        {footer ? (
          <div
            className={cn(
              'sticky bottom-0 flex flex-col gap-1.5 border-t px-5 pb-6 pt-3',
              dark ? 'border-white/10 bg-bl-ink' : 'border-bl-line bg-bl-bg',
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Қабық ішіндегі бет мазмұны: телефонда 16px шет, ноутбукта ортада. */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-[18px] px-4 pb-6 pt-5 lg:px-10 lg:pt-8',
        wide ? 'lg:max-w-[1120px]' : 'max-w-[480px] lg:max-w-[960px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TopBar({
  back,
  backLabel = 'Артқа',
  onBack,
  title,
  right,
  dark,
}: {
  back?: string;
  backLabel?: string;
  onBack?: () => void;
  title?: ReactNode;
  right?: ReactNode;
  dark?: boolean;
}) {
  const iconCls = cn(
    'flex h-11 w-11 flex-none items-center justify-center rounded-xl no-underline',
    dark ? 'text-white hover:bg-white/10' : 'text-bl-ink hover:bg-bl-soft',
  );
  return (
    <header className="flex min-h-[62px] items-center gap-2 pb-1.5 pl-1 pr-4 pt-3">
      {back ? (
        <Link to={back} aria-label={backLabel} className={iconCls}>
          <BackIcon />
        </Link>
      ) : onBack ? (
        <button type="button" onClick={onBack} aria-label={backLabel} className={iconCls}>
          <BackIcon />
        </button>
      ) : (
        <span className="w-3" />
      )}
      <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
      {right}
    </header>
  );
}

export function CloseLink({ to, label = 'Жабу' }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-bl-ink no-underline hover:bg-bl-soft"
    >
      <CloseIcon />
    </Link>
  );
}

export function PageTitle({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">{title}</h1>
        {subtitle ? <div className="m-0 text-[15px] text-bl-ink2">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function SectionLabel({ children, as: Tag = 'h2' }: { children: ReactNode; as?: 'h2' | 'h3' | 'span' }) {
  return <Tag className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-bl-ink2">{children}</Tag>;
}

export function Section({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      {children}
    </section>
  );
}

export function Card({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <Tag className={cn('rounded-2xl border border-bl-line bg-white', className)}>{children}</Tag>;
}

/* ───────── Батырмалар ───────── */

type Variant = ButtonVariant;
type Size = ButtonSize;

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; full?: boolean; loading?: boolean }
>(function Button({ variant = 'primary', size = 'lg', full = true, loading, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass(variant, size, full), className)}
      {...rest}
    >
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'primary',
  size = 'lg',
  full = true,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; full?: boolean }) {
  return <Link className={cn(buttonClass(variant, size, full), className)} {...rest} />;
}

export function TextLink({ className, ...rest }: LinkProps) {
  return (
    <Link
      className={cn('inline-flex min-h-11 items-center text-sm font-semibold text-bl-ink underline-offset-2 hover:underline', className)}
      {...rest}
    />
  );
}

/* ───────── Өрістер ───────── */

const fieldCls =
  'box-border h-[52px] w-full rounded-[14px] border border-bl-field bg-white px-3.5 text-base text-bl-ink placeholder:text-bl-mute focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink disabled:bg-bl-soft disabled:text-bl-ink3 aria-[invalid=true]:border-bl-danger';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${htmlFor}-error`} className="text-[13px] font-medium text-bl-danger">
          {error}
        </span>
      ) : hint ? (
        <span id={`${htmlFor}-hint`} className="text-[13px] text-bl-ink2">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(fieldCls, className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldCls, 'h-auto min-h-[120px] resize-y py-3 leading-normal', className)} {...rest} />;
});

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function PasswordInput({ className, ...rest }, ref) {
    const [shown, setShown] = useState(false);
    return (
      <div className="flex gap-2">
        <input ref={ref} type={shown ? 'text' : 'password'} className={cn(fieldCls, 'min-w-0 flex-1', className)} {...rest} />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-label={shown ? 'Құпиясөзді жасыру' : 'Құпиясөзді көрсету'}
          className="h-[52px] flex-none rounded-[14px] border border-bl-field bg-white px-3.5 text-sm font-semibold text-bl-ink"
        >
          {shown ? 'Жасыру' : 'Көрсету'}
        </button>
      </div>
    );
  },
);

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldCls, 'appearance-auto pr-3 text-[15px] font-medium', className)} {...rest} />;
}

export function OrDivider({ children = 'немесе' }: { children?: ReactNode }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 text-[13px] text-bl-ink2">
      <span className="h-px flex-1 bg-bl-line" />
      {children}
      <span className="h-px flex-1 bg-bl-line" />
    </div>
  );
}

/* ───────── Таңдау элементтері ───────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { id: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  size?: 'md' | 'sm';
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-1 rounded-[14px] bg-bl-soft p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => onChange(o.id)}
            className={cn(
              'rounded-[10px] font-semibold',
              size === 'md' ? 'h-11 text-sm' : 'h-10 text-[13px]',
              on ? 'bg-white text-bl-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'bg-transparent text-bl-ink3 disabled:text-bl-mute',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChipButton({
  on,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'h-9 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold',
        on ? 'border-0 bg-bl-ink text-white' : 'border border-bl-field bg-white text-bl-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'muted' | 'warn' | 'dark' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'good' && 'bg-bl-okbg text-bl-oktext',
        tone === 'neutral' && 'bg-bl-soft text-bl-ink3',
        tone === 'muted' && 'bg-[#F1EFEA] text-bl-ink2',
        tone === 'warn' && 'bg-bl-warnbg text-bl-warntext',
        tone === 'dark' && 'bg-bl-ink text-white',
      )}
    >
      {children}
    </span>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-bl-ink px-1.5 text-xs font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function RadioCard({
  checked,
  onSelect,
  title,
  subtitle,
  name,
  value,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  name: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3.5',
        checked ? 'border-2 border-bl-ink' : 'border border-bl-line',
        disabled && 'cursor-default opacity-60',
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} disabled={disabled} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full',
          checked ? 'bg-bl-ink' : 'border-2 border-bl-field',
        )}
      >
        {checked ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        {subtitle ? <span className="text-[13px] text-bl-ink2">{subtitle}</span> : null}
      </span>
    </label>
  );
}

export function CheckRow({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2', disabled && !checked && 'cursor-default opacity-50')}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled && !checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md',
          checked ? 'bg-bl-ink text-white' : 'border-2 border-bl-field bg-white',
        )}
      >
        {checked ? <CheckIcon size={14} /> : null}
      </span>
      <span className="min-w-0 flex-1 text-[15px]">{children}</span>
    </label>
  );
}

/* ───────── Хабарламалар ───────── */

export function Banner({
  tone,
  children,
  icon,
  live = 'polite',
}: {
  tone: 'good' | 'bad' | 'warn' | 'info';
  children: ReactNode;
  icon?: boolean;
  live?: 'polite' | 'assertive';
}) {
  return (
    <div
      role={tone === 'bad' || live === 'assertive' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-[14px] px-4 py-3.5 text-sm leading-[1.45]',
        tone === 'good' && 'bg-bl-okbg font-semibold text-bl-oktext',
        tone === 'bad' && 'bg-bl-badbg text-bl-badtext',
        tone === 'warn' && 'bg-bl-warnbg text-bl-warntext',
        tone === 'info' && 'border border-bl-line bg-white text-bl-ink3',
      )}
    >
      {icon ? <AlertIcon size={20} className="mt-px flex-none" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ───────── Тізім ───────── */

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft', className)}>
      {children}
    </div>
  );
}

const rowCls =
  'flex min-h-[52px] w-full items-center justify-between gap-3 bg-transparent px-4 text-left text-[15px] text-bl-ink no-underline hover:bg-[#FBFAF8]';

export function ListRow({
  to,
  onClick,
  children,
  trailing,
  danger,
  chevron = true,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
  trailing?: ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) {
  const inner = (
    <>
      <span className={cn('min-w-0 flex-1', danger && 'font-semibold text-bl-danger')}>{children}</span>
      <span className="flex flex-none items-center gap-1.5 text-sm text-bl-ink2">
        {trailing}
        {chevron ? <ChevronIcon className="text-bl-ink" /> : null}
      </span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={rowCls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(rowCls, 'border-0')}>
      {inner}
    </button>
  );
}

/* ───────── Төменгі парақ (bottom sheet) ───────── */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(17,17,17,0.45)] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3 overflow-y-auto',
            'rounded-t-[20px] bg-white px-4 pb-7 pt-5 font-sans text-bl-ink outline-none',
            'lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:rounded-[20px] lg:pb-6',
          )}
        >
          <span aria-hidden="true" className="h-1 w-10 self-center rounded-full bg-bl-handle lg:hidden" />
          <DialogPrimitive.Title className="m-0 text-xl font-bold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="m-0 text-[15px] leading-normal text-bl-ink3">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : ''}</DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Қайтарылмайтын әрекетті растау парағы. */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Болдырмау',
  onConfirm,
  busy,
  destructive = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      <Button onClick={onClose} disabled={busy}>
        {cancelLabel}
      </Button>
      <Button variant={destructive ? 'danger' : 'secondary'} size="md" onClick={onConfirm} loading={busy}>
        {confirmLabel}
      </Button>
    </Sheet>
  );
}

/* ───────── Күйлер ───────── */

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('block animate-pulse rounded-2xl bg-bl-soft', className)} />;
}

export function LoadingBlock({ label = 'Жүктелуде…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-5 w-2/3 rounded-md" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function StateCard({
  mark,
  markTone = 'soft',
  title,
  text,
  children,
}: {
  mark?: ReactNode;
  markTone?: 'soft' | 'dark' | 'ok';
  title: ReactNode;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-8 text-center">
        {mark !== undefined ? (
          <span
            aria-hidden="true"
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold',
              markTone === 'soft' && 'bg-bl-soft',
              markTone === 'dark' && 'bg-bl-ink text-white',
              markTone === 'ok' && 'bg-bl-okbg text-bl-oktext',
            )}
          >
            {mark}
          </span>
        ) : null}
        <h1 className="m-0 text-[22px] font-bold">{title}</h1>
        {text ? <p className="m-0 text-[15px] leading-normal text-bl-ink3">{text}</p> : null}
      </section>
      {children}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-2xl border border-dashed border-bl-dash px-4 py-5 text-center text-sm text-bl-ink2">{children}</p>;
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Бірдеңе дұрыс болмады. Сәлден кейін қайталап көріңіз.';
  return (
    <Banner tone="bad" icon>
      <span className="flex flex-col items-start gap-2">
        {message}
        {onRetry ? (
          <button type="button" onClick={onRetry} className="min-h-9 border-0 bg-transparent p-0 text-sm font-semibold text-bl-badtext underline">
            Қайталау
          </button>
        ) : null}
      </span>
    </Banner>
  );
}
