import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  BrainCircuit,
  CheckCircle2,
  FileCheck2,
  Loader2,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  evaluateAnswer,
  generateQuestions,
  type AiQuestionKind,
  type EvaluateAnswerResponse,
  type GenerateQuestionsResponse,
  type GeneratedQuestion,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 160;
const MAX_SUBJECT_CHARS = 120;
const MAX_TOPIC_CHARS = 200;
const MAX_SOURCE_TEXT_CHARS = 12_000;
const MAX_ANSWER_CHARS = 4_000;
const MAX_QUESTION_TEXT_CHARS = 2_000;
const MAX_OPTION_TEXT_CHARS = 500;
const MAX_EXPECTED_ANSWER_CHARS = 1_000;
const MAX_FEEDBACK_CHARS = 2_000;
const MAX_EXPLANATION_CHARS = 2_500;
const MAX_SUGGESTION_CHARS = 1_500;
const MAX_ERROR_CHARS = 700;
const MAX_PASSAGE_CHARS = 5_000;

const GENERATE_TIMEOUT_MS = 180_000;
const EVALUATE_TIMEOUT_MS = 120_000;

const QUESTION_COUNT_OPTIONS = [3, 5, 7, 10] as const;
const QUESTION_KIND_OPTIONS = ['mixed', 'multiple_choice', 'short_answer'] as const;
const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const;

type Difficulty = (typeof DIFFICULTY_OPTIONS)[number];

type AnswerMap = Record<string, string>;
type FeedbackMap = Record<string, EvaluateAnswerResponse>;

type SelectFieldProps = {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
};

function sanitizeInputValue(value: unknown, limit: number): string {
  return limitText(removeNullCharacters(String(value ?? '')), limit);
}

function cleanText(value: unknown, limit = MAX_QUESTION_TEXT_CHARS): string {
  return limitText(removeNullCharacters(String(value ?? '')).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_SOURCE_TEXT_CHARS): string {
  return limitText(
    removeNullCharacters(String(value ?? ''))
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
    limit,
  );
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeUiText(value: unknown, limit = MAX_QUESTION_TEXT_CHARS): string {
  return cleanText(value, limit)
    .replace(/\bAI\b/g, 'ЖИ')
    .replace(/\bAi\b/g, 'ЖИ')
    .trim();
}

function normalizeDifficulty(value: unknown): Difficulty {
  const normalized = cleanText(value, 40);

  return DIFFICULTY_OPTIONS.includes(normalized as Difficulty)
    ? (normalized as Difficulty)
    : 'medium';
}

function normalizeQuestionKind(value: unknown): AiQuestionKind {
  const normalized = cleanText(value, 60);

  return QUESTION_KIND_OPTIONS.includes(normalized as AiQuestionKind)
    ? (normalized as AiQuestionKind)
    : 'mixed';
}

function normalizeQuestionCount(value: unknown): (typeof QUESTION_COUNT_OPTIONS)[number] {
  const numericValue = Number(value);

  return QUESTION_COUNT_OPTIONS.includes(numericValue as (typeof QUESTION_COUNT_OPTIONS)[number])
    ? (numericValue as (typeof QUESTION_COUNT_OPTIONS)[number])
    : 5;
}

function normalizeScore(value: unknown): number | null {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return null;

  return Math.max(0, Math.round(numericValue * 10) / 10);
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  return (
    error.name === 'AbortError' ||
    message.includes('тоқтатылды') ||
    message.includes('aborted') ||
    message.includes('abort')
  );
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  if (isAbortLikeError(error)) return '';

  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function normalizeQuestionId(
  question: GeneratedQuestion,
  index: number,
  seen: Set<string>,
): string {
  const baseId = cleanId(question.id) || `practice-question-${index + 1}`;
  let id = baseId;
  let suffix = 2;

  while (seen.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  seen.add(id);

  return id;
}

function normalizePracticeQuestions(
  response: GenerateQuestionsResponse,
): GenerateQuestionsResponse {
  const seen = new Set<string>();

  const questions = (response.questions || [])
    .map((question, index) => {
      const id = normalizeQuestionId(question, index, seen);
      const options = (question.options || [])
        .map((option, optionIndex) => ({
          ...option,
          id: cleanId(option.id) || `${id}-option-${optionIndex + 1}`,
          text: cleanText(option.text, MAX_OPTION_TEXT_CHARS),
        }))
        .filter((option) => option.text.length > 0);

      const normalizedType: GeneratedQuestion['type'] =
        question.type === 'multiple_choice' && options.length >= 2
          ? 'multiple_choice'
          : 'short_answer';

      return {
        ...question,
        id,
        type: normalizedType,
        question: cleanText(question.question, MAX_QUESTION_TEXT_CHARS),
        options: normalizedType === 'multiple_choice' ? options : undefined,
        correctAnswer:
          cleanMultilineText(question.correctAnswer, MAX_EXPECTED_ANSWER_CHARS) || undefined,
        explanation:
          cleanMultilineText(question.explanation, MAX_EXPLANATION_CHARS) || undefined,
        difficulty: cleanText(question.difficulty, 60) || undefined,
        topic: cleanText(question.topic, MAX_TOPIC_CHARS) || undefined,
      } satisfies GeneratedQuestion;
    })
    .filter((question) => question.question.length > 0);

  return {
    ...response,
    questions,
    meta: response.meta
      ? {
          ...response.meta,
          passage: cleanMultilineText(response.meta.passage, MAX_PASSAGE_CHARS),
        }
      : response.meta,
  };
}

function getQuestionContext({
  question,
  sourceText,
  topic,
  subject,
  passage,
}: {
  question: GeneratedQuestion;
  sourceText: string;
  topic: string;
  subject: string;
  passage?: string;
}): string | undefined {
  const contextParts = [
    cleanMultilineText(sourceText, MAX_SOURCE_TEXT_CHARS),
    cleanMultilineText(passage, MAX_PASSAGE_CHARS),
    cleanText(question.topic, MAX_TOPIC_CHARS),
    cleanText(topic, MAX_TOPIC_CHARS),
    cleanText(subject, MAX_SUBJECT_CHARS),
  ].filter(Boolean);

  return contextParts.join('\n\n') || undefined;
}

function getFeedbackTone(feedback: EvaluateAnswerResponse): string {
  if (feedback.isCorrect === true) {
    return 'border-success-muted bg-success-soft/70 text-success-foreground';
  }

  const score = normalizeScore(feedback.score);

  if (typeof score === 'number' && score >= 6.5) {
    return 'border-primary-muted bg-primary-soft/60 text-foreground';
  }

  return 'border-warning-muted bg-warning-soft/60 text-warning-foreground';
}

function getDifficultyLabel(difficulty: Difficulty): string {
  const labels: Record<Difficulty, string> = {
    easy: 'Оңай',
    medium: 'Орташа',
    hard: 'Қиын',
  };

  return labels[difficulty];
}

function getQuestionKindLabel(kind: AiQuestionKind): string {
  const labels: Record<AiQuestionKind, string> = {
    mixed: 'Аралас',
    multiple_choice: 'Жауап нұсқалары',
    short_answer: 'Қысқа жауап',
  };

  return labels[kind] || labels.mixed;
}

function getQuestionTypeLabel(type: GeneratedQuestion['type']): string {
  return type === 'multiple_choice' ? 'Жауап нұсқалары' : 'Қысқа жауап';
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  disabled = false,
}: SelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground">
        {cleanText(label, 120)}
      </Label>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-11 w-full rounded-2xl bg-muted/40 border-0 px-4 text-sm text-foreground outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </div>
  );
}

function ProgressCell({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground">{cleanText(label, 120)}</p>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function getCleanFeedback(feedback: EvaluateAnswerResponse) {
  return {
    score: normalizeScore(feedback.score),
    maxScore: normalizeScore(feedback.maxScore),
    feedback: cleanMultilineText(feedback.feedback, MAX_FEEDBACK_CHARS),
    explanation: cleanMultilineText(feedback.explanation, MAX_EXPLANATION_CHARS),
    suggestion: cleanMultilineText(feedback.suggestion, MAX_SUGGESTION_CHARS),
  };
}

export default function AiPracticePage() {
  const { user, session } = useAuth();
  const { toast } = useToast();

  const accessToken = session?.access_token;
  const isStudent = user?.role === 'student';

  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState<(typeof QUESTION_COUNT_OPTIONS)[number]>(5);
  const [kind, setKind] = useState<AiQuestionKind>('mixed');

  const [result, setResult] = useState<GenerateQuestionsResponse | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [feedback, setFeedback] = useState<FeedbackMap>({});

  const [isGenerating, setIsGenerating] = useState(false);
  const [evaluatingQuestionId, setEvaluatingQuestionId] = useState<string | null>(
    null,
  );
  const [errorText, setErrorText] = useState('');

  const generateAbortRef = useRef<AbortController | null>(null);
  const evaluateAbortRef = useRef<AbortController | null>(null);

  const generationRequestIdRef = useRef(0);
  const evaluationRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const generatedCount = result?.questions.length || 0;
  const isAuthMissing = !accessToken;
  const generatedPassage = cleanMultilineText(result?.meta?.passage, MAX_PASSAGE_CHARS);

  const canGenerate = useMemo(() => {
    const hasTopic = cleanText(topic, MAX_TOPIC_CHARS).length > 0;
    const hasSource = cleanMultilineText(sourceText, MAX_SOURCE_TEXT_CHARS).length > 0;

    return isStudent && !isGenerating && !isAuthMissing && (hasTopic || hasSource);
  }, [isAuthMissing, isGenerating, isStudent, sourceText, topic]);

  const answeredCount = useMemo(() => {
    if (!result) return 0;

    return result.questions.filter((question) => {
      const questionId = cleanId(question.id);
      const value = answers[questionId];

      return typeof value === 'string' && cleanMultilineText(value, MAX_ANSWER_CHARS).length > 0;
    }).length;
  }, [answers, result]);

  const evaluatedCount = useMemo(() => Object.keys(feedback).length, [feedback]);

  const resetPracticeState = useCallback(() => {
    generateAbortRef.current?.abort();
    evaluateAbortRef.current?.abort();

    generateAbortRef.current = null;
    evaluateAbortRef.current = null;

    generationRequestIdRef.current += 1;
    evaluationRequestIdRef.current += 1;

    setResult(null);
    setAnswers({});
    setFeedback({});
    setEvaluatingQuestionId(null);
    setErrorText('');
    setIsGenerating(false);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      generateAbortRef.current?.abort();
      evaluateAbortRef.current?.abort();

      generateAbortRef.current = null;
      evaluateAbortRef.current = null;
    };
  }, []);

  const clearError = useCallback(() => {
    setErrorText((current) => (current ? '' : current));
  }, []);

  const handleGenerate = async () => {
    const subjectText = cleanText(subject, MAX_SUBJECT_CHARS);
    const topicText = cleanText(topic, MAX_TOPIC_CHARS);
    const source = cleanMultilineText(sourceText, MAX_SOURCE_TEXT_CHARS);

    if (!topicText && !source) {
      setErrorText('Тақырып немесе мәтін енгізіңіз.');
      return;
    }

    if (!isStudent) {
      setErrorText('Бұл бөлім оқушыға арналған.');
      return;
    }

    if (!accessToken) {
      const message = user ? 'Белсенді сессия қажет.' : 'Жүйеге кіріңіз.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    generateAbortRef.current?.abort();
    evaluateAbortRef.current?.abort();

    const requestId = generationRequestIdRef.current + 1;
    generationRequestIdRef.current = requestId;

    const abortController = new AbortController();
    generateAbortRef.current = abortController;

    setIsGenerating(true);
    setResult(null);
    setAnswers({});
    setFeedback({});
    setEvaluatingQuestionId(null);
    setErrorText('');

    try {
      const response = await generateQuestions(
        {
          sourceText: source || topicText,
          topic: topicText || undefined,
          subject: subjectText || undefined,
          difficulty,
          count,
          kind,
        },
        {
          accessToken,
          signal: abortController.signal,
          timeoutMs: GENERATE_TIMEOUT_MS,
        },
      );

      if (!mountedRef.current || generationRequestIdRef.current !== requestId) return;

      const normalizedResponse = normalizePracticeQuestions(response);
      setResult(normalizedResponse);

      toast({
        title: 'Жаттығу дайын',
        description: `${normalizedResponse.questions.length} сұрақ құрылды.`,
      });
    } catch (error) {
      if (!mountedRef.current || generationRequestIdRef.current !== requestId) return;

      const message = normalizeErrorMessage(
        error,
        'Жаттығу сұрақтарын құру мүмкін болмады.',
      );

      if (!message) return;

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current && generationRequestIdRef.current === requestId) {
        setIsGenerating(false);
      }

      if (generateAbortRef.current === abortController) {
        generateAbortRef.current = null;
      }
    }
  };

  const handleReset = () => {
    setSubject('');
    setTopic('');
    setSourceText('');
    setDifficulty('medium');
    setCount(5);
    setKind('mixed');

    resetPracticeState();
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    const cleanQuestionId = cleanId(questionId);
    const nextValue = cleanMultilineText(value, MAX_ANSWER_CHARS);

    if (!cleanQuestionId) return;

    clearError();

    setAnswers((prev) => ({
      ...prev,
      [cleanQuestionId]: nextValue,
    }));

    setFeedback((prev) => {
      if (!prev[cleanQuestionId]) return prev;

      const next = { ...prev };
      delete next[cleanQuestionId];

      return next;
    });
  };

  const handleEvaluateQuestion = async (question: GeneratedQuestion) => {
    const questionId = cleanId(question.id);
    const questionText = cleanText(question.question, MAX_QUESTION_TEXT_CHARS);
    const studentAnswer = cleanMultilineText(answers[questionId], MAX_ANSWER_CHARS);

    if (!questionId || !questionText) {
      setErrorText('Сұрақ дерегі толық емес.');
      return;
    }

    if (!studentAnswer) {
      toast({
        title: 'Жауап жоқ',
        description: 'Алдымен жауап беріңіз.',
        variant: 'destructive',
      });
      return;
    }

    if (!isStudent) {
      setErrorText('Бұл бөлім оқушыға арналған.');
      return;
    }

    if (!accessToken) {
      const message = user ? 'Белсенді сессия қажет.' : 'Жүйеге кіріңіз.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    evaluateAbortRef.current?.abort();

    const requestId = evaluationRequestIdRef.current + 1;
    evaluationRequestIdRef.current = requestId;

    const abortController = new AbortController();
    evaluateAbortRef.current = abortController;

    setEvaluatingQuestionId(questionId);
    setErrorText('');

    try {
      const response = await evaluateAnswer(
        {
          questionId,
          question: questionText,
          expectedAnswer: cleanMultilineText(question.correctAnswer, MAX_EXPECTED_ANSWER_CHARS),
          referenceAnswer: cleanMultilineText(question.explanation, MAX_EXPLANATION_CHARS),
          studentAnswer,
          context: getQuestionContext({
            question,
            sourceText,
            topic,
            subject,
            passage: generatedPassage,
          }),
          options: (question.options || [])
            .map((option) => cleanText(option.text, MAX_OPTION_TEXT_CHARS))
            .filter(Boolean),
          answerFormat: question.type === 'multiple_choice' ? 'mcq' : 'text',
        },
        {
          accessToken,
          signal: abortController.signal,
          timeoutMs: EVALUATE_TIMEOUT_MS,
        },
      );

      if (!mountedRef.current || evaluationRequestIdRef.current !== requestId) return;

      setFeedback((prev) => ({
        ...prev,
        [questionId]: response,
      }));
    } catch (error) {
      if (!mountedRef.current || evaluationRequestIdRef.current !== requestId) return;

      const message = normalizeErrorMessage(error, 'Жауапты тексеру мүмкін болмады.');

      if (!message) return;

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current && evaluationRequestIdRef.current === requestId) {
        setEvaluatingQuestionId(null);
      }

      if (evaluateAbortRef.current === abortController) {
        evaluateAbortRef.current = null;
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              ЖИ құралдары
            </>
          }
          icon={<BrainCircuit size={20} />}
          title={normalizeUiText(t('nav.ai_practice'), 120)}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/tests">
                  <FileCheck2 size={14} className="mr-2" />
                  Тесттер
                </Link>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isGenerating || Boolean(evaluatingQuestionId)}
              >
                <RefreshCcw size={14} className="mr-2" />
                Тазалау
              </Button>
            </div>
          }
        />

        {!user ? (
          <EmptyState title="Аккаунт анықталмады" text="Жүйеге кіріңіз." tone="ai" />
        ) : null}

        {user && !isStudent ? (
          <EmptyState
            title="Бұл бөлім оқушыға арналған"
            text="Оқушы аккаунтымен кіріңіз."
            tone="ai"
          />
        ) : null}

        {user && isStudent ? (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Card className="overflow-hidden shadow-xs">
                <CardHeader className="bg-card pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Sparkles size={16} className="text-primary" />
                    Жаттығу параметрлері
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="subject"
                        className="text-xs font-semibold text-foreground"
                      >
                        Пән
                      </Label>

                      <Input
                        id="subject"
                        value={subject}
                        maxLength={MAX_SUBJECT_CHARS}
                        onChange={(event) => {
                          setSubject(sanitizeInputValue(event.target.value, MAX_SUBJECT_CHARS));
                          clearError();
                        }}
                        disabled={isGenerating}
                        placeholder="Мысалы: Математика"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="topic"
                        className="text-xs font-semibold text-foreground"
                      >
                        Тақырып
                      </Label>

                      <Input
                        id="topic"
                        value={topic}
                        maxLength={MAX_TOPIC_CHARS}
                        onChange={(event) => {
                          setTopic(sanitizeInputValue(event.target.value, MAX_TOPIC_CHARS));
                          clearError();
                        }}
                        disabled={isGenerating}
                        placeholder="Мысалы: Квадрат теңдеулер"
                      />
                    </div>

                    <SelectField
                      id="difficulty"
                      label="Қиындық"
                      value={difficulty}
                      onChange={(value) => setDifficulty(normalizeDifficulty(value))}
                      disabled={isGenerating}
                    >
                      <option value="easy">Оңай</option>
                      <option value="medium">Орташа</option>
                      <option value="hard">Қиын</option>
                    </SelectField>

                    <SelectField
                      id="count"
                      label="Сұрақ саны"
                      value={count}
                      onChange={(value) => setCount(normalizeQuestionCount(value))}
                      disabled={isGenerating}
                    >
                      {QUESTION_COUNT_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </SelectField>

                    <div className="md:col-span-2">
                      <SelectField
                        id="kind"
                        label="Сұрақ түрі"
                        value={kind}
                        onChange={(value) => setKind(normalizeQuestionKind(value))}
                        disabled={isGenerating}
                      >
                        <option value="mixed">Аралас</option>
                        <option value="multiple_choice">Жауап нұсқалары</option>
                        <option value="short_answer">Қысқа жауап</option>
                      </SelectField>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="sourceText"
                      className="text-xs font-semibold text-foreground"
                    >
                      Қосымша мәтін
                    </Label>

                    <Textarea
                      id="sourceText"
                      value={sourceText}
                      maxLength={MAX_SOURCE_TEXT_CHARS}
                      onChange={(event) => {
                        setSourceText(sanitizeInputValue(event.target.value, MAX_SOURCE_TEXT_CHARS));
                        clearError();
                      }}
                      disabled={isGenerating}
                      placeholder="Қысқаша теория немесе контекст"
                      rows={6}
                    />

                    <p className="text-[11px] text-muted-foreground">
                      {sourceText.length}/{MAX_SOURCE_TEXT_CHARS}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="muted">{getDifficultyLabel(difficulty)}</StatusBadge>
                    <StatusBadge tone="ai">{getQuestionKindLabel(kind)}</StatusBadge>
                    <StatusBadge tone="info">{count} сұрақ</StatusBadge>
                  </div>

                  <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
                    {isGenerating ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Sparkles size={16} className="mr-2" />
                    )}
                    {isGenerating ? 'Құрылуда...' : 'Жаттығу құру'}
                  </Button>

                  {isAuthMissing ? (
                    <p className="rounded-2xl border border-warning-muted bg-warning-soft px-3 py-2 text-xs leading-5 text-warning-foreground">
                      Белсенді сессия қажет.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="overflow-hidden shadow-xs">
                <CardHeader className="bg-card pb-2">
                  <CardTitle className="text-base font-semibold">Оқу барысы</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <ProgressCell label="Сұрақ" value={generatedCount} />
                    <ProgressCell label="Жауап" value={answeredCount} />
                    <ProgressCell label="Тексеру" value={evaluatedCount} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {isGenerating ? <LoadingState text="Сұрақтар құрылуда..." /> : null}

            {errorText ? <ErrorState text={errorText} /> : null}

            {!isGenerating && !errorText && result && result.questions.length === 0 ? (
              <EmptyState
                title="Сұрақ жоқ"
                text="Тақырыпты нақтылап көріңіз."
              />
            ) : null}

            {!isGenerating && result && result.questions.length > 0 ? (
              <div className="space-y-4">
                {result.questions.map((question, index) => {
                  const questionId = cleanId(question.id);
                  const questionText = cleanText(question.question, MAX_QUESTION_TEXT_CHARS);
                  const currentAnswer = answers[questionId] || '';
                  const currentFeedback = feedback[questionId];
                  const cleanFeedback = currentFeedback ? getCleanFeedback(currentFeedback) : null;
                  const isEvaluating = evaluatingQuestionId === questionId;
                  const isAnyEvaluationPending = Boolean(evaluatingQuestionId);

                  return (
                    <Card key={questionId || index} className="overflow-hidden shadow-xs">
                      <CardHeader className="bg-card pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <CardTitle className="text-base font-semibold">
                            Сұрақ {index + 1}
                          </CardTitle>

                          <StatusBadge tone="muted">
                            {getQuestionTypeLabel(question.type)}
                          </StatusBadge>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <p className="text-sm leading-7 text-foreground">
                          {questionText}
                        </p>

                        {question.type === 'multiple_choice' && question.options?.length ? (
                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => {
                              const optionId = cleanId(option.id) || `${questionId}-option-${optionIndex + 1}`;
                              const optionText = cleanText(option.text, MAX_OPTION_TEXT_CHARS);
                              const checked = currentAnswer === optionText;

                              return (
                                <button
                                  key={optionId}
                                  type="button"
                                  onClick={() => handleAnswerChange(questionId, optionText)}
                                  disabled={isEvaluating}
                                  className={cn(
                                    'flex w-full items-center gap-3 rounded-2xl p-3.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70',
                                    checked
                                      ? 'bg-primary/10 text-primary font-medium'
                                      : 'bg-muted/40 text-foreground hover:bg-muted/70',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'inline-block h-3.5 w-3.5 rounded-full',
                                      checked ? 'bg-primary' : 'bg-muted-foreground/30',
                                    )}
                                  />
                                  <span>{optionText}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <Textarea
                              value={currentAnswer}
                              onChange={(event) =>
                                handleAnswerChange(questionId, event.target.value)
                              }
                              disabled={isEvaluating}
                              maxLength={MAX_ANSWER_CHARS}
                              placeholder="Жауабыңызды жазыңыз"
                              rows={4}
                            />

                            <p className="text-[11px] text-muted-foreground">
                              {currentAnswer.length}/{MAX_ANSWER_CHARS}
                            </p>
                          </div>
                        )}

                        <Button
                          type="button"
                          onClick={() => handleEvaluateQuestion(question)}
                          disabled={
                            isEvaluating ||
                            isAnyEvaluationPending ||
                            isAuthMissing ||
                            !currentAnswer.trim()
                          }
                        >
                          {isEvaluating ? (
                            <Loader2 size={16} className="mr-2 animate-spin" />
                          ) : (
                            <BrainCircuit size={16} className="mr-2" />
                          )}
                          {isEvaluating ? 'Тексерілуде...' : 'Тексеру'}
                        </Button>

                        {currentFeedback && cleanFeedback ? (
                          <div
                            className={cn(
                              'rounded-3xl border p-4 shadow-inner-soft',
                              getFeedbackTone(currentFeedback),
                            )}
                          >
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <CheckCircle2 size={15} className="text-primary" />

                              <span className="text-sm font-semibold">
                                Нәтиже: {cleanFeedback.score ?? '—'}
                                {cleanFeedback.maxScore !== null
                                  ? ` / ${cleanFeedback.maxScore}`
                                  : ''}
                              </span>
                            </div>

                            {cleanFeedback.feedback ? (
                              <p className="whitespace-pre-line text-sm leading-7">
                                {cleanFeedback.feedback}
                              </p>
                            ) : null}

                            {cleanFeedback.explanation ? (
                              <div className="mt-3 rounded-2xl border bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  Түсіндірме:{' '}
                                </span>
                                {cleanFeedback.explanation}
                              </div>
                            ) : null}

                            {cleanFeedback.suggestion ? (
                              <div className="mt-3 rounded-2xl border bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  Ұсыныс:{' '}
                                </span>
                                {cleanFeedback.suggestion}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
