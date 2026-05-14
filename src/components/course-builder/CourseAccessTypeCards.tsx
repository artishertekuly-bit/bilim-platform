import {
  CheckCircle2,
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
  dotClassName: string;
};

type AccessCopy = {
  label: string;
  badge: string;
};

function getAccessVisual(type: CourseAccessType): AccessVisual {
  const normalized = String(type || '');

  if (normalized === 'paid' || normalized === 'subscription_only') {
    return {
      icon: Tag,
      iconClassName: 'border-accent-muted bg-accent-soft text-accent-foreground',
      activeClassName: 'border-accent-muted bg-accent-soft/80 ring-2 ring-accent/15',
      inactiveClassName:
        'border-border bg-card hover:border-accent-muted hover:bg-accent-soft/45',
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
      activeClassName: 'border-primary-muted bg-primary-soft/80 ring-2 ring-primary/15',
      inactiveClassName:
        'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/45',
      dotClassName: 'border-primary bg-primary',
    };
  }

  if (normalized === 'public_free' || normalized === 'open' || normalized === 'free') {
    return {
      icon: Globe2,
      iconClassName: 'border-success-muted bg-success-soft text-success-foreground',
      activeClassName: 'border-success-muted bg-success-soft/80 ring-2 ring-success/15',
      inactiveClassName:
        'border-border bg-card hover:border-success-muted hover:bg-success-soft/45',
      dotClassName: 'border-success bg-success',
    };
  }

  return {
    icon: KeyRound,
    iconClassName: 'border-border bg-muted text-muted-foreground',
    activeClassName: 'border-primary-muted bg-primary-soft/80 ring-2 ring-primary/15',
    inactiveClassName:
      'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/45',
    dotClassName: 'border-primary bg-primary',
  };
}

function getAccessCopy(type: CourseAccessType): AccessCopy {
  const normalized = String(type || '');

  if (normalized === 'paid') {
    return {
      label: 'Ақылы курс',
      badge: 'Төлем',
    };
  }

  if (normalized === 'subscription_only') {
    return {
      label: 'Жазылым',
      badge: 'Жазылым',
    };
  }

  if (normalized === 'private_invite' || normalized === 'invite_only') {
    return {
      label: 'Шақыру арқылы',
      badge: 'Код',
    };
  }

  if (normalized === 'school_only') {
    return {
      label: 'Мектеп ішінде',
      badge: 'Ұйым',
    };
  }

  if (normalized === 'closed') {
    return {
      label: 'Жабық курс',
      badge: 'Жабық',
    };
  }

  if (normalized === 'public_free' || normalized === 'open' || normalized === 'free') {
    return {
      label: 'Тегін ашық',
      badge: 'Ашық',
    };
  }

  return {
    label: getAccessTypeLabel(type),
    badge: 'Арнайы',
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
      aria-label="Курсқа кіру түрін таңдау"
    >
      {courseAccessTypes.map((type) => {
        const active = value === type;
        const visual = getAccessVisual(type);
        const copy = getAccessCopy(type);
        const Icon = visual.icon;

        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            aria-pressed={active}
            role="radio"
            aria-checked={active}
            aria-label={copy.label}
            className={`rounded-3xl border p-4 text-left transition-all duration-200 ease-soft active:scale-[0.99] ${
              active ? visual.activeClassName : visual.inactiveClassName
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-all duration-200 ease-soft ${visual.iconClassName}`}
                >
                  <Icon size={17} />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {copy.label}
                  </p>

                  <span className="mt-1 inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {copy.badge}
                  </span>
                </div>
              </div>

              <span
                className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-soft ${
                  active ? visual.dotClassName : 'border-muted-foreground/30 bg-card'
                }`}
              >
                {active ? (
                  <CheckCircle2 size={13} className="text-primary-foreground" />
                ) : null}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}