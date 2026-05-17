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
  HelpCircle,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import TestCard, { type TestCardData } from '@/components/test/TestCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { platformKeys, useTests } from '@/hooks/use-platform-data';
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
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type ViewState = 'list' | 'taking' | 'result';
type TestStatusFilter = 'all' | 'not_started' | 'completed';

const MAX_ID_CHARS = 180;
const MAX_SEARCH_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_OPTION_CHARS = 700;
const MAX_EXPLANATION_CHARS = 1_200;
const MAX_ERROR_CHARS = 700;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_EXPLANATION_CHARS): string {
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

function normalizeText(value: unknown) {
  return cleanText(value, MAX_TITLE_CHARS).toLowerCase();
}

function normalizeSearchInput(value: unknown) {
  return cleanText(value, MAX_SEARCH_CHARS);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function formatNumber(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
}

function formatPercent(value: unknown): string {
  return `${Math.max(0, Math.min(100, formatNumber(value)))}%`;
}

function normalizeAnswerIndexes(value: unknown, optionCount?: number): number[] {
  const maxOptionIndex =
    typeof optionCount === 'number' && Number.isFinite(optionCount)
      ? Math.max(0, optionCount)
      : null;

  const rawIndexes = Array.isArray(value)
    ? value.map((item) => Number(item))
    : value === null || value === undefined
      ? []
      : [Number(value)];

  return Array.from(
    new Set(
      rawIndexes.filter((item) => {
        if (!Number.isInteger(item) || item < 0) return false;
        if (maxOptionIndex !== null && item >= maxOptionIndex) return false;

        return true;
      }),
    ),
  ).sort((a, b) => a - b);
}

function areAnswerSetsEqual(left: number[], right: number[]) {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);

  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function formatAnswer(options: string[], selected: number[]) {
  const safeSelected = normalizeAnswerIndexes(selected, options.length);

  if (safeSelected.length === 0) return t('page.tests.answer.not_answered');

  return safeSelected
    .map((index) => {
      const label = String.fromCharCode(65 + index);
      const value = options[index] || '—';

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

function getTestStatus(test: TestCardData): Exclude<TestStatusFilter, 'all'> {
  return test.bestScore !== null && test.bestScore !== undefined
    ? 'completed'
    : 'not_started';
}

function getResultTone(score: number) {
  if (score >= 80) return 'success' as const;
  if (score >= 50) return 'warning' as const;

  return 'danger' as const;
}

function isTestVisibleToCurrentStudent(tests: TestCardData[], testId: string | null) {
  const safeTestId = cleanId(testId);

  if (!safeTestId) return false;

  return tests.some((test) => cleanId(test.id) === safeTestId);
}

function getQuestionId(question: Tables<'test_questions'> | null | undefined) {
  return cleanId(question?.id);
}

function getQuestionOptions(question: Tables<'test_questions'> | null | undefined) {
  if (!Array.isArray(question?.options)) return [];

  return question.options.map((item) => cleanText(item, MAX_OPTION_CHARS));
}

function getQuestionText(question: Tables<'test_questions'> | null | undefined) {
  return cleanText(question?.question_text) || 'Сұрақ';
}

function buildTestSearchHaystack(test: TestCardData) {
  return normalizeText(
    [test.title, test.topic, test.subjectName]
      .map((item) => cleanText(item))
      .filter(Boolean)
      .join(' '),
  );
}

function TestListSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SkeletonBlock className="h-10 w-full rounded-2xl lg:max-w-md" />

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
          <div
            key={index}
            className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft"
          >
            <div className="relative h-24 border-b border-border bg-surface-soft">
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
              <SkeletonBlock className="h-14 w-full rounded-2xl" />
              <SkeletonBlock className="h-9 w-full rounded-2xl" />
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
        className="h-full rounded-full bg-primary transition-all duration-500 ease-soft"
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
        const questionId = getQuestionId(question);
        const answered = questionId ? (answers[questionId] || []).length > 0 : false;
        const active = current === index;

        return (
          <button
            key={questionId || index}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border text-xs transition-all duration-200 ease-soft',
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                : answered
                  ? 'border-success-muted bg-success-soft text-success-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary',
            )}
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
  const safeUserId = cleanId(user?.id);

  const [view, setView] = useState<ViewState>('list');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [activeSubject, setActiveSubject] = useState('all');
  const [activeStatus, setActiveStatus] = useState<TestStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [startingTestId, setStartingTestId] = useState<string | null>(null);
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
    isStudent ? safeUserId : undefined,
    Boolean(user),
  );

  const tests = useMemo(() => data || [], [data]);

  const subjects = useMemo(() => {
    const output = ['all'];
    const seen = new Set(output);

    tests.forEach((test) => {
      const subjectName = cleanText(test.subjectName, MAX_META_CHARS);

      if (!subjectName) return;

      const key = subjectName.toLowerCase();

      if (seen.has(key)) return;

      seen.add(key);
      output.push(subjectName);
    });

    return output;
  }, [tests]);

  const filtered = useMemo(() => {
    const query = normalizeText(search);

    return tests.filter((test) => {
      const subjectName = cleanText(test.subjectName, MAX_META_CHARS);

      const matchesSubject =
        activeSubject === 'all' || subjectName === activeSubject;

      const matchesStatus =
        activeStatus === 'all' || getTestStatus(test) === activeStatus;

      const matchesSearch =
        !query || buildTestSearchHaystack(test).includes(query);

      return matchesSubject && matchesStatus && matchesSearch;
    });
  }, [activeStatus, activeSubject, search, tests]);

  const activeTest =
    tests.find((item) => cleanId(item.id) === cleanId(activeTestId)) || null;

  const hasActiveFilters =
    Boolean(search.trim()) || activeSubject !== 'all' || activeStatus !== 'all';

  const stats = useMemo(() => {
    const total = tests.length;
    const completed = tests.filter(
      (test) => test.bestScore !== null && test.bestScore !== undefined,
    ).length;
    const notStarted = Math.max(0, total - completed);
    const average =
      completed > 0
        ? Math.round(
            tests
              .filter((test) => test.bestScore !== null && test.bestScore !== undefined)
              .reduce((sum, test) => sum + formatNumber(test.bestScore), 0) /
              completed,
          )
        : 0;

    return {
      total,
      completed,
      notStarted,
      average: Math.max(0, Math.min(100, average)),
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
    setStartingTestId(null);
    setQuestions([]);
    setResult({
      score: 0,
      correctCount: 0,
      attemptId: null,
      breakdown: [],
    });
  };

  const startMutation = useMutation({
    mutationFn: async (testId: string) => {
      const safeTestId = cleanId(testId);

      if (!safeUserId || user?.role !== 'student') {
        throw new Error('Бұл тестті тек оқушы аккаунтымен тапсыруға болады.');
      }

      if (!safeTestId) {
        throw new Error('Тест анықталмады.');
      }

      if (!isTestVisibleToCurrentStudent(tests, safeTestId)) {
        throw new Error('Бұл тест сізге қолжетімді емес немесе сіз бұл курсқа тіркелмегенсіз.');
      }

      setStartingTestId(safeTestId);

      return getTestQuestions(safeTestId);
    },
    onSuccess: (loadedQuestions, testId) => {
      if (!isStudent) return;

      const safeTestId = cleanId(testId);
      const safeQuestions = Array.isArray(loadedQuestions) ? loadedQuestions : [];

      setActiveTestId(safeTestId);
      setQuestions(safeQuestions);
      setAnswers({});
      setCurrentQ(0);
      setResult({
        score: 0,
        correctCount: 0,
        attemptId: null,
        breakdown: [],
      });
      setView('taking');
    },
    onError: (startError) =>
      toast({
        title: t('page.tests.toast.start_error_title'),
        description: getErrorMessage(startError, t('page.tests.toast.start_error_text')),
        variant: 'destructive',
      }),
    onSettled: () => {
      setStartingTestId(null);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const safeActiveTestId = cleanId(activeTestId);

      if (!safeUserId || user?.role !== 'student') {
        throw new Error('Бұл тестті тапсыру үшін оқушы аккаунты қажет.');
      }

      if (!safeActiveTestId) {
        throw new Error('Тест таңдалмаған.');
      }

      if (!isTestVisibleToCurrentStudent(tests, safeActiveTestId)) {
        throw new Error('Бұл тест сізге қолжетімді емес немесе сіз бұл курсқа тіркелмегенсіз.');
      }

      const sanitizedAnswers = questions.reduce<Record<string, number[]>>(
        (acc, question) => {
          const questionId = getQuestionId(question);
          const options = getQuestionOptions(question);

          if (!questionId) return acc;

          acc[questionId] = normalizeAnswerIndexes(answers[questionId], options.length);

          return acc;
        },
        {},
      );

      return submitTestAttempt(safeUserId, safeActiveTestId, sanitizedAnswers);
    },
    onSuccess: async (payload) => {
      if (!safeUserId) return;

      let breakdown: TestAttemptBreakdownItem[] = [];
      const attemptId = cleanId(payload.attempt?.id) || null;

      if (attemptId) {
        try {
          breakdown = await getTestAttemptBreakdown(attemptId);
        } catch {
          breakdown = [];
        }
      }

      setResult({
        score: formatNumber(payload.score),
        correctCount: formatNumber(payload.correctCount),
        attemptId,
        breakdown,
      });

      setView('result');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: platformKeys.tests(safeUserId) }),
        queryClient.invalidateQueries({ queryKey: platformKeys.analytics(safeUserId) }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.studentDashboard(safeUserId),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.achievements(safeUserId),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.leaderboard,
        }),
        queryClient.invalidateQueries({
          queryKey: ['parent-dashboard'],
        }),
      ]);
    },
    onError: (submitError) =>
      toast({
        title: t('page.tests.toast.submit_error_title'),
        description: getErrorMessage(submitError, t('page.tests.toast.submit_error_text')),
        variant: 'destructive',
      }),
  });

  const handleAnswer = (
    questionId: string,
    optionIndex: number,
    multiple: boolean,
  ) => {
    const safeQuestionId = cleanId(questionId);
    const safeOptionIndex = Number(optionIndex);
    const question = questions.find((item) => getQuestionId(item) === safeQuestionId);
    const options = getQuestionOptions(question);

    if (
      !safeQuestionId ||
      !Number.isInteger(safeOptionIndex) ||
      safeOptionIndex < 0 ||
      safeOptionIndex >= options.length
    ) {
      return;
    }

    setAnswers((prev) => {
      const current = normalizeAnswerIndexes(prev[safeQuestionId], options.length);

      if (!multiple) {
        return {
          ...prev,
          [safeQuestionId]: [safeOptionIndex],
        };
      }

      const next = current.includes(safeOptionIndex)
        ? current.filter((item) => item !== safeOptionIndex)
        : [...current, safeOptionIndex];

      return {
        ...prev,
        [safeQuestionId]: normalizeAnswerIndexes(next, options.length),
      };
    });
  };

  if (view === 'taking' && isStudent) {
    const canSubmit =
      questions.length > 0 &&
      questions.every((question) => {
        const questionId = getQuestionId(question);

        return questionId && (answers[questionId] || []).length > 0;
      });

    const q = questions[currentQ];
    const questionId = getQuestionId(q);
    const options = getQuestionOptions(q);
    const questionText = getQuestionText(q);
    const answeredCount = questions.filter((question) => {
      const id = getQuestionId(question);

      return id && (answers[id] || []).length > 0;
    }).length;
    const progressValue = questions.length > 0 ? ((currentQ + 1) / questions.length) * 100 : 0;

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
            title={cleanText(activeTest?.title) || t('nav.tests')}
            actions={
              <StatusBadge tone="info" icon={<Clock size={12} />}>
                {formatNumber(activeTest?.durationMinutes)} {t('common.minutes')}
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
                      className="h-full rounded-full bg-primary transition-all duration-500 ease-soft"
                      style={{
                        width: `${Math.max(0, Math.min(100, progressValue))}%`,
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
                      {questionText}
                    </h3>
                  </div>

                  {options.length > 0 ? (
                    <div className="space-y-2">
                      {options.map((option, index) => {
                        const selected = questionId
                          ? (answers[questionId] || []).includes(index)
                          : false;

                        return (
                          <button
                            key={`${questionId}-${index}`}
                            type="button"
                            onClick={() =>
                              handleAnswer(
                                questionId,
                                index,
                                q.question_type === 'multiple_choice',
                              )
                            }
                            className={cn(
                              'w-full rounded-2xl border p-3.5 text-left text-sm transition-all duration-200 ease-soft',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                                : 'border-border bg-card text-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary',
                            )}
                          >
                            <span className="mr-2 font-semibold">
                              {String.fromCharCode(65 + index)}.
                            </span>
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<HelpCircle size={18} />}
                      title="Жауап нұсқалары жоқ"
                      text="Бұл сұрақ үшін жауап нұсқалары табылмады."
                      compact
                    />
                  )}
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
            actions={
              <StatusBadge tone={resultTone} icon={<CheckCircle2 size={12} />}>
                {formatPercent(result.score)}
              </StatusBadge>
            }
          />

          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">Жалпы нәтиже</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(result.correctCount)}/{formatNumber(totalQuestions)} дұрыс жауап
                  </p>
                </div>

                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-border bg-card text-2xl font-bold shadow-inner-soft">
                  {formatPercent(result.score)}
                </div>
              </div>

              <ScoreProgress value={result.score} />
            </CardContent>
          </Card>

          <div className="space-y-3">
            {result.breakdown.map((item, index) => {
              const questionId = cleanId(item.questionId) || `${index}`;
              const options = (item.options || []).map((option) =>
                cleanText(option, MAX_OPTION_CHARS),
              );
              const selectedAnswer = normalizeAnswerIndexes(
                item.selectedAnswer,
                options.length,
              );
              const correctAnswer = normalizeAnswerIndexes(
                item.correctAnswer,
                options.length,
              );
              const questionText = cleanText(item.questionText) || 'Сұрақ';
              const explanation = cleanMultilineText(
                item.explanation,
                MAX_EXPLANATION_CHARS,
              );

              return (
                <Card
                  key={questionId}
                  className={
                    item.isCorrect
                      ? 'border-success-muted'
                      : 'border-destructive-muted'
                  }
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      {item.isCorrect ? (
                        <CheckCircle
                          size={18}
                          className="mt-0.5 shrink-0 text-success-foreground"
                        />
                      ) : (
                        <XCircle
                          size={18}
                          className="mt-0.5 shrink-0 text-destructive"
                        />
                      )}

                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">
                            {t('page.tests.question_number', { number: index + 1 })}
                          </div>

                          <div className="text-sm font-medium leading-relaxed">
                            {questionText}
                          </div>
                        </div>

                        <div className="grid gap-2 text-xs md:grid-cols-2">
                          <div className="rounded-2xl border border-border bg-surface-soft/60 p-3">
                            <span className="font-medium">
                              {t('page.tests.your_answer')}:
                            </span>{' '}
                            {formatAnswer(options, selectedAnswer)}
                          </div>

                          <div className="rounded-2xl border border-border bg-surface-soft/60 p-3">
                            <span className="font-medium">
                              {t('page.tests.correct_answer')}:
                            </span>{' '}
                            {formatAnswer(options, correctAnswer)}
                          </div>
                        </div>

                        {explanation ? (
                          <div className="rounded-2xl border border-ai-border bg-ai-soft p-3 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {t('page.tests.explanation')}:
                            </span>{' '}
                            {explanation}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {result.breakdown.length === 0 ? (
              <div className="space-y-2">
                {questions.map((question, index) => {
                  const questionId = getQuestionId(question);
                  const options = getQuestionOptions(question);
                  const selected = normalizeAnswerIndexes(answers[questionId], options.length);
                  const correct = normalizeAnswerIndexes(question.correct_answer, options.length);
                  const isCorrect = areAnswerSetsEqual(selected, correct);
                  const questionText = getQuestionText(question);
                  const explanation = cleanMultilineText(
                    question.explanation,
                    MAX_EXPLANATION_CHARS,
                  );

                  return (
                    <Card
                      key={questionId || index}
                      className={
                        isCorrect
                          ? 'border-success-muted'
                          : 'border-destructive-muted'
                      }
                    >
                      <CardContent className="space-y-2 p-4 text-sm">
                        <div className="flex items-start gap-3">
                          {isCorrect ? (
                            <CheckCircle
                              size={18}
                              className="mt-0.5 shrink-0 text-success-foreground"
                            />
                          ) : (
                            <XCircle
                              size={18}
                              className="mt-0.5 shrink-0 text-destructive"
                            />
                          )}

                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {t('page.tests.question_number', { number: index + 1 })}
                            </div>

                            <div className="font-medium">{questionText}</div>

                            <div className="text-xs">
                              <span className="font-medium">
                                {t('page.tests.your_answer')}:
                              </span>{' '}
                              {formatAnswer(options, selected)}
                            </div>

                            <div className="text-xs">
                              <span className="font-medium">
                                {t('page.tests.correct_answer')}:
                              </span>{' '}
                              {formatAnswer(options, correct)}
                            </div>

                            {explanation ? (
                              <div className="rounded-2xl border border-ai-border bg-ai-soft p-3 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {t('page.tests.explanation')}:
                                </span>{' '}
                                {explanation}
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
              onClick={() => {
                const safeActiveTestId = cleanId(activeTestId);

                if (!safeActiveTestId) return;

                startMutation.mutate(safeActiveTestId);
              }}
              disabled={!cleanId(activeTestId) || startMutation.isPending}
            >
              <RotateCcw size={13} className="mr-1.5" />
              {startMutation.isPending ? t('common.loading') : t('test.retake')}
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
          actions={
            isStudent ? (
              <Button type="button" onClick={() => navigate('/ai-exams-open')}>
                ЖИ емтихандар
                <ArrowUpRight size={14} className="ml-2" />
              </Button>
            ) : null
          }
        />

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
                      maxLength={MAX_SEARCH_CHARS}
                      onChange={(event) =>
                        setSearch(normalizeSearchInput(event.target.value))
                      }
                      placeholder="Тест, тақырып немесе пән"
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
                      ),
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

                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="muted">Барлығы: {stats.total}</StatusBadge>
                  <StatusBadge tone="success">Тапсырылған: {stats.completed}</StatusBadge>
                  <StatusBadge tone="warning">Қалғаны: {stats.notStarted}</StatusBadge>
                  <StatusBadge tone="info">Орташа: {stats.average}%</StatusBadge>
                </div>

                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  {subjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => setActiveSubject(subject)}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-all duration-200 ease-soft',
                        activeSubject === subject
                          ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                          : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary',
                      )}
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
                text={
                  isStudent
                    ? 'Сіз тіркелген курстарда жарияланған тесттер әзірге жоқ.'
                    : t('page.tests.empty.text')
                }
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
                {filtered.map((test, index) => {
                  const testId = cleanId(test.id);

                  return (
                    <TestCard
                      key={testId || `${cleanText(test.title)}-${index}`}
                      test={test}
                      isStudent={isStudent}
                      isStarting={
                        startMutation.isPending && cleanId(startingTestId) === testId
                      }
                      onStart={(selectedTest) =>
                        startMutation.mutate(cleanId(selectedTest.id))
                      }
                    />
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