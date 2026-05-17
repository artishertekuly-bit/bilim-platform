import { useCallback, useMemo, useState } from 'react';
import { BrainCircuit, RotateCcw, Sparkles } from 'lucide-react';

import AiPromptShell, {
  type AiConversationMessage,
  type AiPromptSubmitPayload,
  type AiPromptSuggestion,
} from '@/components/ai-tools/AiPromptShell';
import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState } from '@/components/common/DataState';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import { useAuth } from '@/lib/auth-context';
import { limitText, removeNullCharacters } from '@/lib/utils';

type TrackerMode = 'student_tracker' | 'student_course_advisor';

type LearningAiAnalysisMeta = {
  contextSummary?: string | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  warnings?: string[];
  followUpPrompts?: string[];
};

const TRACKER_SUGGESTIONS: AiPromptSuggestion[] = [
  {
    id: 'tracker-review-topic',
    label: 'Қайталау',
    prompt: 'Қай тақырыпты қайталауым керек?',
  },
  {
    id: 'tracker-study-plan',
    label: 'Оқу жоспары',
    prompt: 'Маған қысқа оқу жоспарын құр.',
  },
  {
    id: 'tracker-weak-topic',
    label: 'Әлсіз тұс',
    prompt: 'Менің әлсіз тақырыптарымды түсіндір.',
  },
];

const COURSE_ADVISOR_SUGGESTIONS: AiPromptSuggestion[] = [
  {
    id: 'advisor-course',
    label: 'Курс таңдау',
    prompt: 'Маған қандай курс оқуға болады?',
  },
  {
    id: 'advisor-direction',
    label: 'Бағыт',
    prompt: 'Маған қандай оқу бағытын таңдаған дұрыс?',
  },
  {
    id: 'advisor-next-skill',
    label: 'Келесі дағды',
    prompt: 'Келесі қандай дағдыны үйренген дұрыс?',
  },
];

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
  'ілгерілеу',
  'нәтиже',
  'mini quiz',
  'мини quiz',
  'мини тест',
  'шағын тест',
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

const MAX_ID_CHARS = 180;
const MAX_PROMPT_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_CHARS = 6_000;
const MAX_SUGGESTION_ID_CHARS = 120;
const MAX_SUGGESTION_LABEL_CHARS = 80;
const MAX_SUGGESTION_PROMPT_CHARS = 600;
const MAX_ANSWER_CHARS = 20_000;
const MAX_ERROR_CHARS = 1_000;
const MAX_CONTEXT_CHARS = 2_000;
const MAX_WARNING_CHARS = 500;
const MAX_FOLLOW_UP_CHARS = 500;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit?: number): string {
  const normalized = cleanRawText(value).replace(/\s+/g, ' ').trim();

  return typeof limit === 'number' ? limitText(normalized, limit) : normalized;
}

function cleanMultilineText(value: unknown, limit?: number): string {
  const normalized = cleanRawText(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return typeof limit === 'number' ? limitText(normalized, limit) : normalized;
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeUiText(value: unknown, limit: number): string {
  return cleanMultilineText(value, limit).replace(/\bAI\b/g, 'ЖИ');
}

function normalizePrompt(value: unknown): string {
  return cleanText(value, MAX_PROMPT_CHARS)
    .toLowerCase()
    .replace(/[?.,!;:()[\]{}"'`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function shouldUseStudentCourseAdvisor(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);

  if (!normalized) {
    return false;
  }

  if (includesAny(normalized, COURSE_ADVISOR_DIRECT_PHRASES)) {
    return true;
  }

  if (includesAny(normalized, LEARNING_ANALYSIS_KEYWORDS)) {
    return false;
  }

  const hasCourseOrFutureIntent = includesAny(
    normalized,
    COURSE_OR_FUTURE_KEYWORDS,
  );

  const hasAdvisorActionIntent = includesAny(
    normalized,
    ADVISOR_ACTION_KEYWORDS,
  );

  return hasCourseOrFutureIntent && hasAdvisorActionIntent;
}

function normalizeSuggestion(
  suggestion: AiPromptSuggestion,
): AiPromptSuggestion | null {
  const id = cleanText(suggestion.id, MAX_SUGGESTION_ID_CHARS);
  const label = cleanText(suggestion.label, MAX_SUGGESTION_LABEL_CHARS);
  const prompt = cleanMultilineText(suggestion.prompt, MAX_SUGGESTION_PROMPT_CHARS);

  if (!id || !label || !prompt) {
    return null;
  }

  return {
    ...suggestion,
    id,
    label,
    prompt,
  };
}

function normalizeSuggestions(suggestions: AiPromptSuggestion[]) {
  return suggestions
    .map(normalizeSuggestion)
    .filter((suggestion): suggestion is AiPromptSuggestion => Boolean(suggestion));
}

function normalizeSubmitPayload(
  payload: AiPromptSubmitPayload,
): AiPromptSubmitPayload {
  const conversationHistory: AiConversationMessage[] = Array.isArray(
    payload.conversationHistory,
  )
    ? payload.conversationHistory
        .slice(-MAX_HISTORY_MESSAGES)
        .map(
          (message): AiConversationMessage => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: cleanMultilineText(
              message.content,
              MAX_HISTORY_MESSAGE_CHARS,
            ),
          }),
        )
        .filter((message) => message.content.length > 0)
    : [];

  return {
    prompt: cleanMultilineText(payload.prompt, MAX_PROMPT_CHARS),
    selectedSuggestionId: payload.selectedSuggestionId
      ? cleanText(payload.selectedSuggestionId, MAX_SUGGESTION_ID_CHARS)
      : null,
    conversationHistory,
  };
}

function getAnswerTitle(mode: TrackerMode): string {
  if (mode === 'student_course_advisor') {
    return 'Курс кеңесі';
  }

  return 'Оқу жауабы';
}

function getEmptyAnswerText(mode: TrackerMode): string {
  if (mode === 'student_course_advisor') {
    return 'Курс немесе бағыт туралы сұраңыз.';
  }

  return 'Оқу, қайталау немесе қиын тақырып туралы сұраңыз.';
}

function getPlaceholder(mode: TrackerMode): string {
  if (mode === 'student_course_advisor') {
    return 'Мысалы: Қандай курс оқуға болады?';
  }

  return 'Мысалы: Қай тақырыпты қайталауым керек?';
}

function normalizeMetaList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeUiText(item, limit))
    .filter(Boolean)
    .slice(0, 6);
}

export default function AiTrackerPage() {
  const { user } = useAuth();
  const [activeMode, setActiveMode] = useState<TrackerMode>('student_tracker');

  const safeUserId = cleanId(user?.id);
  const isStudent = user?.role === 'student';
  const canUseAiTracker = Boolean(safeUserId && isStudent);

  const trackerAi = useLearningAiAnalysis({
    mode: 'student_tracker',
    role: 'student',
    scope: safeUserId
      ? {
          studentId: safeUserId,
        }
      : undefined,
  });

  const trackerAiMeta = trackerAi as typeof trackerAi & LearningAiAnalysisMeta;

  const suggestions = useMemo(
    () =>
      normalizeSuggestions(
        activeMode === 'student_course_advisor'
          ? COURSE_ADVISOR_SUGGESTIONS
          : TRACKER_SUGGESTIONS,
      ),
    [activeMode],
  );

  const safeAnswer = useMemo(
    () => normalizeUiText(trackerAi.answer, MAX_ANSWER_CHARS),
    [trackerAi.answer],
  );

  const safeError = useMemo(
    () => normalizeUiText(trackerAi.error, MAX_ERROR_CHARS),
    [trackerAi.error],
  );

  const safeContextSummary = useMemo(() => {
    const value = normalizeUiText(trackerAiMeta.contextSummary, MAX_CONTEXT_CHARS);

    return value || null;
  }, [trackerAiMeta.contextSummary]);

  const safeWarnings = useMemo(
    () => normalizeMetaList(trackerAiMeta.warnings, MAX_WARNING_CHARS),
    [trackerAiMeta.warnings],
  );

  const safeFollowUpPrompts = useMemo(
    () => normalizeMetaList(trackerAiMeta.followUpPrompts, MAX_FOLLOW_UP_CHARS),
    [trackerAiMeta.followUpPrompts],
  );

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      if (!safeUserId || !isStudent) {
        return;
      }

      const normalizedPayload = normalizeSubmitPayload(payload);

      if (!normalizedPayload.prompt) {
        return;
      }

      const nextMode: TrackerMode = shouldUseStudentCourseAdvisor(
        normalizedPayload.prompt,
      )
        ? 'student_course_advisor'
        : 'student_tracker';

      setActiveMode(nextMode);

      await trackerAi.submit(normalizedPayload, {
        mode: nextMode,
        role: 'student',
        scope: {
          studentId: safeUserId,
        },
      });
    },
    [isStudent, safeUserId, trackerAi],
  );

  const handleReset = useCallback(() => {
    setActiveMode('student_tracker');
    trackerAi.reset();
  }, [trackerAi]);

  const disabledReason = !trackerAi.isConfigured
    ? 'ЖИ сервисі қосылмаған.'
    : !canUseAiTracker
      ? 'Бұл бөлім оқушыға арналған.'
      : undefined;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              ЖИ құралдары
            </>
          }
          icon={<BrainCircuit size={20} />}
          title="ЖИ оқу көмекшісі"
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
            text="Жүйеге кіріңіз."
            tone="ai"
          />
        ) : null}

        {user && !isStudent ? (
          <EmptyState
            title="Оқушы аккаунты қажет"
            text="Бұл бөлім оқушыға арналған."
            tone="ai"
          />
        ) : null}

        {canUseAiTracker ? (
          <AiPromptShell
            title="ЖИ оқу көмекшісі"
            description=""
            placeholder={getPlaceholder(activeMode)}
            suggestions={suggestions}
            contextLabel={
              activeMode === 'student_course_advisor'
                ? 'Курс таңдауы'
                : 'Оқу талдауы'
            }
            disabled={Boolean(disabledReason)}
            disabledReason={disabledReason}
            isSubmitting={trackerAi.isSubmitting}
            answer={safeAnswer}
            error={safeError}
            onSubmit={handleSubmit}
            answerTitle={getAnswerTitle(activeMode)}
            emptyAnswerText={getEmptyAnswerText(activeMode)}
            contextSummary={safeContextSummary}
            warnings={safeWarnings}
            followUpPrompts={safeFollowUpPrompts}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
