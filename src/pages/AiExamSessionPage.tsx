import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  History,
  Loader2,
  RefreshCcw,
  TimerReset,
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  getAiExamSession,
  listAiExamAttempts,
  submitAiExam,
  type AiExamAttempt,
  type AiExamSession,
  type SubmitAiExamResponse,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';

type AnswerMap = Record<string, string>;

type RawBreakdownItem = {
  questionId?: string;
  question_id?: string;
  score?: number;
  maxScore?: number;
  max_score?: number;
  feedback?: string;
  isCorrect?: boolean;
  is_correct?: boolean;
};

type RawAnswerItem = {
  questionId?: string;
  question_id?: string;
  answer?: string | string[];
};

type RawSubmitResponse = {
  attemptId?: string;
  attempt_id?: string;
  score?: number;
  maxScore?: number;
  max_score?: number;
  percentage?: number;
  feedback?: string;
  breakdown?: RawBreakdownItem[];
};

type SessionWithLatestAttempt = AiExamSession & {
  latestResult?: RawSubmitResponse | null;
  latest_result?: RawSubmitResponse | null;
  latestAnswers?: RawAnswerItem[] | null;
  latest_answers?: RawAnswerItem[] | null;
  latestSubmittedAt?: string | null;
  latest_submitted_at?: string | null;
  attemptId?: string | null;
  attempt_id?: string | null;
};

const SESSION_TIMEOUT_MS = 90_000;
const ATTEMPTS_TIMEOUT_MS = 60_000;
const SUBMIT_TIMEOUT_MS = 180_000;

function isAbortLikeError(error: unknown) {
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

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeSubmitResponse(raw: unknown): SubmitAiExamResponse | null {
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as RawSubmitResponse;

  return {
    attemptId: data.attemptId ?? data.attempt_id ?? undefined,
    score: toNumber(data.score, 0),
    maxScore:
      data.maxScore !== undefined || data.max_score !== undefined
        ? toNumber(data.maxScore ?? data.max_score)
        : undefined,
    percentage:
      data.percentage !== undefined ? toNumber(data.percentage) : undefined,
    feedback: typeof data.feedback === 'string' ? data.feedback.trim() : '',
    breakdown: Array.isArray(data.breakdown)
      ? data.breakdown
          .map((item) => ({
            questionId: String(item.questionId ?? item.question_id ?? '').trim(),
            score: toNumber(item.score, 0),
            maxScore:
              item.maxScore !== undefined || item.max_score !== undefined
                ? toNumber(item.maxScore ?? item.max_score)
                : undefined,
            feedback: typeof item.feedback === 'string' ? item.feedback.trim() : '',
            isCorrect:
              typeof (item.isCorrect ?? item.is_correct) === 'boolean'
                ? Boolean(item.isCorrect ?? item.is_correct)
                : undefined,
          }))
          .filter((item) => item.questionId.length > 0)
      : [],
  };
}

function normalizeLatestAnswers(raw: unknown): AnswerMap {
  if (!Array.isArray(raw)) return {};

  const answerMap: AnswerMap = {};

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;

    const item = row as RawAnswerItem;
    const questionId = String(item.questionId ?? item.question_id ?? '').trim();

    if (!questionId) continue;

    if (Array.isArray(item.answer)) {
      answerMap[questionId] = item.answer
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(', ');
      continue;
    }

    answerMap[questionId] = String(item.answer ?? '').trim();
  }

  return answerMap;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('kk-KZ');
}

function mapAttemptAnswersToAnswerMap(
  attempt: AiExamAttempt | null | undefined,
): AnswerMap {
  if (!attempt?.answers?.length) return {};

  const result: AnswerMap = {};

  for (const item of attempt.answers) {
    if (!item?.questionId) continue;

    result[item.questionId] = String(item.answer ?? '').trim();
  }

  return result;
}

function getScoreText(result?: SubmitAiExamResponse | null) {
  if (!result) return 'Нәтиже жоқ';

  const maxScore = result.maxScore !== undefined ? ` / ${result.maxScore}` : '';
  const percentage =
    result.percentage !== undefined ? ` · ${result.percentage}%` : '';

  return `${result.score}${maxScore}${percentage}`;
}

function ExamInfoCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function AiExamSessionPage() {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();

  const accessToken = session?.access_token;

  const [examSession, setExamSession] = useState<AiExamSession | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<SubmitAiExamResponse | null>(null);
  const [attempts, setAttempts] = useState<AiExamAttempt[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorText, setErrorText] = useState('');
  const [attemptsErrorText, setAttemptsErrorText] = useState('');

  const sessionAbortRef = useRef<AbortController | null>(null);
  const attemptsAbortRef = useRef<AbortController | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);

  const sessionRequestIdRef = useRef(0);
  const attemptsRequestIdRef = useRef(0);
  const submitRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const totalQuestions = examSession?.questions.length || 0;
  const hasExamSession = !!examSession;
  const hasQuestions = totalQuestions > 0;
  const hasAttempts = attempts.length > 0;

  const answeredCount = useMemo(() => {
    if (!examSession) return 0;

    return examSession.questions.filter((question) => {
      const value = answers[question.id];

      return typeof value === 'string' && value.trim().length > 0;
    }).length;
  }, [answers, examSession]);

  const canSubmit =
    hasQuestions &&
    answeredCount === totalQuestions &&
    !isSubmitting &&
    !isLoading &&
    Boolean(accessToken);

  const questionNumberMap = useMemo(() => {
    const map = new Map<string, number>();

    examSession?.questions.forEach((question, index) => {
      map.set(question.id, index + 1);
    });

    return map;
  }, [examSession]);

  const activeAttemptId = result?.attemptId || examSession?.attemptId;

  const abortAll = useCallback(() => {
    sessionAbortRef.current?.abort();
    attemptsAbortRef.current?.abort();
    submitAbortRef.current?.abort();

    sessionAbortRef.current = null;
    attemptsAbortRef.current = null;
    submitAbortRef.current = null;
  }, []);

  const loadAttempts = useCallback(async () => {
    attemptsAbortRef.current?.abort();

    if (!examId || !accessToken) {
      setAttempts([]);
      setAttemptsErrorText('');
      return;
    }

    const requestId = attemptsRequestIdRef.current + 1;
    attemptsRequestIdRef.current = requestId;

    const controller = new AbortController();
    attemptsAbortRef.current = controller;

    setIsLoadingAttempts(true);
    setAttemptsErrorText('');

    try {
      const response = await listAiExamAttempts(examId, {
        accessToken,
        signal: controller.signal,
        timeoutMs: ATTEMPTS_TIMEOUT_MS,
      });

      if (!mountedRef.current || attemptsRequestIdRef.current !== requestId) return;

      setAttempts(response.attempts);
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const message =
        error instanceof Error
          ? error.message
          : 'Бұрынғы тапсыруларды жүктеу мүмкін болмады.';

      if (mountedRef.current && attemptsRequestIdRef.current === requestId) {
        setAttemptsErrorText(message);
      }
    } finally {
      if (mountedRef.current && attemptsRequestIdRef.current === requestId) {
        setIsLoadingAttempts(false);
      }

      if (attemptsAbortRef.current === controller) {
        attemptsAbortRef.current = null;
      }
    }
  }, [accessToken, examId]);

  const loadExam = useCallback(async () => {
    sessionAbortRef.current?.abort();

    if (!examId) {
      setExamSession(null);
      setAnswers({});
      setResult(null);
      setAttempts([]);
      setErrorText('Емтихан ID табылмады.');
      return;
    }

    if (!accessToken) {
      setExamSession(null);
      setAnswers({});
      setResult(null);
      setAttempts([]);
      setErrorText('Емтиханды ашу үшін авторизация қажет.');
      return;
    }

    const requestId = sessionRequestIdRef.current + 1;
    sessionRequestIdRef.current = requestId;

    const controller = new AbortController();
    sessionAbortRef.current = controller;

    setIsLoading(true);
    setErrorText('');
    setAttemptsErrorText('');
    setExamSession(null);
    setAnswers({});
    setResult(null);
    setAttempts([]);

    try {
      const response = (await getAiExamSession(examId, {
        accessToken,
        signal: controller.signal,
        timeoutMs: SESSION_TIMEOUT_MS,
      })) as SessionWithLatestAttempt;

      if (!mountedRef.current || sessionRequestIdRef.current !== requestId) return;

      const normalizedSession: AiExamSession = {
        ...response,
        attemptId: response.attemptId ?? response.attempt_id ?? undefined,
      };

      setExamSession(normalizedSession);

      const latestResult = normalizeSubmitResponse(
        response.latestResult ?? response.latest_result,
      );

      setResult(latestResult);

      setAnswers(
        normalizeLatestAnswers(response.latestAnswers ?? response.latest_answers),
      );

      await loadAttempts();
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const message =
        error instanceof Error
          ? error.message
          : 'Емтихан сессиясын жүктеу мүмкін болмады.';

      if (mountedRef.current && sessionRequestIdRef.current === requestId) {
        setErrorText(message);
      }
    } finally {
      if (mountedRef.current && sessionRequestIdRef.current === requestId) {
        setIsLoading(false);
      }

      if (sessionAbortRef.current === controller) {
        sessionAbortRef.current = null;
      }
    }
  }, [accessToken, examId, loadAttempts]);

  useEffect(() => {
    void loadExam();
  }, [loadExam]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortAll();
    };
  }, [abortAll]);

  const handleAnswerChange = (questionId: string, value: string) => {
    if (errorText) setErrorText('');

    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));

    if (result) {
      setResult(null);
    }
  };

  const handleLoadAttempt = (attempt: AiExamAttempt) => {
    setAnswers(mapAttemptAnswersToAnswerMap(attempt));
    setResult(attempt.result ?? null);
    setErrorText('');

    toast({
      title: 'Тапсыру ашылды',
      description: 'Таңдалған тапсырудың жауаптары мен нәтижесі көрсетілді.',
    });
  };

  const handleSubmit = async () => {
    submitAbortRef.current?.abort();

    if (!examSession || !examId || !accessToken) return;

    if (answeredCount !== totalQuestions) {
      toast({
        title: 'Толық емес',
        description: 'Барлық сұрақтарға жауап беріңіз.',
        variant: 'destructive',
      });
      return;
    }

    const requestId = submitRequestIdRef.current + 1;
    submitRequestIdRef.current = requestId;

    const controller = new AbortController();
    submitAbortRef.current = controller;

    setIsSubmitting(true);
    setErrorText('');

    try {
      const response = await submitAiExam(
        examId,
        {
          answers: examSession.questions.map((question) => ({
            questionId: question.id,
            answer: answers[question.id] ?? '',
          })),
        },
        {
          accessToken,
          signal: controller.signal,
          timeoutMs: SUBMIT_TIMEOUT_MS,
        },
      );

      if (!mountedRef.current || submitRequestIdRef.current !== requestId) return;

      const normalizedResult = normalizeSubmitResponse(response) ?? response;
      setResult(normalizedResult);

      const newAttempt: AiExamAttempt = {
        id: normalizedResult.attemptId || `attempt-local-${Date.now()}`,
        examId,
        userId: user?.id,
        answers: examSession.questions.map((question) => ({
          questionId: question.id,
          answer: answers[question.id] ?? '',
        })),
        result: normalizedResult,
        submittedAt: new Date().toISOString(),
      };

      setAttempts((prev) => {
        const filtered = prev.filter((item) => item.id !== newAttempt.id);

        return [newAttempt, ...filtered];
      });

      setExamSession((prev) =>
        prev
          ? {
              ...prev,
              attemptId: normalizedResult.attemptId ?? prev.attemptId,
              latestResult: normalizedResult,
              latestAnswers: newAttempt.answers,
              latestSubmittedAt: newAttempt.submittedAt,
            }
          : prev,
      );

      toast({
        title: 'Емтихан жіберілді',
        description: 'Нәтиже сәтті есептелді.',
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const message =
        error instanceof Error ? error.message : 'Емтиханды жіберу мүмкін болмады.';

      if (mountedRef.current && submitRequestIdRef.current === requestId) {
        setErrorText(message);
      }

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current && submitRequestIdRef.current === requestId) {
        setIsSubmitting(false);
      }

      if (submitAbortRef.current === controller) {
        submitAbortRef.current = null;
      }
    }
  };

  const handleResetAnswers = () => {
    submitAbortRef.current?.abort();
    submitAbortRef.current = null;

    setAnswers({});
    setResult(null);
    setErrorText('');
    setIsSubmitting(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={13} />
              Артқа
            </button>
          }
          icon={<ClipboardList size={20} />}
          title="AI емтихан сессиясы"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/ai-practice">
                  <ClipboardList size={14} className="mr-2" />
                  AI практика
                </Link>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadExam()}
                disabled={isLoading || isSubmitting || !accessToken}
              >
                {isLoading ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <RefreshCcw size={14} className="mr-2" />
                )}
                Жаңарту
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleResetAnswers}
                disabled={isLoading || isSubmitting || !hasQuestions}
              >
                Жауаптарды тазалау
              </Button>
            </div>
          }
        />

        {isLoading ? <LoadingState text="Емтихан жүктеліп жатыр..." /> : null}
        {errorText ? <ErrorState text={errorText} /> : null}

        {!isLoading && !errorText && !hasExamSession ? (
          <EmptyState
            title="Емтихан табылмады"
            text="Бұл ID бойынша емтихан сессиясы жоқ."
          />
        ) : null}

        {!isLoading && hasExamSession && !hasQuestions ? (
          <EmptyState
            title="Сұрақтар жоқ"
            text="Бұл емтихан үшін қолжетімді сұрақтар табылмады."
          />
        ) : null}

        {!isLoading && hasExamSession && hasQuestions ? (
          <>
            <Card>
              <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                <CardTitle className="text-base font-semibold">
                  Емтихан ақпараты
                </CardTitle>
              </CardHeader>

              <CardContent className="grid gap-3 p-4 sm:p-5 md:grid-cols-4">
                <ExamInfoCell label="Атауы" value={examSession.exam.title} />
                <ExamInfoCell label="Сұрақ саны" value={totalQuestions} />
                <ExamInfoCell label="Пән" value={examSession.exam.subject || '—'} />
                <ExamInfoCell
                  label="Уақыты"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <TimerReset size={14} className="text-primary" />
                      {examSession.exam.durationMinutes
                        ? `${examSession.exam.durationMinutes} мин`
                        : 'Шектелмеген'}
                    </span>
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold">
                    Жауап беру
                  </CardTitle>

                  <StatusBadge
                    tone={answeredCount === totalQuestions ? 'success' : 'warning'}
                  >
                    {answeredCount}/{totalQuestions}
                  </StatusBadge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 p-4 sm:p-5">
                {examSession.questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Сұрақ {index + 1}
                        </p>

                        {question.points !== undefined ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Ұпай: {question.points}
                          </p>
                        ) : null}
                      </div>

                      <StatusBadge tone="muted">
                        {question.type === 'multiple_choice'
                          ? 'Жауап нұсқалары'
                          : 'Қысқа жауап'}
                      </StatusBadge>
                    </div>

                    <p className="text-sm leading-7 text-foreground">
                      {question.question}
                    </p>

                    {question.type === 'multiple_choice' && question.options?.length ? (
                      <div className="mt-4 space-y-2">
                        {question.options.map((option) => {
                          const checked = answers[question.id] === option.text;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleAnswerChange(question.id, option.text)}
                              disabled={isSubmitting}
                              className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                                checked
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border bg-card hover:bg-accent'
                              } ${isSubmitting ? 'opacity-70' : ''}`}
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
                      <Textarea
                        value={answers[question.id] || ''}
                        onChange={(event) =>
                          handleAnswerChange(question.id, event.target.value)
                        }
                        placeholder="Жауабыңызды жазыңыз..."
                        rows={4}
                        disabled={isSubmitting}
                        className="mt-4"
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                <CardTitle className="text-base font-semibold">
                  Емтиханды жіберу
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-muted-foreground">
                  {answeredCount === totalQuestions
                    ? 'Барлық сұраққа жауап берілді.'
                    : `Әлі ${totalQuestions - answeredCount} сұрақ қалды.`}
                </div>

                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  {isSubmitting ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : (
                    <FileCheck2 size={16} className="mr-2" />
                  )}
                  {isSubmitting ? 'Жіберілуде...' : 'Емтиханды жіберу'}
                </Button>
              </CardContent>
            </Card>

            {result ? (
              <Card>
                <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base font-semibold">Нәтиже</CardTitle>
                    <StatusBadge tone="success">{getScoreText(result)}</StatusBadge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <ExamInfoCell label="Ұпай" value={result.score} />
                    <ExamInfoCell label="Макс. ұпай" value={result.maxScore ?? '—'} />
                    <ExamInfoCell
                      label="Пайыз"
                      value={
                        result.percentage !== undefined ? `${result.percentage}%` : '—'
                      }
                    />
                  </div>

                  {result.feedback ? (
                    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 text-sm leading-7 text-muted-foreground shadow-inner-soft">
                      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                        <CheckCircle2 size={15} className="text-primary" />
                        Жалпы пікір
                      </div>
                      {result.feedback}
                    </div>
                  ) : null}

                  {result.breakdown?.length ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">
                        Сұрақтар бойынша нәтиже
                      </p>

                      {result.breakdown.map((item) => {
                        const questionNumber = questionNumberMap.get(item.questionId);

                        return (
                          <div
                            key={item.questionId}
                            className="rounded-3xl border border-border bg-card p-4 text-sm shadow-soft"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                {questionNumber
                                  ? `Сұрақ ${questionNumber}`
                                  : 'Сұрақ'}
                              </span>

                              <span className="font-medium">
                                {item.score}
                                {item.maxScore !== undefined ? ` / ${item.maxScore}` : ''}
                              </span>
                            </div>

                            {typeof item.isCorrect === 'boolean' ? (
                              <div className="mt-2 text-xs text-muted-foreground">
                                {item.isCorrect ? 'Дұрыс' : 'Қате немесе толық емес'}
                              </div>
                            ) : null}

                            {item.feedback ? (
                              <p className="mt-2 leading-7 text-muted-foreground">
                                {item.feedback}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold">
                    Бұрынғы тапсырулар
                  </CardTitle>

                  <StatusBadge tone="muted">{attempts.length}</StatusBadge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 p-4 sm:p-5">
                {isLoadingAttempts ? (
                  <LoadingState text="Бұрынғы тапсырулар жүктеліп жатыр..." />
                ) : attemptsErrorText ? (
                  <ErrorState text={attemptsErrorText} />
                ) : !hasAttempts ? (
                  <EmptyState
                    title="Тапсыру жоқ"
                    text="Бұл емтихан бойынша сақталған тапсырулар табылмады."
                    compact
                  />
                ) : (
                  attempts.map((attempt, index) => {
                    const isActive = activeAttemptId === attempt.id;

                    return (
                      <div
                        key={attempt.id}
                        className={`rounded-3xl border p-4 shadow-soft ${
                          isActive
                            ? 'border-primary-muted bg-primary-soft/70'
                            : 'border-border bg-surface-soft/60'
                        }`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <History size={14} />
                              <span>Тапсыру {attempts.length - index}</span>
                            </div>

                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(attempt.submittedAt)}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {getScoreText(attempt.result)}
                            </p>
                          </div>

                          <Button
                            variant={isActive ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleLoadAttempt(attempt)}
                          >
                            {isActive ? 'Қазір ашық' : 'Ашу'}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}