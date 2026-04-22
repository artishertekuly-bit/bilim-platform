import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useTests, platformKeys } from '@/hooks/use-platform-data';
import {
  getTestAttemptBreakdown,
  getTestQuestions,
  submitTestAttempt,
} from '@/lib/app-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  Clock,
  CheckCircle,
  ArrowRight,
  ClipboardList,
  RotateCcw,
  XCircle,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';
import type { TestAttemptBreakdownItem } from '@/lib/app-data';
import { useNavigate } from 'react-router-dom';

type ViewState = 'list' | 'taking' | 'result';

function normalizeAnswerIndexes(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .sort((a, b) => a - b);
  }

  if (value === null || value === undefined) return [];

  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? [asNumber] : [];
}

function formatAnswer(options: string[], selected: number[]) {
  if (selected.length === 0) return t('page.tests.answer.not_answered');

  return [...selected]
    .sort((a, b) => a - b)
    .map((index) => {
      const label = String.fromCharCode(65 + index);
      const value = options[index] ?? '—';
      return `${label}. ${value}`;
    })
    .join(', ');
}

export default function TestsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isStudent = user?.role === 'student';

  const [view, setView] = useState<ViewState>('list');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [activeSubject, setActiveSubject] = useState('all');
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Tables<'test_questions'>[]>([]);
  const [result, setResult] = useState<{
    score: number;
    correctCount: number;
    attemptId: string | null;
    breakdown: TestAttemptBreakdownItem[];
  }>({
    score: 0,
    correctCount: 0,
    attemptId: null,
    breakdown: [],
  });

  const { data, isLoading, error } = useTests(isStudent ? user?.id : undefined, !!user);

  const subjects = useMemo(
    () => [
      'all',
      ...Array.from(new Set((data || []).map((tc) => tc.subjectName).filter(Boolean))),
    ],
    [data]
  );

  const filtered = useMemo(
    () =>
      activeSubject === 'all'
        ? data || []
        : (data || []).filter((tc) => tc.subjectName === activeSubject),
    [activeSubject, data]
  );

  const activeTest = (data || []).find((item) => item.id === activeTestId) || null;

  const resetSession = () => {
    setView('list');
    setCurrentQ(0);
    setAnswers({});
    setActiveTestId(null);
    setQuestions([]);
    setResult({ score: 0, correctCount: 0, attemptId: null, breakdown: [] });
  };

  const startMutation = useMutation({
    mutationFn: async (testId: string) => getTestQuestions(testId),
    onSuccess: (loadedQuestions, testId) => {
      if (!isStudent) return;

      const safeQuestions = Array.isArray(loadedQuestions) ? loadedQuestions : [];

      setActiveTestId(testId);
      setQuestions(safeQuestions);
      setAnswers({});
      setCurrentQ(0);
      setResult({ score: 0, correctCount: 0, attemptId: null, breakdown: [] });
      setView('taking');
    },
    onError: () =>
      toast({
        title: t('page.tests.toast.start_error_title'),
        description: t('page.tests.toast.start_error_text'),
        variant: 'destructive',
      }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error('User not found');
      }

      if (!activeTestId) {
        throw new Error('Test not selected');
      }

      return submitTestAttempt(user.id, activeTestId, answers);
    },
    onSuccess: async (payload) => {
      if (!user?.id) {
        throw new Error('User not found');
      }

      let breakdown: TestAttemptBreakdownItem[] = [];
      const attemptId = payload.attempt?.id || null;

      if (attemptId) {
        try {
          breakdown = await getTestAttemptBreakdown(attemptId);
        } catch {
          breakdown = [];
        }
      }

      setResult({
        score: payload.score,
        correctCount: payload.correctCount,
        attemptId,
        breakdown,
      });

      setView('result');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: platformKeys.tests(user.id) }),
        queryClient.invalidateQueries({ queryKey: platformKeys.analytics(user.id) }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.studentDashboard(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.achievements(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.leaderboard,
        }),
        queryClient.invalidateQueries({
          queryKey: ['parent-dashboard'],
        }),
      ]);
    },
    onError: () =>
      toast({
        title: t('page.tests.toast.submit_error_title'),
        description: t('page.tests.toast.submit_error_text'),
        variant: 'destructive',
      }),
  });

  const handleAnswer = (
    questionId: string,
    optIdx: number,
    multiple: boolean
  ) => {
    setAnswers((prev) => {
      const current = prev[questionId] || [];

      if (!multiple) {
        return { ...prev, [questionId]: [optIdx] };
      }

      const next = current.includes(optIdx)
        ? current.filter((item) => item !== optIdx)
        : [...current, optIdx];

      return {
        ...prev,
        [questionId]: [...next].sort((a, b) => a - b),
      };
    });
  };

  if (view === 'taking' && isStudent) {
    const canSubmit =
      questions.length > 0 &&
      questions.every((question) => (answers[question.id] || []).length > 0);

    const q = questions[currentQ];
    const options = Array.isArray(q?.options) ? q.options : [];

    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
          {!q ? (
            <EmptyState
              title={t('page.tests.empty.questions_title')}
              text={t('page.tests.empty.questions_text')}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {t('page.tests.question_counter', {
                    current: currentQ + 1,
                    total: questions.length,
                  })}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={12} />
                  {activeTest?.durationMinutes || 0} {t('common.minutes')}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                />
              </div>

              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      {q.question_type === 'multiple_choice'
                        ? t('page.tests.multiple_choice_hint')
                        : t('page.tests.single_choice_hint')}
                    </div>
                    <h3 className="text-base font-semibold leading-relaxed">
                      {q.question_text}
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {options.map((opt, i) => {
                      const selected = (answers[q.id] || []).includes(i);

                      return (
                        <button
                          key={i}
                          onClick={() =>
                            handleAnswer(q.id, i, q.question_type === 'multiple_choice')
                          }
                          className={`w-full rounded-lg border p-3.5 text-left text-sm transition-colors ${
                            selected
                              ? 'border-foreground bg-primary text-primary-foreground'
                              : 'border-border hover:bg-accent'
                          }`}
                        >
                          <span className="mr-2 font-medium">
                            {String.fromCharCode(65 + i)}.
                          </span>
                          {String(opt)}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                  disabled={currentQ === 0}
                >
                  {t('common.previous')}
                </Button>

                {currentQ < questions.length - 1 ? (
                  <Button size="sm" onClick={() => setCurrentQ(currentQ + 1)}>
                    {t('common.next')}
                    <ArrowRight size={14} className="ml-1" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending || !canSubmit}
                  >
                    {t('test.submit')}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (view === 'result') {
    const totalQuestions = result.breakdown.length || questions.length;

    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl space-y-6 animate-scale-in py-8">
          <div className="space-y-4 text-center">
            <div
              className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold ${
                result.score >= 70 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
              }`}
            >
              {result.score}%
            </div>

            <div>
              <h3 className="text-lg font-bold">{t('test.result')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('page.tests.result_summary', {
                  correct: result.correctCount,
                  total: totalQuestions,
                })}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {result.breakdown.map((item, index) => (
              <Card
                key={item.questionId}
                className={item.isCorrect ? 'border-success/30' : 'border-destructive/30'}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    {item.isCorrect ? (
                      <CheckCircle size={18} className="mt-0.5 shrink-0 text-success" />
                    ) : (
                      <XCircle size={18} className="mt-0.5 shrink-0 text-destructive" />
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">
                          {t('page.tests.question_number', { number: index + 1 })}
                        </div>
                        <div className="text-sm font-medium leading-relaxed">
                          {item.questionText}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div>
                          <span className="font-medium">{t('page.tests.your_answer')}:</span>{' '}
                          {formatAnswer(item.options, item.selectedAnswer)}
                        </div>
                        <div>
                          <span className="font-medium">{t('page.tests.correct_answer')}:</span>{' '}
                          {formatAnswer(item.options, item.correctAnswer)}
                        </div>
                      </div>

                      {item.explanation ? (
                        <div className="rounded-lg bg-accent p-3 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {t('page.tests.explanation')}:
                          </span>{' '}
                          {item.explanation}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {result.breakdown.length === 0 ? (
              <div className="space-y-2">
                {questions.map((q, index) => {
                  const selected = answers[q.id] || [];
                  const correct = normalizeAnswerIndexes(q.correct_answer);
                  const ok =
                    JSON.stringify([...selected].sort()) ===
                    JSON.stringify([...correct].sort());
                  const options = Array.isArray(q.options)
                    ? q.options.map((item) => String(item))
                    : [];

                  return (
                    <Card
                      key={q.id}
                      className={ok ? 'border-success/30' : 'border-destructive/30'}
                    >
                      <CardContent className="space-y-2 p-4 text-sm">
                        <div className="flex items-start gap-3">
                          {ok ? (
                            <CheckCircle size={18} className="mt-0.5 shrink-0 text-success" />
                          ) : (
                            <XCircle size={18} className="mt-0.5 shrink-0 text-destructive" />
                          )}

                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {t('page.tests.question_number', { number: index + 1 })}
                            </div>
                            <div className="font-medium">{q.question_text}</div>
                            <div className="text-xs">
                              <span className="font-medium">{t('page.tests.your_answer')}:</span>{' '}
                              {formatAnswer(options, selected)}
                            </div>
                            <div className="text-xs">
                              <span className="font-medium">
                                {t('page.tests.correct_answer')}:
                              </span>{' '}
                              {formatAnswer(options, correct)}
                            </div>
                            {q.explanation ? (
                              <div className="rounded-lg bg-accent p-3 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {t('page.tests.explanation')}:
                                </span>{' '}
                                {q.explanation}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => activeTestId && startMutation.mutate(activeTestId)}
            >
              <RotateCcw size={13} className="mr-1" />
              {t('test.retake')}
            </Button>

            <Button size="sm" onClick={resetSession}>
              {t('page.tests.back_to_list')}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{t('nav.tests')}</h2>
          <p className="text-sm text-muted-foreground">
            {isStudent
              ? t('page.tests.description.student')
              : t('page.tests.description.admin')}
          </p>
        </div>

        {isStudent ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles size={16} className="text-primary" />
                  AI емтихандар
                </div>
                <p className="text-sm text-muted-foreground">
                  Мұғалім жариялаған AI емтихандарды жеке беттен ашып, тікелей тапсыра аласыз.
                </p>
              </div>

              <Button onClick={() => navigate('/ai-exams-open')}>
                AI емтихандарға өту
                <ArrowUpRight size={14} className="ml-2" />
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <LoadingState text={t('page.tests.loading')} /> : null}

        {error ? <ErrorState text={t('page.tests.error')} /> : null}

        {!isLoading && !error ? (
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setActiveSubject(subject)}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                  activeSubject === subject
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {subject === 'all' ? t('common.all') : subject}
              </button>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && (!data || data.length === 0) ? (
          <EmptyState
            title={t('page.tests.empty.title')}
            text={t('page.tests.empty.text')}
          />
        ) : null}

        {!isLoading && !error && data && data.length > 0 && filtered.length === 0 ? (
          <EmptyState
            title={t('page.tests.empty.filtered_title')}
            text={t('page.tests.empty.filtered_text')}
          />
        ) : null}

        {!isLoading && !error && filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((tc) => (
              <Card key={tc.id} className="transition-shadow hover:shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {tc.subjectName}
                    </span>
                    <h3 className="mt-0.5 text-sm font-semibold">
                      {tc.topic || tc.title}
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">{tc.title}</p>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      <ClipboardList size={11} className="mr-1 inline" />
                      {tc.questionCount} {t('page.tests.questions_label')}
                    </span>
                    <span>
                      <Clock size={11} className="mr-1 inline" />
                      {tc.durationMinutes || 0} {t('common.minutes')}
                    </span>
                  </div>

                  {tc.bestScore !== null ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {tc.attempts} {t('page.tests.attempts_label')}
                      </span>
                      <span className="font-semibold">
                        {t('test.score')}: {tc.bestScore}%
                      </span>
                    </div>
                  ) : null}

                  {isStudent ? (
                    <Button
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => startMutation.mutate(tc.id)}
                      disabled={startMutation.isPending}
                    >
                      {tc.bestScore !== null ? t('test.retake') : t('test.start')}
                    </Button>
                  ) : (
                    <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                      {t('page.tests.published_status')}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}