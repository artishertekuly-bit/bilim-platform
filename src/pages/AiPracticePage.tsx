import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BrainCircuit,
  CheckCircle2,
  FileCheck2,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
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

const MAX_SUBJECT_CHARS = 120;
const MAX_TOPIC_CHARS = 200;
const MAX_SOURCE_TEXT_CHARS = 12_000;
const MAX_ANSWER_CHARS = 4_000;
const GENERATE_TIMEOUT_MS = 180_000;
const EVALUATE_TIMEOUT_MS = 120_000;

const QUESTION_COUNT_OPTIONS = [3, 5, 7, 10] as const;

type Difficulty = 'easy' | 'medium' | 'hard';

type AnswerMap = Record<string, string>;
type FeedbackMap = Record<string, EvaluateAnswerResponse>;

function cleanText(value: unknown, limit?: number) {
  const text = String(value ?? '').replace(/\x00/g, ' ').trim();
  return typeof limit === 'number' ? text.slice(0, limit) : text;
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function normalizeQuestionId(question: GeneratedQuestion, index: number, seen: Set<string>) {
  const rawId = cleanText(question.id, 120) || `practice-question-${index + 1}`;
  let id = rawId;
  let suffix = 2;

  while (seen.has(id)) {
    id = `${rawId}-${suffix}`;
    suffix += 1;
  }

  seen.add(id);
  return id;
}

function normalizePracticeQuestions(response: GenerateQuestionsResponse): GenerateQuestionsResponse {
  const seen = new Set<string>();

  const questions = (response.questions || [])
    .map((question, index) => {
      const id = normalizeQuestionId(question, index, seen);
      const options = question.options
        ?.map((option, optionIndex) => ({
          ...option,
          id: cleanText(option.id, 120) || `${id}-option-${optionIndex + 1}`,
          text: cleanText(option.text, 500),
        }))
        .filter((option) => option.text.length > 0);

      const normalizedType =
        question.type === 'multiple_choice' && options && options.length >= 2
          ? 'multiple_choice'
          : 'short_answer';

      return {
        ...question,
        id,
        type: normalizedType,
        question: cleanText(question.question, 2_000),
        options: normalizedType === 'multiple_choice' ? options : undefined,
        correctAnswer: cleanText(question.correctAnswer, 1_000) || undefined,
        explanation: cleanText(question.explanation, 2_500) || undefined,
        difficulty: cleanText(question.difficulty, 60) || undefined,
        topic: cleanText(question.topic, 200) || undefined,
      } satisfies GeneratedQuestion;
    })
    .filter((question) => question.question.length > 0);

  return {
    ...response,
    questions,
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
}) {
  const contextParts = [
    cleanText(sourceText, MAX_SOURCE_TEXT_CHARS),
    cleanText(passage, 5_000),
    cleanText(question.topic, 200),
    cleanText(topic, MAX_TOPIC_CHARS),
    cleanText(subject, MAX_SUBJECT_CHARS),
  ].filter(Boolean);

  return contextParts.join('\n\n') || undefined;
}

function getFeedbackTone(feedback: EvaluateAnswerResponse) {
  if (feedback.isCorrect === true) return 'border-primary-muted bg-primary-soft/60';
  if (typeof feedback.score === 'number' && feedback.score >= 6.5) {
    return 'border-primary-muted bg-primary-soft/60';
  }
  return 'border-warning-muted bg-warning-soft/60';
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
  const [count, setCount] = useState<number>(5);
  const [kind, setKind] = useState<AiQuestionKind>('mixed');

  const [result, setResult] = useState<GenerateQuestionsResponse | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [feedback, setFeedback] = useState<FeedbackMap>({});

  const [isGenerating, setIsGenerating] = useState(false);
  const [evaluatingQuestionId, setEvaluatingQuestionId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');

  const generateAbortRef = useRef<AbortController | null>(null);
  const evaluateAbortRef = useRef<AbortController | null>(null);
  const generationRequestIdRef = useRef(0);
  const evaluationRequestIdRef = useRef(0);

  const generatedCount = result?.questions.length || 0;
  const isAuthMissing = !accessToken;
  const generatedPassage = result?.meta?.passage?.trim() || '';

  const canGenerate = useMemo(() => {
    const hasTopic = topic.trim().length > 0;
    const hasSource = sourceText.trim().length > 0;

    return (
      isStudent &&
      !isGenerating &&
      !isAuthMissing &&
      (hasTopic || hasSource)
    );
  }, [isAuthMissing, isGenerating, isStudent, sourceText, topic]);

  const answeredCount = useMemo(() => {
    if (!result) return 0;

    return result.questions.filter((question) => {
      const value = answers[question.id];
      return typeof value === 'string' && value.trim().length > 0;
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
      generateAbortRef.current?.abort();
      evaluateAbortRef.current?.abort();
      generateAbortRef.current = null;
      evaluateAbortRef.current = null;
    };
  }, []);

  const handleGenerate = async () => {
    const subjectText = cleanText(subject, MAX_SUBJECT_CHARS);
    const topicText = cleanText(topic, MAX_TOPIC_CHARS);
    const source = cleanText(sourceText, MAX_SOURCE_TEXT_CHARS);

    if (!topicText && !source) {
      setErrorText('Кемінде тақырып немесе қысқаша мазмұн енгізіңіз.');
      return;
    }

    if (!isStudent) {
      setErrorText('AI practice тек оқушы аккаунтына арналған.');
      return;
    }

    if (!accessToken) {
      const message = user
        ? 'AI practice пайдалану үшін белсенді сессия access token қажет.'
        : 'AI practice пайдалану үшін авторизация қажет.';

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
        }
      );

      if (generationRequestIdRef.current !== requestId) return;

      const normalizedResponse = normalizePracticeQuestions(response);
      setResult(normalizedResponse);

      toast({
        title: 'Практика дайын',
        description: `${normalizedResponse.questions.length} сұрақ генерацияланды.`,
      });
    } catch (error) {
      if (generationRequestIdRef.current !== requestId) return;

      const message = normalizeErrorMessage(
        error,
        'Практика сұрақтарын генерациялау мүмкін болмады.'
      );

      if (!message) return;

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (generationRequestIdRef.current === requestId) {
        setIsGenerating(false);
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
    const nextValue = cleanText(value, MAX_ANSWER_CHARS);

    if (errorText) {
      setErrorText('');
    }

    setAnswers((prev) => ({
      ...prev,
      [questionId]: nextValue,
    }));

    setFeedback((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleEvaluateQuestion = async (question: GeneratedQuestion) => {
    const studentAnswer = cleanText(answers[question.id], MAX_ANSWER_CHARS);

    if (!studentAnswer) {
      toast({
        title: 'Жауап жоқ',
        description: 'Алдымен осы сұраққа жауап беріңіз.',
        variant: 'destructive',
      });
      return;
    }

    if (!isStudent) {
      setErrorText('AI practice тек оқушы аккаунтына арналған.');
      return;
    }

    if (!accessToken) {
      const message = user
        ? 'Жауапты тексеру үшін белсенді сессия access token қажет.'
        : 'Жауапты тексеру үшін авторизация қажет.';

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

    setEvaluatingQuestionId(question.id);
    setErrorText('');

    try {
      const response = await evaluateAnswer(
        {
          questionId: question.id,
          question: question.question,
          expectedAnswer: question.correctAnswer,
          referenceAnswer: question.explanation,
          studentAnswer,
          context: getQuestionContext({
            question,
            sourceText,
            topic,
            subject,
            passage: generatedPassage,
          }),
          options: question.options?.map((option) => option.text) ?? [],
          answerFormat: question.type === 'multiple_choice' ? 'mcq' : 'text',
        },
        {
          accessToken,
          signal: abortController.signal,
          timeoutMs: EVALUATE_TIMEOUT_MS,
        }
      );

      if (evaluationRequestIdRef.current !== requestId) return;

      setFeedback((prev) => ({
        ...prev,
        [question.id]: response,
      }));
    } catch (error) {
      if (evaluationRequestIdRef.current !== requestId) return;

      const message = normalizeErrorMessage(error, 'Жауапты тексеру мүмкін болмады.');
      if (!message) return;

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (evaluationRequestIdRef.current === requestId) {
        setEvaluatingQuestionId(null);
        evaluateAbortRef.current = null;
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('nav.ai_practice')}</h2>
            <p className="text-sm text-muted-foreground">
              AI көмегімен қосымша practice сұрақтарын генерациялау және жауапты тексеру бөлімі.
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/tests">
                <FileCheck2 size={14} className="mr-2" />
                Қазіргі тесттерге өту
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
        </div>

        {!user ? (
          <EmptyState
            title="Аккаунт анықталмады"
            text="AI practice қолдану үшін оқушы аккаунтымен жүйеге кіріңіз."
            tone="ai"
          />
        ) : null}

        {user && !isStudent ? (
          <EmptyState
            title="Бұл бөлім оқушыға арналған"
            text="Practice сұрақтарын генерациялау және жауап тексеру оқушы режимінде қолданылады."
            tone="ai"
          />
        ) : null}

        {user && isStudent ? (
          <>
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Practice параметрлері
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="subject">Пән</Label>
                      <Input
                        id="subject"
                        value={subject}
                        maxLength={MAX_SUBJECT_CHARS}
                        onChange={(event) => {
                          setSubject(event.target.value.slice(0, MAX_SUBJECT_CHARS));
                          if (errorText) setErrorText('');
                        }}
                        disabled={isGenerating}
                        placeholder="Мысалы: Математика"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="topic">Тақырып</Label>
                      <Input
                        id="topic"
                        value={topic}
                        maxLength={MAX_TOPIC_CHARS}
                        onChange={(event) => {
                          setTopic(event.target.value.slice(0, MAX_TOPIC_CHARS));
                          if (errorText) setErrorText('');
                        }}
                        disabled={isGenerating}
                        placeholder="Мысалы: Квадрат теңдеулер"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="difficulty">Қиындық деңгейі</Label>
                      <select
                        id="difficulty"
                        value={difficulty}
                        onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                        disabled={isGenerating}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="easy">Оңай</option>
                        <option value="medium">Орташа</option>
                        <option value="hard">Қиын</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="count">Сұрақ саны</Label>
                      <select
                        id="count"
                        value={count}
                        onChange={(event) => setCount(Number(event.target.value))}
                        disabled={isGenerating}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {QUESTION_COUNT_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="kind">Сұрақ түрі</Label>
                      <select
                        id="kind"
                        value={kind}
                        onChange={(event) => setKind(event.target.value as AiQuestionKind)}
                        disabled={isGenerating}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="mixed">Аралас</option>
                        <option value="multiple_choice">Multiple choice</option>
                        <option value="short_answer">Қысқа жауап</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="sourceText">Қосымша мазмұн немесе контекст</Label>
                    <Textarea
                      id="sourceText"
                      value={sourceText}
                      maxLength={MAX_SOURCE_TEXT_CHARS}
                      onChange={(event) => {
                        setSourceText(event.target.value.slice(0, MAX_SOURCE_TEXT_CHARS));
                        if (errorText) setErrorText('');
                      }}
                      disabled={isGenerating}
                      placeholder="Қаласаңыз, қысқаша теория немесе контекст жазыңыз..."
                      rows={6}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {sourceText.length} / {MAX_SOURCE_TEXT_CHARS}
                    </p>
                  </div>

                  <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
                    <Sparkles size={16} className="mr-2" />
                    {isGenerating ? 'Практика дайындалып жатыр...' : 'Практика генерациялау'}
                  </Button>

                  {isAuthMissing ? (
                    <p className="text-xs text-muted-foreground">
                      AI practice пайдалану үшін белсенді авторизация сессиясы қажет.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Прогресс</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Генерацияланған</p>
                      <p className="mt-1 text-lg font-semibold">{generatedCount}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Жауап берілді</p>
                      <p className="mt-1 text-lg font-semibold">{answeredCount}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Тексерілді</p>
                      <p className="mt-1 text-lg font-semibold">{evaluatedCount}</p>
                    </div>
                  </div>

                  {result?.meta ? (
                    <div className="rounded-lg border bg-muted/35 p-4 text-xs leading-5 text-muted-foreground">
                      <p>
                        Режим: {result.meta.mode || 'unknown'}
                        {result.meta.requestedKind ? ` · Түрі: ${result.meta.requestedKind}` : ''}
                        {result.meta.examMode ? ` · Exam: ${result.meta.examMode}` : ''}
                      </p>
                      {result.meta.subject ? <p>Пән: {result.meta.subject}</p> : null}
                      {result.meta.topic ? <p>Тақырып: {result.meta.topic}</p> : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {isGenerating ? (
              <LoadingState text="Practice сұрақтары дайындалып жатыр..." />
            ) : null}
            {errorText ? <ErrorState text={errorText} /> : null}

            {!isGenerating && !errorText && result && result.questions.length === 0 ? (
              <EmptyState
                title="Сұрақтар табылмады"
                text="AI жауап қайтарды, бірақ қолдануға болатын сұрақтар жоқ. Тақырыпты нақтылап көріңіз."
              />
            ) : null}

            {!isGenerating && generatedPassage ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Мәтін / passage</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                    {generatedPassage}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {!isGenerating && result && result.questions.length > 0 ? (
              <div className="space-y-4">
                {result.questions.map((question, index) => {
                  const currentAnswer = answers[question.id] || '';
                  const currentFeedback = feedback[question.id];
                  const isEvaluating = evaluatingQuestionId === question.id;
                  const isAnyEvaluationPending = Boolean(evaluatingQuestionId);

                  return (
                    <Card key={question.id}>
                      <CardHeader>
                        <CardTitle className="text-base font-semibold">
                          Сұрақ {index + 1}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm leading-7">{question.question}</p>

                        {question.type === 'multiple_choice' && question.options?.length ? (
                          <div className="space-y-2">
                            {question.options.map((option) => {
                              const checked = currentAnswer === option.text;

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => handleAnswerChange(question.id, option.text)}
                                  disabled={isEvaluating}
                                  className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                                    checked ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                                  }`}
                                >
                                  <span
                                    className={`mt-0.5 inline-block h-4 w-4 rounded-full border ${
                                      checked ? 'border-primary bg-primary' : ''
                                    }`}
                                  />
                                  <span>{option.text}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <Textarea
                              value={currentAnswer}
                              onChange={(event) =>
                                handleAnswerChange(question.id, event.target.value)
                              }
                              disabled={isEvaluating}
                              maxLength={MAX_ANSWER_CHARS}
                              placeholder="Жауабыңызды жазыңыз..."
                              rows={4}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              {currentAnswer.length} / {MAX_ANSWER_CHARS}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
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
                            <BrainCircuit size={16} className="mr-2" />
                            {isEvaluating ? 'Тексерілуде...' : 'Жауапты тексеру'}
                          </Button>
                        </div>

                        {currentFeedback ? (
                          <div className={`rounded-lg border p-4 ${getFeedbackTone(currentFeedback)}`}>
                            <div className="mb-3 flex items-center gap-2">
                              <CheckCircle2 size={15} className="text-primary" />
                              <span className="text-sm font-medium">
                                Нәтиже: {currentFeedback.score}
                                {currentFeedback.maxScore !== undefined
                                  ? ` / ${currentFeedback.maxScore}`
                                  : ''}
                              </span>
                            </div>

                            <p className="text-sm leading-7 text-muted-foreground">
                              {currentFeedback.feedback}
                            </p>

                            {currentFeedback.explanation ? (
                              <div className="mt-3 rounded-md border bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Түсіндірме: </span>
                                {currentFeedback.explanation}
                              </div>
                            ) : null}

                            {currentFeedback.suggestion ? (
                              <div className="mt-3 rounded-md border bg-card/70 px-3 py-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Ұсыныс: </span>
                                {currentFeedback.suggestion}
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
