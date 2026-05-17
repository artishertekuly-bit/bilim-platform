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
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_NOTE_CHARS = 6_000;
const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_CONTENT_CHARS = 30_000;
const MAX_RESOURCE_DESCRIPTION_CHARS = 700;
const MAX_URL_CHARS = 2_000;
const MAX_ERROR_CHARS = 700;
const MAX_OPTION_CHARS = 700;
const MAX_EXPLANATION_CHARS = 1_200;

type ResourceItem = {
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
};

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_CONTENT_CHARS): string {
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

function normalizeNote(value: unknown): string {
  return cleanMultilineText(value, MAX_NOTE_CHARS);
}

function getErrorMessage(error: unknown, fallback = 'Белгісіз қате пайда болды.'): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}


function buildCoursePath(courseId: unknown): string {
  return `/courses/${encodeURIComponent(cleanId(courseId))}`;
}

function formatNumber(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.round(numberValue));
}

function formatPercent(value: unknown): string {
  return `${Math.max(0, Math.min(100, formatNumber(value)))}%`;
}

function formatBytes(value: number | null | undefined) {
  const size = Number(value || 0);

  if (!Number.isFinite(size) || size <= 0) return null;

  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeExternalUrl(value: unknown): string | null {
  const rawUrl = cleanText(value, MAX_URL_CHARS);

  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function getFileUrl(file: {
  externalUrl: string | null;
  storageBucket: string | null;
  storagePath: string | null;
}) {
  return normalizeExternalUrl(file.externalUrl);
}

function getQuestionId(question: LessonMiniQuizQuestionView) {
  return cleanId(question.id);
}

function getQuestionOptions(question: LessonMiniQuizQuestionView) {
  return (question.options || []).map((option) => cleanText(option, MAX_OPTION_CHARS));
}

function clampOptionIndexes(indexes: number[], options: string[]) {
  return indexes
    .map((index) => Number(index))
    .filter(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < options.length &&
        options[index],
    );
}

function LessonDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-2 border-b border-border/70 bg-card pb-4">
            <SkeletonBlock className="h-5 w-2/3" />
            <SkeletonBlock className="h-3 w-1/2" />
          </CardHeader>

          <CardContent className="space-y-4 p-4 sm:p-5">
            <SkeletonBlock className="h-52 w-full rounded-3xl" />
            <SkeletonBlock className="h-40 w-full rounded-3xl" />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-card pb-4">
            <SkeletonBlock className="h-5 w-40" />
          </CardHeader>

          <CardContent className="space-y-2 p-4 sm:p-5">
            <SkeletonBlock className="h-16 w-full rounded-3xl" />
            <SkeletonBlock className="h-16 w-full rounded-3xl" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card pb-4">
              <SkeletonBlock className="h-5 w-32" />
            </CardHeader>

            <CardContent className="space-y-3 p-4 sm:p-5">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
              <SkeletonBlock className="h-10 w-full rounded-2xl" />
            </CardContent>
          </Card>
        ))}
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
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
          {icon}
        </span>

        <h3 className="text-sm font-semibold text-foreground">
          {cleanText(title, MAX_META_CHARS)}
        </h3>
      </div>

      {children}
    </section>
  );
}

function ResourceListCard({
  title,
  items,
}: {
  title: string;
  items: ResourceItem[];
}) {
  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <FileText size={16} />
          {cleanText(title, MAX_META_CHARS)}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 p-4 sm:p-5">
        {items.map((item, index) => {
          const fileUrl = getFileUrl(item.file);
          const sizeText = formatBytes(item.file.sizeBytes);
          const itemId = cleanId(item.id) || `${cleanText(item.title)}-${index}`;
          const itemTitle = cleanText(item.title) || 'Файл';
          const itemDescription = cleanMultilineText(
            item.description,
            MAX_RESOURCE_DESCRIPTION_CHARS,
          );
          const filename = cleanText(item.file.filename, MAX_META_CHARS) || 'Файл';

          return (
            <div
              key={itemId}
              className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/35 text-muted-foreground">
                    <FileText size={14} />
                  </span>

                  <p className="truncate text-sm font-semibold text-foreground">
                    {itemTitle}
                  </p>
                </div>

                {itemDescription ? (
                  <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
                    {itemDescription}
                  </p>
                ) : null}

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {filename}
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
                  Сілтеме жоқ
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
  questionType: LessonMiniQuizQuestionView['questionType'],
) {
  return questionType === 'multiple_choice'
    ? 'Бірнеше дұрыс жауап'
    : 'Бір дұрыс жауап';
}

function getSelectedAnswerLabel(indexes: number[], options: string[]) {
  const safeIndexes = clampOptionIndexes(indexes, options);

  if (safeIndexes.length === 0) return 'Жауап таңдалмаған';

  return safeIndexes
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
    courseId?: string;
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
        <CardHeader className="space-y-2 border-b border-border/70 bg-card pb-4">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-3 w-72" />
        </CardHeader>

        <CardContent className="space-y-3 p-4 sm:p-5">
          <SkeletonBlock className="h-20 w-full rounded-3xl" />
          <SkeletonBlock className="h-20 w-full rounded-3xl" />
        </CardContent>
      </Card>
    );
  }

  if (hasError) {
    return (
      <Card className="border-destructive-muted bg-destructive-soft/65">
        <CardHeader className="border-b border-destructive-muted/70 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <HelpCircle size={16} />
            Шағын тест
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          <p className="text-sm text-destructive">
            Шағын тестті жүктеу мүмкін болмады.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!quiz) return null;

  const questions = quiz.questions || [];
  const safeQuizTitle = cleanText(quiz.title) || 'Шағын тест';
  const safeQuizDescription = cleanMultilineText(quiz.description, MAX_META_CHARS);
  const passingScore = Math.max(0, Math.min(100, formatNumber(quiz.passingScore)));

  const allQuestionsAnswered =
    questions.length > 0 &&
    questions.every((question) => (answers[getQuestionId(question)] || []).length > 0);

  const quizAlreadyPassed =
    latestResult?.attempt.passed === true || latestAttempt?.passed === true;

  const currentResultFailed = latestResult?.attempt.passed === false;

  return (
    <Card id="mini-quiz" className="border-ai-border bg-ai-soft/45">
      <CardHeader className="border-b border-ai-border/70 bg-card pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <HelpCircle size={16} />
                {safeQuizTitle}
              </CardTitle>

              <StatusBadge tone="secondary">{questions.length} сұрақ</StatusBadge>
              <StatusBadge tone="muted">Өту: {passingScore}%</StatusBadge>
            </div>

            {safeQuizDescription ? (
              <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
                {safeQuizDescription}
              </p>
            ) : null}
          </div>

          {latestAttempt ? (
            <StatusBadge tone={latestAttempt.passed ? 'success' : 'warning'}>
              {latestAttempt.passed ? (
                <CheckCircle2 size={12} />
              ) : (
                <RotateCcw size={12} />
              )}
              Соңғы нәтиже: {formatPercent(latestAttempt.score)}
            </StatusBadge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        {questions.length === 0 ? (
          <EmptyState
            title="Сұрақ жоқ"
            text="Сұрақ қосылғаннан кейін көрінеді."
            compact
            tone="ai"
          />
        ) : (
          questions.map((question, questionIndex) => {
            const questionId = getQuestionId(question);
            const questionText = cleanText(question.questionText) || 'Сұрақ';
            const options = getQuestionOptions(question);
            const selected = clampOptionIndexes(answers[questionId] || [], options);

            const resultItem = latestResult?.breakdown?.find(
              (item) => cleanId(item.questionId) === questionId,
            );

            return (
              <div
                key={questionId || `${questionText}-${questionIndex}`}
                className="rounded-3xl border border-border bg-card p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {questionIndex + 1}-сұрақ ·{' '}
                      {getQuestionTypeLabel(question.questionType)}
                    </p>

                    <h3 className="mt-1 text-sm font-semibold text-foreground">
                      {questionText}
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
                  {options.map((option, optionIndex) => {
                    const active = selected.includes(optionIndex);
                    const correct = Boolean(
                      resultItem?.correctAnswer.includes(optionIndex),
                    );
                    const wrongSelected = Boolean(resultItem && active && !correct);
                    const isAnswerLocked = disabled || Boolean(latestResult) || quizAlreadyPassed;

                    return (
                      <button
                        key={`${questionId}-${optionIndex}`}
                        type="button"
                        disabled={isAnswerLocked}
                        onClick={() => onToggleAnswer(question, optionIndex)}
                        className={cn(
                          'rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors',
                          correct
                            ? 'border-success-muted bg-success-soft text-success-foreground'
                            : wrongSelected
                              ? 'border-destructive-muted bg-destructive-soft text-destructive'
                              : active
                                ? 'border-primary-muted bg-primary-soft text-primary'
                                : 'border-border bg-background hover:border-primary-muted hover:bg-primary-soft/45 hover:text-primary',
                          isAnswerLocked && 'cursor-default',
                        )}
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
                  <div className="mt-3 rounded-2xl border border-border bg-muted/35 p-3 text-xs leading-5">
                    <p>
                      <span className="font-medium text-foreground">
                        Сіздің жауабыңыз:
                      </span>{' '}
                      {getSelectedAnswerLabel(resultItem.selectedAnswer, options)}
                    </p>

                    <p className="mt-1">
                      <span className="font-medium text-foreground">
                        Дұрыс жауап:
                      </span>{' '}
                      {getSelectedAnswerLabel(resultItem.correctAnswer, options)}
                    </p>

                    {resultItem.explanation ? (
                      <p className="mt-2 text-muted-foreground">
                        {cleanMultilineText(resultItem.explanation, MAX_EXPLANATION_CHARS)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {latestResult ? (
          <div className="rounded-3xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Нәтиже: {formatPercent(latestResult.attempt.score)}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(latestResult.attempt.correctCount)}/
                  {formatNumber(latestResult.attempt.totalQuestions)} дұрыс
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
          <div className="rounded-3xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">
              Соңғы нәтиже
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(latestAttempt.correctCount)}/
              {formatNumber(latestAttempt.totalQuestions)} дұрыс ·{' '}
              {formatPercent(latestAttempt.score)} ·{' '}
              {latestAttempt.passed ? 'өтті' : 'қайталау керек'}
            </p>
          </div>
        ) : null}

        {isStudent ? (
          <Button
            type="button"
            onClick={onSubmit}
            disabled={
              disabled ||
              submitting ||
              questions.length === 0 ||
              !allQuestionsAnswered ||
              Boolean(latestResult) ||
              quizAlreadyPassed
            }
          >
            {quizAlreadyPassed
              ? 'Шағын тест өтті'
              : submitting
                ? 'Тексерілуде...'
                : 'Шағын тест тапсыру'}
          </Button>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
            Мұғалім бұл жерден нәтиже жібермейді.
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
    <div className="flex justify-between gap-3 rounded-2xl border border-border bg-muted/35 px-3 py-2.5">
      <span className="text-xs text-muted-foreground">
        {cleanText(label, MAX_META_CHARS)}
      </span>
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

  const safeLessonId = cleanId(lessonId);
  const safeUserId = cleanId(user?.id);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteSeededForLessonId, setNoteSeededForLessonId] = useState('');
  const [miniQuizAnswers, setMiniQuizAnswers] = useState<Record<string, number[]>>({});
  const [miniQuizResult, setMiniQuizResult] =
    useState<LessonMiniQuizSubmitResult | null>(null);

  const { data, isLoading, error } = useLessonDetail(
    safeLessonId,
    isStudent ? safeUserId : undefined,
    Boolean(safeLessonId && safeUserId),
  );

  const {
    data: learningState,
    isLoading: learningStateLoading,
    error: learningStateError,
  } = useLessonLearningState(
    safeUserId,
    safeLessonId,
    Boolean(isStudent && safeUserId && safeLessonId && data && !data.isLocked),
  );

  const {
    data: miniQuizData,
    isLoading: miniQuizLoading,
    error: miniQuizError,
  } = useLessonMiniQuiz(
    safeLessonId,
    isStudent ? safeUserId : undefined,
    Boolean(safeLessonId && safeUserId && data && !data.isLocked),
    !isStudent,
  );

  const upsertNoteMutation = useUpsertLessonNoteMutation();
  const deleteNoteMutation = useDeleteLessonNoteMutation();
  const toggleBookmarkMutation = useToggleLessonBookmarkMutation();
  const toggleReviewLaterMutation = useToggleReviewLaterMutation();
  const submitMiniQuizMutation = useSubmitLessonMiniQuizMutation();

  const safeMediaSource = cleanText(data?.mediaUrl, MAX_URL_CHARS);
  const normalizedMediaUrl = normalizeMediaUrl(safeMediaSource);
  const hasMedia = Boolean(normalizedMediaUrl);
  const isYoutubeMedia = Boolean(
    normalizedMediaUrl && isYouTubeUrl(normalizedMediaUrl),
  );

  const miniQuiz = miniQuizData?.quiz || data?.miniQuiz || null;
  const latestMiniQuizAttempt =
    miniQuizData?.latestAttempt || data?.latestMiniQuizAttempt || null;

  const miniQuizPassed =
    !miniQuiz ||
    (miniQuiz.questions || []).length === 0 ||
    miniQuizResult?.attempt.passed === true ||
    latestMiniQuizAttempt?.passed === true;

  const canCompleteLesson =
    isStudent && Boolean(data) && !data?.isCompleted && !data?.isLocked && miniQuizPassed;

  const lessonCourseId = cleanId((data as { courseId?: string } | undefined)?.courseId);
  const courseId = cleanId(learningState?.courseId || lessonCourseId || miniQuiz?.courseId || '');
  const lessonAttachments = (learningState?.attachments || data?.attachments || []) as ResourceItem[];
  const courseAssets = (learningState?.courseAssets || data?.courseAssets || []) as ResourceItem[];

  const lessonTitle = cleanText(data?.title) || t('page.lesson_detail.title');
  const subjectName = cleanText(data?.subjectName, MAX_META_CHARS) || 'Пән';
  const courseTitle = cleanText(data?.courseTitle, MAX_META_CHARS);
  const moduleTitle = cleanText(data?.moduleTitle, MAX_META_CHARS);
  const contentBody = cleanMultilineText(data?.contentBody, MAX_CONTENT_CHARS);
  const practiceContent = cleanMultilineText(data?.practiceContent, MAX_CONTENT_CHARS);

  const hasLessonAttachments = lessonAttachments.length > 0;
  const hasCourseAssets = courseAssets.length > 0;
  const hasAnyLessonContent = Boolean(
    contentBody || hasMedia || practiceContent,
  );

  const noteChanged = useMemo(
    () => noteDraft !== normalizeNote(learningState?.noteContent || ''),
    [learningState?.noteContent, noteDraft],
  );

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!safeUserId) {
        throw new Error('Пайдаланушы табылмады.');
      }

      if (!safeLessonId) {
        throw new Error('Сабақ табылмады.');
      }

      if (!canCompleteLesson) {
        throw new Error(
          !miniQuizPassed
            ? 'Алдымен шағын тест тапсырыңыз.'
            : 'Бұл сабақты қазір аяқтау мүмкін емес.',
        );
      }

      return markLessonComplete(safeUserId, safeLessonId);
    },
    onSuccess: async () => {
      if (!safeUserId) return;

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
        description: getErrorMessage(completeError, t('lesson.toast.error_text')),
        variant: 'destructive',
      }),
  });

  useEffect(() => {
    setMiniQuizAnswers({});
    setMiniQuizResult(null);
  }, [safeLessonId, miniQuiz?.id]);

  useEffect(() => {
    if (!learningState || !safeLessonId) return;
    if (noteSeededForLessonId === safeLessonId) return;

    setNoteDraft(normalizeNote(learningState.noteContent || ''));
    setNoteSeededForLessonId(safeLessonId);
  }, [learningState, noteSeededForLessonId, safeLessonId]);

  const handleSaveNote = async () => {
    const safeNote = normalizeNote(noteDraft);

    if (!safeUserId || !safeLessonId || !courseId) {
      toast({
        title: 'Жазбаны сақтау мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await upsertNoteMutation.mutateAsync({
        studentId: safeUserId,
        lessonId: safeLessonId,
        courseId,
        content: safeNote,
      });

      setNoteDraft(safeNote);

      toast({
        title: 'Жазба сақталды',
      });
    } catch (noteError) {
      toast({
        title: 'Жазбаны сақтау мүмкін болмады',
        description: getErrorMessage(noteError),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteNote = async () => {
    if (!safeUserId || !safeLessonId) return;

    try {
      await deleteNoteMutation.mutateAsync({
        studentId: safeUserId,
        lessonId: safeLessonId,
        courseId,
      });

      setNoteDraft('');

      toast({
        title: 'Жазба өшірілді',
      });
    } catch (noteError) {
      toast({
        title: 'Жазбаны өшіру мүмкін болмады',
        description: getErrorMessage(noteError),
        variant: 'destructive',
      });
    }
  };

  const handleToggleBookmark = async () => {
    if (!safeUserId || !safeLessonId || !courseId) {
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
        studentId: safeUserId,
        lessonId: safeLessonId,
        courseId,
        bookmarked: nextBookmarked,
      });

      toast({
        title: nextBookmarked ? 'Сабақ сақталды' : 'Сабақ сақтаудан алынды',
      });
    } catch (bookmarkError) {
      toast({
        title: 'Сабақты сақтау мүмкін болмады',
        description: getErrorMessage(bookmarkError),
        variant: 'destructive',
      });
    }
  };

  const handleToggleReviewLater = async () => {
    if (!safeUserId || !safeLessonId || !courseId || !data) {
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
        studentId: safeUserId,
        itemType: 'lesson',
        itemId: safeLessonId,
        lessonId: safeLessonId,
        courseId,
        title: lessonTitle,
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
        description: getErrorMessage(reviewError),
        variant: 'destructive',
      });
    }
  };

  const handleToggleMiniQuizAnswer = (
    question: LessonMiniQuizQuestionView,
    optionIndex: number,
  ) => {
    const questionId = getQuestionId(question);
    const options = getQuestionOptions(question);
    const safeOptionIndex = Number(optionIndex);

    if (
      !questionId ||
      !Number.isInteger(safeOptionIndex) ||
      safeOptionIndex < 0 ||
      safeOptionIndex >= options.length
    ) {
      return;
    }

    setMiniQuizAnswers((previous) => {
      const current = clampOptionIndexes(previous[questionId] || [], options);

      if (question.questionType === 'single_choice') {
        return {
          ...previous,
          [questionId]: [safeOptionIndex],
        };
      }

      const next = current.includes(safeOptionIndex)
        ? current.filter((item) => item !== safeOptionIndex)
        : [...current, safeOptionIndex];

      return {
        ...previous,
        [questionId]: next.sort((a, b) => a - b),
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
    if (!safeUserId || !safeLessonId || !courseId || !miniQuiz) {
      toast({
        title: 'Шағын тест тапсыру мүмкін болмады',
        description: 'Сабақ, курс немесе тест дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    const quizId = cleanId(miniQuiz.id);
    const questions = miniQuiz.questions || [];

    if (!quizId || questions.length === 0) {
      toast({
        title: 'Шағын тест тапсыру мүмкін болмады',
        description: 'Тест дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    const sanitizedAnswers = questions.reduce<Record<string, number[]>>((acc, question) => {
      const questionId = getQuestionId(question);
      const options = getQuestionOptions(question);

      if (!questionId) return acc;

      acc[questionId] = clampOptionIndexes(miniQuizAnswers[questionId] || [], options);

      return acc;
    }, {});

    const unanswered = questions.some(
      (question) => (sanitizedAnswers[getQuestionId(question)] || []).length === 0,
    );

    if (unanswered) {
      toast({
        title: 'Барлық сұраққа жауап беріңіз',
        description: 'Тапсыру үшін әр сұрақта кемінде бір жауап таңдаңыз.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await submitMiniQuizMutation.mutateAsync({
        quizId,
        lessonId: safeLessonId,
        courseId,
        studentId: safeUserId,
        answers: sanitizedAnswers,
      });

      setMiniQuizResult(result);
      setMiniQuizAnswers(sanitizedAnswers);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lesson-mini-quiz'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
      ]);

      toast({
        title: result.attempt.passed
          ? 'Шағын тест өтті'
          : 'Шағын тест қайталауды қажет етеді',
        description: `${formatNumber(result.attempt.correctCount)}/${formatNumber(
          result.attempt.totalQuestions,
        )} дұрыс · ${formatPercent(result.attempt.score)}`,
      });
    } catch (quizError) {
      toast({
        title: 'Шағын тест тапсыру мүмкін болмады',
        description: getErrorMessage(quizError),
        variant: 'destructive',
      });
    }
  };

  const completeButtonLabel = completeMutation.isPending
    ? t('common.loading')
    : !miniQuizPassed
      ? 'Алдымен шағын тест тапсырыңыз'
      : t('lesson.action.complete');

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
              Сабақ
            </>
          }
          icon={<GraduationCap size={20} />}
          title={lessonTitle}
          description={
            data
              ? [subjectName, courseTitle, moduleTitle].filter(Boolean).join(' · ')
              : undefined
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

        {!user ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="Аккаунт анықталмады"
            text="Сабақты көру үшін жүйеге кіріңіз."
          />
        ) : null}

        {user && isLoading ? <LessonDetailSkeleton /> : null}

        {user && !isLoading && error ? (
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

        {user && !isLoading && !error && !data ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="Сабақ табылмады"
            text="Бұл сабақ жоқ немесе сізге қолжетімді емес."
            action={
              <Button type="button" variant="outline" onClick={() => navigate('/lessons')}>
                Сабақтарға қайту
              </Button>
            }
          />
        ) : null}

        {user && !isLoading && !error && data?.isLocked ? (
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

        {user && !isLoading && !error && data && !data.isLocked ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/70 bg-card pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="secondary">
                      <BookOpen size={12} />
                      {subjectName}
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
                    {lessonTitle}
                  </CardTitle>

                  <p className="text-xs leading-5 text-muted-foreground">
                    {[courseTitle, moduleTitle].filter(Boolean).join(' · ')}
                  </p>
                </CardHeader>

                <CardContent className="space-y-6 p-4 sm:p-5">
                  {contentBody ? (
                    <ReadingSection title="Теория" icon={<FileText size={15} />}>
                      <article className="whitespace-pre-wrap rounded-3xl border border-border bg-card p-4 text-sm leading-7 text-foreground sm:p-5">
                        {contentBody}
                      </article>
                    </ReadingSection>
                  ) : null}

                  {hasMedia ? (
                    <ReadingSection
                      title={t('page.lesson_detail.media_title')}
                      icon={<PlayCircle size={15} />}
                    >
                      <div className="overflow-hidden rounded-3xl border border-border bg-card">
                        {isYoutubeMedia && normalizedMediaUrl ? (
                          <iframe
                            src={normalizedMediaUrl}
                            className="aspect-video w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={lessonTitle}
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

                  {practiceContent ? (
                    <ReadingSection
                      title={t('page.lesson_detail.practice_title')}
                      icon={<BookOpen size={15} />}
                    >
                      <div className="whitespace-pre-wrap rounded-3xl border border-border bg-muted/35 p-4 text-sm leading-7 text-foreground sm:p-5">
                        {practiceContent}
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

              <ResourceListCard title="Сабақ файлдары" items={lessonAttachments} />
              <ResourceListCard title="Курс материалдары" items={courseAssets} />

              {!hasLessonAttachments && !hasCourseAssets ? (
                <Card className="border-dashed">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText size={14} />
                      Қосымша файл жоқ.
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
                disabled={!isStudent || !safeUserId || !courseId || Boolean(data.isLocked)}
                onToggleAnswer={handleToggleMiniQuizAnswer}
                onSubmit={handleSubmitMiniQuiz}
                onRetry={handleRetryMiniQuiz}
              />

              <Card className="overflow-hidden">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <p className="text-sm font-semibold text-foreground">
                    Сабақты аяқтау
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {courseId ? (
                      <Button type="button" variant="outline" asChild>
                        <Link to={buildCoursePath(courseId)}>
                          Курсқа қайту
                          <ArrowRight size={15} className="ml-2" />
                        </Link>
                      </Button>
                    ) : null}

                    {isStudent && !data.isCompleted ? (
                      <Button
                        type="button"
                        onClick={() => completeMutation.mutate()}
                        disabled={!canCompleteLesson || completeMutation.isPending}
                      >
                        {completeButtonLabel}
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
                <CardHeader className="border-b border-border/70 bg-card pb-4">
                  <CardTitle className="text-sm font-semibold">
                    {t('page.lesson_detail.status_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 p-4 text-sm sm:p-5">
                  <SidebarInfoRow
                    label={t('page.lesson_detail.field.course')}
                    value={courseTitle || '—'}
                  />

                  <SidebarInfoRow
                    label={t('page.lesson_detail.field.module')}
                    value={moduleTitle || '—'}
                  />

                  <SidebarInfoRow
                    label={t('page.lesson_detail.field.subject')}
                    value={subjectName}
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
                      {completeButtonLabel}
                    </Button>
                  ) : !isStudent ? (
                    <div className="rounded-2xl border border-border bg-muted/35 p-3 text-xs text-muted-foreground">
                      {t('page.lesson_detail.teacher_review_note')}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {isStudent ? (
                <Card className="overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-card pb-4">
                    <CardTitle className="text-sm font-semibold">
                      Оқу құралдары
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3 p-4 sm:p-5">
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
                  <CardHeader className="border-b border-border/70 bg-card pb-4">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <StickyNote size={14} />
                      Менің жазбам
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3 p-4 sm:p-5">
                    <Textarea
                      rows={8}
                      value={noteDraft}
                      maxLength={MAX_NOTE_CHARS}
                      onChange={(event) => setNoteDraft(normalizeNote(event.target.value))}
                      placeholder="Жазба"
                      disabled={!learningState || learningStateLoading}
                    />

                    <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                      <span>{noteDraft.length}/{MAX_NOTE_CHARS}</span>
                    </div>

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
                  <CardContent className="p-4 sm:p-5">
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