import { SkeletonBlock } from '@/components/common/SkeletonBlocks';

export function TeacherCourseBuilderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-3xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-11 w-11 rounded-2xl" />
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-7 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border bg-card p-3 sm:p-4">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-16 w-full rounded-3xl" />
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-3xl border bg-card p-4 sm:p-5">
          <SkeletonBlock className="h-5 w-40" />
          <div className="mt-5 space-y-4">
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-24 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-28 w-full rounded-3xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-4 sm:p-5">
          <SkeletonBlock className="h-5 w-36" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-20 w-full rounded-3xl" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div className="rounded-3xl border bg-card p-4 sm:p-5">
            <SkeletonBlock className="h-5 w-44" />
            <div className="mt-5 space-y-4">
              <SkeletonBlock className="h-10 w-full rounded-2xl" />
              <SkeletonBlock className="h-24 w-full rounded-2xl" />
              <SkeletonBlock className="h-10 w-full rounded-2xl" />
              <SkeletonBlock className="h-36 w-full rounded-3xl" />
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 sm:p-5">
            <SkeletonBlock className="h-5 w-40" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-16 w-full rounded-3xl" />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border bg-card p-4 sm:p-5">
            <SkeletonBlock className="h-5 w-36" />
            <div className="mt-5 space-y-3">
              <SkeletonBlock className="h-10 w-full rounded-2xl" />
              <SkeletonBlock className="h-10 w-full rounded-2xl" />
              <SkeletonBlock className="h-28 w-full rounded-3xl" />
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 sm:p-5">
            <SkeletonBlock className="h-5 w-32" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}