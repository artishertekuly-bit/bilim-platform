import type { CourseAccessType } from '@/lib/app-data-types';
import {
  courseAccessTypes,
  getAccessTypeHint,
  getAccessTypeLabel,
} from '@/lib/course-creator/course-builder-utils';

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

        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`rounded-xl border p-4 text-left transition-all ${
              active
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:bg-accent'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{getAccessTypeLabel(type)}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {getAccessTypeHint(type)}
                </p>
              </div>

              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
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
