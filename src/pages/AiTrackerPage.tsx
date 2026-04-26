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

function normalizePrompt(value: string) {
  return value
    .toLowerCase()
    .replace(/[?.,!;:()[\]{}"'`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function shouldUseStudentCourseAdvisor(prompt: string) {
  const normalized = normalizePrompt(prompt);

  const directCourseAdvisorPhrases = [
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
  ];

  if (includesAny(normalized, directCourseAdvisorPhrases)) {
    return true;
  }

  const courseOrFutureIntent = includesAny(normalized, [
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
  ]);

  const advisorActionIntent = includesAny(normalized, [
    'қандай',
    'қай',
    'ұсын',
    'таңда',
    'болады',
    'керек',
    'жақсы',
    'тиімді',
  ]);

  const strongAnalysisIntent = includesAny(normalized, [
    'progress',
    'прогресс',
    'нәтиже',
    'mini quiz',
    'мини quiz',
    'тест',
    'қайталау',
    'сабақ',
    'тақырып',
    'неден бастайын',
    'қиын',
    'әлсіз',
    'түсінбей',
  ]);

  if (strongAnalysisIntent && !courseOrFutureIntent) {
    return false;
  }

  return courseOrFutureIntent && advisorActionIntent;
}

function getAnswerTitle(mode: TrackerMode) {
  if (mode === 'student_course_advisor') {
    return 'Курс бойынша AI кеңес';
  }

  return 'AI Tracker жауабы';
}

export default function AiTrackerPage() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<TrackerMode>('student_tracker');

  const trackerAi = useLearningAiAnalysis({
    mode: 'student_tracker',
    role: 'student',
    scope: {
      studentId: user?.id || null,
    },
  });

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      const nextMode: TrackerMode = shouldUseStudentCourseAdvisor(payload.prompt)
        ? 'student_course_advisor'
        : 'student_tracker';

      setActiveMode(nextMode);

      await trackerAi.submit(payload, {
        mode: nextMode,
        role: 'student',
        scope: {
          studentId: user?.id || null,
        },
      });
    },
    [trackerAi, user?.id]
  );

  const handleReset = useCallback(() => {
    setActiveMode('student_tracker');
    trackerAi.reset();
  }, [trackerAi]);

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

        {user ? (
          <AiPromptShell
            title="AI Tracker"
            description="Сұрағыңызды жазыңыз. AI оқу дерегіне сүйеніп қысқа әрі нақты жауап береді."
            placeholder="Мысалы: Қай тақырыпты қайталауым керек?"
            suggestions={[]}
            contextLabel="AI чат"
            contextDescription=""
            disabled={!trackerAi.isConfigured}
            disabledReason="AI backend endpoint әлі қосылмаған."
            isSubmitting={trackerAi.isSubmitting}
            answer={trackerAi.answer}
            error={trackerAi.error}
            onSubmit={handleSubmit}
            answerTitle={getAnswerTitle(activeMode)}
            emptyAnswerText="Оқу анализі, курс таңдау немесе болашақ бағыт туралы сұрағыңызды жазыңыз."
            contextSummary={null}
            warnings={[]}
            followUpPrompts={[]}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}