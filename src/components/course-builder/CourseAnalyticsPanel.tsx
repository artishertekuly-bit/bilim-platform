import type { ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  HelpCircle,
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
  return `${value}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('kk-KZ');
}

function getScoreTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'muted';
  if (value >= 80) return 'success';
  if (value >= 60) return 'warning';
  return 'danger';
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold">{value}</p>
          {hint ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
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
      <Card id="course-analytics" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <BarChart3 size={16} />
                Курс аналитикасы
              </CardTitle>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Бұл блок оқушыны бақыламайды. Тек оқу нәтижелері, progress және
                quiz/test қорытындылары бойынша мұғалімге педагогикалық ұсыныс
                береді.
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
              Жаңарту
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <LoadingState text="Курс аналитикасы жүктелуде..." />
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
                  Қайта жүктеу
                </Button>
              }
            />
          ) : null}

          {!isLoading && !error && !snapshot ? (
            <EmptyState
              title="Аналитика әзірге жоқ"
              text="Курс бойынша деректер жиналғаннан кейін analytics осы жерде көрінеді."
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
                  label="Орташа progress"
                  value={formatPercent(snapshot.totals.avgProgressPct)}
                  hint="Курс ішіндегі аяқталған сабақтар негізінде."
                  icon={<Target size={17} />}
                />

                <MetricCard
                  label="Mini quiz pass rate"
                  value={formatPercent(snapshot.totals.miniQuizPassRatePct)}
                  hint={`Attempts: ${formatNumber(snapshot.totals.miniQuizAttempts)}`}
                  icon={<CheckCircle2 size={17} />}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Mini quiz нәтижелері</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Қай сабақтағы mini quiz қиын екенін көруге арналған.
                      </p>
                    </div>

                    <StatusBadge tone={getScoreTone(snapshot.totals.miniQuizAvgScore)}>
                      Орташа: {formatPercent(snapshot.totals.miniQuizAvgScore)}
                    </StatusBadge>
                  </div>

                  {snapshot.miniQuizzes.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                      Бұл курста mini quiz нәтижелері әлі жоқ. Оқушылар mini quiz
                      тапсырғаннан кейін pass rate және орташа score осы жерде
                      көрінеді.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {snapshot.miniQuizzes.slice(0, 6).map((quiz) => (
                        <div key={quiz.quizId} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-medium">
                                {quiz.lessonTitle}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Attempts: {quiz.attempts} · Passed: {quiz.passed} ·
                                Failed: {quiz.failed}
                              </p>
                            </div>

                            <StatusBadge tone={getScoreTone(quiz.avgScore)}>
                              {formatPercent(quiz.avgScore)}
                            </StatusBadge>
                          </div>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${quiz.passRatePct ?? 0}%` }}
                            />
                          </div>

                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Pass rate: {formatPercent(quiz.passRatePct)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Қиын сабақтар</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Бұл автоматты үкім емес. Мұғалім талқылап, педагогикалық
                        шешім қабылдайды.
                      </p>
                    </div>

                    <StatusBadge
                      tone={snapshot.difficultLessons.length ? 'warning' : 'success'}
                    >
                      {snapshot.difficultLessons.length}
                    </StatusBadge>
                  </div>

                  {snapshot.difficultLessons.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                      Қазір course analytics бойынша айқын қиын сабақ байқалмайды.
                      Дерек көбейген сайын бұл бөлім нақтырақ болады.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {snapshot.difficultLessons.slice(0, 6).map((lesson) => (
                        <div key={lesson.lessonId} className="rounded-lg border p-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-amber-500/10 text-amber-600">
                              <TrendingDown size={15} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-1 text-sm font-medium">
                                {lesson.lessonTitle}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {lesson.reason}
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <StatusBadge tone={getScoreTone(lesson.miniQuizAvgScore)}>
                                  Score: {formatPercent(lesson.miniQuizAvgScore)}
                                </StatusBadge>

                                {lesson.failedAttempts > 0 ? (
                                  <StatusBadge tone="danger">
                                    Failed: {lesson.failedAttempts}
                                  </StatusBadge>
                                ) : null}

                                {lesson.reviewLater ? (
                                  <StatusBadge tone="warning">Review later</StatusBadge>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
                    <HelpCircle size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold">Педагогикалық ескерту</p>
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