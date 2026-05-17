import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';

import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  createTest,
  createTestQuestion,
  deleteTest,
  deleteTestQuestion,
  reorderTestQuestions,
  updateTest,
  updateTestQuestion,
} from '@/lib/app-data';
import {
  platformKeys,
  useSubjects,
  useTeacherCourseWorkspace,
  useTeacherTestsWorkspace,
} from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import {
  clearPendingAiQuestionImport,
  getPendingAiQuestionImport,
  type PendingAiQuestionImport,
} from '@/lib/ai-question-import';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

const statuses = ['draft', 'under_review', 'published', 'archived'] as const;

type TestStatus = (typeof statuses)[number];

type CourseOption = {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string | null;
};

type QuestionFormState = {
  questionText: string;
  optionsText: string;
  correctAnswer: string;
  explanation: string;
  sortOrder: string;
  multiple: boolean;
};

const MAX_ID_CHARS = 180;
const MAX_ERROR_CHARS = 900;
const MAX_TEST_TITLE_CHARS = 180;
const MAX_TEST_TOPIC_CHARS = 220;
const MAX_QUESTION_TEXT_CHARS = 1_200;
const MAX_OPTION_CHARS = 400;
const MAX_OPTIONS = 8;
const MAX_EXPLANATION_CHARS = 1_500;
const MAX_DURATION_CHARS = 3;
const MAX_SORT_ORDER_CHARS = 4;

function sanitizeInputValue(value: unknown, limit: number): string {
  return limitText(removeNullCharacters(String(value ?? '')), limit);
}

function cleanText(value: unknown, limit: number): string {
  return sanitizeInputValue(value, limit).replace(/\s+/g, ' ').trim();
}

function cleanMultilineText(value: unknown, limit: number): string {
  return sanitizeInputValue(value, limit)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeNumericInput(value: unknown, limit: number): string {
  return limitText(removeNullCharacters(String(value ?? '')).replace(/[^\d]/g, ''), limit);
}

function normalizePositiveInt(value: unknown, fallback: number, max = 999): number {
  const normalized = Number(normalizeNumericInput(value, MAX_DURATION_CHARS));
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.round(normalized)));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? cleanText(error.message, MAX_ERROR_CHARS)
    : t('page.teacher_test_builder.toast.error_text');
}

function normalizeTestStatus(value: unknown): TestStatus {
  return statuses.includes(value as TestStatus) ? (value as TestStatus) : 'draft';
}

function normalizeQuestionType(value: unknown): 'single_choice' | 'multiple_choice' {
  return value === 'multiple_choice' ? 'multiple_choice' : 'single_choice';
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next;
}

function buildQuestionForm(nextSortOrder = '1'): QuestionFormState {
  return {
    questionText: '',
    optionsText: 'A\nB\nC\nD',
    correctAnswer: '1',
    explanation: '',
    sortOrder: nextSortOrder,
    multiple: false,
  };
}

function getSortedQuestions<T extends { sort_order: number }>(questions: T[] = []): T[] {
  return [...questions].sort((a, b) => a.sort_order - b.sort_order);
}

function getNextSortOrder<T extends { sort_order: number }>(
  questions: T[] = [],
  extra = 1,
): string {
  const maxSortOrder = questions.reduce(
    (max, question) => Math.max(max, Number(question.sort_order) || 0),
    0,
  );

  return String(maxSortOrder + extra);
}

function getTestStatusTone(status: TestStatus) {
  if (status === 'published') return 'success' as const;
  if (status === 'under_review') return 'warning' as const;
  if (status === 'archived') return 'muted' as const;

  return 'info' as const;
}

function normalizeCourseOptions(workspace: unknown): CourseOption[] {
  const raw = workspace as {
    courses?: unknown[];
    items?: unknown[];
    teacherCourses?: unknown[];
  };

  const source: unknown[] =
    (Array.isArray(raw?.courses) && raw.courses) ||
    (Array.isArray(raw?.items) && raw.items) ||
    (Array.isArray(raw?.teacherCourses) && raw.teacherCourses) ||
    (Array.isArray(raw) && raw) ||
    [];

  return source
    .map((item): CourseOption => {
      const row = item as Record<string, unknown>;

      const subjectId =
        typeof row.subjectId === 'string'
          ? cleanId(row.subjectId)
          : typeof row.subject_id === 'string'
            ? cleanId(row.subject_id)
            : '';

      const subjectName =
        typeof row.subjectName === 'string'
          ? cleanText(row.subjectName, 180)
          : typeof row.subject_name === 'string'
            ? cleanText(row.subject_name, 180)
            : null;

      return {
        id: cleanId(row.id || row.courseId || ''),
        title: cleanText(row.title || row.courseTitle || 'Курс', 240),
        subjectId,
        subjectName,
      };
    })
    .filter((course) => course.id.length > 0);
}

function parseCorrectAnswerIndexes(value: string, optionCount?: number): number[] {
  const maxOptionCount =
    typeof optionCount === 'number' && Number.isFinite(optionCount)
      ? Math.max(0, Math.round(optionCount))
      : null;

  return Array.from(
    new Set(
      removeNullCharacters(value)
        .split(',')
        .map((item) => Number(item.trim()) - 1)
        .filter((item) => {
          if (!Number.isInteger(item) || item < 0) return false;
          if (maxOptionCount !== null && item >= maxOptionCount) return false;
          return true;
        }),
    ),
  ).sort((a, b) => a - b);
}

function normalizeCorrectAnswerIndexes(value: unknown, optionCount: number): number[] {
  const maxOptionCount = Math.max(0, Math.round(Number(optionCount) || 0));
  const rawIndexes = Array.isArray(value)
    ? value.map((item) => Number(item))
    : typeof value === 'string'
      ? parseCorrectAnswerIndexes(value, maxOptionCount)
      : [Number(value)];

  return Array.from(
    new Set(
      rawIndexes.filter(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < maxOptionCount,
      ),
    ),
  ).sort((a, b) => a - b);
}

function getOptionLinesForEditor(value: string): string[] {
  const lines = removeNullCharacters(value)
    .split('\n')
    .slice(0, MAX_OPTIONS)
    .map((line) => sanitizeInputValue(line, MAX_OPTION_CHARS));

  while (lines.length < 2) {
    lines.push('');
  }

  return lines;
}

function getNormalizedOptionRows(value: string) {
  return getOptionLinesForEditor(value)
    .map((option, originalIndex) => ({
      originalIndex,
      text: cleanText(option, MAX_OPTION_CHARS),
    }))
    .filter((option) => option.text.length > 0);
}

function formatCorrectAnswer(indexes: number[]): string {
  return Array.from(new Set(indexes))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < MAX_OPTIONS)
    .sort((a, b) => a - b)
    .map((index) => index + 1)
    .join(',');
}

function TestBuilderSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="rounded-3xl border bg-card p-4 sm:p-5">
          <SkeletonBlock className="h-5 w-40" />

          <div className="mt-5 space-y-3">
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-4 sm:p-5">
          <SkeletonBlock className="h-5 w-44" />

          <div className="mt-5 space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-16 w-full rounded-3xl" />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border bg-card p-4 sm:p-5">
          <SkeletonBlock className="h-5 w-44" />

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
          </div>
        </div>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-3xl border bg-card p-4 sm:p-5">
            <SkeletonBlock className="h-5 w-40" />

            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-16 w-full rounded-3xl" />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-4 sm:p-5">
            <SkeletonBlock className="h-5 w-44" />

            <div className="mt-5 space-y-3">
              <SkeletonBlock className="h-24 w-full rounded-2xl" />
              <SkeletonBlock className="h-40 w-full rounded-2xl" />
              <SkeletonBlock className="h-10 w-full rounded-2xl" />
              <SkeletonBlock className="h-24 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  children,
  required,
}: {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>

      {children}
    </div>
  );
}

function InlineConfirm({
  title,
  confirmLabel,
  pending,
  variant = 'warning',
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  pending: boolean;
  variant?: 'warning' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-3',
        variant === 'danger'
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-warning-muted bg-warning-soft/60',
      )}
    >
      <p className="text-xs font-semibold text-foreground">{cleanText(title, 240)}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={variant === 'danger' ? 'destructive' : 'outline'}
          size="sm"
          disabled={pending}
          onClick={onConfirm}
        >
          {cleanText(confirmLabel, 120)}
        </Button>

        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Болдырмау
        </Button>
      </div>
    </div>
  );
}

export default function TeacherCreateTestPage() {
  const { user } = useAuth();
  const safeUserId = cleanId(user?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjects();
  const { data: courseWorkspace, isFetching: courseWorkspaceFetching } =
    useTeacherCourseWorkspace(safeUserId, Boolean(safeUserId));
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTestId = cleanId(searchParams.get('testId') || '');

  const courseOptions = useMemo(
    () => normalizeCourseOptions(courseWorkspace),
    [courseWorkspace],
  );

  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
  } = useTeacherTestsWorkspace(safeUserId, Boolean(safeUserId));

  const [selectedTestId, setSelectedTestId] = useState('');
  const lastSeededTestId = useRef('');

  const [newTest, setNewTest] = useState({
    title: '',
    topic: '',
    duration: '20',
    subjectId: '',
    courseId: '',
  });

  const [testEdit, setTestEdit] = useState<{
    title: string;
    topic: string;
    duration: string;
    subjectId: string;
    status: TestStatus;
  }>({
    title: '',
    topic: '',
    duration: '20',
    subjectId: '',
    status: 'draft',
  });

  const [questionForm, setQuestionForm] = useState(buildQuestionForm());
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [pendingAiImport, setPendingAiImport] =
    useState<PendingAiQuestionImport | null>(null);
  const [deleteTestConfirmOpen, setDeleteTestConfirmOpen] = useState(false);
  const [questionDeleteId, setQuestionDeleteId] = useState<string | null>(null);
  const [aiImportConfirmOpen, setAiImportConfirmOpen] = useState(false);

  const selectedTest = useMemo(
    () =>
      workspace?.tests.find((test) => cleanId(test.id) === cleanId(selectedTestId)) ||
      workspace?.tests.find((test) => cleanId(test.id) === cleanId(requestedTestId)) ||
      workspace?.tests[0] ||
      null,
    [workspace, selectedTestId, requestedTestId],
  );

  const sortedSelectedQuestions = useMemo(
    () => getSortedQuestions(selectedTest?.questions || []),
    [selectedTest],
  );

  const questionOptions = useMemo(
    () => getOptionLinesForEditor(questionForm.optionsText),
    [questionForm.optionsText],
  );

  const correctAnswerIndexes = useMemo(
    () => parseCorrectAnswerIndexes(questionForm.correctAnswer, questionOptions.length),
    [questionForm.correctAnswer, questionOptions.length],
  );

  const statusLabels: Record<TestStatus, string> = {
    draft: t('course.status.draft'),
    under_review: t('page.teacher_test_builder.status.under_review'),
    published: t('course.status.published'),
    archived: t('course.status.archived'),
  };

  const questionTypeLabel = (multiple: boolean) =>
    multiple
      ? t('page.teacher_test_builder.question_type.multiple')
      : t('page.teacher_test_builder.question_type.single');

  const hasPendingAiImport = !!pendingAiImport && pendingAiImport.questions.length > 0;

  const syncTestParam = useCallback(
    (testId?: string) => {
      const next = new URLSearchParams(searchParams);
      const cleanTestId = cleanId(testId || '');

      if (cleanTestId) {
        next.set('testId', cleanTestId);
      } else {
        next.delete('testId');
      }

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const getNextQuestionSortOrder = useCallback(
    (test = selectedTest, extra = 1) => getNextSortOrder(test?.questions || [], extra),
    [selectedTest],
  );

  const resetQuestionForm = useCallback(
    (nextSortOrder?: string) => {
      setEditingQuestionId(null);
      setQuestionDeleteId(null);
      setQuestionForm(buildQuestionForm(nextSortOrder || getNextQuestionSortOrder()));
    },
    [getNextQuestionSortOrder],
  );

  const selectTest = (testId: string) => {
    const cleanTestId = cleanId(testId);

    if (!cleanTestId) return;

    setSelectedTestId(cleanTestId);
    syncTestParam(cleanTestId);
    setEditingQuestionId(null);
    setQuestionDeleteId(null);
    setDeleteTestConfirmOpen(false);
  };

  const seedEditFromTest = (testId: string) => {
    const cleanTestId = cleanId(testId);
    const test = workspace?.tests.find((item) => cleanId(item.id) === cleanTestId);
    if (!test) return;

    selectTest(cleanTestId);
    setTestEdit({
      title: cleanText(test.title, MAX_TEST_TITLE_CHARS),
      topic: cleanText(test.topic || '', MAX_TEST_TOPIC_CHARS),
      duration: normalizeNumericInput(test.durationMinutes || 20, MAX_DURATION_CHARS) || '20',
      subjectId: cleanId(test.subjectId || ''),
      status: normalizeTestStatus(test.status),
    });
    setQuestionForm(buildQuestionForm(getNextSortOrder(test.questions || [])));
    setEditingQuestionId(null);
  };

  useEffect(() => {
    const pending = getPendingAiQuestionImport();
    setPendingAiImport(pending);
  }, []);

  useEffect(() => {
    if (!pendingAiImport) return;

    setNewTest((prev) => ({
      ...prev,
      title:
        prev.title ||
        cleanText(pendingAiImport.titleSuggestion || '', MAX_TEST_TITLE_CHARS),
      topic:
        prev.topic ||
        cleanText(pendingAiImport.topic || '', MAX_TEST_TOPIC_CHARS),
      duration: prev.duration || '20',
    }));
  }, [pendingAiImport]);

  useEffect(() => {
    if (newTest.courseId || courseOptions.length !== 1) return;

    const onlyCourse = courseOptions[0];

    setNewTest((previous) => ({
      ...previous,
      courseId: onlyCourse.id,
      subjectId: onlyCourse.subjectId || previous.subjectId,
    }));
  }, [courseOptions, newTest.courseId]);

  useEffect(() => {
    if (!newTest.courseId || courseOptions.some((course) => course.id === newTest.courseId)) {
      return;
    }

    setNewTest((previous) => ({
      ...previous,
      courseId: '',
    }));
  }, [courseOptions, newTest.courseId]);

  useEffect(() => {
    if (!workspace) return;

    if (!workspace.tests?.length) {
      if (selectedTestId) {
        setSelectedTestId('');
      }

      if (requestedTestId) {
        syncTestParam();
      }

      return;
    }

    const test =
      workspace.tests.find((item) => cleanId(item.id) === requestedTestId) ||
      workspace.tests.find((item) => cleanId(item.id) === cleanId(selectedTestId)) ||
      workspace.tests[0];

    if (!test) return;

    if (cleanId(test.id) !== cleanId(selectedTestId)) {
      setSelectedTestId(cleanId(test.id));
    }

    if (requestedTestId !== cleanId(test.id)) {
      syncTestParam(cleanId(test.id));
    }
  }, [workspace, requestedTestId, selectedTestId, syncTestParam]);

  useEffect(() => {
    if (!selectedTest) return;
    if (lastSeededTestId.current === cleanId(selectedTest.id)) return;

    lastSeededTestId.current = cleanId(selectedTest.id);

    setTestEdit({
      title: cleanText(selectedTest.title, MAX_TEST_TITLE_CHARS),
      topic: cleanText(selectedTest.topic || '', MAX_TEST_TOPIC_CHARS),
      duration: normalizeNumericInput(selectedTest.durationMinutes || 20, MAX_DURATION_CHARS) || '20',
      subjectId: cleanId(selectedTest.subjectId || ''),
      status: normalizeTestStatus(selectedTest.status),
    });

    setQuestionForm(buildQuestionForm(getNextQuestionSortOrder(selectedTest)));
    setEditingQuestionId(null);
    setQuestionDeleteId(null);
    setDeleteTestConfirmOpen(false);
  }, [selectedTest, getNextQuestionSortOrder]);

  useEffect(() => {
    if (!selectedTest || !editingQuestionId) return;

    const questionStillExists = selectedTest.questions.some(
      (question) => cleanId(question.id) === cleanId(editingQuestionId),
    );

    if (!questionStillExists) {
      resetQuestionForm();
    }
  }, [selectedTest, editingQuestionId, resetQuestionForm]);

  const refetch = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherTestsWorkspaceBase,
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherDashboardBase,
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.testsBase,
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.moderationQueue,
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.adminDashboard,
      }),
    ]);
  };

  const parseQuestionPayload = () => {
    const questionText = cleanMultilineText(
      questionForm.questionText,
      MAX_QUESTION_TEXT_CHARS,
    );
    const explanation = cleanMultilineText(
      questionForm.explanation,
      MAX_EXPLANATION_CHARS,
    );

    if (!questionText) {
      throw new Error('Сұрақ мәтіні міндетті.');
    }

    const optionRows = getNormalizedOptionRows(questionForm.optionsText);

    if (optionRows.length < 2) {
      throw new Error(t('page.teacher_test_builder.validation.options_min'));
    }

    const originalIndexToNormalizedIndex = new Map(
      optionRows.map((option, normalizedIndex) => [
        option.originalIndex,
        normalizedIndex,
      ]),
    );

    const correct = Array.from(
      new Set(
        parseCorrectAnswerIndexes(questionForm.correctAnswer).flatMap((index) => {
          const normalizedIndex = originalIndexToNormalizedIndex.get(index);

          return normalizedIndex === undefined ? [] : [normalizedIndex];
        }),
      ),
    ).sort((a, b) => a - b);

    if (correct.length === 0) {
      throw new Error(
        t('page.teacher_test_builder.validation.correct_answer_required'),
      );
    }

    if (!questionForm.multiple && correct.length > 1) {
      throw new Error(
        t('page.teacher_test_builder.validation.single_answer_only'),
      );
    }

    return {
      questionText,
      explanation,
      options: optionRows.map((option) => option.text),
      correct,
    };
  };

  const createTestMutation = useMutation({
    mutationFn: async () => {
      if (!safeUserId) throw new Error('Пайдаланушы табылмады.');

      const title = cleanText(newTest.title, MAX_TEST_TITLE_CHARS);
      const courseId = cleanId(newTest.courseId);
      const subjectId = cleanId(newTest.subjectId);

      if (!title) throw new Error('Тест атауы міндетті.');
      if (!courseId) throw new Error('Курс таңдаңыз.');
      if (!subjectId) throw new Error('Пән таңдаңыз.');

      return createTest({
        title,
        courseId,
        topic: cleanText(newTest.topic, MAX_TEST_TOPIC_CHARS),
        subjectId,
        durationMinutes: normalizePositiveInt(newTest.duration, 20),
        createdBy: safeUserId,
        status: 'draft',
      });
    },
    onSuccess: async (test) => {
      setNewTest({
        title: '',
        topic: '',
        duration: '20',
        subjectId: '',
        courseId: '',
      });

      await refetch();
      selectTest(cleanId(test.id));

      toast({
        title: t('page.teacher_test_builder.toast.create_test_title'),
        description: pendingAiImport ? 'ЖИ сұрақтарды осы тестке қосуға болады.' : undefined,
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: getErrorMessage(error),
        variant: 'destructive',
      }),
  });

  const updateTestMutation = useMutation({
    mutationFn: async () => {
      const testId = cleanId(selectedTest?.id);

      if (!testId) throw new Error('Тест таңдалмаған.');

      const title = cleanText(testEdit.title, MAX_TEST_TITLE_CHARS);
      if (!title) throw new Error('Тест атауы міндетті.');

      return updateTest({
        testId,
        title,
        topic: cleanText(testEdit.topic, MAX_TEST_TOPIC_CHARS),
        subjectId: cleanId(testEdit.subjectId) || null,
        durationMinutes: normalizePositiveInt(testEdit.duration, 20),
        status: normalizeTestStatus(testEdit.status),
      });
    },
    onSuccess: async () => {
      await refetch();
      toast({ title: t('page.teacher_test_builder.toast.update_test_title') });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: getErrorMessage(error),
        variant: 'destructive',
      }),
  });

  const deleteTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      await deleteTest(cleanId(testId));
    },
    onSuccess: async (_data, testId) => {
      const deletedTestId = cleanId(testId);
      const nextTestId = workspace?.tests.find((test) => cleanId(test.id) !== deletedTestId)?.id || '';

      setEditingQuestionId(null);
      setDeleteTestConfirmOpen(false);

      if (nextTestId) {
        setSelectedTestId(cleanId(nextTestId));
        syncTestParam(cleanId(nextTestId));
      } else {
        setSelectedTestId('');
        syncTestParam();
      }

      await refetch();
      resetQuestionForm('1');

      toast({ title: t('page.teacher_test_builder.toast.delete_test_title') });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: getErrorMessage(error),
        variant: 'destructive',
      }),
  });

  const saveQuestionMutation = useMutation({
    mutationFn: async () => {
      const testId = cleanId(selectedTest?.id);

      if (!testId) throw new Error('Тест таңдалмаған.');

      const { questionText, explanation, options, correct } = parseQuestionPayload();
      const sortOrder =
        Number(normalizeNumericInput(questionForm.sortOrder, MAX_SORT_ORDER_CHARS)) || 1;
      const questionType = questionForm.multiple ? 'multiple_choice' : 'single_choice';
      const questionId = cleanId(editingQuestionId);

      if (questionId) {
        return updateTestQuestion({
          questionId,
          questionText,
          options,
          correctAnswer: correct,
          explanation: explanation || null,
          sortOrder,
          questionType,
        });
      }

      return createTestQuestion({
        testId,
        questionText,
        options,
        correctAnswer: correct,
        explanation,
        sortOrder: sortOrder || selectedTest.questions.length + 1,
        questionType,
      });
    },
    onSuccess: async () => {
      const nextSortOrder = editingQuestionId
        ? getNextQuestionSortOrder(selectedTest, 1)
        : getNextQuestionSortOrder(selectedTest, 2);

      await refetch();
      resetQuestionForm(nextSortOrder);

      toast({
        title: editingQuestionId
          ? t('page.teacher_test_builder.toast.update_question_title')
          : t('page.teacher_test_builder.toast.add_question_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: getErrorMessage(error),
        variant: 'destructive',
      }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async ({
      questionId,
      remainingIds,
    }: {
      questionId: string;
      remainingIds: string[];
    }) => {
      if (!selectedTest) throw new Error('Тест таңдалмаған.');

      const cleanQuestionId = cleanId(questionId);
      const cleanRemainingIds = remainingIds
        .map((id) => cleanId(id))
        .filter(Boolean);

      await deleteTestQuestion(cleanQuestionId);

      if (cleanRemainingIds.length > 0) {
        await reorderTestQuestions(cleanId(selectedTest.id), cleanRemainingIds);
      }
    },
    onSuccess: async (_data, variables) => {
      await refetch();
      resetQuestionForm(String(variables.remainingIds.length + 1));
      setQuestionDeleteId(null);

      toast({
        title: t('page.teacher_test_builder.toast.delete_question_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: getErrorMessage(error),
        variant: 'destructive',
      }),
  });

  const reorderQuestionsMutation = useMutation({
    mutationFn: async ({
      questionId,
      direction,
    }: {
      questionId: string;
      direction: 'up' | 'down';
    }) => {
      if (!selectedTest) throw new Error('Тест таңдалмаған.');

      const cleanQuestionId = cleanId(questionId);
      const currentIndex = sortedSelectedQuestions.findIndex(
        (question) => cleanId(question.id) === cleanQuestionId,
      );
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= sortedSelectedQuestions.length
      ) {
        return;
      }

      const nextOrder = moveItem(sortedSelectedQuestions, currentIndex, nextIndex).map(
        (question) => cleanId(question.id),
      ).filter(Boolean);

      await reorderTestQuestions(cleanId(selectedTest.id), nextOrder);
    },
    onSuccess: async () => {
      await refetch();
      toast({
        title: t('page.teacher_test_builder.toast.reorder_questions_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: getErrorMessage(error),
        variant: 'destructive',
      }),
  });

  const importAiQuestionsMutation = useMutation({
    mutationFn: async () => {
      const testId = cleanId(selectedTest?.id);

      if (!testId) {
        throw new Error('Алдымен сұрақ қосылатын тестті таңдаңыз.');
      }

      if (!pendingAiImport || pendingAiImport.questions.length === 0) {
        throw new Error('Қосылатын ЖИ сұрақтар табылмады.');
      }

      const startSortOrder =
        getSortedQuestions(selectedTest.questions).at(-1)?.sort_order || 0;

      for (const [index, question] of pendingAiImport.questions.entries()) {
        const questionText = cleanMultilineText(
          question.questionText,
          MAX_QUESTION_TEXT_CHARS,
        );
        const options = question.options
          .map((option) => cleanText(option, MAX_OPTION_CHARS))
          .filter(Boolean)
          .slice(0, MAX_OPTIONS);
        const correctAnswer = normalizeCorrectAnswerIndexes(
          question.correctAnswer,
          options.length,
        );
        const questionType = normalizeQuestionType(question.questionType);

        if (!questionText || options.length < 2 || correctAnswer.length === 0) {
          continue;
        }

        if (questionType === 'single_choice' && correctAnswer.length > 1) {
          correctAnswer.splice(1);
        }

        await createTestQuestion({
          testId,
          questionText,
          options,
          correctAnswer,
          explanation: cleanMultilineText(question.explanation || '', MAX_EXPLANATION_CHARS),
          sortOrder: startSortOrder + index + 1,
          questionType,
        });
      }
    },
    onSuccess: async () => {
      const importedCount = pendingAiImport?.questions.length || 0;
      const skipped = pendingAiImport?.skippedCount || 0;

      clearPendingAiQuestionImport();
      setPendingAiImport(null);
      setAiImportConfirmOpen(false);

      await refetch();
      resetQuestionForm();

      toast({
        title: 'ЖИ сұрақтар қосылды',
        description:
          skipped > 0
            ? `${importedCount} сұрақ қосылды, ${skipped} сұрақ өтпеді.`
            : `${importedCount} сұрақ қосылды.`,
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: getErrorMessage(error),
        variant: 'destructive',
      }),
  });

  const dismissPendingAiImport = () => {
    clearPendingAiQuestionImport();
    setPendingAiImport(null);
    setAiImportConfirmOpen(false);
  };

  const editQuestion = (questionId: string) => {
    const cleanQuestionId = cleanId(questionId);
    const question = selectedTest?.questions.find((item) => cleanId(item.id) === cleanQuestionId);
    if (!question) return;

    setQuestionDeleteId(null);
    setEditingQuestionId(cleanId(question.id));
    setQuestionForm({
      questionText: cleanMultilineText(question.question_text, MAX_QUESTION_TEXT_CHARS),
      optionsText: Array.isArray(question.options)
        ? question.options.map((value) => sanitizeInputValue(value, MAX_OPTION_CHARS)).join('\n')
        : '',
      correctAnswer: Array.isArray(question.correct_answer)
        ? question.correct_answer.map((value: unknown) => Number(value) + 1).join(',')
        : '1',
      explanation: cleanMultilineText(question.explanation || '', MAX_EXPLANATION_CHARS),
      sortOrder: normalizeNumericInput(question.sort_order, MAX_SORT_ORDER_CHARS) || '1',
      multiple: normalizeQuestionType(question.question_type) === 'multiple_choice',
    });
  };

  const updateQuestionOption = (optionIndex: number, value: string) => {
    setQuestionForm((previous) => {
      const nextOptions = getOptionLinesForEditor(previous.optionsText);
      nextOptions[optionIndex] = sanitizeInputValue(value, MAX_OPTION_CHARS);

      const nextCorrect = parseCorrectAnswerIndexes(previous.correctAnswer, nextOptions.length).filter(
        (index) => nextOptions[index]?.trim(),
      );

      return {
        ...previous,
        optionsText: nextOptions.join('\n'),
        correctAnswer: formatCorrectAnswer(nextCorrect),
      };
    });
  };

  const addQuestionOption = () => {
    setQuestionForm((previous) => {
      const currentOptions = getOptionLinesForEditor(previous.optionsText);

      if (currentOptions.length >= MAX_OPTIONS) return previous;

      return {
        ...previous,
        optionsText: `${currentOptions.join('\n')}\n`,
      };
    });
  };

  const removeQuestionOption = (optionIndex: number) => {
    setQuestionForm((previous) => {
      const currentOptions = getOptionLinesForEditor(previous.optionsText);

      if (currentOptions.length <= 2) return previous;

      const nextOptions = currentOptions.filter((_, index) => index !== optionIndex);
      const nextCorrect = parseCorrectAnswerIndexes(previous.correctAnswer, currentOptions.length)
        .flatMap((index) => {
          if (index === optionIndex) return [];
          if (index > optionIndex) return [index - 1];

          return [index];
        })
        .filter((index) => nextOptions[index]?.trim());

      return {
        ...previous,
        optionsText: nextOptions.join('\n'),
        correctAnswer: formatCorrectAnswer(nextCorrect),
      };
    });
  };

  const toggleCorrectOption = (optionIndex: number) => {
    setQuestionForm((previous) => {
      if (!previous.multiple) {
        return {
          ...previous,
          correctAnswer: String(optionIndex + 1),
        };
      }

      const current = parseCorrectAnswerIndexes(previous.correctAnswer, getOptionLinesForEditor(previous.optionsText).length);
      const exists = current.includes(optionIndex);
      const next = exists
        ? current.filter((index) => index !== optionIndex)
        : [...current, optionIndex];

      return {
        ...previous,
        correctAnswer: formatCorrectAnswer(next),
      };
    });
  };

  const canCreateTest =
    !!cleanText(newTest.title, MAX_TEST_TITLE_CHARS) &&
    !!cleanId(newTest.courseId) &&
    !!cleanId(newTest.subjectId) &&
    !createTestMutation.isPending;

  const canSaveQuestion =
    !!cleanMultilineText(questionForm.questionText, MAX_QUESTION_TEXT_CHARS) &&
    getNormalizedOptionRows(questionForm.optionsText).length >= 2 &&
    parseCorrectAnswerIndexes(questionForm.correctAnswer, getOptionLinesForEditor(questionForm.optionsText).length).some((index) =>
      getOptionLinesForEditor(questionForm.optionsText)[index]?.trim(),
    ) &&
    !saveQuestionMutation.isPending;

  const canImportAiQuestions =
    !!selectedTest &&
    hasPendingAiImport &&
    !importAiQuestionsMutation.isPending;

  const testsCount = workspace?.tests?.length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutDashboard size={13} />
              Тест құрастыру
            </>
          }
          icon={<ClipboardList size={20} />}
          title={t('page.teacher_test_builder.title')}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {selectedTest ? (
                <StatusBadge tone={getTestStatusTone(testEdit.status)}>
                  {statusLabels[normalizeTestStatus(testEdit.status)]}
                </StatusBadge>
              ) : null}

              <Button type="button" variant="outline" asChild>
                <Link to="/ai-question-builder">
                  <Sparkles size={16} className="mr-2" />
                  ЖИ сұрақ
                </Link>
              </Button>
            </div>
          }
        />

        {workspaceLoading ? <TestBuilderSkeleton /> : null}

        {!workspaceLoading && workspaceError ? (
          <ErrorState
            text={t('page.teacher_test_builder.error.tests')}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                <RotateCcw size={15} className="mr-2" />
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {pendingAiImport ? (
          <Card className="border-primary-muted bg-primary-soft/45">
            <CardHeader className="border-b border-primary-muted/70 bg-card pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles size={16} className="text-primary" />
                  ЖИ сұрақтарды қосу
                </CardTitle>

                <StatusBadge tone="primary">
                  {pendingAiImport.questions.length} сұрақ
                </StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {cleanText(pendingAiImport.titleSuggestion || 'ЖИ тест', MAX_TEST_TITLE_CHARS)}
                  </p>

                  {pendingAiImport.skippedCount > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Өтпеген сұрақтар: {pendingAiImport.skippedCount}
                    </p>
                  ) : null}

                  {!selectedTest ? (
                    <p className="mt-1 text-xs text-destructive">
                      Алдымен тест таңдаңыз.
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => setAiImportConfirmOpen(true)}
                    disabled={!canImportAiQuestions}
                  >
                    <ClipboardList size={16} className="mr-2" />
                    {importAiQuestionsMutation.isPending ? 'Қосылуда...' : 'Қосу'}
                  </Button>

                  <Button type="button" variant="outline" onClick={dismissPendingAiImport}>
                    Болдырмау
                  </Button>
                </div>
              </div>

              {aiImportConfirmOpen ? (
                <InlineConfirm
                  title="Сұрақтар осы тестке қосылсын ба?"
                  confirmLabel="Қосу"
                  pending={importAiQuestionsMutation.isPending}
                  onConfirm={() => importAiQuestionsMutation.mutate()}
                  onCancel={() => setAiImportConfirmOpen(false)}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {!workspaceLoading && !workspaceError ? (
          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 bg-card pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base font-semibold">
                      {t('page.teacher_test_builder.section.new_test')}
                    </CardTitle>

                    <StatusBadge tone={canCreateTest ? 'success' : 'muted'}>
                      {canCreateTest ? 'Дайын' : 'Толтырыңыз'}
                    </StatusBadge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 p-4 sm:p-5">
                  <FieldBlock label="Курс" required>
                    <select
                      value={newTest.courseId}
                      onChange={(event) => {
                        const courseId = cleanId(event.target.value);
                        const course = courseOptions.find((item) => item.id === courseId);

                        setNewTest((previous) => ({
                          ...previous,
                          courseId,
                          subjectId: course?.subjectId || previous.subjectId,
                        }));
                      }}
                      disabled={courseWorkspaceFetching || courseOptions.length === 0}
                      className="h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">
                        {courseWorkspaceFetching
                          ? 'Курстар жүктелуде...'
                          : courseOptions.length === 0
                            ? 'Алдымен курс құрыңыз'
                            : 'Курс таңдаңыз'}
                      </option>

                      {courseOptions.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                          {course.subjectName ? ` · ${course.subjectName}` : ''}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>

                  <FieldBlock
                    label={t('page.teacher_test_builder.field.test_title')}
                    required
                  >
                    <Input
                      value={newTest.title}
                      maxLength={MAX_TEST_TITLE_CHARS}
                      onChange={(event) =>
                        setNewTest((previous) => ({
                          ...previous,
                          title: sanitizeInputValue(event.target.value, MAX_TEST_TITLE_CHARS),
                        }))
                      }
                      placeholder={t('page.teacher_test_builder.placeholder.test_title')}
                    />
                  </FieldBlock>

                  <FieldBlock label={t('page.teacher_test_builder.field.topic')}>
                    <Input
                      value={newTest.topic}
                      maxLength={MAX_TEST_TOPIC_CHARS}
                      onChange={(event) =>
                        setNewTest((previous) => ({
                          ...previous,
                          topic: sanitizeInputValue(event.target.value, MAX_TEST_TOPIC_CHARS),
                        }))
                      }
                      placeholder={t('page.teacher_test_builder.placeholder.topic')}
                    />
                  </FieldBlock>

                  <div className="grid grid-cols-2 gap-4">
                    <FieldBlock label={t('page.teacher_test_builder.field.duration')}>
                      <Input
                        type="number"
                        min={1}
                        value={newTest.duration}
                        onChange={(event) =>
                          setNewTest((previous) => ({
                            ...previous,
                            duration: normalizeNumericInput(event.target.value, MAX_DURATION_CHARS),
                          }))
                        }
                      />
                    </FieldBlock>

                    <FieldBlock
                      label={t('page.teacher_test_builder.field.subject')}
                      required
                    >
                      <select
                        value={newTest.subjectId}
                        onChange={(event) =>
                          setNewTest((previous) => ({
                            ...previous,
                            subjectId: cleanId(event.target.value),
                          }))
                        }
                        className="h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">
                          {t('page.teacher_test_builder.placeholder.select_subject')}
                        </option>

                        {(subjects || []).map((subject) => (
                          <option key={cleanId(subject.id)} value={cleanId(subject.id)}>
                            {cleanText(subject.name_kk, 180) || cleanId(subject.id)}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => createTestMutation.mutate()}
                    disabled={!canCreateTest}
                  >
                    <Plus size={15} className="mr-2" />
                    {createTestMutation.isPending
                      ? t('page.teacher_test_builder.action.saving')
                      : t('page.teacher_test_builder.action.create_test')}
                  </Button>
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 bg-card pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base font-semibold">
                      {t('page.teacher_test_builder.section.manage_tests')}
                    </CardTitle>

                    <StatusBadge tone="muted">{testsCount}</StatusBadge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5">
                  <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
                    {workspaceLoading ? (
                      <LoadingState text={t('page.teacher_test_builder.loading.tests')} />
                    ) : workspaceError ? (
                      <ErrorState text={t('page.teacher_test_builder.error.tests')} />
                    ) : !(workspace?.tests?.length) ? (
                      <EmptyState
                        title={t('page.teacher_test_builder.empty.tests_title')}
                        text={t('page.teacher_test_builder.empty.tests_text')}
                        compact
                      />
                    ) : (
                      workspace.tests.map((test) => {
                        const testId = cleanId(test.id);
                        const testStatus = normalizeTestStatus(test.status);

                        return (
                          <button
                            key={testId}
                            type="button"
                            onClick={() => seedEditFromTest(testId)}
                            aria-pressed={cleanId(selectedTest?.id) === testId}
                            className={cn(
                              'w-full rounded-3xl border p-4 text-left transition-colors active:scale-[0.99]',
                              cleanId(selectedTest?.id) === testId
                                ? 'border-primary-muted bg-primary-soft'
                                : 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/40',
                            )}
                          >
                            <p className="truncate text-sm font-semibold text-foreground">
                              {cleanText(test.title, MAX_TEST_TITLE_CHARS) || 'Тест'}
                            </p>

                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                              {[
                                cleanText(test.subjectName, 180),
                                `${Math.max(0, Number(test.questionCount) || 0)} ${t(
                                  'page.teacher_test_builder.questions_label',
                                )}`,
                                statusLabels[testStatus],
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {selectedTest ? (
              <div className="space-y-6">
                <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b border-border/70 bg-card pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base font-semibold">
                          Тест баптаулары
                        </CardTitle>

                        <StatusBadge tone={getTestStatusTone(testEdit.status)}>
                          {statusLabels[normalizeTestStatus(testEdit.status)]}
                        </StatusBadge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <FieldBlock
                            label={t('page.teacher_test_builder.field.test_title')}
                            required
                          >
                            <Input
                              value={testEdit.title}
                              maxLength={MAX_TEST_TITLE_CHARS}
                              onChange={(event) =>
                                setTestEdit((previous) => ({
                                  ...previous,
                                  title: sanitizeInputValue(
                                    event.target.value,
                                    MAX_TEST_TITLE_CHARS,
                                  ),
                                }))
                              }
                            />
                          </FieldBlock>
                        </div>

                        <div className="md:col-span-2">
                          <FieldBlock label={t('page.teacher_test_builder.field.topic')}>
                            <Input
                              value={testEdit.topic}
                              maxLength={MAX_TEST_TOPIC_CHARS}
                              onChange={(event) =>
                                setTestEdit((previous) => ({
                                  ...previous,
                                  topic: sanitizeInputValue(
                                    event.target.value,
                                    MAX_TEST_TOPIC_CHARS,
                                  ),
                                }))
                              }
                            />
                          </FieldBlock>
                        </div>

                        <FieldBlock label={t('page.teacher_test_builder.field.duration')}>
                          <Input
                            type="number"
                            min={1}
                            value={testEdit.duration}
                            onChange={(event) =>
                              setTestEdit((previous) => ({
                                ...previous,
                                duration: normalizeNumericInput(
                                  event.target.value,
                                  MAX_DURATION_CHARS,
                                ),
                              }))
                            }
                          />
                        </FieldBlock>

                        <FieldBlock label={t('page.teacher_test_builder.field.status')}>
                          <select
                            value={testEdit.status}
                            onChange={(event) =>
                              setTestEdit((previous) => ({
                                ...previous,
                                status: normalizeTestStatus(event.target.value),
                              }))
                            }
                            className="h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          >
                            {statuses.map((status) => (
                              <option key={status} value={status}>
                                {statusLabels[status]}
                              </option>
                            ))}
                          </select>
                        </FieldBlock>

                        <div className="md:col-span-2">
                          <FieldBlock label={t('page.teacher_test_builder.field.subject')}>
                            <select
                              value={testEdit.subjectId}
                              onChange={(event) =>
                                setTestEdit((previous) => ({
                                  ...previous,
                                  subjectId: cleanId(event.target.value),
                                }))
                              }
                              className="h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="">
                                {t('page.teacher_test_builder.placeholder.select_subject')}
                              </option>

                              {(subjects || []).map((subject) => (
                                <option key={cleanId(subject.id)} value={cleanId(subject.id)}>
                                  {cleanText(subject.name_kk, 180) || cleanId(subject.id)}
                                </option>
                              ))}
                            </select>
                          </FieldBlock>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          onClick={() => updateTestMutation.mutate()}
                          disabled={updateTestMutation.isPending}
                        >
                          {updateTestMutation.isPending
                            ? t('page.teacher_test_builder.action.saving')
                            : t('page.teacher_test_builder.action.save_test')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card className="overflow-hidden">
                      <CardHeader className="border-b border-border/70 bg-card pb-3">
                        <CardTitle className="text-sm font-semibold">
                          Қысқаша мәлімет
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-2 p-4 text-sm">
                        <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
                          <span className="text-muted-foreground">Сұрақтар</span>
                          <span className="font-medium">
                            {Math.max(0, Number(selectedTest.questionCount) || 0)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
                          <span className="text-muted-foreground">Пән</span>
                          <span className="font-medium">
                            {cleanText(selectedTest.subjectName, 180) || '—'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
                          <span className="text-muted-foreground">Статус</span>
                          <span className="font-medium">
                            {statusLabels[normalizeTestStatus(selectedTest.status)]}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden border-destructive/30">
                      <CardHeader className="border-b border-destructive/20 bg-card pb-3">
                        <CardTitle className="text-sm font-semibold text-destructive">
                          Өшіру
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-3 p-4">
                        {deleteTestConfirmOpen ? (
                          <InlineConfirm
                            title="Тест өшірілсін бе?"
                            confirmLabel="Өшіру"
                            pending={deleteTestMutation.isPending}
                            variant="danger"
                            onConfirm={() => deleteTestMutation.mutate(cleanId(selectedTest.id))}
                            onCancel={() => setDeleteTestConfirmOpen(false)}
                          />
                        ) : null}

                        <Button
                          type="button"
                          variant={deleteTestConfirmOpen ? 'outline' : 'destructive'}
                          size="sm"
                          className="w-full"
                          onClick={() =>
                            setDeleteTestConfirmOpen((previous) => !previous)
                          }
                          disabled={deleteTestMutation.isPending}
                        >
                          {deleteTestConfirmOpen ? (
                            <X size={14} className="mr-1.5" />
                          ) : (
                            <Trash2 size={14} className="mr-1.5" />
                          )}
                          {deleteTestConfirmOpen
                            ? 'Жабу'
                            : t('page.teacher_test_builder.action.delete_test')}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <div className="grid gap-6 border-t pt-6 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b border-border/70 bg-card pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base font-semibold">
                          {t('page.teacher_test_builder.section.questions')}
                        </CardTitle>

                        <StatusBadge tone="muted">
                          {sortedSelectedQuestions.length}
                        </StatusBadge>
                      </div>
                    </CardHeader>

                    <CardContent className="max-h-[680px] space-y-3 overflow-auto p-4 pr-1 sm:p-5">
                      {sortedSelectedQuestions.length === 0 ? (
                        <EmptyState
                          title={t('page.teacher_test_builder.empty.questions_title')}
                          text={t('page.teacher_test_builder.empty.questions_text')}
                          compact
                        />
                      ) : (
                        sortedSelectedQuestions.map((question, index) => {
                          const questionId = cleanId(question.id);
                          const deleteOpen = cleanId(questionDeleteId) === questionId;

                          return (
                            <div
                              key={questionId}
                              className="rounded-3xl border border-border bg-card p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => editQuestion(questionId)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="text-sm font-semibold leading-6 text-foreground">
                                    #{Number(question.sort_order) || index + 1} {cleanMultilineText(question.question_text, MAX_QUESTION_TEXT_CHARS)}
                                  </p>
                                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                    {questionTypeLabel(
                                      normalizeQuestionType(question.question_type) === 'multiple_choice',
                                    )}{' '}
                                    ·{' '}
                                    {Array.isArray(question.options)
                                      ? question.options.map((option) => cleanText(option, MAX_OPTION_CHARS)).filter(Boolean).length
                                      : 0}{' '}
                                    {t('page.teacher_test_builder.options_label')}
                                  </p>
                                </button>

                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={
                                      index === 0 || reorderQuestionsMutation.isPending
                                    }
                                    onClick={() =>
                                      reorderQuestionsMutation.mutate({
                                        questionId,
                                        direction: 'up',
                                      })
                                    }
                                    aria-label="Сұрақты жоғары жылжыту"
                                  >
                                    <ArrowUp size={14} />
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={
                                      index === sortedSelectedQuestions.length - 1 ||
                                      reorderQuestionsMutation.isPending
                                    }
                                    onClick={() =>
                                      reorderQuestionsMutation.mutate({
                                        questionId,
                                        direction: 'down',
                                      })
                                    }
                                    aria-label="Сұрақты төмен жылжыту"
                                  >
                                    <ArrowDown size={14} />
                                  </Button>

                                  <Button
                                    type="button"
                                    variant={deleteOpen ? 'outline' : 'destructive'}
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={deleteQuestionMutation.isPending}
                                    onClick={() =>
                                      setQuestionDeleteId((current) =>
                                        cleanId(current) === questionId ? null : questionId,
                                      )
                                    }
                                    aria-label="Сұрақты өшіру"
                                  >
                                    {deleteOpen ? <X size={14} /> : <Trash2 size={14} />}
                                  </Button>
                                </div>
                              </div>

                              {deleteOpen ? (
                                <div className="mt-3">
                                  <InlineConfirm
                                    title="Сұрақ өшірілсін бе?"
                                    confirmLabel="Өшіру"
                                    pending={deleteQuestionMutation.isPending}
                                    variant="danger"
                                    onConfirm={() =>
                                      deleteQuestionMutation.mutate({
                                        questionId,
                                        remainingIds: sortedSelectedQuestions
                                          .filter((item) => cleanId(item.id) !== questionId)
                                          .map((item) => cleanId(item.id))
                                          .filter(Boolean),
                                      })
                                    }
                                    onCancel={() => setQuestionDeleteId(null)}
                                  />
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden">
                    <CardHeader className="border-b border-border/70 bg-card pb-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="text-base font-semibold">
                          {editingQuestionId
                            ? t('page.teacher_test_builder.section.edit_question')
                            : t('page.teacher_test_builder.section.new_question')}
                        </CardTitle>

                        <StatusBadge tone={canSaveQuestion ? 'success' : 'muted'}>
                          {editingQuestionId ? 'Өңдеу' : 'Жаңа'}
                        </StatusBadge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <FieldBlock
                        label={t('page.teacher_test_builder.field.question_text')}
                        required
                      >
                        <Textarea
                          rows={4}
                          value={questionForm.questionText}
                          maxLength={MAX_QUESTION_TEXT_CHARS}
                          onChange={(event) =>
                            setQuestionForm((previous) => ({
                              ...previous,
                              questionText: sanitizeInputValue(
                                event.target.value,
                                MAX_QUESTION_TEXT_CHARS,
                              ),
                            }))
                          }
                          placeholder="Сұрақ"
                        />
                      </FieldBlock>

                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-foreground">
                          {t('page.teacher_test_builder.field.options')}
                          <span className="ml-1 text-destructive">*</span>
                        </Label>

                        <div className="space-y-2">
                          {questionOptions.map((option, optionIndex) => {
                            const checked = correctAnswerIndexes.includes(optionIndex);
                            const inputType = questionForm.multiple ? 'checkbox' : 'radio';
                            const canMarkCorrect = option.trim().length > 0;

                            return (
                              <div
                                key={optionIndex}
                                className={cn(
                                  'flex items-center gap-3 rounded-2xl border p-2 transition-colors',
                                  checked
                                    ? 'border-success-muted bg-success-soft/70'
                                    : 'border-border bg-card',
                                )}
                              >
                                <input
                                  type={inputType}
                                  name="test-correct-answer"
                                  checked={checked}
                                  disabled={!canMarkCorrect}
                                  onChange={() => toggleCorrectOption(optionIndex)}
                                  className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                />

                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-xs font-semibold text-muted-foreground">
                                  {String.fromCharCode(65 + optionIndex)}
                                </div>

                                <Input
                                  value={option}
                                  maxLength={MAX_OPTION_CHARS}
                                  onChange={(event) =>
                                    updateQuestionOption(optionIndex, event.target.value)
                                  }
                                  placeholder={`Жауап ${optionIndex + 1}`}
                                />

                                {questionOptions.length > 2 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => removeQuestionOption(optionIndex)}
                                    aria-label="Жауап нұсқасын өшіру"
                                  >
                                    <X size={14} />
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addQuestionOption}
                          disabled={questionOptions.length >= MAX_OPTIONS}
                        >
                          <Plus size={14} className="mr-1.5" />
                          Нұсқа қосу
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <FieldBlock label={t('page.teacher_test_builder.field.sort_order')}>
                          <Input
                            type="number"
                            min={1}
                            value={questionForm.sortOrder}
                            onChange={(event) =>
                              setQuestionForm((previous) => ({
                                ...previous,
                                sortOrder: normalizeNumericInput(
                                  event.target.value,
                                  MAX_SORT_ORDER_CHARS,
                                ),
                              }))
                            }
                          />
                        </FieldBlock>

                        <div
                          className={cn(
                            'rounded-2xl border px-4 py-3 transition-colors',
                            questionForm.multiple
                              ? 'border-primary-muted bg-primary-soft/70'
                              : 'border-border bg-muted/30',
                          )}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <Label
                              htmlFor="multiple-choice"
                              className="text-sm font-semibold text-foreground"
                            >
                              {t('page.teacher_test_builder.field.multiple_choice')}
                            </Label>

                            <Switch
                              id="multiple-choice"
                              checked={questionForm.multiple}
                              onCheckedChange={(checked) =>
                                setQuestionForm((previous) => ({
                                  ...previous,
                                  multiple: checked,
                                  correctAnswer: checked
                                    ? previous.correctAnswer
                                    : previous.correctAnswer.split(',')[0] || '1',
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <FieldBlock label={t('page.teacher_test_builder.field.explanation')}>
                        <Textarea
                          rows={3}
                          value={questionForm.explanation}
                          maxLength={MAX_EXPLANATION_CHARS}
                          onChange={(event) =>
                            setQuestionForm((previous) => ({
                              ...previous,
                              explanation: sanitizeInputValue(
                                event.target.value,
                                MAX_EXPLANATION_CHARS,
                              ),
                            }))
                          }
                          placeholder="Түсіндірме"
                        />
                      </FieldBlock>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          onClick={() => saveQuestionMutation.mutate()}
                          disabled={!canSaveQuestion}
                        >
                          {saveQuestionMutation.isPending
                            ? t('page.teacher_test_builder.action.saving')
                            : editingQuestionId
                              ? t('page.teacher_test_builder.action.save_question')
                              : t('page.teacher_test_builder.action.add_question')}
                        </Button>

                        {editingQuestionId ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => resetQuestionForm()}
                          >
                            {t('page.teacher_test_builder.action.clear_form')}
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="py-10">
                  <EmptyState
                    title={t('page.teacher_test_builder.empty.select_test_title')}
                    text={t('page.teacher_test_builder.empty.select_test_text')}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}