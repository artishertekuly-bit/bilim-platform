import { useCallback } from 'react';
import { BrainCircuit, RotateCcw, Sparkles } from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/DataState';
import AiPromptShell, {
  type AiPromptSubmitPayload,
} from '@/components/ai-tools/AiPromptShell';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

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

function getAnswerTitle(mode: string | undefined) {
  if (mode === 'student_course_advisor') {
    return 'Course Advisor жауабы';
  }

  return 'AI Tracker жауабы';
}

export default function AiTrackerPage() {
  const { user } = useAuth();

  const trackerAi = useLearningAiAnalysis({
    mode: 'student_tracker',
    role: 'student',
    scope: {
      studentId: user?.id || null,
    },
  });

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      const useCourseAdvisor = shouldUseStudentCourseAdvisor(payload.prompt);

      await trackerAi.submit(payload, {
        mode: useCourseAdvisor ? 'student_course_advisor' : 'student_tracker',
        role: 'student',
        scope: {
          studentId: user?.id || null,
        },
      });
    },
    [trackerAi.submit, user?.id]
  );

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
          description="Оқу анализі мен болашақ курс бағытын сұрай алатын жеке AI чат."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={trackerAi.reset}
              disabled={trackerAi.isSubmitting}
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

        {user ? (
          <AiPromptShell
            title="AI Tracker"
            description="Сұрағыңызды жазыңыз. AI оқу дерегі болса анализ жасайды, ал курс немесе болашақ бағыт туралы сұраса Course Advisor ретінде жауап береді."
            placeholder="Сұрағыңызды жазыңыз..."
            suggestions={[]}
            contextLabel="AI чат"
            contextDescription=""
            disabled={false}
            isSubmitting={trackerAi.isSubmitting}
            answer={trackerAi.answer}
            error={trackerAi.error}
            onSubmit={handleSubmit}
            answerTitle={getAnswerTitle(trackerAi.lastRequest?.mode)}
            emptyAnswerText="Мысал сұрақтар көрсетілмейді. Оқу анализі, курс таңдау немесе болашақ бағыт туралы сұрағыңызды өзіңіз жазыңыз."
            contextSummary={null}
            warnings={[]}
            followUpPrompts={[]}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}