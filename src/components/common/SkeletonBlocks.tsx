import { BookOpen } from 'lucide-react';

type SkeletonProps = {
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function SkeletonBlock({ className }: SkeletonProps) {
  return (
    <div
      className={cx(
        'animate-pulse rounded-md bg-muted',
        className
      )}
    />
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-7 w-40 rounded-full" />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <SkeletonBlock className="h-10 w-10 rounded-xl" />

          <div className="space-y-2">
            <SkeletonBlock className="h-7 w-56" />
            <SkeletonBlock className="h-4 w-80 max-w-full" />
          </div>
        </div>

        <SkeletonBlock className="h-10 w-32" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-10 rounded-xl" />

        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-6 w-12" />
        </div>
      </div>
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function FilterPanelSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SkeletonBlock className="h-10 w-full lg:max-w-md" />
        <SkeletonBlock className="h-9 w-36" />
      </div>

      <div className="mt-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }).map((_, index) => (
          <SkeletonBlock
            key={index}
            className="h-7 w-20 shrink-0 rounded-full"
          />
        ))}
      </div>
    </div>
  );
}

export function CourseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="relative flex h-28 items-center justify-center border-b bg-accent">
        <BookOpen size={28} className="text-muted-foreground/20" />
        <SkeletonBlock className="absolute left-3 top-3 h-6 w-16 rounded-full" />
        <SkeletonBlock className="absolute right-3 top-3 h-8 w-8 rounded-full" />
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-4 w-4/5" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>

        <div className="flex gap-3">
          <SkeletonBlock className="h-3 w-12" />
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="h-3 w-14" />
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-8 rounded-full" />
            <div className="space-y-1">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          </div>
        </div>

        <SkeletonBlock className="h-8 w-full" />
      </div>
    </div>
  );
}

export function CourseGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <CourseCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function SavedLessonCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-6 w-20 rounded-full" />
          <SkeletonBlock className="h-6 w-24 rounded-full" />
        </div>

        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-2/3" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </div>

        <div className="flex justify-end gap-2">
          <SkeletonBlock className="h-9 w-32" />
          <SkeletonBlock className="h-9 w-28" />
        </div>
      </div>
    </div>
  );
}

export function SavedLessonsListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <SavedLessonCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function TimelineLessonSkeleton({ isLast = false }: { isLast?: boolean }) {
  return (
    <div className="relative flex gap-4">
      {!isLast ? (
        <div className="absolute left-[18px] top-9 h-full w-px bg-border" />
      ) : null}

      <SkeletonBlock className="relative z-10 h-9 w-9 shrink-0 rounded-full" />

      <div className="min-w-0 flex-1 pb-5">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex gap-2">
                <SkeletonBlock className="h-5 w-16 rounded-full" />
                <SkeletonBlock className="h-5 w-24 rounded-full" />
              </div>
              <SkeletonBlock className="h-4 w-56" />
              <SkeletonBlock className="h-3 w-32" />
            </div>

            <SkeletonBlock className="h-9 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModuleTimelineSkeleton() {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-44" />
            <SkeletonBlock className="h-3 w-28" />
          </div>

          <div className="min-w-[160px] space-y-2">
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-2 w-full rounded-full" />
          </div>
        </div>
      </div>

      <div className="p-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <TimelineLessonSkeleton key={index} isLast={index === 3} />
        ))}
      </div>
    </div>
  );
}

export function CourseTimelineSkeleton() {
  return (
    <div className="space-y-6">
      <StatsGridSkeleton count={4} />

      <div className="rounded-xl border bg-card p-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-4 w-12" />
          </div>
          <SkeletonBlock className="h-2 w-full rounded-full" />
          <SkeletonBlock className="h-3 w-80 max-w-full" />
        </div>
      </div>

      <div className="space-y-4">
        <ModuleTimelineSkeleton />
        <ModuleTimelineSkeleton />
      </div>
    </div>
  );
}