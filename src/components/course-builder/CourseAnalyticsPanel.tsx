import type { ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  RotateCcw,
  Target,
  TrendingDown,
  Users,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useCourseLearningSnapshot } from '@/hooks/use-platform-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import TeacherStudentAnalyticsPanel from '@/components/course-builder/TeacherStudentAnalyticsPanel';

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('kk-KZ');
}

function getScoreTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'muted' as const;
  if (value >= 80) return 'success' as const;
  if (value >= 60) return 'warning' as const;
  return 'danger' as const;
}

function MetricCard({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'ai';
}) {
  const toneClassName = {
    primary: 'border-primary-muted bg-primary-soft text-primary',
    success: 'border-success-muted bg-success-soft text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    ai: 'border-ai-border bg-ai-soft text-primary',
  }[tone];

  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClassName}`}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProgressLine({ value }: { value: number | null | undefined }) {
  const normalized = Math.max(0, Math.min(100, Math.round(value || 0)));

  return (
    <div className="h-2 overflow-hidden rounded-full border border-border bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-soft"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

export default function CourseAnalyticsPanel({
  courseId,
  teacherId,
}: {
  courseId: string;
  teacherId: string;
}) {
  const {
    data: snapshot,
    isLoading,
    error,
    isFetching,
    refetch,
  } = useCourseLearningSnapshot(courseId, Boolean(courseId));

  return (
    <div className="space-y-4">
      <Card id="course-analytics" className="scroll-mt-24 overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-card pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <BarChart3 size={16} />
                Курс аналитикасы
              </CardTitle>

              {snapshot ? (
                <StatusBadge tone="secondary">
                  <Users size={12} />
                  {formatNumber(snapshot.totals.students)}
                </StatusBadge>
              ) : null}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RotateCcw size={14} className="mr-1.5" />
              {isFetching ? 'Жаңартылуда...' : 'Жаңарту'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-4 sm:p-5">
          {isLoading ? (
            <LoadingState text="Жүктелуде..." compact />
          ) : null}

          {!isLoading && error ? (
            <ErrorState
              text="Аналитиканы жүктеу мүмкін болмады."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refetch()}
                >
                  <RotateCcw size={15} className="mr-2" />
                  Қайта жүктеу
                </Button>
              }
              compact
            />
          ) : null}

          {!isLoading && !error && !snapshot ? (
            <EmptyState
              title="Аналитика жоқ"
              text="Дерек жиналғаннан кейін көрсетіледі."
              compact
              tone="ai"
            />
          ) : null}

          {!isLoading && !error && snapshot ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Оқушылар"
                  value={formatNumber(snapshot.totals.students)}
                  icon={<Users size={17} />}
                />

                <MetricCard
                  label="Сабақтар"
                  value={formatNumber(snapshot.totals.lessons)}
                  icon={<BookOpen size={17} />}
                />

                <MetricCard
                  label="Орташа прогресс"
                  value={formatPercent(snapshot.totals.avgProgressPct)}
                  icon={<Target size={17} />}
                  tone="success"
                />

                <MetricCard
                  label="Шағын тест"
                  value={formatPercent(snapshot.totals.miniQuizPassRatePct)}
                  icon={<CheckCircle2 size={17} />}
                  tone="ai"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-3xl border border-border bg-card p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      Шағын тест нәтижелері
                    </p>

                    <StatusBadge tone={getScoreTone(snapshot.totals.miniQuizAvgScore)}>
                      {formatPercent(snapshot.totals.miniQuizAvgScore)}
                    </StatusBadge>
                  </div>

                  {snapshot.miniQuizzes.length === 0 ? (
                    <EmptyState
                      title="Нәтиже жоқ"
                      text="Тапсырылғаннан кейін көрсетіледі."
                      compact
                      tone="ai"
                    />
                  ) : (
                    <div className="space-y-2">
                      {snapshot.miniQuizzes.slice(0, 6).map((quiz) => (
                        <div
                          key={quiz.quizId}
                          className="rounded-3xl border border-border bg-muted/25 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                {quiz.lessonTitle}
                              </p>

                              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                Тапсырды: {quiz.attempts} · Өтті: {quiz.passed} · Өтпеді:{' '}
                                {quiz.failed}
                              </p>
                            </div>

                            <StatusBadge tone={getScoreTone(quiz.avgScore)}>
                              {formatPercent(quiz.avgScore)}
                            </StatusBadge>
                          </div>

                          <div className="mt-3">
                            <ProgressLine value={quiz.passRatePct} />
                          </div>

                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Өту: {formatPercent(quiz.passRatePct)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-3xl border border-border bg-card p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      Қиын сабақтар
                    </p>

                    <StatusBadge
                      tone={snapshot.difficultLessons.length ? 'warning' : 'success'}
                    >
                      {snapshot.difficultLessons.length}
                    </StatusBadge>
                  </div>

                  {snapshot.difficultLessons.length === 0 ? (
                    <EmptyState
                      title="Қиын сабақ жоқ"
                      text="Дерек көбейгенде жаңарады."
                      compact
                    />
                  ) : (
                    <div className="space-y-2">
                      {snapshot.difficultLessons.slice(0, 6).map((lesson) => (
                        <div
                          key={lesson.lessonId}
                          className="rounded-3xl border border-warning-muted bg-warning-soft/45 p-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-warning-muted bg-card text-warning-foreground">
                              <TrendingDown size={15} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                {lesson.lessonTitle}
                              </p>

                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {lesson.reason}
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <StatusBadge tone={getScoreTone(lesson.miniQuizAvgScore)}>
                                  Ұпай: {formatPercent(lesson.miniQuizAvgScore)}
                                </StatusBadge>

                                {lesson.failedAttempts > 0 ? (
                                  <StatusBadge tone="danger">
                                    Өтпеді: {lesson.failedAttempts}
                                  </StatusBadge>
                                ) : null}

                                {lesson.reviewLater ? (
                                  <StatusBadge tone="warning">Қайталау</StatusBadge>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {courseId && teacherId ? (
        <TeacherStudentAnalyticsPanel courseId={courseId} teacherId={teacherId} />
      ) : null}
    </div>
  );
}