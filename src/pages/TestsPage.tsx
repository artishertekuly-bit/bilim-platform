import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  HelpCircle,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import TestCard, { type TestCardData } from '@/components/test/TestCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTests, platformKeys } from '@/hooks/use-platform-data';
import {
  getTestAttemptBreakdown,
  getTestQuestions,
  submitTestAttempt,
} from '@/lib/app-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';
import type { TestAttemptBreakdownItem } from '@/lib/app-data';

type ViewState = 'list' | 'taking' | 'result';
type TestStatusFilter = 'all' | 'not_started' | 'completed';

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase().trim();
}

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

function getStatusFilterLabel(filter: TestStatusFilter) {
  const labels: Record<TestStatusFilter, string> = {
    all: 'Барлығы',
    not_started: 'Тапсырылмаған',
    completed: 'Тапсырылған',
  };

  return labels[filter];
}

function getTestStatus(test: TestCardData): TestStatusFilter {
  return test.bestScore !== null && test.bestScore !== undefined
    ? 'completed'
    : 'not_started';
}

function getResultTone(score: number) {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function TestListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SkeletonBlock className="h-10 w-full lg:max-w-md" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-24 rounded-full" />
            <SkeletonBlock className="h-9 w-28 rounded-full" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock
              key={index}
              className="h-7 w-20 shrink-0 rounded-full"
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border bg-card">
            <div className="relative h-24 border-b bg-accent">
              <SkeletonBlock className="absolute left-3 top-3 h-6 w-20 rounded-full" />
              <SkeletonBlock className="absolute bottom-3 left-3 h-6 w-24 rounded-full" />
            </div>

            <div className="space-y-3 p-4">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-5 w-4/5" />
              <div className="flex gap-3">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-3 w-16" />
              </div>
              <SkeletonBlock className="h-14 w-full rounded-lg" />
              <SkeletonBlock className="h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreProgress({ value }: { value: number }) {
  const normalized = Math.min(100, Math.max(0, Math.round(value || 0)));

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

function QuestionNavigation({
  total,
  current,
  answers,
  questions,
  onSelect,
}: {
  total: number;
  current: number;
  answers: Record<string, number[]>;
  questions: Tables<'test_questions'>[];
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: total }).map((_, index) => {
        const question = questions[index];
        const answered = question ? (answers[question.id] || []).length > 0 : false;
        const active = current === index;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs transition-colors ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : answered
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-border hover:bg-accent'
            }`}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
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
  const [activeStatus, setActiveStatus] = useState<TestStatusFilter>('all');
  const [search, setSearch] = useState('');
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

  const { data, isLoading, error } = useTests(
    isStudent ? user?.id : undefined,
    !!user
  );

  const tests = data || [];

  const subjects = useMemo(
    () => [
      'all',
      ...Array.from(new Set(tests.map((tc) => tc.subjectName).filter(Boolean))),
    ],
    [tests]
  );

  const filtered = useMemo(() => {
    const query = normalizeText(search);

    return tests.filter((tc) => {
      const matchesSubject =
        activeSubject === 'all' || tc.subjectName === activeSubject;

      const matchesStatus =
        activeStatus === 'all' || getTestStatus(tc) === activeStatus;

      const matchesSearch =
        !query ||
        normalizeText(tc.title).includes(query) ||
        normalizeText(tc.topic).includes(query) ||
        normalizeText(tc.subjectName).includes(query);

      return matchesSubject && matchesStatus && matchesSearch;
    });
  }, [activeStatus, activeSubject, search, tests]);

  const activeTest = tests.find((item) => item.id === activeTestId) || null;

  const hasActiveFilters =
    search.trim() || activeSubject !== 'all' || activeStatus !== 'all';

  const stats = useMemo(() => {
    const total = tests.length;
    const completed = tests.filter(
      (test) => test.bestScore !== null && test.bestScore !== undefined
    ).length;
    const notStarted = total - completed;
    const average =
      completed > 0
        ? Math.round(
            tests
              .filter((test) => test.bestScore !== null && test.bestScore !== undefined)
              .reduce((sum, test) => sum + Number(test.bestScore || 0), 0) /
              completed
          )
        : 0;

    return {
      total,
      completed,
      notStarted,
      average,
    };
  }, [tests]);

  const resetFilters = () => {
    setSearch('');
    setActiveSubject('all');
    setActiveStatus('all');
  };

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
    const answeredCount = questions.filter(
      (question) => (answers[question.id] || []).length > 0
    ).length;

    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
          <PageHeader
            backAction={{
              label: 'Тесттерге қайту',
              onClick: resetSession,
            }}
            eyebrow={
              <>
                <ClipboardList size={13} />
                Тест тапсыру
              </>
            }
            icon={<ClipboardList size={20} />}
            title={activeTest?.title || t('nav.tests')}
            description={
              activeTest
                ? `${activeTest.subjectName} · ${activeTest.questionCount} ${t(
                    'page.tests.questions_label'
                  )}`
                : t('page.tests.description.student')
            }
            actions={
              <StatusBadge tone="info" icon={<Clock size={12} />}>
                {activeTest?.durationMinutes || 0} {t('common.minutes')}
              </StatusBadge>
            }
          />

          {!q ? (
            <EmptyState
              icon={<HelpCircle size={18} />}
              title={t('page.tests.empty.questions_title')}
              text={t('page.tests.empty.questions_text')}
              action={
                <Button type="button" variant="outline" onClick={resetSession}>
                  Тесттерге қайту
                </Button>
              }
            />
          ) : (
            <>
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {t('page.tests.question_counter', {
                          current: currentQ + 1,
                          total: questions.length,
                        })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {answeredCount}/{questions.length} сұраққа жауап берілді
                      </p>
                    </div>

                    <QuestionNavigation
                      total={questions.length}
                      current={currentQ}
                      answers={answers}
                      questions={questions}
                      onSelect={setCurrentQ}
                    />
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${((currentQ + 1) / questions.length) * 100}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-5 p-5">
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
                          type="button"
                          onClick={() =>
                            handleAnswer(q.id, i, q.question_type === 'multiple_choice')
                          }
                          className={`w-full rounded-xl border p-3.5 text-left text-sm transition-colors ${
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:bg-accent'
                          }`}
                        >
                          <span className="mr-2 font-semibold">
                            {String.fromCharCode(65 + i)}.
                          </span>
                          {String(opt)}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                  disabled={currentQ === 0}
                >
                  <ArrowLeft size={14} className="mr-1.5" />
                  {t('common.previous')}
                </Button>

                {currentQ < questions.length - 1 ? (
                  <Button size="sm" onClick={() => setCurrentQ(currentQ + 1)}>
                    {t('common.next')}
                    <ArrowRight size={14} className="ml-1.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending || !canSubmit}
                  >
                    {submitMutation.isPending ? t('common.loading') : t('test.submit')}
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
    const resultTone = getResultTone(result.score);

    return (
      <DashboardLayout>
        <div className="mx-auto max-w-4xl space-y-6 animate-scale-in">
          <PageHeader
            eyebrow={
              <>
                <CheckCircle2 size={13} />
                Тест нәтижесі
              </>
            }
            icon={<ClipboardList size={20} />}
            title={t('test.result')}
            description={t('page.tests.result_summary', {
              correct: result.correctCount,
              total: totalQuestions,
            })}
            actions={
              <StatusBadge tone={resultTone} icon={<CheckCircle2 size={12} />}>
                {result.score}%
              </StatusBadge>
            }
          />

          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">Жалпы нәтиже</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {result.correctCount}/{totalQuestions} дұрыс жауап
                  </p>
                </div>

                <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-card text-2xl font-bold">
                  {result.score}%
                </div>
              </div>

              <ScoreProgress value={result.score} />
            </CardContent>
          </Card>

          <div className="space-y-3">
            {result.breakdown.map((item, index) => (
              <Card
                key={item.questionId}
                className={item.isCorrect ? 'border-emerald-300/60' : 'border-red-300/60'}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    {item.isCorrect ? (
                      <CheckCircle size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
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

                      <div className="grid gap-2 text-xs md:grid-cols-2">
                        <div className="rounded-lg border bg-muted/20 p-3">
                          <span className="font-medium">{t('page.tests.your_answer')}:</span>{' '}
                          {formatAnswer(item.options, item.selectedAnswer)}
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-3">
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
                      className={ok ? 'border-emerald-300/60' : 'border-red-300/60'}
                    >
                      <CardContent className="space-y-2 p-4 text-sm">
                        <div className="flex items-start gap-3">
                          {ok ? (
                            <CheckCircle size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                          ) : (
                            <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
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

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={() => activeTestId && startMutation.mutate(activeTestId)}
            >
              <RotateCcw size={13} className="mr-1.5" />
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
        <PageHeader
          eyebrow={
            <>
              <ClipboardList size={13} />
              Тест орталығы
            </>
          }
          icon={<ClipboardList size={20} />}
          title={t('nav.tests')}
          description={
            isStudent
              ? t('page.tests.description.student')
              : t('page.tests.description.admin')
          }
          actions={
            isStudent ? (
              <Button type="button" onClick={() => navigate('/ai-exams-open')}>
                AI емтихандар
                <ArrowUpRight size={14} className="ml-2" />
              </Button>
            ) : null
          }
        />

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

              <Button variant="outline" onClick={() => navigate('/ai-exams-open')}>
                AI емтихандарға өту
                <ArrowUpRight size={14} className="ml-2" />
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <TestListSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.tests.error')}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Барлығы</p>
                  <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Тапсырылған</p>
                  <p className="mt-1 text-2xl font-semibold">{stats.completed}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Тапсырылмаған</p>
                  <p className="mt-1 text-2xl font-semibold">{stats.notStarted}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">Орташа балл</p>
                  <p className="mt-1 text-2xl font-semibold">{stats.average}%</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-md">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Тест, тақырып немесе пән бойынша іздеу..."
                      className="pl-9"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['all', 'not_started', 'completed'] as TestStatusFilter[]).map(
                      (status) => (
                        <Button
                          key={status}
                          type="button"
                          size="sm"
                          variant={activeStatus === status ? 'default' : 'outline'}
                          onClick={() => setActiveStatus(status)}
                        >
                          {getStatusFilterLabel(status)}
                        </Button>
                      )
                    )}

                    {hasActiveFilters ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={resetFilters}
                      >
                        <RotateCcw size={14} className="mr-1.5" />
                        Тазалау
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {subjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => setActiveSubject(subject)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                        activeSubject === subject
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      {subject === 'all' ? t('common.all') : subject}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {tests.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={18} />}
                title={t('page.tests.empty.title')}
                text={t('page.tests.empty.text')}
              />
            ) : null}

            {tests.length > 0 && filtered.length === 0 ? (
              <EmptyState
                icon={<Search size={18} />}
                title={t('page.tests.empty.filtered_title')}
                text={t('page.tests.empty.filtered_text')}
                action={
                  <Button type="button" onClick={resetFilters}>
                    <RotateCcw size={15} className="mr-2" />
                    Сүзгіні тазалау
                  </Button>
                }
              />
            ) : null}

            {filtered.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((tc) => (
                  <TestCard
                    key={tc.id}
                    test={tc}
                    isStudent={isStudent}
                    isStarting={startMutation.isPending && activeTestId === tc.id}
                    onStart={(test) => startMutation.mutate(test.id)}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}