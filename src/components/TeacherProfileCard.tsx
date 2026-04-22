import UserAvatar from '@/components/UserAvatar';

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
};

export default function TeacherProfileCard({ teacher, compact = false }: Props) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        <UserAvatar
          name={teacher.fullName}
          avatarUrl={teacher.avatarUrl}
          className={compact ? 'h-10 w-10' : 'h-12 w-12'}
          fallbackClassName={compact ? 'text-sm' : 'text-base'}
        />

        <div className="min-w-0 flex-1">
          <div className="font-medium leading-none truncate">
            {teacher.fullName || 'Мұғалім'}
          </div>

          {typeof teacher.coursesCount === 'number' && (
            <div className="mt-1 text-xs text-muted-foreground">
              Курстар саны: {teacher.coursesCount}
            </div>
          )}

          <p className={`mt-2 text-muted-foreground ${compact ? 'text-xs line-clamp-2' : 'text-sm line-clamp-3'}`}>
            {teacher.bio?.trim()
              ? teacher.bio
              : 'Мұғалім туралы ақпарат әлі толтырылмаған.'}
          </p>
        </div>
      </div>
    </div>
  );
}