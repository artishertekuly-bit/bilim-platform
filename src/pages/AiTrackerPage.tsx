import { useCallback, useState } from 'react';
import { BrainCircuit, RotateCcw, Sparkles } from 'lucide-react';

import AiPromptShell, {
  type AiPromptSubmitPayload,
} from '@/components/ai-tools/AiPromptShell';
import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState } from '@/components/common/DataState';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import { useAuth } from '@/lib/auth-context';

type TrackerMode = 'student_tracker' | 'student_course_advisor';

type LearningAiAnalysisMeta = {
  contextSummary?: string | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  warnings?: string[];
  followUpPrompts?: string[];
};

const COURSE_ADVISOR_DIRECT_PHRASES = [
  'қандай курс',
  'қай курс',
  'курс оқысам',
  'курсты оқысам',
  'қандай курсты',
  'қай курсты',
  'курс таңда',
  'курсты таңда',
  'маған курс',
  'курс ұсын',
  'курстар ұсын',
  'болашақта қандай',
  'болашақта не',
  'қай бағыт',
  'қандай бағыт',
  'бағыт таңда',
  'мамандық таңда',
  'не оқысам болады',
  'нені оқысам болады',
  'не үйренсем болады',
  'нені үйренсем болады',
  'career',
  'карьера',
] as const;

const COURSE_OR_FUTURE_KEYWORDS = [
  'курс',
  'курстар',
  'бағыт',
  'мамандық',
  'болашақ',
  'career',
  'карьера',
  'үйрен',
  'оқысам',
  'таңда',
] as const;

const ADVISOR_ACTION_KEYWORDS = [
  'қандай',
  'қай',
  'ұсын',
  'таңда',
  'болады',
  'керек',
  'жақсы',
  'тиімді',
] as const;

const LEARNING_ANALYSIS_KEYWORDS = [
  'progress',
  'прогресс',
  'нәтиже',
  'mini quiz',
  'мини quiz',
  'мини тест',
  'тест',
  'қайталау',
  'қайталауым',
  'сабақ',
  'сабағым',
  'тақырып',
  'неден бастайын',
  'неден бастау',
  'қиын',
  'әлсіз',
  'түсінбей',
  'түсінбедім',
  'оқу жоспар',
  'жоспар құр',
] as const;

function normalizePrompt(value: string) {
  return value
    .toLowerCase()
    .replace(/[?.,!;:()[\]{}"'`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, keywords: readonly string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function shouldUseStudentCourseAdvisor(prompt: string) {
  const normalized = normalizePrompt(prompt);

  if (!normalized) {
    return false;
  }

  if (includesAny(normalized, COURSE_ADVISOR_DIRECT_PHRASES)) {
    return true;
  }

  const hasLearningAnalysisIntent = includesAny(
    normalized,
    LEARNING_ANALYSIS_KEYWORDS
  );

  if (hasLearningAnalysisIntent) {
    return false;
  }

  const hasCourseOrFutureIntent = includesAny(
    normalized,
    COURSE_OR_FUTURE_KEYWORDS
  );

  const hasAdvisorActionIntent = includesAny(
    normalized,
    ADVISOR_ACTION_KEYWORDS
  );

  return hasCourseOrFutureIntent && hasAdvisorActionIntent;
}

function getAnswerTitle(mode: TrackerMode) {
  if (mode === 'student_course_advisor') {
    return 'Курс бойынша AI кеңес';
  }

  return 'AI Tracker жауабы';
}

function getEmptyAnswerText(mode: TrackerMode) {
  if (mode === 'student_course_advisor') {
    return 'Қандай курс немесе бағыт таңдауға болатынын сұраңыз.';
  }

  return 'Оқу анализі, қайталау жоспары немесе қиын тақырып туралы сұрағыңызды жазыңыз.';
}

export default function AiTrackerPage() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<TrackerMode>('student_tracker');

  const isStudent = user?.role === 'student';
  const canUseAiTracker = Boolean(user?.id && isStudent);

  const trackerAi = useLearningAiAnalysis({
    mode: 'student_tracker',
    role: 'student',
    scope: user?.id
      ? {
          studentId: user.id,
        }
      : undefined,
  });

  const trackerAiMeta = trackerAi as typeof trackerAi & LearningAiAnalysisMeta;

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      if (!user?.id || !isStudent) {
        return;
      }

      const nextMode: TrackerMode = shouldUseStudentCourseAdvisor(payload.prompt)
        ? 'student_course_advisor'
        : 'student_tracker';

      setActiveMode(nextMode);

      await trackerAi.submit(payload, {
        mode: nextMode,
        role: 'student',
        scope: {
          studentId: user.id,
        },
      });
    },
    [isStudent, trackerAi, user?.id]
  );

  const handleReset = useCallback(() => {
    setActiveMode('student_tracker');
    trackerAi.reset();
  }, [trackerAi]);

  const disabledReason = !trackerAi.isConfigured
    ? 'AI backend endpoint әлі қосылмаған.'
    : !canUseAiTracker
      ? 'AI Tracker тек оқушы аккаунты үшін қолжетімді.'
      : undefined;

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
          description="Оқу анализі, қайталау жоспары немесе курс бағыты бойынша сұрақ қойыңыз."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={trackerAi.isSubmitting}
            >
              <RotateCcw size={15} className="mr-2" />
              Тазалау
            </Button>
          }
        />

        {!user ? (
          <EmptyState
            title="Аккаунт анықталмады"
            text="AI Tracker қолдану үшін жүйеге кіру керек."
            tone="ai"
          />
        ) : null}

        {user && !isStudent ? (
          <EmptyState
            title="Бұл бет оқушы режиміне арналған"
            text="Мұғалім үшін AI Assistant немесе AI Tracker-дің мұғалімге арналған бөлімін қолданыңыз."
            tone="ai"
          />
        ) : null}

        {user ? (
          <AiPromptShell
            title="AI Tracker"
            description="Сұрағыңызды жазыңыз. AI оқу дерегіне немесе курс каталогына сүйеніп қысқа әрі нақты жауап береді."
            placeholder="Мысалы: Қай тақырыпты қайталауым керек?"
            suggestions={[]}
            contextLabel="AI чат"
            contextDescription="Оқу progress-і туралы сұрасаңыз — AI Tracker, курс/бағыт таңдауды сұрасаңыз — Course Advisor режимі автоматты қолданылады."
            disabled={Boolean(disabledReason)}
            disabledReason={disabledReason}
            isSubmitting={trackerAi.isSubmitting}
            answer={trackerAi.answer}
            error={trackerAi.error}
            onSubmit={handleSubmit}
            answerTitle={getAnswerTitle(activeMode)}
            emptyAnswerText={getEmptyAnswerText(activeMode)}
            contextSummary={trackerAiMeta.contextSummary ?? null}
            warnings={trackerAiMeta.warnings ?? []}
            followUpPrompts={trackerAiMeta.followUpPrompts ?? []}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
