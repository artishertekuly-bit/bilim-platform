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

const MAX_TEST_TITLE_CHARS = 180;
const MAX_TEST_TOPIC_CHARS = 220;
const MAX_QUESTION_TEXT_CHARS = 1_200;
const MAX_OPTION_CHARS = 400;
const MAX_OPTIONS = 8;
const MAX_EXPLANATION_CHARS = 1_500;
const MAX_DURATION_CHARS = 3;
const MAX_SORT_ORDER_CHARS = 4;

function cleanText(value: string, limit: number) {
  return value.replace(/\x00/g, ' ').slice(0, limit);
}

function normalizeNumericInput(value: string, limit: number) {
  return value.replace(/[^\d]/g, '').slice(0, limit);
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
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

function getSortedQuestions<T extends { sort_order: number }>(questions: T[] = []) {
  return [...questions].sort((a, b) => a.sort_order - b.sort_order);
}

function getNextSortOrder<T extends { sort_order: number }>(
  questions: T[] = [],
  extra = 1,
) {
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
          ? row.subjectId
          : typeof row.subject_id === 'string'
            ? row.subject_id
            : '';

      const subjectName =
        typeof row.subjectName === 'string'
          ? row.subjectName
          : typeof row.subject_name === 'string'
            ? row.subject_name
            : null;

      return {
        id: String(row.id || row.courseId || '').trim(),
        title: String(row.title || row.courseTitle || 'Курс').trim(),
        subjectId,
        subjectName,
      };
    })
    .filter((course) => course.id.length > 0);
}

function parseCorrectAnswerIndexes(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => Number(item.trim()) - 1)
        .filter((item) => Number.isInteger(item) && item >= 0),
    ),
  ).sort((a, b) => a - b);
}

function getOptionLinesForEditor(value: string) {
  const lines = value.split('\n').slice(0, MAX_OPTIONS);

  while (lines.length < 2) {
    lines.push('');
  }

  return lines;
}

function getNormalizedOptionRows(value: string) {
  return getOptionLinesForEditor(value)
    .map((option, originalIndex) => ({
      originalIndex,
      text: option.trim(),
    }))
    .filter((option) => option.text.length > 0);
}

function formatCorrectAnswer(indexes: number[]) {
  return indexes
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
      className={`rounded-2xl border p-3 ${
        variant === 'danger'
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-warning-muted bg-warning-soft/60'
      }`}
    >
      <p className="text-xs font-semibold text-foreground">{title}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={variant === 'danger' ? 'destructive' : 'outline'}
          size="sm"
          disabled={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjects();
  const { data: courseWorkspace, isFetching: courseWorkspaceFetching } =
    useTeacherCourseWorkspace(user?.id || '', !!user?.id);
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTestId = searchParams.get('testId') || '';

  const courseOptions = useMemo(
    () => normalizeCourseOptions(courseWorkspace),
    [courseWorkspace],
  );

  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
  } = useTeacherTestsWorkspace(user?.id || '', !!user?.id);

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
      workspace?.tests.find((test) => test.id === selectedTestId) ||
      workspace?.tests.find((test) => test.id === requestedTestId) ||
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
    () => parseCorrectAnswerIndexes(questionForm.correctAnswer),
    [questionForm.correctAnswer],
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

      if (testId) {
        next.set('testId', testId);
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
    setSelectedTestId(testId);
    syncTestParam(testId);
    setEditingQuestionId(null);
    setQuestionDeleteId(null);
    setDeleteTestConfirmOpen(false);
  };

  const seedEditFromTest = (testId: string) => {
    const test = workspace?.tests.find((item) => item.id === testId);
    if (!test) return;

    selectTest(testId);
    setTestEdit({
      title: test.title,
      topic: test.topic || '',
      duration: String(test.durationMinutes || 20),
      subjectId: test.subjectId || '',
      status: test.status as TestStatus,
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
      title: prev.title || pendingAiImport.titleSuggestion || '',
      topic: prev.topic || pendingAiImport.topic || '',
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
      workspace.tests.find((item) => item.id === requestedTestId) ||
      workspace.tests.find((item) => item.id === selectedTestId) ||
      workspace.tests[0];

    if (!test) return;

    if (test.id !== selectedTestId) {
      setSelectedTestId(test.id);
    }

    if (requestedTestId !== test.id) {
      syncTestParam(test.id);
    }
  }, [workspace, requestedTestId, selectedTestId, syncTestParam]);

  useEffect(() => {
    if (!selectedTest) return;
    if (lastSeededTestId.current === selectedTest.id) return;

    lastSeededTestId.current = selectedTest.id;

    setTestEdit({
      title: selectedTest.title,
      topic: selectedTest.topic || '',
      duration: String(selectedTest.durationMinutes || 20),
      subjectId: selectedTest.subjectId || '',
      status: selectedTest.status as TestStatus,
    });

    setQuestionForm(buildQuestionForm(getNextQuestionSortOrder(selectedTest)));
    setEditingQuestionId(null);
    setQuestionDeleteId(null);
    setDeleteTestConfirmOpen(false);
  }, [selectedTest, getNextQuestionSortOrder]);

  useEffect(() => {
    if (!selectedTest || !editingQuestionId) return;

    const questionStillExists = selectedTest.questions.some(
      (question) => question.id === editingQuestionId,
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
    const questionText = questionForm.questionText.trim();
    const explanation = questionForm.explanation.trim();

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
      if (!user) throw new Error('Пайдаланушы табылмады.');

      return createTest({
        title: newTest.title.trim(),
        courseId: newTest.courseId,
        topic: newTest.topic.trim(),
        subjectId: newTest.subjectId,
        durationMinutes: Number(newTest.duration) || 20,
        createdBy: user.id,
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
      selectTest(test.id);

      toast({
        title: t('page.teacher_test_builder.toast.create_test_title'),
        description: pendingAiImport
          ? 'AI сұрақтарды осы тестке қосуға болады.'
          : undefined,
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const updateTestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTest) throw new Error('Тест таңдалмаған.');

      return updateTest({
        testId: selectedTest.id,
        title: testEdit.title.trim(),
        topic: testEdit.topic.trim(),
        subjectId: testEdit.subjectId || null,
        durationMinutes: Number(testEdit.duration) || 20,
        status: testEdit.status,
      });
    },
    onSuccess: async () => {
      await refetch();
      toast({ title: t('page.teacher_test_builder.toast.update_test_title') });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const deleteTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      await deleteTest(testId);
    },
    onSuccess: async (_data, testId) => {
      const nextTestId = workspace?.tests.find((test) => test.id !== testId)?.id || '';

      setEditingQuestionId(null);
      setDeleteTestConfirmOpen(false);

      if (nextTestId) {
        setSelectedTestId(nextTestId);
        syncTestParam(nextTestId);
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
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const saveQuestionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTest) throw new Error('Тест таңдалмаған.');

      const { questionText, explanation, options, correct } = parseQuestionPayload();

      if (editingQuestionId) {
        return updateTestQuestion({
          questionId: editingQuestionId,
          questionText,
          options,
          correctAnswer: correct,
          explanation: explanation || null,
          sortOrder: Number(questionForm.sortOrder) || 1,
          questionType: questionForm.multiple ? 'multiple_choice' : 'single_choice',
        });
      }

      return createTestQuestion({
        testId: selectedTest.id,
        questionText,
        options,
        correctAnswer: correct,
        explanation,
        sortOrder: Number(questionForm.sortOrder) || selectedTest.questions.length + 1,
        questionType: questionForm.multiple ? 'multiple_choice' : 'single_choice',
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
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_test_builder.toast.error_text'),
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

      await deleteTestQuestion(questionId);

      if (remainingIds.length > 0) {
        await reorderTestQuestions(selectedTest.id, remainingIds);
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
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_test_builder.toast.error_text'),
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

      const currentIndex = sortedSelectedQuestions.findIndex((question) => question.id === questionId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= sortedSelectedQuestions.length
      ) {
        return;
      }

      const nextOrder = moveItem(sortedSelectedQuestions, currentIndex, nextIndex).map(
        (question) => question.id,
      );

      await reorderTestQuestions(selectedTest.id, nextOrder);
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
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const importAiQuestionsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTest) {
        throw new Error('Алдымен сұрақ қосылатын тестті таңдаңыз.');
      }

      if (!pendingAiImport || pendingAiImport.questions.length === 0) {
        throw new Error('Қосылатын AI сұрақтар табылмады.');
      }

      const startSortOrder =
        getSortedQuestions(selectedTest.questions).at(-1)?.sort_order || 0;

      for (const [index, question] of pendingAiImport.questions.entries()) {
        await createTestQuestion({
          testId: selectedTest.id,
          questionText: question.questionText,
          options: question.options,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation || '',
          sortOrder: startSortOrder + index + 1,
          questionType: question.questionType,
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
        title: 'AI сұрақтар қосылды',
        description:
          skipped > 0
            ? `${importedCount} сұрақ қосылды, ${skipped} сұрақ өтпеді.`
            : `${importedCount} сұрақ қосылды.`,
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const dismissPendingAiImport = () => {
    clearPendingAiQuestionImport();
    setPendingAiImport(null);
    setAiImportConfirmOpen(false);
  };

  const editQuestion = (questionId: string) => {
    const question = selectedTest?.questions.find((item) => item.id === questionId);
    if (!question) return;

    setQuestionDeleteId(null);
    setEditingQuestionId(question.id);
    setQuestionForm({
      questionText: question.question_text,
      optionsText: Array.isArray(question.options)
        ? question.options.map(String).join('\n')
        : '',
      correctAnswer: Array.isArray(question.correct_answer)
        ? question.correct_answer.map((value: unknown) => Number(value) + 1).join(',')
        : '1',
      explanation: question.explanation || '',
      sortOrder: String(question.sort_order),
      multiple: question.question_type === 'multiple_choice',
    });
  };

  const updateQuestionOption = (optionIndex: number, value: string) => {
    setQuestionForm((previous) => {
      const nextOptions = getOptionLinesForEditor(previous.optionsText);
      nextOptions[optionIndex] = cleanText(value, MAX_OPTION_CHARS);

      const nextCorrect = parseCorrectAnswerIndexes(previous.correctAnswer).filter(
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
      const nextCorrect = parseCorrectAnswerIndexes(previous.correctAnswer)
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

      const current = parseCorrectAnswerIndexes(previous.correctAnswer);
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
    !!newTest.title.trim() &&
    !!newTest.courseId &&
    !!newTest.subjectId &&
    !createTestMutation.isPending;

  const canSaveQuestion =
    !!questionForm.questionText.trim() &&
    getNormalizedOptionRows(questionForm.optionsText).length >= 2 &&
    parseCorrectAnswerIndexes(questionForm.correctAnswer).some((index) =>
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
                  {statusLabels[testEdit.status]}
                </StatusBadge>
              ) : null}

              <Button type="button" variant="outline" asChild>
                <Link to="/ai-question-builder">
                  <Sparkles size={16} className="mr-2" />
                  AI сұрақ
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
                  AI сұрақтарды қосу
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
                    {pendingAiImport.titleSuggestion || 'AI тест'}
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
                      {canCreateTest ? 'Дайын' : 'Міндетті'}
                    </StatusBadge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 p-4 sm:p-5">
                  <FieldBlock label="Курс" required>
                    <select
                      value={newTest.courseId}
                      onChange={(event) => {
                        const courseId = event.target.value;
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
                      onChange={(event) =>
                        setNewTest((previous) => ({
                          ...previous,
                          title: cleanText(event.target.value, MAX_TEST_TITLE_CHARS),
                        }))
                      }
                      placeholder={t('page.teacher_test_builder.placeholder.test_title')}
                    />
                  </FieldBlock>

                  <FieldBlock label={t('page.teacher_test_builder.field.topic')}>
                    <Input
                      value={newTest.topic}
                      onChange={(event) =>
                        setNewTest((previous) => ({
                          ...previous,
                          topic: cleanText(event.target.value, MAX_TEST_TOPIC_CHARS),
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
                            subjectId: event.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">
                          {t('page.teacher_test_builder.placeholder.select_subject')}
                        </option>

                        {(subjects || []).map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name_kk}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>
                  </div>

                  <Button
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
                      workspace.tests.map((test) => (
                        <button
                          key={test.id}
                          type="button"
                          onClick={() => seedEditFromTest(test.id)}
                          aria-pressed={selectedTest?.id === test.id}
                          className={`w-full rounded-3xl border p-4 text-left transition-colors active:scale-[0.99] ${
                            selectedTest?.id === test.id
                              ? 'border-primary-muted bg-primary-soft'
                              : 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/40'
                          }`}
                        >
                          <p className="truncate text-sm font-semibold text-foreground">
                            {test.title}
                          </p>

                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            {[
                              test.subjectName,
                              `${test.questionCount} ${t(
                                'page.teacher_test_builder.questions_label',
                              )}`,
                              statusLabels[test.status as TestStatus] || test.status,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </button>
                      ))
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
                          {statusLabels[testEdit.status]}
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
                              onChange={(event) =>
                                setTestEdit((previous) => ({
                                  ...previous,
                                  title: cleanText(event.target.value, MAX_TEST_TITLE_CHARS),
                                }))
                              }
                            />
                          </FieldBlock>
                        </div>

                        <div className="md:col-span-2">
                          <FieldBlock label={t('page.teacher_test_builder.field.topic')}>
                            <Input
                              value={testEdit.topic}
                              onChange={(event) =>
                                setTestEdit((previous) => ({
                                  ...previous,
                                  topic: cleanText(event.target.value, MAX_TEST_TOPIC_CHARS),
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
                                duration: normalizeNumericInput(event.target.value, MAX_DURATION_CHARS),
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
                                status: event.target.value as TestStatus,
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
                                  subjectId: event.target.value,
                                }))
                              }
                              className="h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="">
                                {t('page.teacher_test_builder.placeholder.select_subject')}
                              </option>

                              {(subjects || []).map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.name_kk}
                                </option>
                              ))}
                            </select>
                          </FieldBlock>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <Button
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
                            {selectedTest.questionCount}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
                          <span className="text-muted-foreground">Пән</span>
                          <span className="font-medium">
                            {selectedTest.subjectName || '—'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2">
                          <span className="text-muted-foreground">Статус</span>
                          <span className="font-medium">
                            {statusLabels[selectedTest.status as TestStatus] ||
                              selectedTest.status}
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
                            onConfirm={() => deleteTestMutation.mutate(selectedTest.id)}
                            onCancel={() => setDeleteTestConfirmOpen(false)}
                          />
                        ) : null}

                        <Button
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
                          const deleteOpen = questionDeleteId === question.id;

                          return (
                            <div
                              key={question.id}
                              className="rounded-3xl border border-border bg-card p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => editQuestion(question.id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="text-sm font-semibold leading-6 text-foreground">
                                    #{question.sort_order} {question.question_text}
                                  </p>
                                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                    {questionTypeLabel(
                                      question.question_type === 'multiple_choice',
                                    )}{' '}
                                    ·{' '}
                                    {Array.isArray(question.options)
                                      ? question.options.length
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
                                        questionId: question.id,
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
                                        questionId: question.id,
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
                                        current === question.id ? null : question.id,
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
                                        questionId: question.id,
                                        remainingIds: sortedSelectedQuestions
                                          .filter((item) => item.id !== question.id)
                                          .map((item) => item.id),
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
                          onChange={(event) =>
                            setQuestionForm((previous) => ({
                              ...previous,
                              questionText: cleanText(event.target.value, MAX_QUESTION_TEXT_CHARS),
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
                                className={`flex items-center gap-3 rounded-2xl border p-2 transition-colors ${
                                  checked
                                    ? 'border-success-muted bg-success-soft/70'
                                    : 'border-border bg-card'
                                }`}
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
                                sortOrder: normalizeNumericInput(event.target.value, MAX_SORT_ORDER_CHARS),
                              }))
                            }
                          />
                        </FieldBlock>

                        <div
                          className={`rounded-2xl border px-4 py-3 transition-colors ${
                            questionForm.multiple
                              ? 'border-primary-muted bg-primary-soft/70'
                              : 'border-border bg-muted/30'
                          }`}
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
                          onChange={(event) =>
                            setQuestionForm((previous) => ({
                              ...previous,
                              explanation: cleanText(event.target.value, MAX_EXPLANATION_CHARS),
                            }))
                          }
                          placeholder="Түсіндірме"
                        />
                      </FieldBlock>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
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
                          <Button variant="outline" onClick={() => resetQuestionForm()}>
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