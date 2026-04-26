import { cn } from '@/lib/utils';

type KazakhOrnamentVariant = 'default' | 'corner' | 'divider';

type KazakhOrnamentProps = {
  className?: string;
  variant?: KazakhOrnamentVariant;
};

export default function KazakhOrnament({
  className,
  variant = 'default',
}: KazakhOrnamentProps) {
  if (variant === 'divider') {
    return (
      <div className={cn('flex items-center justify-center py-6 text-foreground/70', className)}>
        <svg
          width="200"
          height="24"
          viewBox="0 0 200 24"
          fill="none"
          aria-hidden="true"
          className="opacity-[0.08] dark:opacity-[0.12]"
        >
          <path
            d="M0 12h60 M140 12h60"
            stroke="currentColor"
            strokeWidth="0.5"
            strokeLinecap="round"
          />
          <path
            d="M70 12 Q80 4 90 12 Q100 20 110 12 Q120 4 130 12"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle
            cx="100"
            cy="12"
            r="3"
            stroke="currentColor"
            strokeWidth="0.8"
            fill="none"
          />
        </svg>
      </div>
    );
  }

  if (variant === 'corner') {
    return (
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        aria-hidden="true"
        className={cn('text-foreground opacity-[0.045] dark:opacity-[0.075]', className)}
      >
        <path
          d="M0 0 Q20 20 40 0 Q60 20 80 0"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M0 0 Q20 20 0 40 Q20 60 0 80"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M10 10 Q25 25 10 40"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle
          cx="20"
          cy="20"
          r="4"
          stroke="currentColor"
          strokeWidth="0.6"
          fill="none"
        />
      </svg>
    );
  }

  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className={cn('text-foreground opacity-[0.035] dark:opacity-[0.065]', className)}
    >
      <path
        d="M60 10 C75 25, 90 25, 105 10 C90 35, 90 50, 105 75 C90 60, 75 60, 60 75 C45 60, 30 60, 15 75 C30 50, 30 35, 15 10 C30 25, 45 25, 60 10Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="60"
        cy="42"
        r="8"
        stroke="currentColor"
        strokeWidth="0.8"
        fill="none"
      />
      <path
        d="M48 42 Q60 30 72 42 Q60 54 48 42Z"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}