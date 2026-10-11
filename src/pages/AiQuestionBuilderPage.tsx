import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import t from '@/lib/i18n';
import { savePendingAiQuestionImport } from '@/lib/ai-question-import';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  generateQuestions,
  type GenerateQuestionsResponse,
  type AiQuestionKind,
  type GeneratedQuestion,
} from '@/lib/ai-api';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

import {
  AlertTriangle,
  Check,
  ClipboardList,
  Loader2,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionKindOption = AiQuestionKind;

const difficultyOptions: Array<{
  value: Difficulty;
  label: string;
}> = [
  {
    value: 'easy',
    label: 'Оңай',
  },
  {
    value: 'medium',
    label: 'Орташа',
  },
  {
    value: 'hard',
    label: 'Қиын',
  },
];

const questionKindOptions: Array<{
  value: QuestionKindOption;
  label: string;
}> = [
  {
    value: 'mixed',
    label: 'Аралас',
  },
  {
    value: 'multiple_choice',
    label: 'Жауап нұсқалары',
  },
  {
    value: 'short_answer',
    label: 'Қысқа жауап',
  },
];

const questionCountOptions = [5, 10, 15, 20, 30, 40, 50] as const;

const MAX_SOURCE_TEXT_CHARS = 16_000;
const MAX_TOPIC_CHARS = 220;
const MAX_SUBJECT_CHARS = 120;
const MAX_ID_CHARS = 160;
const MAX_QUESTION_TEXT_CHARS = 2_000;
const MAX_OPTION_CHARS = 500;
const MAX_EXPLANATION_CHARS = 2_500;
const MAX_RESULT_META_CHARS = 5_000;
const MAX_GENERATED_QUESTIONS = 60;
const MAX_ERROR_CHARS = 700;
const MAX_TITLE_SUGGESTION_CHARS = 180;
const MAX_COUNT = Math.max(...questionCountOptions);
const GENERATE_TIMEOUT_MS = 180_000;

function sanitizeInputValue(value: unknown, limit: number): string {
  return limitText(removeNullCharacters(String(value ?? '')), limit);
}

function cleanText(value: unknown, limit: number): string {
  return sanitizeInputValue(value, limit).replace(/\s+/g, ' ').trim();
}

function cleanMultilineText(value: unknown, limit: number): string {
  return limitText(
    removeNullCharacters(String(value ?? ''))
      .slice(0, limit)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
    limit,
  );
}

function normalizeUiText(value: unknown, limit = MAX_TITLE_SUGGESTION_CHARS): string {
  return cleanText(value, limit)
    .replace(/\bAI\b/g, 'ЖИ')
    .replace(/\bAi\b/g, 'ЖИ')
    .trim();
}

function normalizeId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeDifficulty(value: unknown): Difficulty {
  const cleanValue = cleanText(value, 32);

  if (cleanValue === 'easy' || cleanValue === 'medium' || cleanValue === 'hard') {
    return cleanValue;
  }

  return 'medium';
}

function normalizeQuestionKind(value: unknown): QuestionKindOption {
  const cleanValue = cleanText(value, 64);

  if (
    cleanValue === 'mixed' ||
    cleanValue === 'multiple_choice' ||
    cleanValue === 'short_answer'
  ) {
    return cleanValue;
  }

  return 'mixed';
}

function normalizeQuestionCount(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 10;

  const normalized = Math.max(1, Math.min(MAX_COUNT, Math.round(numericValue)));

  return questionCountOptions.includes(normalized as (typeof questionCountOptions)[number])
    ? normalized
    : 10;
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

function getErrorMessage(error: unknown): string {
  if (isAbortLikeError(error)) {
    return '';
  }

  return error instanceof Error && error.message.trim()
    ? cleanText(error.message, MAX_ERROR_CHARS)
    : 'Сұрақ құру мүмкін болмады.';
}

function isImportCompatibleQuestion(question: GeneratedQuestion) {
  const options = question.options || [];

  return (
    question.type === 'multiple_choice' &&
    options.length >= 2 &&
    Boolean(cleanText(question.correctAnswer, MAX_OPTION_CHARS))
  );
}

function getDifficultyLabel(value: Difficulty) {
  return difficultyOptions.find((item) => item.value === value)?.label || 'Орташа';
}

function getKindLabel(value: QuestionKindOption) {
  return questionKindOptions.find((item) => item.value === value)?.label || 'Аралас';
}

function getQuestionTypeLabel(type: GeneratedQuestion['type']) {
  if (type === 'multiple_choice') return 'Жауап нұсқалары';

  return 'Қысқа жауап';
}

function normalizeGeneratedQuestionId(
  question: GeneratedQuestion,
  index: number,
  seen: Set<string>,
): string {
  const rawId = normalizeId(question.id) || `question-${index + 1}`;
  let id = rawId;
  let suffix = 2;

  while (seen.has(id)) {
    id = `${rawId}-${suffix}`;
    suffix += 1;
  }

  seen.add(id);

  return id;
}

function normalizeQuestionOptions(
  question: GeneratedQuestion,
  questionId: string,
): GeneratedQuestion['options'] {
  if (!Array.isArray(question.options)) return undefined;

  const seen = new Set<string>();

  return question.options
    .map((option, optionIndex) => {
      const rawId = normalizeId(option.id) || `${questionId}-option-${optionIndex + 1}`;
      let id = rawId;
      let suffix = 2;

      while (seen.has(id)) {
        id = `${rawId}-${suffix}`;
        suffix += 1;
      }

      seen.add(id);

      return {
        ...option,
        id,
        text: cleanText(option.text, MAX_OPTION_CHARS),
        isCorrect: Boolean(option.isCorrect),
      };
    })
    .filter((option) => option.text.length > 0)
    .slice(0, 8);
}

function normalizeGeneratedQuestions(
  response: GenerateQuestionsResponse,
): GenerateQuestionsResponse {
  const seen = new Set<string>();

  const questions = (response.questions || [])
    .slice(0, MAX_GENERATED_QUESTIONS)
    .map((question, index): GeneratedQuestion => {
      const id = normalizeGeneratedQuestionId(question, index, seen);
      const options = normalizeQuestionOptions(question, id);

      const normalizedType: GeneratedQuestion['type'] =
        question.type === 'multiple_choice' && options && options.length >= 2
          ? 'multiple_choice'
          : 'short_answer';

      return {
        ...question,
        id,
        type: normalizedType,
        question: cleanMultilineText(question.question, MAX_QUESTION_TEXT_CHARS),
        options: normalizedType === 'multiple_choice' ? options : undefined,
        correctAnswer: cleanText(question.correctAnswer, MAX_OPTION_CHARS) || undefined,
        explanation:
          cleanMultilineText(question.explanation, MAX_EXPLANATION_CHARS) ||
          undefined,
        topic: cleanText(question.topic, MAX_TOPIC_CHARS) || undefined,
        difficulty: cleanText(question.difficulty, 80) || undefined,
      };
    })
    .filter((question) => question.question.length > 0);

  return {
    ...response,
    meta: response.meta
      ? {
          ...response.meta,
          passage: cleanMultilineText(response.meta.passage, MAX_RESULT_META_CHARS),
        }
      : response.meta,
    questions,
  };
}

function OptionButton({
  active,
  label,
  value,
  onSelect,
  disabled = false,
}: {
  active: boolean;
  label: string;
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled}
      className={cn(
        'rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 shadow-xs',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 hover:bg-muted',
      )}
    >
      {cleanText(label, 80)}
    </button>
  );
}

function AiQuestionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles size={16} className="animate-pulse text-primary" />
          Сұрақтар дайындалып жатыр...
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl bg-muted/30 p-4 shadow-xs">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-3 h-4 w-4/5" />
            <SkeletonBlock className="mt-2 h-4 w-2/3" />
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-9 w-full rounded-lg" />
              <SkeletonBlock className="h-9 w-full rounded-lg" />
              <SkeletonBlock className="h-9 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QuestionPreviewCard({
  question,
  index,
}: {
  question: GeneratedQuestion;
  index: number;
}) {
  const isCompatible = isImportCompatibleQuestion(question);
  const questionText = cleanMultilineText(question.question, MAX_QUESTION_TEXT_CHARS);
  const correctAnswer = cleanText(question.correctAnswer, MAX_OPTION_CHARS);
  const explanation = cleanMultilineText(question.explanation, MAX_EXPLANATION_CHARS);
  const topic = cleanText(question.topic, MAX_TOPIC_CHARS);
  const difficulty = cleanText(question.difficulty, 80);
  const options = question.options || [];

  return (
    <div className="rounded-2xl bg-muted/30 p-4 shadow-xs transition-colors hover:bg-muted/40">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Сұрақ {index + 1}</p>
          <p className="mt-1 whitespace-pre-line text-sm font-medium leading-6">
            {questionText || 'Сұрақ'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusBadge tone="info">{getQuestionTypeLabel(question.type)}</StatusBadge>
          <StatusBadge tone={isCompatible ? 'success' : 'muted'}>
            {isCompatible ? 'Жарамды' : 'Қарау'}
          </StatusBadge>
        </div>
      </div>

      {options.length > 0 ? (
        <div className="space-y-2">
          {options.map((option, optionIndex) => {
            const optionId = normalizeId(option.id) || `${question.id}-${optionIndex}`;
            const optionText = cleanText(option.text, MAX_OPTION_CHARS);

            if (!optionText) return null;

            return (
              <div
                key={optionId}
                className={cn(
                  'flex items-start gap-2 rounded-xl px-3 py-2 text-sm shadow-xs',
                  option.isCorrect ? 'bg-primary/10 text-primary font-medium' : 'bg-card',
                )}
              >
                {option.isCorrect ? (
                  <Check size={14} className="mt-0.5 shrink-0 text-primary" />
                ) : (
                  <span className="mt-[3px] inline-block h-3 w-3 shrink-0 rounded-full bg-muted-foreground/30" />
                )}

                <span>{optionText}</span>
              </div>
            );
          })}
        </div>
      ) : correctAnswer ? (
        <div className="rounded-xl bg-primary/10 px-3 py-2 text-sm shadow-xs">
          <span className="text-muted-foreground">Дұрыс жауап: </span>
          <span className="font-medium">{correctAnswer}</span>
        </div>
      ) : null}

      {explanation ? (
        <div className="mt-3 whitespace-pre-line rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground shadow-xs">
          <span className="font-medium text-foreground">Түсіндірме: </span>
          {explanation}
        </div>
      ) : null}

      {topic || difficulty ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          {topic ? (
            <span className="rounded-full bg-muted/50 px-2.5 py-1">
              {topic}
            </span>
          ) : null}

          {difficulty ? (
            <span className="rounded-full bg-muted/50 px-2.5 py-1">
              {difficulty}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AiQuestionBuilderPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const accessToken = session?.access_token;

  const [sourceText, setSourceText] = useState('');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState(10);
  const [kind, setKind] = useState<QuestionKindOption>('mixed');

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateQuestionsResponse | null>(null);
  const [errorText, setErrorText] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const generatedCount = result?.questions.length || 0;
  const safeDifficulty = normalizeDifficulty(difficulty);
  const safeKind = normalizeQuestionKind(kind);
  const safeCount = normalizeQuestionCount(count);

  const importableCount = useMemo(() => {
    if (!result) return 0;

    return result.questions.filter(isImportCompatibleQuestion).length;
  }, [result]);

  const skippedCount = useMemo(() => {
    if (!result) return 0;

    return Math.max(result.questions.length - importableCount, 0);
  }, [result, importableCount]);

  const hasGeneratedQuestions = Boolean(result && generatedCount > 0);

  const canGenerate = useMemo(() => {
    const hasSource = cleanMultilineText(sourceText, MAX_SOURCE_TEXT_CHARS).length > 0;
    const hasTopic = cleanText(topic, MAX_TOPIC_CHARS).length > 0;

    return !isGenerating && Boolean(accessToken) && (hasSource || hasTopic);
  }, [sourceText, topic, isGenerating, accessToken]);

  const canSendToTestBuilder = hasGeneratedQuestions && importableCount > 0;

  const clearError = () => {
    if (errorText) {
      setErrorText('');
    }
  };

  const abortGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortGeneration();
    };
  }, [abortGeneration]);

  const handleGenerate = async () => {
    abortGeneration();

    const trimmedSource = cleanMultilineText(sourceText, MAX_SOURCE_TEXT_CHARS);
    const trimmedTopic = cleanText(topic, MAX_TOPIC_CHARS);
    const trimmedSubject = cleanText(subject, MAX_SUBJECT_CHARS);

    if (!trimmedSource && !trimmedTopic) {
      setErrorText('Мәтін немесе тақырып енгізіңіз.');
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

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setErrorText('');
    setResult(null);

    try {
      const response = await generateQuestions(
        {
          sourceText: trimmedSource || trimmedTopic,
          topic: trimmedTopic || undefined,
          subject: trimmedSubject || undefined,
          difficulty: safeDifficulty,
          count: safeCount,
          kind: safeKind,
        },
        {
          accessToken,
          signal: controller.signal,
          timeoutMs: GENERATE_TIMEOUT_MS,
        },
      );

      if (!mountedRef.current || requestIdRef.current !== requestId) return;

      const normalizedResponse = normalizeGeneratedQuestions(response);

      setResult(normalizedResponse);

      toast({
        title: 'Сұрақтар дайын',
        description: `${normalizedResponse.questions.length} сұрақ құрылды.`,
      });
    } catch (error) {
      if (!mountedRef.current || requestIdRef.current !== requestId) return;

      const message = getErrorMessage(error);

      if (!message) return;

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setIsGenerating(false);
      }

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleReset = () => {
    abortGeneration();
    requestIdRef.current += 1;

    setSourceText('');
    setTopic('');
    setSubject('');
    setDifficulty('medium');
    setCount(10);
    setKind('mixed');
    setResult(null);
    setErrorText('');
    setIsGenerating(false);
  };

  const handleSendToTestBuilder = () => {
    if (!result || generatedCount === 0) return;

    const payload = savePendingAiQuestionImport({
      titleSuggestion:
        cleanText(topic, MAX_TOPIC_CHARS) ||
        cleanText(subject, MAX_SUBJECT_CHARS) ||
        'ЖИ тест',
      topic: cleanText(topic, MAX_TOPIC_CHARS) || undefined,
      subject: cleanText(subject, MAX_SUBJECT_CHARS) || undefined,
      questions: result.questions,
    });

    if (payload.questions.length === 0) {
      toast({
        title: 'Жарамды сұрақ жоқ',
        description: 'Тест редакторы жауап нұсқалары бар сұрақтарды қабылдайды.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Тест редакторына дайын',
      description:
        payload.skippedCount > 0
          ? `${payload.questions.length} сұрақ дайын, ${payload.skippedCount} сұрақ өтпеді.`
          : `${payload.questions.length} сұрақ дайын.`,
    });

    navigate('/create-test');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              ЖИ сұрақ құрастыру
            </>
          }
          icon={<Sparkles size={20} />}
          title={normalizeUiText(t('nav.ai_question_builder')) || 'ЖИ сұрақ құрастыру'}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" asChild>
                <Link to="/create-test">
                  <ClipboardList size={14} className="mr-2" />
                  Тест редакторы
                </Link>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isGenerating}
              >
                <RefreshCcw size={14} className="mr-2" />
                Тазалау
              </Button>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles size={16} />
                  Параметрлер
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-5 p-4 sm:p-5">
                <div className="space-y-1.5">
                  <Label htmlFor="sourceText">Мәтін</Label>
                  <Textarea
                    id="sourceText"
                    value={sourceText}
                    maxLength={MAX_SOURCE_TEXT_CHARS}
                    onChange={(event) => {
                      setSourceText(
                        sanitizeInputValue(event.target.value, MAX_SOURCE_TEXT_CHARS),
                      );
                      clearError();
                    }}
                    placeholder="Теория, конспект немесе сабақ мәтіні"
                    rows={11}
                    disabled={isGenerating}
                  />

                  <p className="text-[11px] text-muted-foreground">
                    {sourceText.length}/{MAX_SOURCE_TEXT_CHARS}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="topic">Тақырып</Label>
                    <Input
                      id="topic"
                      value={topic}
                      maxLength={MAX_TOPIC_CHARS}
                      onChange={(event) => {
                        setTopic(sanitizeInputValue(event.target.value, MAX_TOPIC_CHARS));
                        clearError();
                      }}
                      placeholder="Мысалы: Квадрат теңдеулер"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="subject">Пән</Label>
                    <Input
                      id="subject"
                      value={subject}
                      maxLength={MAX_SUBJECT_CHARS}
                      onChange={(event) => {
                        setSubject(
                          sanitizeInputValue(event.target.value, MAX_SUBJECT_CHARS),
                        );
                        clearError();
                      }}
                      placeholder="Мысалы: Математика"
                      disabled={isGenerating}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Қиындық</Label>
                  <div className="flex flex-wrap gap-2">
                    {difficultyOptions.map((item) => (
                      <OptionButton
                        key={item.value}
                        active={safeDifficulty === item.value}
                        label={item.label}
                        value={item.value}
                        onSelect={(value) => setDifficulty(normalizeDifficulty(value))}
                        disabled={isGenerating}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Сұрақ түрі</Label>
                  <div className="flex flex-wrap gap-2">
                    {questionKindOptions.map((item) => (
                      <OptionButton
                        key={item.value}
                        active={safeKind === item.value}
                        label={item.label}
                        value={item.value}
                        onSelect={(value) => setKind(normalizeQuestionKind(value))}
                        disabled={isGenerating}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Сұрақ саны</Label>
                  <div className="flex flex-wrap gap-2">
                    {questionCountOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCount(value)}
                        disabled={isGenerating}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 shadow-xs',
                          safeCount === value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/50 hover:bg-muted',
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="muted">{getDifficultyLabel(safeDifficulty)}</StatusBadge>
                  <StatusBadge tone="ai">{getKindLabel(safeKind)}</StatusBadge>
                  <StatusBadge tone="info">{safeCount} сұрақ</StatusBadge>
                </div>

                {!accessToken ? (
                  <div className="flex items-start gap-2 rounded-2xl bg-warning-soft p-3 text-sm text-warning-foreground shadow-xs">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{user ? 'Белсенді сессия қажет.' : 'Жүйеге кіріңіз.'}</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
                    {isGenerating ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Sparkles size={16} className="mr-2" />
                    )}
                    {isGenerating ? 'Құрылуда...' : 'Сұрақ құру'}
                  </Button>

                  {hasGeneratedQuestions ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendToTestBuilder}
                      disabled={!canSendToTestBuilder || isGenerating}
                    >
                      <ClipboardList size={16} className="mr-2" />
                      Тестке жіберу
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {errorText ? <ErrorState text={errorText} /> : null}

            {!isGenerating && !errorText && !result ? (
              <EmptyState
                title="Нәтиже жоқ"
                text="Мәтін немесе тақырып енгізіңіз."
              />
            ) : null}

            {isGenerating ? <AiQuestionSkeleton /> : null}

            {!isGenerating && !errorText && result && generatedCount === 0 ? (
              <EmptyState
                title="Сұрақ табылмады"
                text="Мәтінді нақтылап көріңіз."
              />
            ) : null}

            {!isGenerating && hasGeneratedQuestions ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base font-semibold">
                      Нәтиже
                    </CardTitle>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone="info">{generatedCount} сұрақ</StatusBadge>
                      <StatusBadge tone="success">
                        {importableCount} жарамды
                      </StatusBadge>

                      {skippedCount > 0 ? (
                        <StatusBadge tone="warning">
                          {skippedCount} өтпейді
                        </StatusBadge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>

                {safeKind !== 'multiple_choice' && skippedCount > 0 ? (
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-2 rounded-2xl bg-warning-soft p-3 text-sm text-warning-foreground shadow-xs">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>Тестке тек жауап нұсқалары бар сұрақ өтеді.</span>
                    </div>
                  </CardContent>
                ) : null}

                <CardContent className="space-y-4 p-4 sm:p-5">
                  {result?.questions.map((question, index) => (
                    <QuestionPreviewCard
                      key={normalizeId(question.id) || `${index}-${cleanText(question.question, 80)}`}
                      question={question}
                      index={index}
                    />
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}