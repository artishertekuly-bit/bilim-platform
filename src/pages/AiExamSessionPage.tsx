import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  type AiExamQuestion,
  type AiExamSession,
  type SubmitAiExamResponse,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

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

const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_ANSWER_CHARS = 4_000;
const MAX_FEEDBACK_CHARS = 2_500;
const MAX_QUESTION_CHARS = 2_000;
const MAX_OPTION_CHARS = 700;
const MAX_DATE_CHARS = 100;
const MAX_QUESTIONS = 120;
const MAX_ATTEMPTS = 100;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_META_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_FEEDBACK_CHARS): string {
  return limitText(
    cleanRawText(value)
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

function cleanAnswer(value: unknown): string {
  return cleanMultilineText(value, MAX_ANSWER_CHARS);
}

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

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAbortLikeError(error)) return '';

  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, 700);
  }

  return fallback;
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeScore(value: unknown, fallback = 0) {
  const numeric = toNumber(value, fallback);

  return Math.max(0, Math.round(numeric * 100) / 100);
}

function normalizePercentage(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  const numeric = toNumber(value, 0);

  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

function normalizeQuestionType(value: unknown): AiExamQuestion['type'] {
  return value === 'multiple_choice' ? 'multiple_choice' : 'short_answer';
}

function normalizeOptionId(questionId: string, value: unknown, index: number) {
  return cleanId(value) || `${questionId}-option-${index + 1}`;
}

function normalizeQuestionId(value: unknown, index: number, seen: Set<string>) {
  const base = cleanId(value) || `exam-question-${index + 1}`;
  let id = base;
  let suffix = 2;

  while (seen.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  seen.add(id);

  return id;
}

function normalizeExamQuestion(
  question: AiExamQuestion,
  index: number,
  seen: Set<string>,
): AiExamQuestion {
  const id = normalizeQuestionId(question.id, index, seen);

  const options = (question.options || [])
    .map((option, optionIndex) => ({
      ...option,
      id: normalizeOptionId(id, option.id, optionIndex),
      text: cleanText(option.text, MAX_OPTION_CHARS),
      isCorrect: Boolean(option.isCorrect),
    }))
    .filter((option) => option.text.length > 0)
    .slice(0, 12);

  const type = normalizeQuestionType(question.type);

  return {
    ...question,
    id,
    type: type === 'multiple_choice' && options.length >= 2 ? 'multiple_choice' : 'short_answer',
    question: cleanMultilineText(question.question, MAX_QUESTION_CHARS) || 'Сұрақ',
    options: type === 'multiple_choice' && options.length >= 2 ? options : undefined,
    correctAnswer: cleanMultilineText(question.correctAnswer, MAX_ANSWER_CHARS) || undefined,
    explanation: cleanMultilineText(question.explanation, MAX_FEEDBACK_CHARS) || undefined,
    points:
      question.points === undefined || question.points === null
        ? undefined
        : Math.max(0, Math.round(toNumber(question.points, 0) * 100) / 100),
  };
}

function normalizeExamSession(raw: SessionWithLatestAttempt): AiExamSession {
  const seen = new Set<string>();

  return {
    ...raw,
    attemptId: cleanId(raw.attemptId ?? raw.attempt_id) || undefined,
    exam: {
      ...raw.exam,
      id: cleanId(raw.exam?.id),
      title: cleanText(raw.exam?.title, MAX_TITLE_CHARS) || 'Емтихан',
      subject: cleanText(raw.exam?.subject, MAX_META_CHARS) || undefined,
      topic: cleanText(raw.exam?.topic, MAX_META_CHARS) || undefined,
      durationMinutes:
        raw.exam?.durationMinutes === undefined || raw.exam?.durationMinutes === null
          ? undefined
          : Math.max(0, Math.round(toNumber(raw.exam.durationMinutes, 0))),
    },
    questions: (raw.questions || [])
      .slice(0, MAX_QUESTIONS)
      .map((question, index) => normalizeExamQuestion(question, index, seen))
      .filter((question) => cleanId(question.id) && cleanText(question.question, MAX_QUESTION_CHARS)),
  };
}

function normalizeSubmitResponse(raw: unknown): SubmitAiExamResponse | null {
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as RawSubmitResponse;

  return {
    attemptId: cleanId(data.attemptId ?? data.attempt_id) || undefined,
    score: normalizeScore(data.score, 0),
    maxScore:
      data.maxScore !== undefined || data.max_score !== undefined
        ? normalizeScore(data.maxScore ?? data.max_score, 0)
        : undefined,
    percentage: normalizePercentage(data.percentage),
    feedback: cleanMultilineText(data.feedback, MAX_FEEDBACK_CHARS),
    breakdown: Array.isArray(data.breakdown)
      ? data.breakdown
          .slice(0, MAX_QUESTIONS)
          .map((item) => ({
            questionId: cleanId(item.questionId ?? item.question_id),
            score: normalizeScore(item.score, 0),
            maxScore:
              item.maxScore !== undefined || item.max_score !== undefined
                ? normalizeScore(item.maxScore ?? item.max_score, 0)
                : undefined,
            feedback: cleanMultilineText(item.feedback, MAX_FEEDBACK_CHARS),
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
    const questionId = cleanId(item.questionId ?? item.question_id);

    if (!questionId) continue;

    if (Array.isArray(item.answer)) {
      answerMap[questionId] = item.answer
        .map((value) => cleanAnswer(value))
        .filter(Boolean)
        .join(', ');
      continue;
    }

    answerMap[questionId] = cleanAnswer(item.answer);
  }

  return answerMap;
}

function normalizeAttempt(attempt: AiExamAttempt, fallbackExamId: string): AiExamAttempt | null {
  const id = cleanId(attempt.id);
  const examId = cleanId(attempt.examId) || fallbackExamId;

  if (!id || !examId) return null;

  return {
    ...attempt,
    id,
    examId,
    userId: cleanId(attempt.userId) || undefined,
    submittedAt: cleanText(attempt.submittedAt, MAX_DATE_CHARS) || undefined,
    answers: (attempt.answers || [])
      .map((item) => ({
        questionId: cleanId(item.questionId),
        answer: cleanAnswer(item.answer),
      }))
      .filter((item) => item.questionId && item.answer),
    result: normalizeSubmitResponse(attempt.result) || attempt.result || null,
  };
}

function normalizeAttempts(items: AiExamAttempt[], fallbackExamId: string): AiExamAttempt[] {
  const seen = new Set<string>();

  return (items || [])
    .slice(0, MAX_ATTEMPTS)
    .map((attempt) => normalizeAttempt(attempt, fallbackExamId))
    .filter((attempt): attempt is AiExamAttempt => Boolean(attempt))
    .filter((attempt) => {
      if (seen.has(attempt.id)) return false;

      seen.add(attempt.id);
      return true;
    });
}

function formatDateTime(value?: string | null) {
  const rawValue = cleanText(value, MAX_DATE_CHARS);

  if (!rawValue) return '—';

  const date = new Date(rawValue);

  if (Number.isNaN(date.getTime())) return rawValue;

  return date.toLocaleString('kk-KZ');
}

function mapAttemptAnswersToAnswerMap(
  attempt: AiExamAttempt | null | undefined,
): AnswerMap {
  if (!attempt?.answers?.length) return {};

  const result: AnswerMap = {};

  for (const item of attempt.answers) {
    const questionId = cleanId(item?.questionId);

    if (!questionId) continue;

    result[questionId] = cleanAnswer(item.answer);
  }

  return result;
}

function getScoreText(result?: SubmitAiExamResponse | null) {
  if (!result) return 'Нәтиже жоқ';

  const score = normalizeScore(result.score, 0);
  const maxScore =
    result.maxScore !== undefined ? ` / ${normalizeScore(result.maxScore, 0)}` : '';
  const percentage =
    result.percentage !== undefined
      ? ` · ${normalizePercentage(result.percentage) ?? 0}%`
      : '';

  return `${score}${maxScore}${percentage}`;
}

function getQuestionTypeLabel(type: AiExamQuestion['type']) {
  return type === 'multiple_choice' ? 'Жауап нұсқалары' : 'Қысқа жауап';
}

function ExamInfoCell({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
      <p className="text-xs text-muted-foreground">{cleanText(label, MAX_META_CHARS)}</p>
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
  const safeExamId = cleanId(examId);
  const safeUserId = cleanId(user?.id);

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
      const questionId = cleanId(question.id);
      const value = answers[questionId];

      return typeof value === 'string' && cleanAnswer(value).length > 0;
    }).length;
  }, [answers, examSession]);

  const canSubmit =
    hasQuestions &&
    answeredCount === totalQuestions &&
    !isSubmitting &&
    !isLoading &&
    Boolean(accessToken && safeExamId);

  const questionNumberMap = useMemo(() => {
    const map = new Map<string, number>();

    examSession?.questions.forEach((question, index) => {
      const questionId = cleanId(question.id);

      if (questionId) {
        map.set(questionId, index + 1);
      }
    });

    return map;
  }, [examSession]);

  const activeAttemptId = cleanId(result?.attemptId || examSession?.attemptId);

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

    if (!safeExamId || !accessToken) {
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
      const response = await listAiExamAttempts(safeExamId, {
        accessToken,
        signal: controller.signal,
        timeoutMs: ATTEMPTS_TIMEOUT_MS,
      });

      if (!mountedRef.current || attemptsRequestIdRef.current !== requestId) return;

      setAttempts(normalizeAttempts(response.attempts || [], safeExamId));
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const message = getErrorMessage(
        error,
        'Бұрынғы тапсыруларды жүктеу мүмкін болмады.',
      );

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
  }, [accessToken, safeExamId]);

  const loadExam = useCallback(async () => {
    sessionAbortRef.current?.abort();

    if (!safeExamId) {
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
      const response = (await getAiExamSession(safeExamId, {
        accessToken,
        signal: controller.signal,
        timeoutMs: SESSION_TIMEOUT_MS,
      })) as SessionWithLatestAttempt;

      if (!mountedRef.current || sessionRequestIdRef.current !== requestId) return;

      const normalizedSession = normalizeExamSession(response);
      const latestResult = normalizeSubmitResponse(
        response.latestResult ?? response.latest_result,
      );

      setExamSession(normalizedSession);
      setResult(latestResult);
      setAnswers(
        normalizeLatestAnswers(response.latestAnswers ?? response.latest_answers),
      );

      await loadAttempts();
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const message = getErrorMessage(
        error,
        'Емтихан сессиясын жүктеу мүмкін болмады.',
      );

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
  }, [accessToken, loadAttempts, safeExamId]);

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
    const safeQuestionId = cleanId(questionId);
    const safeAnswer = cleanAnswer(value);

    if (!safeQuestionId) return;

    if (errorText) setErrorText('');

    setAnswers((prev) => ({
      ...prev,
      [safeQuestionId]: safeAnswer,
    }));

    if (result) {
      setResult(null);
    }
  };

  const handleLoadAttempt = (attempt: AiExamAttempt) => {
    const normalizedAttempt = normalizeAttempt(attempt, safeExamId);

    if (!normalizedAttempt) return;

    setAnswers(mapAttemptAnswersToAnswerMap(normalizedAttempt));
    setResult(normalizeSubmitResponse(normalizedAttempt.result) || normalizedAttempt.result || null);
    setErrorText('');

    toast({
      title: 'Тапсыру ашылды',
      description: 'Таңдалған тапсырудың жауаптары мен нәтижесі көрсетілді.',
    });
  };

  const handleSubmit = async () => {
    submitAbortRef.current?.abort();

    if (!examSession || !safeExamId || !accessToken) return;

    if (answeredCount !== totalQuestions) {
      toast({
        title: 'Толық емес',
        description: 'Барлық сұрақтарға жауап беріңіз.',
        variant: 'destructive',
      });
      return;
    }

    const safeAnswers = examSession.questions.map((question) => ({
      questionId: cleanId(question.id),
      answer: cleanAnswer(answers[cleanId(question.id)] ?? ''),
    }));

    if (safeAnswers.some((item) => !item.questionId || !item.answer)) {
      toast({
        title: 'Толық емес',
        description: 'Жауап дерегін тексеріңіз.',
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
        safeExamId,
        {
          answers: safeAnswers,
        },
        {
          accessToken,
          signal: controller.signal,
          timeoutMs: SUBMIT_TIMEOUT_MS,
        },
      );

      if (!mountedRef.current || submitRequestIdRef.current !== requestId) return;

      const normalizedResult = normalizeSubmitResponse(response) ?? response;
      const localAttemptId =
        cleanId(normalizedResult.attemptId) || `attempt-local-${Date.now()}`;

      setResult(normalizedResult);

      const newAttempt: AiExamAttempt = {
        id: localAttemptId,
        examId: safeExamId,
        userId: safeUserId || undefined,
        answers: safeAnswers,
        result: normalizedResult,
        submittedAt: new Date().toISOString(),
      };

      setAttempts((prev) => {
        const filtered = prev.filter((item) => cleanId(item.id) !== localAttemptId);

        return normalizeAttempts([newAttempt, ...filtered], safeExamId);
      });

      setExamSession((prev) =>
        prev
          ? {
              ...prev,
              attemptId: cleanId(normalizedResult.attemptId) || prev.attemptId,
            }
          : prev,
      );

      toast({
        title: 'Емтихан жіберілді',
        description: 'Нәтиже сәтті есептелді.',
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const message = getErrorMessage(error, 'Емтиханды жіберу мүмкін болмады.');

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
          title="ЖИ емтихан сессиясы"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/ai-practice">
                  <ClipboardList size={14} className="mr-2" />
                  ЖИ практика
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
                {examSession.questions.map((question, index) => {
                  const questionId = cleanId(question.id);
                  const questionAnswer = answers[questionId] || '';

                  return (
                    <div
                      key={questionId || index}
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
                          {getQuestionTypeLabel(question.type)}
                        </StatusBadge>
                      </div>

                      <p className="text-sm leading-7 text-foreground">
                        {question.question}
                      </p>

                      {question.type === 'multiple_choice' && question.options?.length ? (
                        <div className="mt-4 space-y-2">
                          {question.options.map((option) => {
                            const checked = questionAnswer === option.text;

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() =>
                                  handleAnswerChange(questionId, option.text)
                                }
                                disabled={isSubmitting || !questionId}
                                className={cn(
                                  'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70',
                                  checked
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border bg-card hover:bg-accent',
                                )}
                              >
                                <span
                                  className={cn(
                                    'mt-0.5 inline-block h-4 w-4 rounded-full border',
                                    checked ? 'border-primary bg-primary' : 'border-border',
                                  )}
                                />
                                <span>{option.text}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 space-y-1.5">
                          <Textarea
                            value={questionAnswer}
                            onChange={(event) =>
                              handleAnswerChange(questionId, event.target.value)
                            }
                            placeholder="Жауабыңызды жазыңыз"
                            rows={4}
                            disabled={isSubmitting || !questionId}
                            maxLength={MAX_ANSWER_CHARS}
                          />

                          <p className="text-[11px] text-muted-foreground">
                            {questionAnswer.length}/{MAX_ANSWER_CHARS}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                <CardTitle className="text-base font-semibold">
                  Емтиханды жіберу
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="text-sm text-muted-foreground">
                  {answeredCount === totalQuestions
                    ? 'Барлық сұраққа жауап берілді.'
                    : `Әлі ${Math.max(totalQuestions - answeredCount, 0)} сұрақ қалды.`}
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
                    <ExamInfoCell label="Ұпай" value={normalizeScore(result.score, 0)} />
                    <ExamInfoCell
                      label="Макс. ұпай"
                      value={
                        result.maxScore !== undefined
                          ? normalizeScore(result.maxScore, 0)
                          : '—'
                      }
                    />
                    <ExamInfoCell
                      label="Пайыз"
                      value={
                        result.percentage !== undefined
                          ? `${normalizePercentage(result.percentage) ?? 0}%`
                          : '—'
                      }
                    />
                  </div>

                  {result.feedback ? (
                    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 text-sm leading-7 text-muted-foreground shadow-inner-soft">
                      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                        <CheckCircle2 size={15} className="text-primary" />
                        Жалпы пікір
                      </div>
                      {cleanMultilineText(result.feedback, MAX_FEEDBACK_CHARS)}
                    </div>
                  ) : null}

                  {result.breakdown?.length ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">
                        Сұрақтар бойынша нәтиже
                      </p>

                      {result.breakdown.map((item) => {
                        const questionId = cleanId(item.questionId);
                        const questionNumber = questionNumberMap.get(questionId);

                        return (
                          <div
                            key={questionId}
                            className="rounded-3xl border border-border bg-card p-4 text-sm shadow-soft"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                {questionNumber
                                  ? `Сұрақ ${questionNumber}`
                                  : 'Сұрақ'}
                              </span>

                              <span className="font-medium">
                                {normalizeScore(item.score, 0)}
                                {item.maxScore !== undefined
                                  ? ` / ${normalizeScore(item.maxScore, 0)}`
                                  : ''}
                              </span>
                            </div>

                            {typeof item.isCorrect === 'boolean' ? (
                              <div className="mt-2 text-xs text-muted-foreground">
                                {item.isCorrect ? 'Дұрыс' : 'Қате немесе толық емес'}
                              </div>
                            ) : null}

                            {item.feedback ? (
                              <p className="mt-2 whitespace-pre-line leading-7 text-muted-foreground">
                                {cleanMultilineText(item.feedback, MAX_FEEDBACK_CHARS)}
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
                    const attemptId = cleanId(attempt.id);
                    const isActive = activeAttemptId === attemptId;

                    return (
                      <div
                        key={attemptId || index}
                        className={cn(
                          'rounded-3xl border p-4 shadow-soft',
                          isActive
                            ? 'border-primary-muted bg-primary-soft/70'
                            : 'border-border bg-surface-soft/60',
                        )}
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
