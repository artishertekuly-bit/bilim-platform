import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Lock,
  PlayCircle,
  RotateCcw,
  Save,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  useDeleteLessonNoteMutation,
  useLessonDetail,
  useLessonLearningState,
  useLessonMiniQuiz,
  useSubmitLessonMiniQuizMutation,
  useToggleLessonBookmarkMutation,
  useToggleReviewLaterMutation,
  useUpsertLessonNoteMutation,
} from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import { markLessonComplete } from '@/lib/app-data';
import type {
  LessonMiniQuizQuestionView,
  LessonMiniQuizSubmitResult,
} from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { isYouTubeUrl, normalizeMediaUrl } from '@/lib/media-url';

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) return null;

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getFileUrl(file: {
  externalUrl: string | null;
  storageBucket: string | null;
  storagePath: string | null;
}) {
  return file.externalUrl || null;
}

function LessonDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-2 border-b border-border/70 bg-card/80 pb-4">
            <SkeletonBlock className="h-5 w-2/3" />
            <SkeletonBlock className="h-3 w-1/2" />
          </CardHeader>

          <CardContent className="space-y-4 p-5">
            <SkeletonBlock className="h-52 w-full rounded-3xl" />
            <SkeletonBlock className="h-40 w-full rounded-3xl" />
            <SkeletonBlock className="h-28 w-full rounded-3xl" />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="space-y-2 border-b border-border/70 bg-card/80 pb-4">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-3 w-72" />
          </CardHeader>

          <CardContent className="space-y-2 p-5">
            <SkeletonBlock className="h-16 w-full rounded-3xl" />
            <SkeletonBlock className="h-16 w-full rounded-3xl" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
            <SkeletonBlock className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-5/6" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
            <SkeletonBlock className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-2 p-5">
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
            <SkeletonBlock className="h-5 w-28" />
          </CardHeader>
          <CardContent className="p-5">
            <SkeletonBlock className="h-36 w-full rounded-3xl" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReadingSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      {children}
    </section>
  );
}

function ResourceListCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    file: {
      filename: string;
      sizeBytes: number | null;
      externalUrl: string | null;
      storageBucket: string | null;
      storagePath: string | null;
    };
  }>;
}) {
  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
            <FileText size={16} />
          </span>
          {title}
        </CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </CardHeader>

      <CardContent className="space-y-3 p-5">
        {items.map((item) => {
          const fileUrl = getFileUrl(item.file);
          const sizeText = formatBytes(item.file.sizeBytes);

          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:shadow-soft-md sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-inner-soft">
                    <FileText size={14} />
                  </span>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.title}
                  </p>
                </div>

                {item.description ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {item.file.filename}
                  {sizeText ? ` · ${sizeText}` : ''}
                </p>
              </div>

              {fileUrl ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={fileUrl} target="_blank" rel="noreferrer">
                    Ашу
                    <ExternalLink size={13} className="ml-1.5" />
                  </a>
                </Button>
              ) : (
                <StatusBadge tone="muted">
                  <Lock size={12} />
                  URL жоқ
                </StatusBadge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function getQuestionTypeLabel(
  questionType: LessonMiniQuizQuestionView['questionType']
) {
  if (questionType === 'multiple_choice') return 'Бірнеше дұрыс жауап';
  return 'Бір дұрыс жауап';
}

function getSelectedAnswerLabel(indexes: number[], options: string[]) {
  if (indexes.length === 0) return 'Жауап таңдалмаған';

  return indexes
    .map((index) => options[index])
    .filter(Boolean)
    .join(', ');
}

function MiniQuizCard({
  quiz,
  latestAttempt,
  latestResult,
  answers,
  isLoading,
  hasError,
  isStudent,
  submitting,
  disabled,
  onToggleAnswer,
  onSubmit,
  onRetry,
}: {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    passingScore: number;
    questions: LessonMiniQuizQuestionView[];
  } | null;
  latestAttempt: {
    score: number;
    correctCount: number;
    totalQuestions: number;
    passed: boolean;
    completedAt: string;
  } | null;
  latestResult: LessonMiniQuizSubmitResult | null;
  answers: Record<string, number[]>;
  isLoading: boolean;
  hasError: boolean;
  isStudent: boolean;
  submitting: boolean;
  disabled: boolean;
  onToggleAnswer: (question: LessonMiniQuizQuestionView, optionIndex: number) => void;
  onSubmit: () => void;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-2 border-b border-border/70 bg-card/80 pb-4">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-3 w-72" />
        </CardHeader>

        <CardContent className="space-y-3 p-5">
          <SkeletonBlock className="h-20 w-full rounded-3xl" />
          <SkeletonBlock className="h-20 w-full rounded-3xl" />
        </CardContent>
      </Card>
    );
  }

  if (hasError) {
    return (
      <Card className="border-destructive-muted bg-destructive-soft/75">
        <CardHeader className="border-b border-destructive-muted/70 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <HelpCircle size={16} />
            Lesson Mini Quiz
          </CardTitle>
        </CardHeader>

        <CardContent className="p-5">
          <p className="text-sm text-destructive">
            Mini quiz дерегін жүктеу мүмкін болмады.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!quiz) return null;

  const allQuestionsAnswered =
    quiz.questions.length > 0 &&
    quiz.questions.every((question) => (answers[question.id] || []).length > 0);
  const quizAlreadyPassed =
    latestResult?.attempt.passed === true || latestAttempt?.passed === true;
  const currentResultFailed = latestResult?.attempt.passed === false;

  return (
    <Card id="mini-quiz" className="ai-soft-panel">
      <CardHeader className="border-b border-ai-border/70 bg-card/70 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-ai-border bg-ai-soft text-primary shadow-inner-soft">
                  <HelpCircle size={16} />
                </span>
                {quiz.title || 'Lesson Mini Quiz'}
              </CardTitle>

              <StatusBadge tone="secondary">{quiz.questions.length} сұрақ</StatusBadge>
              <StatusBadge tone="muted">Өту: {quiz.passingScore}%</StatusBadge>
            </div>

            {quiz.description ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {quiz.description}
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Сабақ соңындағы қысқа тексеріс. Нәтиже бірден көрсетіледі.
              </p>
            )}
          </div>

          {latestAttempt ? (
            <StatusBadge tone={latestAttempt.passed ? 'success' : 'warning'}>
              {latestAttempt.passed ? (
                <CheckCircle2 size={12} />
              ) : (
                <RotateCcw size={12} />
              )}
              Соңғы нәтиже: {latestAttempt.score}%
            </StatusBadge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {quiz.questions.length === 0 ? (
          <EmptyState
            title="Mini quiz ішінде сұрақ жоқ"
            text="Мұғалім сұрақ қосқаннан кейін quiz осы жерде ашылады."
            compact
            tone="ai"
          />
        ) : (
          quiz.questions.map((question, questionIndex) => {
            const selected = answers[question.id] || [];
            const resultItem = latestResult?.breakdown?.find(
              (item) => item.questionId === question.id
            );

            return (
              <div
                key={question.id}
                className="rounded-3xl border border-border bg-card/95 p-4 shadow-soft"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {questionIndex + 1}-сұрақ ·{' '}
                      {getQuestionTypeLabel(question.questionType)}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-foreground">
                      {question.questionText}
                    </h3>
                  </div>

                  {resultItem ? (
                    <StatusBadge tone={resultItem.isCorrect ? 'success' : 'danger'}>
                      {resultItem.isCorrect ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <RotateCcw size={12} />
                      )}
                      {resultItem.isCorrect ? 'Дұрыс' : 'Қате'}
                    </StatusBadge>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2">
                  {question.options.map((option, optionIndex) => {
                    const active = selected.includes(optionIndex);
                    const correct = resultItem?.correctAnswer.includes(optionIndex);
                    const wrongSelected = Boolean(resultItem && active && !correct);

                    return (
                      <button
                        key={`${question.id}-${optionIndex}`}
                        type="button"
                        disabled={disabled || Boolean(latestResult) || quizAlreadyPassed}
                        onClick={() => onToggleAnswer(question, optionIndex)}
                        className={`rounded-2xl border px-3 py-2.5 text-left text-sm transition-all duration-200 ease-soft ${
                          correct
                            ? 'border-success-muted bg-success-soft text-success-foreground'
                            : wrongSelected
                              ? 'border-destructive-muted bg-destructive-soft text-destructive'
                              : active
                                ? 'border-primary-muted bg-primary-soft text-primary'
                                : 'border-border bg-background hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft hover:text-primary'
                        } ${disabled || latestResult || quizAlreadyPassed ? 'cursor-default' : ''}`}
                      >
                        <span className="mr-2 text-xs text-muted-foreground">
                          {String.fromCharCode(65 + optionIndex)}.
                        </span>
                        {option}
                      </button>
                    );
                  })}
                </div>

                {resultItem ? (
                  <div className="mt-3 rounded-2xl border border-border bg-surface-soft/60 p-3 text-xs leading-5">
                    <p>
                      <span className="font-medium text-foreground">Сіздің жауабыңыз:</span>{' '}
                      {getSelectedAnswerLabel(resultItem.selectedAnswer, question.options)}
                    </p>
                    <p className="mt-1">
                      <span className="font-medium text-foreground">Дұрыс жауап:</span>{' '}
                      {getSelectedAnswerLabel(resultItem.correctAnswer, question.options)}
                    </p>
                    {resultItem.explanation ? (
                      <p className="mt-2 text-muted-foreground">
                        {resultItem.explanation}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {latestResult ? (
          <div className="rounded-3xl border border-border bg-card/90 p-4 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Нәтиже: {latestResult.attempt.score}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latestResult.attempt.correctCount}/
                  {latestResult.attempt.totalQuestions} сұрақ дұрыс.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                <StatusBadge tone={latestResult.attempt.passed ? 'success' : 'warning'}>
                  {latestResult.attempt.passed ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {latestResult.attempt.passed ? 'Өтті' : 'Қайталау керек'}
                </StatusBadge>

                {currentResultFailed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRetry}
                    disabled={disabled || submitting}
                  >
                    <RotateCcw size={14} className="mr-1.5" />
                    Қайта тапсыру
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : latestAttempt ? (
          <div className="rounded-3xl border border-border bg-card/90 p-4 shadow-soft">
            <p className="text-sm font-semibold text-foreground">
              Соңғы тапсыру нәтижесі
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {latestAttempt.correctCount}/{latestAttempt.totalQuestions} дұрыс ·{' '}
              {latestAttempt.score}% · {latestAttempt.passed ? 'өтті' : 'қайталау керек'}
            </p>
          </div>
        ) : null}

        {isStudent ? (
          <Button
            type="button"
            variant="ai"
            onClick={onSubmit}
            disabled={
              disabled ||
              submitting ||
              quiz.questions.length === 0 ||
              !allQuestionsAnswered ||
              Boolean(latestResult) ||
              quizAlreadyPassed
            }
          >
            {quizAlreadyPassed
              ? 'Mini quiz өтті'
              : submitting
                ? 'Тексерілуде...'
                : 'Mini quiz тапсыру'}
          </Button>
        ) : (
          <div className="rounded-2xl border border-border bg-card/70 p-3 text-xs text-muted-foreground">
            Мұғалім preview режимінде quiz-ді көре алады, бірақ нәтиже жібермейді.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SidebarInfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

export default function LessonDetailPage() {
  const { lessonId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isStudent = user?.role === 'student';

  const [noteDraft, setNoteDraft] = useState('');
  const [noteSeededForLessonId, setNoteSeededForLessonId] = useState('');
  const [miniQuizAnswers, setMiniQuizAnswers] = useState<Record<string, number[]>>({});
  const [miniQuizResult, setMiniQuizResult] =
    useState<LessonMiniQuizSubmitResult | null>(null);

  const { data, isLoading, error } = useLessonDetail(
    lessonId,
    isStudent ? user?.id : undefined,
    !!lessonId && !!user?.id
  );

  const {
    data: learningState,
    isLoading: learningStateLoading,
    error: learningStateError,
  } = useLessonLearningState(
    user?.id || '',
    lessonId,
    Boolean(isStudent && user?.id && lessonId && data && !data.isLocked)
  );

  const {
    data: miniQuizData,
    isLoading: miniQuizLoading,
    error: miniQuizError,
  } = useLessonMiniQuiz(
    lessonId,
    isStudent ? user?.id : undefined,
    Boolean(lessonId && user?.id && data && !data.isLocked),
    !isStudent
  );

  const upsertNoteMutation = useUpsertLessonNoteMutation();
  const deleteNoteMutation = useDeleteLessonNoteMutation();
  const toggleBookmarkMutation = useToggleLessonBookmarkMutation();
  const toggleReviewLaterMutation = useToggleReviewLaterMutation();
  const submitMiniQuizMutation = useSubmitLessonMiniQuizMutation();

  const normalizedMediaUrl = normalizeMediaUrl(data?.mediaUrl);
  const hasMedia = Boolean(normalizedMediaUrl);
  const isYoutubeMedia = Boolean(
    normalizedMediaUrl && isYouTubeUrl(normalizedMediaUrl)
  );

  const miniQuiz = miniQuizData?.quiz || data?.miniQuiz || null;
  const latestMiniQuizAttempt =
    miniQuizData?.latestAttempt || data?.latestMiniQuizAttempt || null;

  const miniQuizPassed =
    !miniQuiz ||
    miniQuiz.questions.length === 0 ||
    miniQuizResult?.attempt.passed === true ||
    latestMiniQuizAttempt?.passed === true;

  const canCompleteLesson =
    isStudent && Boolean(data) && !data?.isCompleted && !data?.isLocked && miniQuizPassed;

  const lessonCourseId = (data as { courseId?: string } | undefined)?.courseId || '';
  const courseId = learningState?.courseId || lessonCourseId || miniQuiz?.courseId || '';
  const lessonAttachments = learningState?.attachments || data?.attachments || [];
  const courseAssets = learningState?.courseAssets || data?.courseAssets || [];

  const hasLessonAttachments = lessonAttachments.length > 0;
  const hasCourseAssets = courseAssets.length > 0;
  const hasAnyLessonContent = Boolean(
    data?.contentBody || hasMedia || data?.practiceContent
  );

  const noteChanged = useMemo(
    () => noteDraft !== (learningState?.noteContent || ''),
    [learningState?.noteContent, noteDraft]
  );

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error('User not found');
      }

      if (!lessonId) {
        throw new Error('Lesson not found');
      }

      if (!canCompleteLesson) {
        throw new Error(
          !miniQuizPassed
            ? 'Алдымен mini quiz тапсырыңыз.'
            : 'Бұл сабақты қазір аяқтау мүмкін емес.'
        );
      }

      return markLessonComplete(user.id, lessonId);
    },
    onSuccess: async () => {
      if (!user?.id) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lessons'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-progress'] }),
        queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['achievements'] }),
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
        queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] }),
      ]);

      toast({
        title: t('lesson.toast.complete_title'),
        description: t('lesson.toast.complete_text'),
      });
    },
    onError: (completeError) =>
      toast({
        title: t('lesson.toast.error_title'),
        description:
          completeError instanceof Error
            ? completeError.message
            : t('lesson.toast.error_text'),
        variant: 'destructive',
      }),
  });

  useEffect(() => {
    setMiniQuizAnswers({});
    setMiniQuizResult(null);
  }, [lessonId, miniQuiz?.id]);

  useEffect(() => {
    if (!learningState) return;
    if (!lessonId) return;
    if (noteSeededForLessonId === lessonId) return;

    setNoteDraft(learningState.noteContent || '');
    setNoteSeededForLessonId(lessonId);
  }, [learningState, lessonId, noteSeededForLessonId]);

  const handleSaveNote = async () => {
    if (!user?.id || !lessonId || !courseId) {
      toast({
        title: 'Жазбаны сақтау мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await upsertNoteMutation.mutateAsync({
        studentId: user.id,
        lessonId,
        courseId,
        content: noteDraft,
      });

      toast({
        title: 'Жазба сақталды',
        description: 'Сіздің жеке жазбаңыз осы сабаққа бекітілді.',
      });
    } catch (noteError) {
      toast({
        title: 'Жазбаны сақтау мүмкін болмады',
        description:
          noteError instanceof Error ? noteError.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteNote = async () => {
    if (!user?.id || !lessonId) return;

    try {
      await deleteNoteMutation.mutateAsync({
        studentId: user.id,
        lessonId,
        courseId,
      });

      setNoteDraft('');

      toast({
        title: 'Жазба өшірілді',
      });
    } catch (noteError) {
      toast({
        title: 'Жазбаны өшіру мүмкін болмады',
        description:
          noteError instanceof Error ? noteError.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleBookmark = async () => {
    if (!user?.id || !lessonId || !courseId) {
      toast({
        title: 'Сақтау мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    const nextBookmarked = !learningState?.bookmarked;

    try {
      await toggleBookmarkMutation.mutateAsync({
        studentId: user.id,
        lessonId,
        courseId,
        bookmarked: nextBookmarked,
      });

      toast({
        title: nextBookmarked ? 'Сабақ сақталды' : 'Сабақ сақтаудан алынды',
      });
    } catch (bookmarkError) {
      toast({
        title: 'Сабақты сақтау мүмкін болмады',
        description:
          bookmarkError instanceof Error
            ? bookmarkError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleReviewLater = async () => {
    if (!user?.id || !lessonId || !courseId || !data) {
      toast({
        title: 'Кейін қайталауға қосу мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    const nextReviewLater = !learningState?.reviewLater;

    try {
      await toggleReviewLaterMutation.mutateAsync({
        studentId: user.id,
        itemType: 'lesson',
        itemId: lessonId,
        lessonId,
        courseId,
        title: data.title,
        note: null,
        reviewLater: nextReviewLater,
      });

      toast({
        title: nextReviewLater
          ? 'Кейін қайталауға қосылды'
          : 'Кейін қайталаудан алынды',
      });
    } catch (reviewError) {
      toast({
        title: 'Әрекет орындалмады',
        description:
          reviewError instanceof Error
            ? reviewError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleMiniQuizAnswer = (
    question: LessonMiniQuizQuestionView,
    optionIndex: number
  ) => {
    setMiniQuizAnswers((previous) => {
      const current = previous[question.id] || [];

      if (question.questionType === 'single_choice') {
        return {
          ...previous,
          [question.id]: [optionIndex],
        };
      }

      const next = current.includes(optionIndex)
        ? current.filter((item) => item !== optionIndex)
        : [...current, optionIndex];

      return {
        ...previous,
        [question.id]: next,
      };
    });
  };

  const handleRetryMiniQuiz = () => {
    setMiniQuizAnswers({});
    setMiniQuizResult(null);

    window.requestAnimationFrame(() => {
      document.getElementById('mini-quiz')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const handleSubmitMiniQuiz = async () => {
    if (!user?.id || !lessonId || !courseId || !miniQuiz) {
      toast({
        title: 'Mini quiz тапсыру мүмкін болмады',
        description: 'Сабақ, курс немесе quiz дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    const unanswered = miniQuiz.questions.some(
      (question) => (miniQuizAnswers[question.id] || []).length === 0
    );

    if (unanswered) {
      toast({
        title: 'Барлық сұраққа жауап беріңіз',
        description: 'Mini quiz тапсыру үшін әр сұрақта кемінде бір жауап таңдаңыз.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await submitMiniQuizMutation.mutateAsync({
        quizId: miniQuiz.id,
        lessonId,
        courseId,
        studentId: user.id,
        answers: miniQuizAnswers,
      });

      setMiniQuizResult(result);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lesson-mini-quiz'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
      ]);

      toast({
        title: result.attempt.passed
          ? 'Mini quiz өтті'
          : 'Mini quiz қайталауды қажет етеді',
        description: `${result.attempt.correctCount}/${result.attempt.totalQuestions} дұрыс · ${result.attempt.score}%`,
      });
    } catch (quizError) {
      toast({
        title: 'Mini quiz тапсыру мүмкін болмады',
        description:
          quizError instanceof Error
            ? quizError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          backAction={{
            label: t('page.lesson_detail.back_to_lessons'),
            onClick: () => navigate('/lessons'),
          }}
          eyebrow={
            <>
              <BookOpen size={13} />
              Сабақ оқу режимі
            </>
          }
          icon={<GraduationCap size={20} />}
          title={data?.title || t('page.lesson_detail.title')}
          description={
            data
              ? [data.subjectName, data.courseTitle, data.moduleTitle]
                  .filter(Boolean)
                  .join(' · ')
              : t('page.lesson_detail.subtitle')
          }
          actions={
            data?.isCompleted ? (
              <StatusBadge tone="success">
                <CheckCircle2 size={12} />
                {t('lesson.status.completed')}
              </StatusBadge>
            ) : data?.isLocked ? (
              <StatusBadge tone="muted">
                <Lock size={12} />
                Құлыпталған
              </StatusBadge>
            ) : null
          }
        />

        {isLoading ? <LessonDetailSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.lesson_detail.error')}
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
            secondaryAction={
              <Button type="button" variant="ghost" onClick={() => navigate('/lessons')}>
                Сабақтарға қайту
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && data?.isLocked ? (
          <EmptyState
            icon={<Lock size={18} />}
            title={t('page.lesson_detail.locked_title')}
            text={t('page.lesson_detail.locked_text')}
            action={
              <Button type="button" variant="outline" asChild>
                <Link to="/courses">
                  Курстарға өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && data && !data.isLocked ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="secondary">
                      <BookOpen size={12} />
                      {data.subjectName}
                    </StatusBadge>

                    {data.isCompleted ? (
                      <StatusBadge tone="success">
                        <CheckCircle2 size={12} />
                        {t('lesson.status.completed')}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">
                        <PlayCircle size={12} />
                        {t('page.lesson_detail.status.in_progress')}
                      </StatusBadge>
                    )}
                  </div>

                  <CardTitle className="pt-2 text-lg font-semibold">
                    {data.title}
                  </CardTitle>

                  <p className="text-xs leading-5 text-muted-foreground">
                    {[data.courseTitle, data.moduleTitle].filter(Boolean).join(' · ')}
                  </p>
                </CardHeader>

                <CardContent className="space-y-6 p-5">
                  {data.contentBody ? (
                    <ReadingSection title="Теория" icon={<FileText size={15} />}>
                      <article className="whitespace-pre-wrap rounded-3xl border border-border bg-card p-5 text-sm leading-7 text-foreground shadow-soft">
                        {data.contentBody}
                      </article>
                    </ReadingSection>
                  ) : null}

                  {hasMedia ? (
                    <ReadingSection
                      title={t('page.lesson_detail.media_title')}
                      icon={<PlayCircle size={15} />}
                    >
                      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
                        {isYoutubeMedia && normalizedMediaUrl ? (
                          <iframe
                            src={normalizedMediaUrl}
                            className="aspect-video w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={data.title}
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                          />
                        ) : normalizedMediaUrl ? (
                          <a
                            href={normalizedMediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-3 p-4 text-sm font-medium text-primary transition-colors hover:underline"
                          >
                            {t('page.lesson_detail.open_media')}
                            <ExternalLink size={14} />
                          </a>
                        ) : null}
                      </div>
                    </ReadingSection>
                  ) : null}

                  {data.practiceContent ? (
                    <ReadingSection
                      title={t('page.lesson_detail.practice_title')}
                      icon={<Sparkles size={15} />}
                    >
                      <div className="whitespace-pre-wrap rounded-3xl border border-ai-border bg-ai-soft p-5 text-sm leading-7 text-foreground shadow-soft">
                        {data.practiceContent}
                      </div>
                    </ReadingSection>
                  ) : null}

                  {!hasAnyLessonContent ? (
                    <EmptyState
                      title={t('page.lesson_detail.empty_theory_title')}
                      text={t('page.lesson_detail.empty_theory_text')}
                      compact
                    />
                  ) : null}
                </CardContent>
              </Card>

              <ResourceListCard
                title="Сабақ файлдары"
                description="Мұғалім осы сабаққа қосқан қосымша материалдар."
                items={lessonAttachments}
              />

              <ResourceListCard
                title="Курс материалдары"
                description="Бұл курсқа арналған жалпы қосымша материалдар."
                items={courseAssets}
              />

              {!hasLessonAttachments && !hasCourseAssets ? (
                <Card className="border-dashed">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText size={14} />
                      Бұл сабаққа қосымша файлдар тіркелмеген.
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <MiniQuizCard
                quiz={miniQuiz}
                latestAttempt={latestMiniQuizAttempt}
                latestResult={miniQuizResult}
                answers={miniQuizAnswers}
                isLoading={miniQuizLoading}
                hasError={Boolean(miniQuizError)}
                isStudent={isStudent}
                submitting={submitMiniQuizMutation.isPending}
                disabled={!isStudent || !user?.id || !courseId || Boolean(data.isLocked)}
                onToggleAnswer={handleToggleMiniQuizAnswer}
                onSubmit={handleSubmitMiniQuiz}
                onRetry={handleRetryMiniQuiz}
              />

              <Card className="overflow-hidden">
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Сабақты аяқтау
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Сабақты аяқтағаннан кейін прогресс course timeline ішінде жаңарады.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="outline" asChild>
                      <Link to={`/courses/${courseId}`}>
                        Курс roadmap
                        <ArrowRight size={15} className="ml-2" />
                      </Link>
                    </Button>

                    {isStudent && !data.isCompleted ? (
                      <Button
                        type="button"
                        onClick={() => completeMutation.mutate()}
                        disabled={!canCompleteLesson || completeMutation.isPending}
                      >
                        {completeMutation.isPending
                          ? t('common.loading')
                          : !miniQuizPassed
                            ? 'Алдымен mini quiz тапсырыңыз'
                            : t('lesson.action.complete')}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" disabled>
                        <CheckCircle2 size={15} className="mr-2" />
                        {t('lesson.status.completed')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                  <CardTitle className="text-sm font-semibold">
                    {t('page.lesson_detail.status_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 p-5 text-sm">
                  <SidebarInfoRow
                    label={t('page.lesson_detail.field.course')}
                    value={data.courseTitle}
                  />

                  <SidebarInfoRow
                    label={t('page.lesson_detail.field.module')}
                    value={data.moduleTitle}
                  />

                  <SidebarInfoRow
                    label={t('page.lesson_detail.field.subject')}
                    value={data.subjectName}
                  />

                  <SidebarInfoRow
                    label={t('page.lesson_detail.field.status')}
                    value={
                      data.isCompleted
                        ? t('lesson.status.completed')
                        : t('page.lesson_detail.status.in_progress')
                    }
                  />

                  {!data.isCompleted && isStudent ? (
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => completeMutation.mutate()}
                      disabled={!canCompleteLesson || completeMutation.isPending}
                    >
                      {completeMutation.isPending
                        ? t('common.loading')
                        : !miniQuizPassed
                          ? 'Алдымен mini quiz тапсырыңыз'
                          : t('lesson.action.complete')}
                    </Button>
                  ) : !isStudent ? (
                    <div className="rounded-2xl border border-border bg-surface-soft/60 p-3 text-xs text-muted-foreground">
                      {t('page.lesson_detail.teacher_review_note')}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {isStudent ? (
                <Card className="overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                    <CardTitle className="text-sm font-semibold">
                      Оқу құралдары
                    </CardTitle>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Сабақты сақтау, кейін қайталау және жеке жазба.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3 p-5">
                    {learningStateLoading ? (
                      <div className="space-y-2">
                        <SkeletonBlock className="h-9 w-full rounded-2xl" />
                        <SkeletonBlock className="h-9 w-full rounded-2xl" />
                      </div>
                    ) : null}

                    {learningStateError ? (
                      <div className="rounded-2xl border border-destructive-muted bg-destructive-soft p-3 text-xs text-destructive">
                        Оқу құралдарын жүктеу мүмкін болмады.
                      </div>
                    ) : null}

                    {!learningStateLoading ? (
                      <>
                        <Button
                          type="button"
                          variant={learningState?.bookmarked ? 'default' : 'outline'}
                          className="w-full justify-start"
                          onClick={handleToggleBookmark}
                          disabled={
                            !learningState ||
                            toggleBookmarkMutation.isPending ||
                            learningStateLoading
                          }
                        >
                          <Bookmark
                            size={14}
                            className="mr-2"
                            fill={learningState?.bookmarked ? 'currentColor' : 'none'}
                          />
                          {learningState?.bookmarked
                            ? 'Сақталған сабақ'
                            : 'Сабақты сақтау'}
                        </Button>

                        <Button
                          type="button"
                          variant={learningState?.reviewLater ? 'default' : 'outline'}
                          className="w-full justify-start"
                          onClick={handleToggleReviewLater}
                          disabled={
                            !learningState ||
                            toggleReviewLaterMutation.isPending ||
                            learningStateLoading
                          }
                        >
                          <RotateCcw size={14} className="mr-2" />
                          {learningState?.reviewLater
                            ? 'Қайталау тізімінде'
                            : 'Кейін қайталау'}
                        </Button>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {isStudent ? (
                <Card className="overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                        <StickyNote size={14} />
                      </span>
                      Менің жазбам
                    </CardTitle>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Бұл жазба тек сізге көрінеді.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3 p-5">
                    <Textarea
                      rows={8}
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Осы сабақ бойынша өз ойыңызды, формулаларды немесе түсінбеген жерлерді жазыңыз..."
                      disabled={!learningState || learningStateLoading}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveNote}
                        disabled={
                          !learningState ||
                          !noteChanged ||
                          upsertNoteMutation.isPending ||
                          learningStateLoading
                        }
                      >
                        <Save size={14} className="mr-1.5" />
                        Сақтау
                      </Button>

                      {learningState?.noteContent ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleDeleteNote}
                          disabled={deleteNoteMutation.isPending}
                        >
                          <Trash2 size={14} className="mr-1.5" />
                          Өшіру
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {!hasAnyLessonContent ? (
                <Card className="border-dashed">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock size={14} />
                      {t('page.lesson_detail.empty_content_note')}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}