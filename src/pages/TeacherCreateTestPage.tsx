import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
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
  useTeacherTestsWorkspace,
} from '@/hooks/use-platform-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import {
  ArrowDown,
  ArrowUp,
  Trash2,
  Sparkles,
  ClipboardList,
} from 'lucide-react';
import {
  clearPendingAiQuestionImport,
  getPendingAiQuestionImport,
  type PendingAiQuestionImport,
} from '@/lib/ai-question-import';

const statuses = ['draft', 'under_review', 'published', 'archived'] as const;
type TestStatus = (typeof statuses)[number];

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function buildQuestionForm(nextSortOrder = '1') {
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
  extra = 1
) {
  const maxSortOrder = questions.reduce(
    (max, question) => Math.max(max, Number(question.sort_order) || 0),
    0
  );

  return String(maxSortOrder + extra);
}

export default function TeacherCreateTestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjects();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTestId = searchParams.get('testId') || '';

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

  const selectedTest = useMemo(
    () =>
      workspace?.tests.find((test) => test.id === selectedTestId) ||
      workspace?.tests.find((test) => test.id === requestedTestId) ||
      workspace?.tests[0] ||
      null,
    [workspace, selectedTestId, requestedTestId]
  );

  const sortedSelectedQuestions = useMemo(
    () => getSortedQuestions(selectedTest?.questions || []),
    [selectedTest]
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

  const hasPendingAiImport =
    !!pendingAiImport && pendingAiImport.questions.length > 0;

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
    [searchParams, setSearchParams]
  );

  const getNextQuestionSortOrder = useCallback(
    (test = selectedTest, extra = 1) => getNextSortOrder(test?.questions || [], extra),
    [selectedTest]
  );

  const resetQuestionForm = useCallback(
    (nextSortOrder?: string) => {
      setEditingQuestionId(null);
      setQuestionForm(buildQuestionForm(nextSortOrder || getNextQuestionSortOrder()));
    },
    [getNextQuestionSortOrder]
  );

  const selectTest = (testId: string) => {
    setSelectedTestId(testId);
    syncTestParam(testId);
    setEditingQuestionId(null);
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
      subjectId: prev.subjectId || '',
      duration: prev.duration || '20',
    }));
  }, [pendingAiImport]);

  useEffect(() => {
    if (!workspace?.tests?.length) {
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
  }, [selectedTest, getNextQuestionSortOrder]);

  useEffect(() => {
    if (!selectedTest || !editingQuestionId) return;

    const questionStillExists = selectedTest.questions.some(
      (q) => q.id === editingQuestionId
    );

    if (!questionStillExists) {
      resetQuestionForm();
    }
  }, [selectedTest, editingQuestionId, resetQuestionForm]);

  const refetch = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherTestsWorkspace(user?.id || ''),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherDashboard(user?.id || ''),
      }),
      queryClient.invalidateQueries({ queryKey: ['tests'] }),
      queryClient.invalidateQueries({ queryKey: platformKeys.moderationQueue }),
      queryClient.invalidateQueries({ queryKey: platformKeys.adminDashboard }),
    ]);
  };

  const parseQuestionPayload = () => {
    const questionText = questionForm.questionText.trim();
    const explanation = questionForm.explanation.trim();

    if (!questionText) {
      throw new Error('Сұрақ мәтіні міндетті');
    }

    const options = questionForm.optionsText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    if (options.length < 2) {
      throw new Error(t('page.teacher_test_builder.validation.options_min'));
    }

    const correct = Array.from(
      new Set(
        questionForm.correctAnswer
          .split(',')
          .map((value) => Number(value.trim()) - 1)
          .filter((value) => Number.isFinite(value) && value >= 0)
      )
    );

    if (correct.length === 0) {
      throw new Error(
        t('page.teacher_test_builder.validation.correct_answer_required')
      );
    }

    if (correct.some((value) => value >= options.length)) {
      throw new Error(
        t('page.teacher_test_builder.validation.correct_answer_range')
      );
    }

    if (!questionForm.multiple && correct.length > 1) {
      throw new Error(
        t('page.teacher_test_builder.validation.single_answer_only')
      );
    }

    return {
      questionText,
      explanation,
      options,
      correct,
    };
  };

  const createTestMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not found');

      return createTest({
        title: newTest.title.trim(),
        topic: newTest.topic.trim(),
        subjectId: newTest.subjectId,
        durationMinutes: Number(newTest.duration) || 20,
        createdBy: user.id,
        status: 'draft',
      });
    },
    onSuccess: async (test) => {
      setNewTest({ title: '', topic: '', duration: '20', subjectId: '' });
      await refetch();
      selectTest(test.id);

      toast({
        title: t('page.teacher_test_builder.toast.create_test_title'),
        description: pendingAiImport
          ? 'Жаңа тест таңдалды. Енді AI сұрақтарды осы тестке импорттай аласыз.'
          : undefined,
      });
    },
    onError: () =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const updateTestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTest) throw new Error('Test not selected');

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
    onError: () =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const deleteTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      await deleteTest(testId);
    },
    onSuccess: async (_data, testId) => {
      const nextTestId =
        workspace?.tests.find((test) => test.id !== testId)?.id || '';

      setEditingQuestionId(null);

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
    onError: (error) => {
  console.error('[deleteTestMutation error]', error);

  toast({
    title: t('page.teacher_test_builder.toast.error_title'),
    description:
      error instanceof Error
        ? error.message
        : t('page.teacher_test_builder.toast.error_text'),
    variant: 'destructive',
  });
},
  });

  const saveQuestionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTest) throw new Error('Test not selected');

      const { questionText, explanation, options, correct } =
        parseQuestionPayload();

      if (editingQuestionId) {
        return updateTestQuestion({
          questionId: editingQuestionId,
          questionText,
          options,
          correctAnswer: correct,
          explanation: explanation || null,
          sortOrder: Number(questionForm.sortOrder) || 1,
          questionType: questionForm.multiple
            ? 'multiple_choice'
            : 'single_choice',
        });
      }

      return createTestQuestion({
        testId: selectedTest.id,
        questionText,
        options,
        correctAnswer: correct,
        explanation,
        sortOrder:
          Number(questionForm.sortOrder) || selectedTest.questions.length + 1,
        questionType: questionForm.multiple
          ? 'multiple_choice'
          : 'single_choice',
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
      if (!selectedTest) throw new Error('Test not selected');

      await deleteTestQuestion(questionId);

      if (remainingIds.length > 0) {
        await reorderTestQuestions(selectedTest.id, remainingIds);
      }
    },
    onSuccess: async (_data, variables) => {
      await refetch();
      resetQuestionForm(String(variables.remainingIds.length + 1));

      toast({
        title: t('page.teacher_test_builder.toast.delete_question_title'),
      });
    },
    onError: () =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: t('page.teacher_test_builder.toast.error_text'),
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
      if (!selectedTest) throw new Error('Test not selected');

      const currentIndex = sortedSelectedQuestions.findIndex((q) => q.id === questionId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= sortedSelectedQuestions.length
      ) {
        return;
      }

      const nextOrder = moveItem(
        sortedSelectedQuestions,
        currentIndex,
        nextIndex
      ).map((q) => q.id);

      await reorderTestQuestions(selectedTest.id, nextOrder);
    },
    onSuccess: async () => {
      await refetch();
      toast({
        title: t('page.teacher_test_builder.toast.reorder_questions_title'),
      });
    },
    onError: () =>
      toast({
        title: t('page.teacher_test_builder.toast.error_title'),
        description: t('page.teacher_test_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const importAiQuestionsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTest) {
        throw new Error('Алдымен импорт жасалатын тестті таңдаңыз.');
      }

      if (!pendingAiImport || pendingAiImport.questions.length === 0) {
        throw new Error('Импорттайтын AI сұрақтар табылмады.');
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

      await refetch();
      resetQuestionForm();

      toast({
        title: 'AI сұрақтар импортталды',
        description:
          skipped > 0
            ? `${importedCount} сұрақ импортталды, ${skipped} сұрақ import-қа кірмеді.`
            : `${importedCount} сұрақ импортталды.`,
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
  };

  const editQuestion = (questionId: string) => {
    const question = selectedTest?.questions.find((item) => item.id === questionId);
    if (!question) return;

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

  const canCreateTest =
    !!newTest.title.trim() &&
    !!newTest.subjectId &&
    !createTestMutation.isPending;

  const canImportAiQuestions =
    !!selectedTest &&
    hasPendingAiImport &&
    !importAiQuestionsMutation.isPending;

  const testsCount = workspace?.tests?.length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {t('page.teacher_test_builder.title')}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t('page.teacher_test_builder.subtitle')}
            </p>
          </div>

          <Link to="/ai-question-builder">
            <Button variant="outline">
              <Sparkles size={16} className="mr-2" />
              AI сұрақ құрастыру
            </Button>
          </Link>
        </div>

        {pendingAiImport ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Sparkles size={16} className="text-primary" />
                AI-дан дайын сұрақтар бар
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {pendingAiImport.titleSuggestion || 'AI generated test draft'}
                </p>
                <p className="text-muted-foreground">
                  {pendingAiImport.questions.length} үйлесімді сұрақ дайын
                  {pendingAiImport.skippedCount > 0
                    ? `, ${pendingAiImport.skippedCount} сұрақ import-қа кірмеді`
                    : ''}
                  .
                </p>
                {!selectedTest ? (
                  <p className="text-destructive">
                    Импорттау үшін алдымен тест таңдаңыз немесе жаңасын құрыңыз.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Ағымдағы таңдалған тест:{' '}
                    <span className="font-medium text-foreground">{selectedTest.title}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    if (
                      window.confirm(
                        'AI сұрақтарды осы тестке импорттағыңыз келе ме? Қайталап импорттасаңыз, дубликат сұрақтар қосылуы мүмкін.'
                      )
                    ) {
                      importAiQuestionsMutation.mutate();
                    }
                  }}
                  disabled={!canImportAiQuestions}
                >
                  <ClipboardList size={16} className="mr-2" />
                  {importAiQuestionsMutation.isPending
                    ? 'Импортталуда...'
                    : 'Осы тестке импорттау'}
                </Button>

                <Button variant="outline" onClick={dismissPendingAiImport}>
                  Болдырмау
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">
                  {t('page.teacher_test_builder.section.new_test')}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t('page.teacher_test_builder.field.test_title')}</Label>
                  <Input
                    value={newTest.title}
                    onChange={(e) =>
                      setNewTest((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder={t('page.teacher_test_builder.placeholder.test_title')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t('page.teacher_test_builder.field.topic')}</Label>
                  <Input
                    value={newTest.topic}
                    onChange={(e) =>
                      setNewTest((p) => ({ ...p, topic: e.target.value }))
                    }
                    placeholder={t('page.teacher_test_builder.placeholder.topic')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t('page.teacher_test_builder.field.duration')}</Label>
                    <Input
                      type="number"
                      value={newTest.duration}
                      onChange={(e) =>
                        setNewTest((p) => ({ ...p, duration: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('page.teacher_test_builder.field.subject')}</Label>
                    <select
                      value={newTest.subjectId}
                      onChange={(e) =>
                        setNewTest((p) => ({ ...p, subjectId: e.target.value }))
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => createTestMutation.mutate()}
                  disabled={!canCreateTest}
                >
                  {createTestMutation.isPending
                    ? t('page.teacher_test_builder.action.saving')
                    : t('page.teacher_test_builder.action.create_test')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold">
                    {t('page.teacher_test_builder.section.manage_tests')}
                  </CardTitle>
                  <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                    {testsCount}
                  </span>
                </div>
              </CardHeader>

              <CardContent>
                <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
                  {workspaceLoading ? (
                    <LoadingState text={t('page.teacher_test_builder.loading.tests')} />
                  ) : workspaceError ? (
                    <ErrorState text={t('page.teacher_test_builder.error.tests')} />
                  ) : !(workspace?.tests?.length) ? (
                    <EmptyState
                      title={t('page.teacher_test_builder.empty.tests_title')}
                      text={t('page.teacher_test_builder.empty.tests_text')}
                    />
                  ) : (
                    workspace.tests.map((test) => (
                      <button
                        key={test.id}
                        onClick={() => seedEditFromTest(test.id)}
                        className={`w-full rounded-xl border p-4 text-left transition-colors ${
                          selectedTest?.id === test.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <p className="text-sm font-medium">{test.title}</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {[
                            test.subjectName,
                            `${test.questionCount} ${t(
                              'page.teacher_test_builder.questions_label'
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

          {workspaceLoading ? (
            <LoadingState text={t('page.teacher_test_builder.loading.test_editor')} />
          ) : selectedTest ? (
            <div className="space-y-6">
              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base font-semibold">
                      Тест параметрлері
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5 md:col-span-2">
                        <Label>{t('page.teacher_test_builder.field.test_title')}</Label>
                        <Input
                          value={testEdit.title}
                          onChange={(e) =>
                            setTestEdit((p) => ({ ...p, title: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <Label>{t('page.teacher_test_builder.field.topic')}</Label>
                        <Input
                          value={testEdit.topic}
                          onChange={(e) =>
                            setTestEdit((p) => ({ ...p, topic: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_test_builder.field.duration')}</Label>
                        <Input
                          type="number"
                          value={testEdit.duration}
                          onChange={(e) =>
                            setTestEdit((p) => ({ ...p, duration: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_test_builder.field.status')}</Label>
                        <select
                          value={testEdit.status}
                          onChange={(e) =>
                            setTestEdit((p) => ({
                              ...p,
                              status: e.target.value as TestStatus,
                            }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 md:col-span-2">
                        <Label>{t('page.teacher_test_builder.field.subject')}</Label>
                        <select
                          value={testEdit.subjectId}
                          onChange={(e) =>
                            setTestEdit((p) => ({ ...p, subjectId: e.target.value }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        onClick={() => updateTestMutation.mutate()}
                        disabled={updateTestMutation.isPending}
                      >
                        {t('page.teacher_test_builder.action.save_test')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Қысқаша мәлімет</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Сұрақ саны</span>
                        <span className="font-medium">{selectedTest.questionCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Пән</span>
                        <span className="font-medium">{selectedTest.subjectName || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Статус</span>
                        <span className="font-medium">
                          {statusLabels[selectedTest.status as TestStatus] || selectedTest.status}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-destructive/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-destructive">
                        Danger zone
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Бұл әрекет тестті және оған байланған сұрақтарды өшіруі мүмкін.
                      </p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          if (
                            window.confirm(
                              t('page.teacher_test_builder.confirm.delete_test')
                            )
                          ) {
                            deleteTestMutation.mutate(selectedTest.id);
                          }
                        }}
                        disabled={deleteTestMutation.isPending}
                      >
                        <Trash2 size={14} className="mr-1.5" />
                        {t('page.teacher_test_builder.action.delete_test')}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="grid gap-6 border-t pt-6 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base font-semibold">
                      {t('page.teacher_test_builder.section.questions')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="max-h-[680px] space-y-3 overflow-auto pr-1">
                    {sortedSelectedQuestions.length === 0 ? (
                      <EmptyState
                        title={t('page.teacher_test_builder.empty.questions_title')}
                        text={t('page.teacher_test_builder.empty.questions_text')}
                      />
                    ) : (
                      sortedSelectedQuestions.map((question, index) => (
                        <div key={question.id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => editQuestion(question.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-sm font-medium leading-6">
                                #{question.sort_order} {question.question_text}
                              </p>
                              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                {questionTypeLabel(
                                  question.question_type === 'multiple_choice'
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
                                disabled={index === 0 || reorderQuestionsMutation.isPending}
                                onClick={() =>
                                  reorderQuestionsMutation.mutate({
                                    questionId: question.id,
                                    direction: 'up',
                                  })
                                }
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
                              >
                                <ArrowDown size={14} />
                              </Button>

                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="h-8 w-8"
                                disabled={deleteQuestionMutation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      t(
                                        'page.teacher_test_builder.confirm.delete_question'
                                      )
                                    )
                                  ) {
                                    deleteQuestionMutation.mutate({
                                      questionId: question.id,
                                      remainingIds: sortedSelectedQuestions
                                        .filter((item) => item.id !== question.id)
                                        .map((item) => item.id),
                                    });
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base font-semibold">
                      {editingQuestionId
                        ? t('page.teacher_test_builder.section.edit_question')
                        : t('page.teacher_test_builder.section.new_question')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_test_builder.field.question_text')}</Label>
                      <Textarea
                        rows={4}
                        value={questionForm.questionText}
                        onChange={(e) =>
                          setQuestionForm((p) => ({
                            ...p,
                            questionText: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_test_builder.field.options')}</Label>
                      <Textarea
                        rows={7}
                        value={questionForm.optionsText}
                        onChange={(e) =>
                          setQuestionForm((p) => ({
                            ...p,
                            optionsText: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>
                          {t('page.teacher_test_builder.field.correct_answer')}
                        </Label>
                        <Input
                          value={questionForm.correctAnswer}
                          onChange={(e) =>
                            setQuestionForm((p) => ({
                              ...p,
                              correctAnswer: e.target.value,
                            }))
                          }
                          placeholder={t(
                            'page.teacher_test_builder.placeholder.correct_answer'
                          )}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_test_builder.field.sort_order')}</Label>
                        <Input
                          type="number"
                          value={questionForm.sortOrder}
                          onChange={(e) =>
                            setQuestionForm((p) => ({
                              ...p,
                              sortOrder: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <Label htmlFor="multiple-choice">
                        {t('page.teacher_test_builder.field.multiple_choice')}
                      </Label>
                      <Switch
                        id="multiple-choice"
                        checked={questionForm.multiple}
                        onCheckedChange={(checked) =>
                          setQuestionForm((p) => ({ ...p, multiple: checked }))
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_test_builder.field.explanation')}</Label>
                      <Textarea
                        rows={4}
                        value={questionForm.explanation}
                        onChange={(e) =>
                          setQuestionForm((p) => ({
                            ...p,
                            explanation: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        onClick={() => saveQuestionMutation.mutate()}
                        disabled={
                          !questionForm.questionText.trim() ||
                          saveQuestionMutation.isPending
                        }
                      >
                        {editingQuestionId
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
      </div>
    </DashboardLayout>
  );
}