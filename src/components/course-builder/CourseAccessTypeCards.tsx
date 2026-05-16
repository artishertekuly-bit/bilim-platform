import {
  Globe2,
  KeyRound,
  Lock,
  Tag,
  type LucideIcon,
} from 'lucide-react';

import type { CourseAccessType } from '@/lib/app-data-types';
import {
  courseAccessTypes,
  getAccessTypeLabel,
} from '@/lib/course-creator/course-builder-utils';

type AccessVisual = {
  icon: LucideIcon;
  iconClassName: string;
  activeClassName: string;
  inactiveClassName: string;
  radioClassName: string;
};

function normalizeAccessType(value: CourseAccessType | string | null | undefined) {
  if (value === 'open' || value === 'free') return 'public_free';
  if (value === 'closed' || value === 'invite_only') return 'private_invite';

  return String(value || 'public_free');
}

function getAccessVisual(type: CourseAccessType): AccessVisual {
  const normalized = normalizeAccessType(type);

  if (normalized === 'paid' || normalized === 'subscription_only') {
    return {
      icon: Tag,
      iconClassName:
        'border-warning-muted bg-warning-soft text-warning-foreground',
      activeClassName: 'border-warning-muted bg-warning-soft/70',
      inactiveClassName:
        'border-border bg-card hover:border-warning-muted hover:bg-warning-soft/40',
      radioClassName: 'border-warning bg-warning',
    };
  }

  if (normalized === 'private_invite' || normalized === 'school_only') {
    return {
      icon: Lock,
      iconClassName: 'border-primary-muted bg-primary-soft text-primary',
      activeClassName: 'border-primary-muted bg-primary-soft/70',
      inactiveClassName:
        'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/40',
      radioClassName: 'border-primary bg-primary',
    };
  }

  if (normalized === 'public_free') {
    return {
      icon: Globe2,
      iconClassName:
        'border-success-muted bg-success-soft text-success-foreground',
      activeClassName: 'border-success-muted bg-success-soft/70',
      inactiveClassName:
        'border-border bg-card hover:border-success-muted hover:bg-success-soft/40',
      radioClassName: 'border-success bg-success',
    };
  }

  return {
    icon: KeyRound,
    iconClassName: 'border-border bg-muted text-muted-foreground',
    activeClassName: 'border-primary-muted bg-primary-soft/70',
    inactiveClassName:
      'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/40',
    radioClassName: 'border-primary bg-primary',
  };
}

export function CourseAccessTypeCards({
  value,
  onChange,
}: {
  value: CourseAccessType;
  onChange: (nextAccessType: CourseAccessType) => void;
}) {
  return (
    <div
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      role="radiogroup"
      aria-label="Курсқа кіру түрі"
    >
      {courseAccessTypes.map((type) => {
        const active = value === type;
        const visual = getAccessVisual(type);
        const Icon = visual.icon;
        const label = getAccessTypeLabel(type);

        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => onChange(type)}
            className={`rounded-3xl border p-4 text-left transition-colors active:scale-[0.99] ${
              active ? visual.activeClassName : visual.inactiveClassName
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${visual.iconClassName}`}
                >
                  <Icon size={17} />
                </span>

                <span className="truncate text-sm font-semibold text-foreground">
                  {label}
                </span>
              </div>

              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  active
                    ? visual.radioClassName
                    : 'border-muted-foreground/30 bg-card'
                }`}
              >
                {active ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-card" />
                ) : null}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}