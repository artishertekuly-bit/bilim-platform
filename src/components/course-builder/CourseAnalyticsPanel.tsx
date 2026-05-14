import type { ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  ListChecks,
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
  hint,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  hint?: string;
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
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:shadow-soft-md">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${toneClassName}`}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProgressLine({ value }: { value: number | null | undefined }) {
  const normalized = Math.max(0, Math.min(100, Math.round(value || 0)));

  return (
    <div className="h-2 overflow-hidden rounded-full border border-border bg-muted shadow-inner-soft">
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
        <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <BarChart3 size={16} />
                  Курс аналитикасы
                </CardTitle>

                <StatusBadge tone="ai">
                  <HelpCircle size={12} />
                  Human + AI қолдау
                </StatusBadge>

                {snapshot ? (
                  <StatusBadge tone="secondary">
                    <Users size={12} />
                    {formatNumber(snapshot.totals.students)} оқушы
                  </StatusBadge>
                ) : null}
              </div>

              <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                Бұл блок оқушыны бақыламайды. Тек оқу нәтижелері, прогресс және
                quiz/test қорытындылары бойынша мұғалімге педагогикалық талдау
                жасауға көмектеседі.
              </p>
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
            <LoadingState text="Курс аналитикасы жүктелуде..." compact />
          ) : null}

          {!isLoading && error ? (
            <ErrorState
              text="Курс аналитикасын жүктеу мүмкін болмады."
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
              title="Аналитика әзірге жоқ"
              text="Курс бойынша деректер жиналғаннан кейін analytics осы жерде көрінеді."
              compact
              tone="ai"
            />
          ) : null}

          {!isLoading && !error && snapshot ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Оқушы саны"
                  value={formatNumber(snapshot.totals.students)}
                  icon={<Users size={17} />}
                />

                <MetricCard
                  label="Сабақ саны"
                  value={formatNumber(snapshot.totals.lessons)}
                  icon={<BookOpen size={17} />}
                />

                <MetricCard
                  label="Орташа прогресс"
                  value={formatPercent(snapshot.totals.avgProgressPct)}
                  hint="Курс ішіндегі аяқталған сабақтар негізінде."
                  icon={<Target size={17} />}
                  tone="success"
                />

                <MetricCard
                  label="Қысқа тест өту деңгейі"
                  value={formatPercent(snapshot.totals.miniQuizPassRatePct)}
                  hint={`Талпыныс: ${formatNumber(snapshot.totals.miniQuizAttempts)}`}
                  icon={<CheckCircle2 size={17} />}
                  tone="ai"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          Қысқа тест нәтижелері
                        </p>

                        <StatusBadge tone={getScoreTone(snapshot.totals.miniQuizAvgScore)}>
                          Орташа: {formatPercent(snapshot.totals.miniQuizAvgScore)}
                        </StatusBadge>
                      </div>

                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Қай сабақтағы қысқа тест қиын екенін көруге арналған.
                      </p>
                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-inner-soft">
                      <ListChecks size={17} />
                    </div>
                  </div>

                  {snapshot.miniQuizzes.length === 0 ? (
                    <EmptyState
                      title="Қысқа тест нәтижелері жоқ"
                      text="Оқушылар қысқа тест тапсырғаннан кейін өту деңгейі мен орташа нәтиже осы жерде көрінеді."
                      compact
                      tone="ai"
                    />
                  ) : (
                    <div className="space-y-2">
                      {snapshot.miniQuizzes.slice(0, 6).map((quiz) => (
                        <div
                          key={quiz.quizId}
                          className="rounded-3xl border border-border bg-surface-soft/55 p-3 shadow-soft"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                {quiz.lessonTitle}
                              </p>
                              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                Талпыныс: {quiz.attempts} · Өткен: {quiz.passed} · Өтпеген:{' '}
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
                            Өту деңгейі: {formatPercent(quiz.passRatePct)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-3xl border border-border bg-card p-4 shadow-soft">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          Қиын сабақтар
                        </p>

                        <StatusBadge
                          tone={snapshot.difficultLessons.length ? 'warning' : 'success'}
                        >
                          {snapshot.difficultLessons.length}
                        </StatusBadge>
                      </div>

                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Бұл автоматты үкім емес. Мұғалім талқылап, педагогикалық
                        шешім қабылдайды.
                      </p>
                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-warning-muted bg-warning-soft text-warning-foreground shadow-inner-soft">
                      <TrendingDown size={17} />
                    </div>
                  </div>

                  {snapshot.difficultLessons.length === 0 ? (
                    <EmptyState
                      title="Айқын қиын сабақ байқалмайды"
                      text="Дерек көбейген сайын бұл бөлім нақтырақ болады."
                      compact
                    />
                  ) : (
                    <div className="space-y-2">
                      {snapshot.difficultLessons.slice(0, 6).map((lesson) => (
                        <div
                          key={lesson.lessonId}
                          className="rounded-3xl border border-warning-muted bg-warning-soft/50 p-3 shadow-soft"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-warning-muted bg-card text-warning-foreground shadow-inner-soft">
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
                                  Нәтиже: {formatPercent(lesson.miniQuizAvgScore)}
                                </StatusBadge>

                                {lesson.failedAttempts > 0 ? (
                                  <StatusBadge tone="danger">
                                    Өтпеген: {lesson.failedAttempts}
                                  </StatusBadge>
                                ) : null}

                                {lesson.reviewLater ? (
                                  <StatusBadge tone="warning">Қайталау белгісі</StatusBadge>
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

              <div className="rounded-3xl border border-ai-border bg-ai-soft/65 p-4 shadow-soft">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-card text-primary shadow-inner-soft">
                    <HelpCircle size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Педагогикалық ескерту
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Бұл аналитика оқушыны бақылау үшін емес, оқу нәтижесін түсіну
                      үшін қолданылады. Оқушы сабаққа кірмесе де, тақырыпты мектепте,
                      кітаптан немесе басқа ортада меңгеруі мүмкін. Сондықтан бұл блок
                      тек мұғалімге талқылау және ұсыныс жасауға көмектеседі.
                    </p>
                  </div>
                </div>
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