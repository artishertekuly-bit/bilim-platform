import { SkeletonBlock } from '@/components/common/SkeletonBlocks';

export function TeacherCourseBuilderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-6 w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-40" />
            <div className="mt-5 space-y-3">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-24 w-full rounded-lg" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-32 w-full rounded-lg" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-44" />
            <div className="mt-5 space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-40" />
            <div className="mt-5 space-y-3">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-24 w-full rounded-lg" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-32 w-full rounded-lg" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-52" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
