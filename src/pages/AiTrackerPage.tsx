import { useCallback, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  Compass,
  GraduationCap,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import AiPromptShell, {
  type AiPromptSubmitPayload,
} from '@/components/ai-tools/AiPromptShell';
import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState } from '@/components/common/DataState';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    return 'Course Advisor жауабы';
  }

  return 'AI Tracker жауабы';
}

function getModeLabel(mode: TrackerMode) {
  if (mode === 'student_course_advisor') {
    return 'Course Advisor';
  }

  return 'Learning Tracker';
}

function getModeDescription(mode: TrackerMode) {
  if (mode === 'student_course_advisor') {
    return 'Курс, болашақ бағыт, не оқу керек, қандай тақырыптан бастау керек деген сұрақтарға кеңес береді.';
  }

  return 'Оқу нәтижесі, progress, қиын тақырып, қайталау және келесі нақты оқу қадамы туралы жауап береді.';
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
      const useCourseAdvisor = shouldUseStudentCourseAdvisor(payload.prompt);
      const nextMode: TrackerMode = useCourseAdvisor
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
          description="Оқу нәтижесі, қайталау бағыты және болашақ курс таңдауы туралы сұрақ қоя алатын жеке AI чат."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
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
            tone="ai"
          />
        ) : null}

        {user ? (
          <>
            <Card className="overflow-hidden border-ai-border/70 bg-card/95 shadow-soft">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="ai">
                        <BrainCircuit size={12} />
                        Chat-first tracker
                      </StatusBadge>

                      <StatusBadge
                        tone={
                          activeMode === 'student_course_advisor'
                            ? 'primary'
                            : 'secondary'
                        }
                      >
                        <Compass size={12} />
                        {getModeLabel(activeMode)}
                      </StatusBadge>

                      <StatusBadge tone="muted">
                        <GraduationCap size={12} />
                        Оқушы режимі
                      </StatusBadge>
                    </div>

                    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                      Бұл бет analytics dashboard емес. Мұнда негізгі жұмыс чат
                      арқылы жүреді. Егер оқу дерегі аз болса, AI оны ашық айтып,
                      қандай дерек керек екенін түсіндіреді.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-soft/70 px-3 py-2 text-xs text-muted-foreground">
                    Режим:{' '}
                    <span className="font-semibold text-foreground">
                      {getModeLabel(activeMode)}
                    </span>
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-surface-soft/55 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-inner-soft">
                      {activeMode === 'student_course_advisor' ? (
                        <Compass size={17} />
                      ) : (
                        <BookOpen size={17} />
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Қазіргі жауап логикасы
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {getModeDescription(activeMode)}
                      </p>
                    </div>
                  </div>
                </div>

                {!trackerAi.isConfigured ? (
                  <div className="rounded-3xl border border-warning-muted bg-warning-soft/70 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-warning-muted bg-card text-warning-foreground shadow-inner-soft">
                        <Sparkles size={17} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          AI backend қосылмаған
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Frontend env ішінде AI backend URL көрсетілмесе, чат
                          сұранысы жіберілмейді.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <AiPromptShell
              title="AI Tracker"
              description="Сұрағыңызды жазыңыз. AI оқу дерегі болса анализ жасайды, ал курс немесе болашақ бағыт туралы сұраса Course Advisor ретінде жауап береді."
              placeholder="Мысалы: Болашақта қандай курс оқысам болады?"
              suggestions={[]}
              contextLabel={getModeLabel(activeMode)}
              contextDescription=""
              disabled={!trackerAi.isConfigured}
              disabledReason="AI backend endpoint әлі қосылмаған."
              isSubmitting={trackerAi.isSubmitting}
              answer={trackerAi.answer}
              error={trackerAi.error}
              onSubmit={handleSubmit}
              answerTitle={getAnswerTitle(activeMode)}
              emptyAnswerText="Мысал сұрақтар көрсетілмейді. Оқу анализі, курс таңдау немесе болашақ бағыт туралы сұрағыңызды өзіңіз жазыңыз."
              contextSummary={null}
              warnings={[]}
              followUpPrompts={[]}
            />
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}