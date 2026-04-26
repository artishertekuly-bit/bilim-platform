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
  getAccessTypeHint,
  getAccessTypeLabel,
} from '@/lib/course-creator/course-builder-utils';

type AccessVisual = {
  icon: LucideIcon;
  iconClassName: string;
  activeClassName: string;
  inactiveClassName: string;
  dotClassName: string;
};

function getAccessVisual(type: CourseAccessType): AccessVisual {
  const normalized = String(type || '');

  if (normalized === 'paid' || normalized === 'subscription_only') {
    return {
      icon: Tag,
      iconClassName: 'border-accent-muted bg-accent-soft text-accent-foreground',
      activeClassName: 'border-accent-muted bg-accent-soft/80 shadow-soft-md',
      inactiveClassName:
        'border-border bg-card hover:border-accent-muted hover:bg-accent-soft/70',
      dotClassName: 'border-accent bg-accent',
    };
  }

  if (
    normalized === 'private_invite' ||
    normalized === 'school_only' ||
    normalized === 'closed' ||
    normalized === 'invite_only'
  ) {
    return {
      icon: Lock,
      iconClassName: 'border-primary-muted bg-primary-soft text-primary',
      activeClassName: 'border-primary-muted bg-primary-soft/80 shadow-soft-md',
      inactiveClassName:
        'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/70',
      dotClassName: 'border-primary bg-primary',
    };
  }

  if (normalized === 'public_free' || normalized === 'open' || normalized === 'free') {
    return {
      icon: Globe2,
      iconClassName: 'border-success-muted bg-success-soft text-success-foreground',
      activeClassName: 'border-success-muted bg-success-soft/80 shadow-soft-md',
      inactiveClassName:
        'border-border bg-card hover:border-success-muted hover:bg-success-soft/70',
      dotClassName: 'border-success bg-success',
    };
  }

  return {
    icon: KeyRound,
    iconClassName: 'border-border bg-muted text-muted-foreground',
    activeClassName: 'border-primary-muted bg-primary-soft/80 shadow-soft-md',
    inactiveClassName:
      'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/70',
    dotClassName: 'border-primary bg-primary',
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
    <div className="grid gap-3 md:grid-cols-3">
      {courseAccessTypes.map((type) => {
        const active = value === type;
        const visual = getAccessVisual(type);
        const Icon = visual.icon;

        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            aria-pressed={active}
            className={`group rounded-3xl border p-4 text-left transition-all duration-200 ease-soft active:translate-y-0 active:scale-[0.99] ${
              active
                ? visual.activeClassName
                : `${visual.inactiveClassName} hover:-translate-y-0.5 hover:shadow-soft-md`
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft transition-all duration-200 ease-soft ${visual.iconClassName}`}
                  >
                    <Icon size={16} />
                  </span>

                  <p className="text-sm font-semibold text-foreground">
                    {getAccessTypeLabel(type)}
                  </p>
                </div>

                <p className="text-xs leading-5 text-muted-foreground">
                  {getAccessTypeHint(type)}
                </p>
              </div>

              <span
                className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-soft ${
                  active ? visual.dotClassName : 'border-muted-foreground/30 bg-card'
                }`}
              >
                {active ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                ) : null}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}