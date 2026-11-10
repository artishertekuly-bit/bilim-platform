import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  CheckCircle,
  ClipboardList,
  Flame,
  GraduationCap,
  Lock,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Star,
  Target,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import ProgressBar from '@/components/ProgressBar';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
import { useStudentDashboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_NAME_CHARS = 120;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function formatCount(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.round(numberValue));
}

function clampPercentNumber(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function formatPercent(value: unknown): string {
  return `${clampPercentNumber(value)}%`;
}

function buildLessonPath(value: unknown): string | null {
  const id = cleanId(value);
  if (!id) return null;
  return `/lessons/${encodeURIComponent(id)}`;
}

function buildCoursePath(value: unknown): string | null {
  const id = cleanId(value);
  if (!id) return null;
  return `/courses/${encodeURIComponent(id)}`;
}

function getScoreTone(score: number | null | undefined) {
  const normalized = clampPercentNumber(score);
  if (normalized >= 80) return 'success' as const;
  if (normalized >= 50) return 'warning' as const;
  return 'danger' as const;
}

function StudentDashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 rounded-3xl bg-muted/50" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted/40 p-3" />
        ))}
      </div>
      <div className="h-44 rounded-3xl bg-muted/40" />
      <div className="h-44 rounded-3xl bg-muted/40" />
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const safeUserId = cleanId(user?.id);

  const { data, isLoading, error } = useStudentDashboard(safeUserId, Boolean(safeUserId));

  const firstName =
    cleanText(user?.fullName, MAX_NAME_CHARS).split(/\s+/)[0] ||
    cleanText(user?.email?.split('@')[0], MAX_NAME_CHARS) ||
    'оқушы';

  const safeStats = useMemo(
    () => ({
      enrolledCourses: formatCount(data?.stats?.enrolledCourses),
      avgScore: clampPercentNumber(data?.stats?.avgScore),
      streakDays: formatCount(data?.stats?.streakDays),
      points: formatCount(data?.stats?.points),
      rank: formatCount(data?.stats?.rank),
      completedLessons: formatCount(data?.stats?.completedLessons),
      bestSubject: cleanText(data?.stats?.bestSubject, MAX_META_CHARS),
    }),
    [data],
  );

  const enrolledCourses = data?.enrolledCourses || [];
  const recentAttempts = data?.recentAttempts || [];
  const nextLessons = data?.nextLessons || [];

  const nextLesson =
    nextLessons.find((lesson) => !lesson.isLocked) ||
    nextLessons[0] ||
    null;

  const nextLessonPath = nextLesson && !nextLesson.isLocked ? buildLessonPath(nextLesson.id) : null;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Mobile App Header Card */}
        <div className="flex flex-col gap-3 rounded-3xl border border-border/80 bg-gradient-to-r from-muted/50 via-card to-card p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-xs">
                <GraduationCap size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-black tracking-tight text-foreground sm:text-lg">
                  Сәлем, {firstName}!
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  Оқу барысы белсенді
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-warning-muted bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning-foreground">
                <Flame size={13} className="text-warning-foreground" />
                {safeStats.streakDays} күн
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground">
                <Star size={12} className="text-accent-foreground" />
                {safeStats.points}
              </span>
            </div>
          </div>
        </div>

        {isLoading ? <StudentDashboardSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text="Оқушы деректерін жүктеу мүмкін болмады."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => window.location.reload()}
              >
                <RotateCcw size={14} className="mr-1.5" />
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && (
          <>
            {/* Continue Learning Banner */}
            {nextLesson ? (
              <div className="group relative overflow-hidden rounded-3xl border border-primary/20 bg-primary-soft/40 p-4 sm:p-5 shadow-xs transition-all hover:border-primary/40">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <PlayCircle size={11} />
                        Келесі сабақ
                      </span>
                      {nextLesson.isLocked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Lock size={10} />
                          Құлыптаулы
                        </span>
                      ) : null}
                    </div>

                    <h2 className="line-clamp-1 text-sm font-bold text-foreground sm:text-base">
                      {cleanText(nextLesson.title)}
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[cleanText(nextLesson.subjectName, MAX_META_CHARS), cleanText(nextLesson.courseTitle, MAX_META_CHARS)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  {nextLesson.isLocked ? (
                    <Button size="sm" variant="outline" className="h-9 rounded-full text-xs" disabled>
                      <Lock size={13} className="mr-1.5" />
                      Құлыптаулы
                    </Button>
                  ) : (
                    <Button size="sm" className="h-9 rounded-full text-xs font-semibold shadow-xs app-tap" asChild>
                      <Link to={nextLessonPath || '/courses'}>
                        Жалғастыру
                        <ArrowRight size={13} className="ml-1.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            {/* Core Stats Row */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Курстар</span>
                  <BookOpen size={14} className="text-muted-foreground" />
                </div>
                <p className="mt-1 text-lg font-black text-foreground">{safeStats.enrolledCourses}</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Орташа балл</span>
                  <Target size={14} className="text-success-foreground" />
                </div>
                <p className="mt-1 text-lg font-black text-foreground">{formatPercent(safeStats.avgScore)}</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Оқу сериясы</span>
                  <Flame size={14} className="text-warning-foreground" />
                </div>
                <p className="mt-1 text-lg font-black text-foreground">{safeStats.streakDays} күн</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Аяқталған</span>
                  <CheckCircle size={14} className="text-foreground" />
                </div>
                <p className="mt-1 text-lg font-black text-foreground">{safeStats.completedLessons} сабақ</p>
              </div>
            </div>

            {/* Quick App Action Grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Link
                to="/courses"
                className="app-tap flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 transition-colors hover:border-foreground/20"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <BookOpen size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">Курстар</p>
                  <p className="text-[10px] text-muted-foreground">Каталог</p>
                </div>
              </Link>

              <Link
                to="/tests"
                className="app-tap flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 transition-colors hover:border-foreground/20"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <ClipboardList size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">Тесттер</p>
                  <p className="text-[10px] text-muted-foreground">Тапсырмалар</p>
                </div>
              </Link>

              <Link
                to="/ai-tutor"
                className="app-tap flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 transition-colors hover:border-foreground/20"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Bot size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">AI Тьютор</p>
                  <p className="text-[10px] text-muted-foreground">Сұрақ-жауап</p>
                </div>
              </Link>

              <Link
                to="/analytics"
                className="app-tap flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 transition-colors hover:border-foreground/20"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Target size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">Прогресс</p>
                  <p className="text-[10px] text-muted-foreground">Талдау</p>
                </div>
              </Link>
            </div>

            {/* Enrolled Courses Section */}
            <div className="rounded-3xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Менің курстарым</h3>
                <Link
                  to="/courses"
                  className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Барлығы
                  <ArrowRight size={13} className="ml-1" />
                </Link>
              </div>

              {enrolledCourses.length === 0 ? (
                <EmptyState
                  title="Курстар әзірге жоқ"
                  text="Каталогтан курс таңдап, оқуды бастаңыз."
                  action={
                    <Button size="sm" className="rounded-full text-xs font-semibold" asChild>
                      <Link to="/courses">Курс таңдау</Link>
                    </Button>
                  }
                  compact
                />
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {enrolledCourses.map((course) => {
                    const courseId = cleanId(course.id);
                    const coursePath = buildCoursePath(courseId);

                    return (
                      <Link
                        key={courseId || cleanText(course.title)}
                        to={coursePath || '/courses'}
                        className="app-tap block rounded-2xl border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-xs font-bold text-foreground">
                              {cleanText(course.title)}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {cleanText(course.subjectName, MAX_META_CHARS)} · {formatCount(course.lessons)} сабақ
                            </p>
                          </div>
                          <StatusBadge tone={getScoreTone(course.progress)}>
                            {formatPercent(course.progress)}
                          </StatusBadge>
                        </div>
                        <div className="mt-2.5">
                          <ProgressBar value={clampPercentNumber(course.progress)} size="sm" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Tests Section */}
            {recentAttempts.length > 0 ? (
              <div className="rounded-3xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground">Соңғы тапсырмалар</h3>
                  <Link
                    to="/tests"
                    className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Барлық тесттер
                    <ArrowRight size={13} className="ml-1" />
                  </Link>
                </div>

                <div className="space-y-2">
                  {recentAttempts.slice(0, 4).map((test, index) => (
                    <Link
                      key={cleanId(test.id) || index}
                      to="/tests"
                      className="app-tap flex items-center justify-between gap-3 rounded-2xl bg-muted/25 p-2.5 transition-colors hover:bg-muted/45"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {cleanText(test.title)}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {cleanText(test.subjectName, MAX_META_CHARS)}
                        </p>
                      </div>
                      <StatusBadge tone={getScoreTone(test.score)}>
                        {formatPercent(test.score)}
                      </StatusBadge>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
