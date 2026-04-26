import UserAvatar from '@/components/UserAvatar';
import { cn } from '@/lib/utils';

export type TeacherProfileSummary = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  coursesCount?: number;
};

type Props = {
  teacher: TeacherProfileSummary;
  compact?: boolean;
  className?: string;
};

export default function TeacherProfileCard({
  teacher,
  compact = false,
  className,
}: Props) {
  const teacherName = teacher.fullName?.trim() || 'Мұғалім';
  const teacherBio = teacher.bio?.trim() || 'Мұғалім туралы ақпарат әлі толтырылмаған.';

  return (
    <div
      className={cn(
        'rounded-3xl border border-border bg-surface-soft/60 shadow-inner-soft',
        compact ? 'p-3' : 'p-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          name={teacherName}
          avatarUrl={teacher.avatarUrl}
          className={compact ? 'h-10 w-10' : 'h-12 w-12'}
          fallbackClassName={compact ? 'text-sm' : 'text-base'}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-5 text-foreground">
            {teacherName}
          </div>

          {typeof teacher.coursesCount === 'number' ? (
            <div className="mt-1 inline-flex w-fit rounded-full border border-primary-muted bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
              Курстар саны: {teacher.coursesCount}
            </div>
          ) : null}

          <p
            className={cn(
              'mt-2 leading-5 text-muted-foreground',
              compact ? 'line-clamp-2 text-xs' : 'line-clamp-3 text-sm'
            )}
          >
            {teacherBio}
          </p>
        </div>
      </div>
    </div>
  );
}