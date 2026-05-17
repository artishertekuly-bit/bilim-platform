import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  LayoutDashboard,
  RotateCcw,
  Target,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import ProgressBar from '@/components/ProgressBar';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTeacherDashboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t, { getLocale } from '@/lib/i18n';
import { limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 180;
const MAX_NAME_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_URL_CHARS = 2_000;
const MAX_DATE_CHARS = 80;

type TeacherStudentSourceRow = {
  studentId?: string | null;
  student_id?: string | null;
  studentName?: string | null;
  student_name?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  courseId?: string | null;
  course_id?: string | null;
  courseTitle?: string | null;
  course_title?: string | null;
  subjectName?: string | null;
  subject_name?: string | null;
  progressPct?: number | string | null;
  progress_pct?: number | string | null;
  completedLessons?: number | string | null;
  completed_lessons?: number | string | null;
  totalLessons?: number | string | null;
  total_lessons?: number | string | null;
  enrolledAt?: string | null;
  enrolled_at?: string | null;
  lastCompletedAt?: string | null;
  last_completed_at?: string | null;
};

type TeacherStudentCardData = {
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  courseId: string;
  courseTitle: string;
  subjectName: string;
  progressPct: number;
  completedLessons: number;
  totalLessons: number;
  enrolledAt: string | null;
  lastCompletedAt: string | null;
};

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function cleanUrl(value: unknown): string | null {
  const url = cleanText(value, MAX_URL_CHARS);

  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return Math.max(0, Math.round(numberValue));
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, toSafeNumber(value)));
}

function formatPercent(value: unknown): string {
  return `${clampPercent(value)}%`;
}

function formatDate(value?: string | null) {
  const rawValue = cleanText(value, MAX_DATE_CHARS);

  if (!rawValue) return t('page.teacher_students.not_available');

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return t('page.teacher_students.not_available');
  }

  const locale = getLocale() === 'ru' ? 'ru-RU' : 'kk-KZ';

  return parsed.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getProgressTone(progressPct: number) {
  if (progressPct >= 80) return 'success' as const;
  if (progressPct >= 40) return 'warning' as const;
  return 'danger' as const;
}

function normalizeTeacherStudents(input: unknown): TeacherStudentCardData[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const row = item as TeacherStudentSourceRow;
      const studentId = cleanId(row.studentId ?? row.student_id);
      const courseId = cleanId(row.courseId ?? row.course_id);
      const progressPct = clampPercent(row.progressPct ?? row.progress_pct);
      const totalLessons = toSafeNumber(row.totalLessons ?? row.total_lessons);
      const completedLessons = Math.min(
        toSafeNumber(row.completedLessons ?? row.completed_lessons),
        totalLessons || Number.MAX_SAFE_INTEGER,
      );

      return {
        studentId,
        studentName:
          cleanText(row.studentName ?? row.student_name, MAX_NAME_CHARS) ||
          t('page.teacher_students.not_available'),
        avatarUrl: cleanUrl(row.avatarUrl ?? row.avatar_url),
        courseId,
        courseTitle:
          cleanText(row.courseTitle ?? row.course_title, MAX_TITLE_CHARS) ||
          t('page.teacher_students.not_available'),
        subjectName: cleanText(row.subjectName ?? row.subject_name, MAX_META_CHARS),
        progressPct,
        completedLessons,
        totalLessons,
        enrolledAt: cleanText(row.enrolledAt ?? row.enrolled_at, MAX_DATE_CHARS) || null,
        lastCompletedAt:
          cleanText(row.lastCompletedAt ?? row.last_completed_at, MAX_DATE_CHARS) || null,
      };
    })
    .filter((row) => row.studentId && row.courseId);
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/35 px-3 py-2.5">
      <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="truncate">{cleanText(label, MAX_META_CHARS)}</span>
      </span>
      <span className="text-right text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

function TeacherStudentCard({ row }: { row: TeacherStudentCardData }) {
  const progressTone = getProgressTone(row.progressPct);
  const coursePath = `/courses/${encodeURIComponent(row.courseId)}`;

  return (
    <Card className="overflow-hidden border-border bg-card transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={row.studentName}
              avatarUrl={row.avatarUrl}
              className="h-11 w-11"
              fallbackClassName="bg-accent text-sm font-semibold"
            />

            <div className="min-w-0">
              <CardTitle className="truncate text-sm font-semibold">
                {row.studentName}
              </CardTitle>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row.courseTitle}
              </p>
            </div>
          </div>

          <StatusBadge tone={progressTone}>{formatPercent(row.progressPct)}</StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-foreground">
              {t('page.teacher_students.field.progress')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {formatPercent(row.progressPct)}
            </span>
          </div>
          <ProgressBar value={row.progressPct} size="sm" />
        </div>

        <div className="grid gap-2">
          {row.subjectName ? (
            <InfoRow
              label="Пән"
              value={row.subjectName}
              icon={<GraduationCap size={13} />}
            />
          ) : null}

          <InfoRow
            label={t('page.teacher_students.field.completed_lessons')}
            value={`${row.completedLessons}/${row.totalLessons}`}
            icon={<CheckCircle2 size={13} />}
          />

          <InfoRow
            label={t('page.teacher_students.field.enrolled_at')}
            value={formatDate(row.enrolledAt)}
            icon={<CalendarClock size={13} />}
          />

          <InfoRow
            label={t('page.teacher_students.field.last_activity')}
            value={formatDate(row.lastCompletedAt)}
            icon={<Target size={13} />}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to={coursePath}>
              Курсты ашу
              <ArrowRight size={14} className="ml-1.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TeacherStudentsPage() {
  const { user } = useAuth();
  const safeUserId = cleanId(user?.id);

  const { data, isLoading, error } = useTeacherDashboard(safeUserId, Boolean(safeUserId));

  const students = useMemo(() => {
    const rows = normalizeTeacherStudents((data as { students?: unknown[] } | undefined)?.students);
    const locale = getLocale() === 'ru' ? 'ru' : 'kk';

    return rows.sort((a, b) => {
      const courseDiff = a.courseTitle.localeCompare(b.courseTitle, locale);
      if (courseDiff !== 0) return courseDiff;

      const progressDiff = b.progressPct - a.progressPct;
      if (progressDiff !== 0) return progressDiff;

      return a.studentName.localeCompare(b.studentName, locale);
    });
  }, [data]);

  const stats = useMemo(() => {
    const totalStudents = new Set(students.map((student) => student.studentId)).size;
    const totalCourses = new Set(students.map((student) => student.courseId)).size;
    const avgProgress =
      students.length > 0
        ? Math.round(
            students.reduce((sum, student) => sum + student.progressPct, 0) /
              students.length,
          )
        : 0;
    const completedLessons = students.reduce(
      (sum, student) => sum + student.completedLessons,
      0,
    );

    return {
      totalStudents,
      totalCourses,
      avgProgress: clampPercent(avgProgress),
      completedLessons,
    };
  }, [students]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutDashboard size={13} />
              Мұғалім
            </>
          }
          icon={<Users size={20} />}
          title={t('nav.students')}
          actions={
            <Button type="button" variant="outline" asChild>
              <Link to="/my-courses">
                <BookOpen size={15} className="mr-2" />
                Курстарға өту
              </Link>
            </Button>
          }
        />

        {isLoading ? <LoadingState text={t('page.teacher_students.loading')} /> : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.teacher_students.error')}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                <RotateCcw size={15} className="mr-2" />
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                    <Users size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Оқушылар</p>
                    <p className="text-xl font-semibold text-foreground">
                      {stats.totalStudents}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-secondary-muted bg-secondary-soft text-secondary-foreground">
                    <BookOpen size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Курстар</p>
                    <p className="text-xl font-semibold text-foreground">
                      {stats.totalCourses}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-success-muted bg-success-soft text-success-foreground">
                    <Target size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Орташа барыс</p>
                    <p className="text-xl font-semibold text-foreground">
                      {formatPercent(stats.avgProgress)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-warning-muted bg-warning-soft text-warning-foreground">
                    <CheckCircle2 size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Аяқталған сабақ</p>
                    <p className="text-xl font-semibold text-foreground">
                      {stats.completedLessons}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {students.length === 0 ? (
              <EmptyState
                title={t('page.teacher_students.empty.title')}
                text={t('page.teacher_students.empty.text')}
                action={
                  <Button type="button" variant="outline" asChild>
                    <Link to="/my-courses">
                      Курстарға өту
                      <ArrowRight size={15} className="ml-2" />
                    </Link>
                  </Button>
                }
              />
            ) : null}

            {students.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {students.map((row, index) => (
                  <TeacherStudentCard
                    key={`${row.courseId}-${row.studentId}-${index}`}
                    row={row}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
