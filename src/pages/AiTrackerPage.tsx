import { BrainCircuit, RotateCcw, Sparkles } from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import AiPromptShell from '@/components/ai-tools/AiPromptShell';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import { useStudentLearningSnapshot } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

type StudentLearningSnapshotLike = {
  totals?: {
    enrolledCourses?: number | null;
    totalLessons?: number | null;
    completedLessons?: number | null;
    miniQuizAttempts?: number | null;
    testAttempts?: number | null;
    savedLessons?: number | null;
    reviewLaterItems?: number | null;
  } | null;
  weakLessons?: unknown[] | null;
};

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function hasUsableLearningData(snapshot: StudentLearningSnapshotLike | null | undefined) {
  if (!snapshot) return false;

  const totals = snapshot.totals || {};
  const weakLessons = Array.isArray(snapshot.weakLessons) ? snapshot.weakLessons : [];

  return (
    toNumber(totals.enrolledCourses) > 0 ||
    toNumber(totals.totalLessons) > 0 ||
    toNumber(totals.completedLessons) > 0 ||
    toNumber(totals.miniQuizAttempts) > 0 ||
    toNumber(totals.testAttempts) > 0 ||
    toNumber(totals.savedLessons) > 0 ||
    toNumber(totals.reviewLaterItems) > 0 ||
    weakLessons.length > 0
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

  const hasLearningData = hasUsableLearningData(snapshot);

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
          description="Оқу деректеріңізге сүйеніп жауап беретін жеке AI чат."
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
            text="AI Tracker жеке жауап беруі үшін алдымен курсқа тіркелу, сабақ оқу немесе тест/mini quiz нәтижесі керек."
          />
        ) : null}

        {user && !isLoading && !error && snapshot && !hasLearningData ? (
          <EmptyState
            title="AI Tracker әлі жеке талдау бере алмайды"
            text="Бұл аккаунтта әзірге курс, сабақ progress-і, тест немесе mini quiz нәтижесі табылмады. Сондықтан AI нақты оқу жоспарын ойдан құрмайды."
            action={
              <Button type="button" variant="outline" asChild>
                <a href="/courses">Курстарды қарау</a>
              </Button>
            }
          />
        ) : null}

        {user && !isLoading && !error && snapshot && hasLearningData ? (
          <AiPromptShell
            title="AI Tracker"
            description="Сұрағыңызды жазыңыз. AI тек бар оқу context-іне сүйеніп жауап береді."
            placeholder="Сұрағыңызды жазыңыз..."
            suggestions={[]}
            contextLabel="Оқу context"
            contextDescription=""
            disabled={false}
            isSubmitting={trackerAi.isSubmitting}
            answer={trackerAi.answer}
            error={trackerAi.error}
            onSubmit={trackerAi.submit}
            answerTitle="AI Tracker жауабы"
            emptyAnswerText="Мысал сұрақтар көрсетілмейді. Өзіңіздің нақты сұрағыңызды жазыңыз."
            contextSummary={null}
            warnings={[]}
            followUpPrompts={[]}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}