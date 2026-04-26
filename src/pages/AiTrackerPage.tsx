import type { ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import AiPromptShell, {
  type AiPromptSuggestion,
} from '@/components/ai-tools/AiPromptShell';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import { useStudentLearningSnapshot } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Priority = 'low' | 'medium' | 'high';

const STUDENT_AI_TRACKER_PROMPTS: AiPromptSuggestion[] = [
  {
    id: 'today-plan',
    label: 'Бүгін не оқимын?',
    prompt:
      'Менің оқу нәтижелеріме қарап, бүгін қай сабақтарды бірінші қайталауым керек екенін түсіндір.',
  },
  {
    id: 'three-day-plan',
    label: '3 күндік жоспар',
    prompt:
      'Менің оқу нәтижелеріме қарап, 3 күндік қысқа әрі нақты оқу жоспарын жасап бер.',
  },
  {
    id: 'hard-lessons',
    label: 'Қиын сабақтар',
    prompt:
      'Маған қиын болып тұрған сабақтарды көрсетіп, оларды қалай қайталау керегін түсіндір.',
  },
  {
    id: 'quiz-explain',
    label: 'Mini quiz түсіндір',
    prompt:
      'Mini quiz нәтижелеріме қарап, қай тақырыптарға көбірек көңіл бөлуім керек екенін түсіндір.',
  },
];

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

function getPriorityTone(priority: Priority) {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'success';
}

function getPriorityLabel(priority: Priority) {
  const map: Record<Priority, string> = {
    low: 'Жай қайталау',
    medium: 'Назар аудару',
    high: 'Бірінші қайталау',
  };

  return map[priority];
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
    <div className="group rounded-2xl border bg-card/95 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold text-foreground">{value}</p>
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

export default function AiTrackerPage() {
  const { user } = useAuth();

  const {
    data: snapshot,
    isLoading,
    error,
    isFetching,
    refetch,
  } = useStudentLearningSnapshot(user?.id || '', Boolean(user?.id));

  const trackerAi = useLearningAiAnalysis({
    mode: 'student_tracker',
    role: 'student',
    scope: {
      studentId: user?.id || null,
    },
  });

  const topRecommendation = snapshot
    ? snapshot.recommendations.find((item) => item.priority === 'high') ||
      snapshot.recommendations[0] ||
      null
    : null;

  const topWeakLesson = snapshot?.weakLessons[0] || null;
  const focusTitle =
    topRecommendation?.title ||
    topWeakLesson?.lessonTitle ||
    'Оқу бағытыңыз тұрақты';
  const focusDescription =
    topRecommendation?.description ||
    topWeakLesson?.reason ||
    'Қазір айқын қиындық байқалмайды. Жоспарлы түрде келесі сабақтарды жалғастырып, mini quiz нәтижелерін бақылаңыз.';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              AI құралдар
            </>
          }
          icon={<BrainCircuit size={20} />}
          title="AI Tracker"
          description="Оқу нәтижелеріңізді түсіндіріп, бүгінгі қайталау фокусын және нақты әрекет жоспарын көрсететін жеке оқу трекері."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                trackerAi.reset();
                void refetch();
              }}
              disabled={isFetching || !user?.id}
            >
              <RotateCcw size={15} className="mr-2" />
              Жаңарту
            </Button>
          }
        />

        {!user ? (
          <EmptyState
            title="Аккаунт анықталмады"
            text="AI Tracker қолдану үшін жүйеге кіру керек."
          />
        ) : null}

        {user && isLoading ? <LoadingState text="Оқу snapshot жүктелуде..." /> : null}

        {user && !isLoading && error ? (
          <ErrorState
            text="AI Tracker үшін оқу аналитикасын жүктеу мүмкін болмады."
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

        {user && !isLoading && !error && !snapshot ? (
          <EmptyState
            title="Оқу snapshot әзірге жоқ"
            text="Курсқа тіркеліп, сабақтар мен mini quiz нәтижелері пайда болғаннан кейін бұл жерде жеке оқу талдауы көрсетіледі."
          />
        ) : null}

        {user && !isLoading && !error && snapshot ? (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/15 via-background to-background shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-3xl">
                      <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium text-primary shadow-sm">
                        <Target size={12} />
                        Бүгінгі оқу фокусы
                      </div>

                      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        {focusTitle}
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                        {focusDescription}
                      </p>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <StatusBadge tone={topRecommendation ? getPriorityTone(topRecommendation.priority) : 'success'}>
                          {topRecommendation
                            ? getPriorityLabel(topRecommendation.priority)
                            : 'Жоспар бойынша'}
                        </StatusBadge>
                        <StatusBadge tone="primary">AI snapshot дайын</StatusBadge>
                        <StatusBadge tone="muted">Click/time tracking жоқ</StatusBadge>
                      </div>
                    </div>

                    <div className="grid min-w-[220px] gap-2 rounded-2xl border bg-background/75 p-4">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Progress</p>
                        <p className="text-2xl font-semibold">
                          {formatPercent(snapshot.totals.progressPct)}
                        </p>
                      </div>
                      <div className="h-px bg-border" />
                      <div>
                        <p className="text-[11px] text-muted-foreground">Mini quiz орташа</p>
                        <p className="text-2xl font-semibold">
                          {formatPercent(snapshot.totals.miniQuizAvgScore)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/10 bg-card/95 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck size={16} />
                    Қауіпсіз context
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs leading-5 text-muted-foreground">
                  <p>
                    AI тек оқу нәтижелерін қолданады: progress, mini quiz, сақталған сабақтар және кейін қайталау белгілері.
                  </p>
                  <div className="rounded-xl border bg-background p-3">
                    Оқушыны бақылауға арналған click tracking, бетте отырған уақыт немесе жасырын behavior деректері қолданылмайды.
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Жалпы progress"
                value={formatPercent(snapshot.totals.progressPct)}
                hint={`${snapshot.totals.completedLessons}/${snapshot.totals.totalLessons} сабақ аяқталған`}
                icon={<Target size={17} />}
              />

              <MetricCard
                label="Mini quiz орташа нәтиже"
                value={formatPercent(snapshot.totals.miniQuizAvgScore)}
                hint={`Тапсырылған саны: ${formatNumber(snapshot.totals.miniQuizAttempts)}`}
                icon={<CheckCircle2 size={17} />}
              />

              <MetricCard
                label="Сақталған сабақтар"
                value={formatNumber(snapshot.totals.savedLessons)}
                icon={<Star size={17} />}
              />

              <MetricCard
                label="Кейін қайталау"
                value={formatNumber(snapshot.totals.reviewLaterItems)}
                icon={<RotateCcw size={17} />}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_470px]">
              <div className="space-y-5">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Қайталау ұсыныстары</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Бірінші орындауға болатын нақты оқу әрекеттері.
                        </p>
                      </div>

                      <StatusBadge
                        tone={snapshot.recommendations.length ? 'warning' : 'success'}
                      >
                        {snapshot.recommendations.length}
                      </StatusBadge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {snapshot.recommendations.length === 0 ? (
                      <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
                        Қазір нақты қайталау ұсынысы жоқ. Оқуды жоспар бойынша жалғастыруға болады.
                      </div>
                    ) : (
                      snapshot.recommendations.slice(0, 6).map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border bg-background p-4 transition-all hover:border-primary/25 hover:bg-primary/5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{item.title}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {item.description}
                              </p>
                            </div>

                            <StatusBadge tone={getPriorityTone(item.priority)}>
                              {getPriorityLabel(item.priority)}
                            </StatusBadge>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Қайталау керек сабақтар</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Mini quiz нәтижесі және кейін қайталау белгісі бойынша.
                        </p>
                      </div>

                      <StatusBadge
                        tone={snapshot.weakLessons.length ? 'warning' : 'success'}
                      >
                        {snapshot.weakLessons.length}
                      </StatusBadge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {snapshot.weakLessons.length === 0 ? (
                      <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
                        Қазір айқын қиын сабақ байқалмайды.
                      </div>
                    ) : (
                      snapshot.weakLessons.slice(0, 6).map((lesson) => (
                        <div
                          key={lesson.lessonId}
                          className="rounded-2xl border bg-background p-4 transition-all hover:border-primary/25 hover:bg-primary/5"
                        >
                          <p className="text-sm font-semibold">{lesson.lessonTitle}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {lesson.reason}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <StatusBadge tone={getScoreTone(lesson.miniQuizAvgScore)}>
                              Нәтиже: {formatPercent(lesson.miniQuizAvgScore)}
                            </StatusBadge>

                            {lesson.failedAttempts > 0 ? (
                              <StatusBadge tone="danger">
                                Қайта тапсыру керек: {lesson.failedAttempts}
                              </StatusBadge>
                            ) : null}

                            {lesson.reviewLater ? (
                              <StatusBadge tone="warning">Кейін қайталау</StatusBadge>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="xl:sticky xl:top-6 xl:self-start">
                <AiPromptShell
                  title="AI Tracker сұрағы"
                  description="AI осы беттегі оқу snapshot-ты ғана қолданып, түсінікті оқу жоспарын дайындайды."
                  placeholder="Мысалы: Маған бүгін қай тақырыпты қайталау керек?"
                  suggestions={STUDENT_AI_TRACKER_PROMPTS}
                  contextLabel="Сіздің оқу snapshot-ыңыз"
                  contextDescription="Context ретінде progress, аяқталған сабақтар, mini quiz нәтижелері, сақталған сабақтар және кейін қайталау белгілері қолданылады."
                  disabled={false}
                  isSubmitting={trackerAi.isSubmitting}
                  answer={trackerAi.answer}
                  error={trackerAi.error}
                  onSubmit={trackerAi.submit}
                  answerTitle="AI Tracker жауабы"
                  emptyAnswerText={
                    trackerAi.isConfigured
                      ? 'Жылдам prompt таңдаңыз немесе өз сұрағыңызды жазыңыз. AI ұсыныс осы panel ішінде пайда болады.'
                      : 'AI backend әлі қосылмаған. Frontend env ішінде VITE_AI_API_BASE_URL көрсетілгенде нақты жауап осы жерге шығады.'
                  }
                />
              </div>
            </div>
          </>
        ) : null}

        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 size={16} />
              Қолданылатын деректер
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border bg-background p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <BookOpen size={14} />
                Progress
              </p>
              <p className="mt-1">Аяқталған сабақтар және курс progress-і</p>
            </div>

            <div className="rounded-2xl border bg-background p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <CheckCircle2 size={14} />
                Mini quiz
              </p>
              <p className="mt-1">Mini quiz нәтижелері және қайта тапсыру белгілері</p>
            </div>

            <div className="rounded-2xl border bg-background p-4">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <RotateCcw size={14} />
                Қайталау
              </p>
              <p className="mt-1">Сақталған сабақтар және кейін қайталау белгілері</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
