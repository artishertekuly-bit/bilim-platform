// Bilim UI батырма стилдері (компонент емес файлда: react-refresh ережесі үшін).
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
export type ButtonSize = 'lg' | 'md' | 'sm';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'lg', full = true) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold no-underline transition-colors',
    'disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bl-ink',
    size === 'lg' && 'h-[52px] px-5 text-base',
    size === 'md' && 'h-12 px-4 text-[15px]',
    size === 'sm' && 'h-11 rounded-xl px-4 text-sm',
    full && 'w-full',
    variant === 'primary' && 'border-0 bg-bl-btn text-white hover:bg-black disabled:bg-bl-handle disabled:text-bl-ink3',
    variant === 'secondary' && 'border border-bl-field bg-white text-bl-ink hover:border-bl-ink3 disabled:text-bl-mute',
    variant === 'ghost' && 'border-0 bg-transparent text-bl-ink hover:bg-bl-soft disabled:text-bl-mute',
    variant === 'danger' && 'border border-bl-field bg-white text-bl-danger hover:border-bl-danger disabled:opacity-60',
    variant === 'light' && 'border-0 bg-white text-bl-ink hover:bg-bl-soft disabled:opacity-60',
  );
}

export function initialsOf(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}
