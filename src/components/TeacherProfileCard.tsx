import UserAvatar from '@/components/UserAvatar';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

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

const MAX_NAME_CHARS = 160;
const MAX_BIO_CHARS = 700;
const MAX_URL_CHARS = 2_000;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit: number): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit: number): string {
  return limitText(
    cleanRawText(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
    limit,
  );
}

function normalizeCount(value: unknown): number | null {
  const count = Number(value);

  if (!Number.isFinite(count)) {
    return null;
  }

  return Math.max(0, Math.round(count));
}

export default function TeacherProfileCard({
  teacher,
  compact = false,
  className,
}: Props) {
  const teacherName = cleanText(teacher.fullName, MAX_NAME_CHARS) || 'Автор';
  const teacherBio = cleanMultilineText(teacher.bio, MAX_BIO_CHARS);
  const avatarUrl = cleanText(teacher.avatarUrl, MAX_URL_CHARS) || undefined;
  const coursesCount = normalizeCount(teacher.coursesCount);

  return (
    <div
      className={cn(
        'rounded-3xl border border-border bg-card',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          name={teacherName}
          avatarUrl={avatarUrl}
          className={compact ? 'h-10 w-10' : 'h-12 w-12'}
          fallbackClassName={compact ? 'text-sm' : 'text-base'}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-5 text-foreground">
            {teacherName}
          </div>

          {coursesCount !== null ? (
            <div className="mt-1 inline-flex w-fit rounded-full border border-border bg-muted/45 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {coursesCount} курс
            </div>
          ) : null}

          {teacherBio ? (
            <p
              className={cn(
                'mt-2 leading-5 text-muted-foreground',
                compact ? 'line-clamp-2 text-xs' : 'line-clamp-3 text-sm',
              )}
            >
              {teacherBio}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}