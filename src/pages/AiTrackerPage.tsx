import {
  BookOpen,
  BrainCircuit,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
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
    label: 'Бүгін неден бастаймын?',
    prompt:
      'Менің оқу жағдайымды түсіндіріп, бүгін неден бастауым керек екенін қысқа әрі нақты айтып бер.',
  },
  {
    id: 'focus-topic',
    label: 'Қай тақырыпқа көңіл бөлемін?',
    prompt:
      'Қазір қай тақырыпқа көбірек көңіл бөлген дұрыс екенін түсіндір және неге солай екенін қысқа айт.',
  },
  {
    id: 'three-day-plan',
    label: '3 күндік жоспар',
    prompt:
      'Оқу жағдайыма сүйеніп, маған жеңіл әрі орындауға болатын 3 күндік оқу жоспарын жасап бер.',
  },
  {
    id: 'simple-explain',
    label: 'Жеңіл түсіндір',
    prompt:
      'Маған қиын болып тұрған тақырыптарды қарапайым тілмен түсіндіріп, неден бастау керек екенін айт.',
  },
  {
    id: 'motivation-next-step',
    label: 'Келесі қадам',
    prompt:
      'Маған қазір ең тиімді келесі оқу қадамын ұсын. Жауапты қысқа, түсінікті және нақты қылып бер.',
  },
];

function getPriorityTone(priority: Priority) {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'success';
}

function getPriorityLabel(priority: Priority) {
  const map: Record<Priority, string> = {
    low: 'Жоспарлы қайталау',
    medium: 'Назар аудару',
    high: 'Бірінші қарау',
  };

  return map[priority];
}

function getSoftFocusLabel(priority?: Priority | null) {
  if (priority === 'high') return 'Бірінші назар керек';
  if (priority === 'medium') return 'Қайталау пайдалы';
  if (priority === 'low') return 'Жоспар бойынша';
  return 'AI context дайын';
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
    'Қазір айқын шұғыл қиындық байқалмайды. AI-дан бүгінгі оқу қадамын сұрап, қысқа жоспармен жалғастыруға болады.';

  const focusPriority = topRecommendation?.priority as Priority | undefined;

  const activeWarnings = trackerAi.lastResponse?.warnings || [];
  const activeFollowUpPrompts = trackerAi.lastResponse?.followUpPrompts || [];

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              AI құралдар
            </>
          }
          icon={<BrainCircuit size={20} />}
          title="AI Tracker"
          description="Оқу деректерін есеп ретінде емес, түсінікті кеңес пен келесі қадамға айналдыратын жеке AI көмекші."
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

        {user && isLoading ? <LoadingState text="Оқу context жүктелуде..." /> : null}

        {user && !isLoading && error ? (
          <ErrorState
            text="AI Tracker үшін оқу context-ін жүктеу мүмкін болмады."
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
            title="Оқу context әзірге жоқ"
            text="Курсқа тіркеліп, сабақтар мен mini quiz нәтижелері пайда болғаннан кейін AI Tracker жеке оқу бағытын ұсына алады."
          />
        ) : null}

        {user && !isLoading && !error && snapshot ? (
          <>
            <Card className="border-primary/10 bg-card/95 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={focusPriority ? getPriorityTone(focusPriority) : 'success'}>
                        {getSoftFocusLabel(focusPriority)}
                      </StatusBadge>
                      <StatusBadge tone="primary">Оқу context дайын</StatusBadge>
                      <StatusBadge tone="muted">Жасырын бақылау жоқ</StatusBadge>
                    </div>

                    <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                      {focusTitle}
                    </h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                      {focusDescription}
                    </p>
                  </div>

                  <div className="rounded-2xl border bg-background px-4 py-3 text-xs leading-5 text-muted-foreground xl:max-w-sm">
                    AI оқу деректерін ішкі талдау үшін қолданады. Негізгі мақсат — барлық көрсеткішті тізу емес, сізге түсінікті бағыт пен келесі әрекетті ұсыну.
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <AiPromptShell
                title="AI Tracker"
                description="Сұрақ қойыңыз. AI оқу context-іңізді ішкі талдап, тек сұрағыңызға байланысты қысқа түсіндірме және нақты next step береді."
                placeholder="Мысалы: Бүгін неден бастайын? Қай тақырыпты бірінші қайталаймын?"
                suggestions={STUDENT_AI_TRACKER_PROMPTS}
                contextLabel="Оқу context"
                contextDescription="AI progress, mini quiz, сақталған сабақтар және кейін қайталау белгілерін ішкі талдау ретінде қолданады, бірақ барлық сандық analytics-ті жауапта тізіп шықпайды."
                disabled={false}
                isSubmitting={trackerAi.isSubmitting}
                answer={trackerAi.answer}
                error={trackerAi.error}
                onSubmit={trackerAi.submit}
                answerTitle="AI Tracker жауабы"
                emptyAnswerText={
                  trackerAi.isConfigured
                    ? 'Дайын prompt таңдаңыз немесе өз сұрағыңызды жазыңыз. AI жауапты осы жерде береді.'
                    : 'AI backend әлі қосылмаған. Frontend env ішінде VITE_AI_API_BASE_URL көрсетілгенде нақты жауап осы жерде шығады.'
                }
                contextSummary={null}
                warnings={activeWarnings}
                followUpPrompts={activeFollowUpPrompts}
              />

              <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageCircle size={16} />
                      Бұл бет қалай жұмыс істейді
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs leading-5 text-muted-foreground">
                    <div className="rounded-2xl border bg-background p-3">
                      <p className="font-medium text-foreground">AI талдайды</p>
                      <p className="mt-1">
                        Оқу нәтижелері ішкі context ретінде қолданылады.
                      </p>
                    </div>

                    <div className="rounded-2xl border bg-background p-3">
                      <p className="font-medium text-foreground">Сіз шешесіз</p>
                      <p className="mt-1">
                        AI бағыт береді, бірақ қандай жоспармен оқу керегін сіз таңдайсыз.
                      </p>
                    </div>

                    <div className="rounded-2xl border bg-background p-3">
                      <p className="font-medium text-foreground">Артық есеп жоқ</p>
                      <p className="mt-1">
                        Сандық көрсеткіштер негізгі экранға шығарылмайды, тек жауапты нақтылау үшін қолданылады.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Star size={16} />
                      Бірінші фокус
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border bg-background p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={focusPriority ? getPriorityTone(focusPriority) : 'success'}>
                          {focusPriority ? getPriorityLabel(focusPriority) : 'Жоспар бойынша'}
                        </StatusBadge>
                      </div>

                      <p className="mt-3 text-sm font-semibold leading-5">
                        {focusTitle}
                      </p>
                      <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">
                        {focusDescription}
                      </p>
                    </div>

                    <p className="text-xs leading-5 text-muted-foreground">
                      Толық талдауды көру үшін чатқа нақты сұрақ қойыңыз. AI жауапта тек қажет insight пен әрекет қадамын береді.
                    </p>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BookOpen size={16} />
                      Қайталау бағыты
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {snapshot.weakLessons.length === 0 ? (
                      <div className="rounded-2xl border border-dashed bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                        Қазір айқын қайталау бағыты байқалмайды. AI-дан бүгінгі оқу жоспарын сұрауға болады.
                      </div>
                    ) : (
                      snapshot.weakLessons.slice(0, 2).map((lesson) => (
                        <div key={lesson.lessonId} className="rounded-2xl border bg-background p-3">
                          <p className="text-sm font-semibold leading-5">
                            {lesson.lessonTitle}
                          </p>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                            {lesson.reason}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-primary/10 bg-card/90 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck size={16} />
                      Қауіпсіздік
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs leading-5 text-muted-foreground">
                    <p>
                      AI тек оқу нәтижелеріне сүйенеді және жасырын behavior tracking қолданбайды.
                    </p>
                    <div className="rounded-2xl border bg-background p-3">
                      Бұл көмекші сізге бағыт ұсынады. Соңғы оқу шешімі сізде қалады.
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}