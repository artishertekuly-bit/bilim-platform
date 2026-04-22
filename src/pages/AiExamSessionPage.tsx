import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  getAiExamSession,
  listAiExamAttempts,
  submitAiExam,
  type AiExamAttempt,
  type AiExamSession,
  type SubmitAiExamResponse,
} from '@/lib/ai-api';
import {
  ClipboardList,
  TimerReset,
  FileCheck2,
  ArrowLeft,
  CheckCircle2,
  History,
} from 'lucide-react';

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

function normalizeSubmitResponse(raw: unknown): SubmitAiExamResponse | null {
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as RawSubmitResponse;

  return {
    attemptId: data.attemptId ?? data.attempt_id ?? undefined,
    score: Number(data.score ?? 0),
    maxScore:
      data.maxScore !== undefined || data.max_score !== undefined
        ? Number(data.maxScore ?? data.max_score)
        : undefined,
    percentage: data.percentage !== undefined ? Number(data.percentage) : undefined,
    feedback: typeof data.feedback === 'string' ? data.feedback : '',
    breakdown: Array.isArray(data.breakdown)
      ? data.breakdown.map((item) => ({
          questionId: item.questionId ?? item.question_id ?? '',
          score: Number(item.score ?? 0),
          maxScore:
            item.maxScore !== undefined || item.max_score !== undefined
              ? Number(item.maxScore ?? item.max_score)
              : undefined,
          feedback: typeof item.feedback === 'string' ? item.feedback : '',
          isCorrect:
            typeof (item.isCorrect ?? item.is_correct) === 'boolean'
              ? Boolean(item.isCorrect ?? item.is_correct)
              : undefined,
        }))
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

  return date.toLocaleString();
}

function mapAttemptAnswersToAnswerMap(attempt: AiExamAttempt | null | undefined): AnswerMap {
  if (!attempt?.answers?.length) return {};

  const result: AnswerMap = {};
  for (const item of attempt.answers) {
    if (!item?.questionId) continue;
    result[item.questionId] = String(item.answer ?? '').trim();
  }
  return result;
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

  useEffect(() => {
    let cancelled = false;

    async function loadExam() {
      if (!examId) {
        setExamSession(null);
        setAnswers({});
        setResult(null);
        setAttempts([]);
        setErrorText('Емтихан идентификаторы табылмады.');
        return;
      }

      if (!accessToken) {
        setExamSession(null);
        setAnswers({});
        setResult(null);
        setAttempts([]);
        setErrorText('Авторизация қажет.');
        return;
      }

      setIsLoading(true);
      setIsLoadingAttempts(true);
      setErrorText('');
      setExamSession(null);
      setAnswers({});
      setResult(null);
      setAttempts([]);

      try {
        const response = (await getAiExamSession(examId, {
          accessToken,
        })) as SessionWithLatestAttempt;

        if (cancelled) return;

        const normalizedSession: AiExamSession = {
          ...response,
          attemptId: response.attemptId ?? response.attempt_id ?? undefined,
        };

        setExamSession(normalizedSession);

        const latestResult = normalizeSubmitResponse(
          response.latestResult ?? response.latest_result
        );
        setResult(latestResult);

        const latestAnswers = normalizeLatestAnswers(
          response.latestAnswers ?? response.latest_answers
        );
        setAnswers(latestAnswers);

        try {
          const attemptsResponse = await listAiExamAttempts(examId, {
            accessToken,
          });

          if (!cancelled) {
            setAttempts(attemptsResponse.attempts);
          }
        } catch (attemptError) {
          if (!cancelled) {
            const message =
              attemptError instanceof Error
                ? attemptError.message
                : 'Attempt history жүктеу мүмкін болмады.';
            setErrorText((prev) => prev || message);
          }
        } finally {
          if (!cancelled) {
            setIsLoadingAttempts(false);
          }
        }
      } catch (error) {
        if (cancelled) return;

        const message =
          error instanceof Error ? error.message : 'Емтихан сессиясын жүктеу мүмкін болмады.';

        setErrorText(message);
        setIsLoadingAttempts(false);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadExam();

    return () => {
      cancelled = true;
    };
  }, [examId, accessToken]);

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

  const handleAnswerChange = (questionId: string, value: string) => {
    if (errorText) {
      setErrorText('');
    }

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
      title: 'Attempt жүктелді',
      description: 'Таңдалған тапсырудың жауаптары мен нәтижесі көрсетілді.',
    });
  };

  const handleSubmit = async () => {
    if (!examSession || !examId || !accessToken) return;

    if (answeredCount !== totalQuestions) {
      toast({
        title: 'Толық емес',
        description: 'Барлық сұрақтарға жауап беріңіз.',
        variant: 'destructive',
      });
      return;
    }

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
        }
      );

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
          : prev
      );

      toast({
        title: 'Емтихан жіберілді',
        description: 'Нәтиже сәтті есептелді.',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Емтиханды жіберу мүмкін болмады.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAnswers = () => {
    setAnswers({});
    setResult(null);
    setErrorText('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={13} />
              Артқа
            </button>

            <h2 className="text-xl font-bold">AI емтихан сессиясы</h2>
            <p className="text-sm text-muted-foreground">
              Емтиханды ашу, сұрақтарға жауап беру және нәтижені жіберу бөлімі.
            </p>
          </div>

          <div className="flex gap-2">
            <Link to="/ai-practice">
              <Button variant="outline" size="sm">
                <ClipboardList size={14} className="mr-2" />
                AI практикаға өту
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAnswers}
              disabled={isLoading || isSubmitting || !hasQuestions}
            >
              Жауаптарды тазалау
            </Button>
          </div>
        </div>

        {isLoading ? <LoadingState text="Емтихан сессиясы жүктеліп жатыр..." /> : null}
        {errorText ? <ErrorState text={errorText} /> : null}

        {!isLoading && !errorText && !hasExamSession ? (
          <EmptyState
            title="Емтихан табылмады"
            text="Бұл идентификатор бойынша жүктелетін емтихан сессиясы жоқ."
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
              <CardHeader>
                <CardTitle className="text-base font-semibold">Емтихан ақпараты</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Атауы</p>
                  <p className="mt-1 text-sm font-medium">{examSession.exam.title}</p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Сұрақ саны</p>
                  <p className="mt-1 text-sm font-medium">{totalQuestions}</p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Пән</p>
                  <p className="mt-1 text-sm font-medium">{examSession.exam.subject || '—'}</p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Уақыты</p>
                  <p className="mt-1 flex items-center gap-1 text-sm font-medium">
                    <TimerReset size={14} className="text-primary" />
                    {examSession.exam.durationMinutes
                      ? `${examSession.exam.durationMinutes} мин`
                      : 'Шектелмеген'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Прогресс</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Жауап берілді</p>
                  <p className="mt-1 text-lg font-semibold">
                    {answeredCount}/{totalQuestions}
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Статус</p>
                  <p className="mt-1 text-sm font-medium">
                    {answeredCount === totalQuestions
                      ? 'Жіберуге дайын'
                      : 'Жауап беру жүріп жатыр'}
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Attempt</p>
                  <p className="mt-1 text-sm font-medium">
                    {activeAttemptId || 'Жаңа сессия'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Бұрынғы тапсырулар</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingAttempts ? (
                  <LoadingState text="Attempt history жүктеліп жатыр..." />
                ) : !hasAttempts ? (
                  <EmptyState
                    title="Attempt history жоқ"
                    text="Бұл емтихан бойынша әлі сақталған тапсырулар табылмады."
                  />
                ) : (
                  attempts.map((attempt, index) => {
                    const score = attempt.result?.score;
                    const maxScore = attempt.result?.maxScore;
                    const percentage = attempt.result?.percentage;
                    const isActive = activeAttemptId === attempt.id;

                    return (
                      <div
                        key={attempt.id}
                        className={`rounded-lg border p-4 ${
                          isActive ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <History size={14} />
                              <span>Attempt {attempts.length - index}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(attempt.submittedAt)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {score !== undefined ? `Ұпай: ${score}` : 'Ұпай жоқ'}
                              {maxScore !== undefined ? ` / ${maxScore}` : ''}
                              {percentage !== undefined ? ` · ${percentage}%` : ''}
                            </p>
                          </div>

                          <Button
                            variant={isActive ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleLoadAttempt(attempt)}
                          >
                            {isActive ? 'Қазір көрсетіліп тұр' : 'Осы attempt-ті ашу'}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {examSession.questions.map((question, index) => (
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
                          const checked = answers[question.id] === option.text;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleAnswerChange(question.id, option.text)}
                              disabled={isSubmitting}
                              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                                checked ? 'border-primary bg-primary/5' : 'hover:bg-accent'
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
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        placeholder="Жауабыңызды жазыңыз..."
                        rows={4}
                        disabled={isSubmitting}
                      />
                    )}

                    {question.points !== undefined ? (
                      <div className="text-xs text-muted-foreground">
                        Ұпай: {question.points}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Submit</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-muted-foreground">
                  Емтиханды жібермес бұрын барлық сұрақтарға жауап берілгеніне көз жеткізіңіз.
                </div>

                <Button onClick={handleSubmit} disabled={!canSubmit}>
                  <FileCheck2 size={16} className="mr-2" />
                  {isSubmitting ? 'Жіберілуде...' : 'Емтиханды жіберу'}
                </Button>
              </CardContent>
            </Card>

            {result ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Нәтиже</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Ұпай</p>
                      <p className="mt-1 text-lg font-semibold">{result.score}</p>
                    </div>

                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Макс. ұпай</p>
                      <p className="mt-1 text-lg font-semibold">{result.maxScore ?? '—'}</p>
                    </div>

                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Пайыз</p>
                      <p className="mt-1 text-lg font-semibold">
                        {result.percentage !== undefined ? `${result.percentage}%` : '—'}
                      </p>
                    </div>

                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Attempt ID</p>
                      <p className="mt-1 text-sm font-medium">{result.attemptId || '—'}</p>
                    </div>
                  </div>

                  {result.feedback ? (
                    <div className="rounded-lg border p-4 text-sm leading-7 text-muted-foreground">
                      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                        <CheckCircle2 size={15} className="text-primary" />
                        Жалпы пікір
                      </div>
                      {result.feedback}
                    </div>
                  ) : null}

                  {result.breakdown?.length ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Сұрақтар бойынша breakdown</p>
                      {result.breakdown.map((item) => {
                        const questionNumber = questionNumberMap.get(item.questionId);

                        return (
                          <div key={item.questionId} className="rounded-lg border p-4 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                {questionNumber
                                  ? `Сұрақ ${questionNumber}`
                                  : `Question ID: ${item.questionId}`}
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
                              <p className="mt-2 leading-7 text-muted-foreground">{item.feedback}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}