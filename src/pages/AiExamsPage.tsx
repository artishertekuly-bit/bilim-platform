import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  ListChecks,
  Loader2,
  RefreshCcw,
  WandSparkles,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  createAiExam,
  listAiExams,
  updateAiExamStatus,
  type AiExamQuestion,
  type AiExamSummary,
  type AiQuestionKind,
  type CreateAiExamResponse,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 200;
const MAX_SUBJECT_CHARS = 120;
const MAX_TOPIC_CHARS = 200;
const MAX_SOURCE_TEXT_CHARS = 16_000;
const MAX_QUESTION_TEXT_CHARS = 2_000;
const MAX_OPTION_CHARS = 700;
const MAX_EXPLANATION_CHARS = 2_500;
const MAX_ERROR_CHARS = 700;
const MAX_META_CHARS = 240;

const LIST_TIMEOUT_MS = 60_000;
const CREATE_TIMEOUT_MS = 360_000;
const STATUS_TIMEOUT_MS = 60_000;

const DIFFICULTY_VALUES = ['easy', 'medium', 'hard'] as const;
const EXAM_STATUS_VALUES = ['draft', 'published', 'archived'] as const;
const EXAM_MODE_VALUES = ['', 'unt'] as const;
const QUESTION_KIND_VALUES = ['mixed', 'multiple_choice', 'short_answer'] as const;
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30] as const;

type Difficulty = (typeof DIFFICULTY_VALUES)[number];
type ExamStatus = (typeof EXAM_STATUS_VALUES)[number];
type ExamMode = (typeof EXAM_MODE_VALUES)[number];

type SelectFieldProps = {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
};

function sanitizeInputValue(value: unknown, limit: number): string {
  return limitText(removeNullCharacters(String(value ?? '')), limit);
}

function cleanText(value: unknown, limit = MAX_META_CHARS): string {
  return sanitizeInputValue(value, limit).replace(/\s+/g, ' ').trim();
}

function cleanMultilineText(value: unknown, limit: number): string {
  return limitText(
    removeNullCharacters(String(value ?? ''))
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

function normalizeUiText(value: unknown): string {
  return cleanText(value, MAX_META_CHARS)
    .replace(/\bAI\b/g, 'ЖИ')
    .replace(/\bAi\b/g, 'ЖИ')
    .trim();
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const next = Number(value);

  if (!Number.isFinite(next)) return fallback;

  return Math.max(min, Math.min(max, Math.round(next)));
}

function normalizeDifficulty(value: unknown): Difficulty {
  const normalized = cleanText(value, 40);

  return DIFFICULTY_VALUES.includes(normalized as Difficulty)
    ? (normalized as Difficulty)
    : 'medium';
}

function normalizeQuestionKind(value: unknown): AiQuestionKind {
  const normalized = cleanText(value, 60);

  return QUESTION_KIND_VALUES.includes(normalized as AiQuestionKind)
    ? (normalized as AiQuestionKind)
    : 'mixed';
}

function normalizeExamMode(value: unknown): ExamMode {
  const normalized = cleanText(value, 40);

  return EXAM_MODE_VALUES.includes(normalized as ExamMode)
    ? (normalized as ExamMode)
    : '';
}

function normalizeExamStatus(value: unknown): ExamStatus {
  const normalized = cleanText(value, 40);

  return EXAM_STATUS_VALUES.includes(normalized as ExamStatus)
    ? (normalized as ExamStatus)
    : 'draft';
}

function isAbortLikeError(error: unknown): boolean {
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

function getErrorMessage(
  error: unknown,
  fallback = 'Белгісіз қате пайда болды.',
): string {
  if (isAbortLikeError(error)) return '';

  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function getStatusLabel(status: string | null | undefined): string {
  const normalizedStatus = normalizeExamStatus(status);

  switch (normalizedStatus) {
    case 'published':
      return 'Жарияланған';
    case 'archived':
      return 'Архивте';
    case 'draft':
    default:
      return 'Жоба';
  }
}

function getStatusTone(status: string | null | undefined) {
  const normalizedStatus = normalizeExamStatus(status);

  switch (normalizedStatus) {
    case 'published':
      return 'success' as const;
    case 'archived':
      return 'muted' as const;
    case 'draft':
    default:
      return 'warning' as const;
  }
}

function getDifficultyLabel(difficulty: Difficulty): string {
  const labels: Record<Difficulty, string> = {
    easy: 'Оңай',
    medium: 'Орташа',
    hard: 'Қиын',
  };

  return labels[difficulty];
}

function getQuestionKindLabel(kind: AiQuestionKind): string {
  const normalizedKind = normalizeQuestionKind(kind);

  const labels: Record<AiQuestionKind, string> = {
    mixed: 'Аралас',
    multiple_choice: 'Жауап нұсқалары',
    short_answer: 'Қысқа жауап',
  };

  return labels[normalizedKind];
}

function normalizeQuestionType(value: unknown): AiExamQuestion['type'] {
  return value === 'multiple_choice' ? 'multiple_choice' : 'short_answer';
}

function normalizeQuestionOption(
  option: NonNullable<AiExamQuestion['options']>[number],
  questionId: string,
  index: number,
): NonNullable<AiExamQuestion['options']>[number] | null {
  const text = cleanText(option?.text, MAX_OPTION_CHARS);

  if (!text) return null;

  return {
    ...option,
    id: cleanId(option?.id) || `${questionId}-option-${index + 1}`,
    text,
    isCorrect: Boolean(option?.isCorrect),
  };
}

function normalizeExamQuestion(question: AiExamQuestion, index: number): AiExamQuestion | null {
  const id = cleanId(question?.id) || `question-${index + 1}`;
  const rawOptions = Array.isArray(question?.options) ? question.options : [];
  const options = rawOptions
    .map((option, optionIndex) => normalizeQuestionOption(option, id, optionIndex))
    .filter((option): option is NonNullable<AiExamQuestion['options']>[number] =>
      Boolean(option),
    )
    .slice(0, 8);

  const type =
    normalizeQuestionType(question?.type) === 'multiple_choice' && options.length >= 2
      ? 'multiple_choice'
      : 'short_answer';

  const text = cleanMultilineText(question?.question, MAX_QUESTION_TEXT_CHARS);

  if (!text) return null;

  return {
    ...question,
    id,
    type,
    question: text,
    options: type === 'multiple_choice' ? options : undefined,
    correctAnswer: cleanText(question?.correctAnswer, MAX_OPTION_CHARS) || undefined,
    explanation:
      cleanMultilineText(question?.explanation, MAX_EXPLANATION_CHARS) || undefined,
  };
}

function normalizeExamSummary(item: AiExamSummary): AiExamSummary | null {
  const id = cleanId(item?.id);

  if (!id) return null;

  return {
    ...item,
    id,
    title: cleanText(item?.title, MAX_TITLE_CHARS) || 'Емтихан',
    subject: cleanText(item?.subject, MAX_SUBJECT_CHARS) || undefined,
    topic: cleanText(item?.topic, MAX_TOPIC_CHARS) || undefined,
    status: normalizeExamStatus(item?.status),
    questionCount: normalizeNumber(item?.questionCount, 0, 0, 1_000),
    durationMinutes: normalizeNumber(item?.durationMinutes, 0, 0, 10_000),
  };
}

function normalizeCreateResponse(response: CreateAiExamResponse): CreateAiExamResponse {
  const normalizedExam = normalizeExamSummary(response.exam) || response.exam;

  return {
    ...response,
    exam: normalizedExam,
    questions: (response.questions || [])
      .map((question, index) => normalizeExamQuestion(question, index))
      .filter((question): question is AiExamQuestion => Boolean(question)),
  };
}

function upsertExam(list: AiExamSummary[], incoming: AiExamSummary): AiExamSummary[] {
  const normalizedIncoming = normalizeExamSummary(incoming);

  if (!normalizedIncoming) return list;

  const exists = list.some((item) => cleanId(item.id) === normalizedIncoming.id);

  if (!exists) {
    return [normalizedIncoming, ...list];
  }

  return list.map((item) =>
    cleanId(item.id) === normalizedIncoming.id
      ? { ...item, ...normalizedIncoming }
      : item,
  );
}

function normalizeExamList(items: AiExamSummary[] = []): AiExamSummary[] {
  const seen = new Set<string>();
  const normalized: AiExamSummary[] = [];

  for (const item of items) {
    const nextItem = normalizeExamSummary(item);

    if (!nextItem || seen.has(nextItem.id)) continue;

    seen.add(nextItem.id);
    normalized.push(nextItem);
  }

  return normalized;
}

function getExamMeta(item: AiExamSummary): string {
  const subject = cleanText(item.subject, MAX_SUBJECT_CHARS) || 'Пән жоқ';
  const questionCount = normalizeNumber(item.questionCount, 0, 0, 1_000);
  const duration = normalizeNumber(item.durationMinutes, 0, 0, 10_000);

  return `${subject} · ${questionCount} сұрақ · ${duration || '—'} мин`;
}

function getCreateValidationMessage({
  title,
  subject,
  topic,
  sourceText,
}: {
  title: string;
  subject: string;
  topic: string;
  sourceText: string;
}): string {
  if (!cleanText(title, MAX_TITLE_CHARS)) {
    return 'Емтихан атауын енгізіңіз.';
  }

  if (
    !cleanText(subject, MAX_SUBJECT_CHARS) &&
    !cleanText(topic, MAX_TOPIC_CHARS) &&
    !cleanMultilineText(sourceText, MAX_SOURCE_TEXT_CHARS)
  ) {
    return 'Пән, тақырып немесе мәтін енгізіңіз.';
  }

  return '';
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  disabled = false,
}: SelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-foreground">
        {cleanText(label, MAX_META_CHARS)}
      </Label>

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-11 w-full rounded-2xl border border-input bg-card px-4 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
    </div>
  );
}

function InfoCell({
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

function ExamListItem({
  item,
  accessToken,
  statusUpdatingId,
  onUpdateStatus,
  mode,
}: {
  item: AiExamSummary;
  accessToken?: string;
  statusUpdatingId: string | null;
  onUpdateStatus: (examId: string, status: ExamStatus) => void;
  mode: ExamStatus;
}) {
  const examId = cleanId(item.id);
  const title = cleanText(item.title, MAX_TITLE_CHARS) || 'Емтихан';
  const status = normalizeExamStatus(item.status);
  const updating = cleanId(statusUpdatingId) === examId;
  const disabled = updating || !accessToken || !examId;

  return (
    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {title}
          </p>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {getExamMeta(item)}
          </p>
        </div>

        <StatusBadge tone={getStatusTone(status)}>
          {getStatusLabel(status)}
        </StatusBadge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {mode === 'draft' ? (
          <>
            <Button
              size="sm"
              onClick={() => onUpdateStatus(examId, 'published')}
              disabled={disabled}
            >
              {updating ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <ArrowRight size={14} className="mr-2" />
              )}
              Жариялау
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(examId, 'archived')}
              disabled={disabled}
            >
              <Archive size={14} className="mr-2" />
              Архивке
            </Button>
          </>
        ) : null}

        {mode === 'published' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateStatus(examId, 'archived')}
            disabled={disabled}
          >
            {updating ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Archive size={14} className="mr-2" />
            )}
            Архивке
          </Button>
        ) : null}

        {mode === 'archived' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(examId, 'draft')}
              disabled={disabled}
            >
              Жобаға қайтару
            </Button>

            <Button
              size="sm"
              onClick={() => onUpdateStatus(examId, 'published')}
              disabled={disabled}
            >
              {updating ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              Жариялау
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function QuestionPreview({
  question,
  index,
}: {
  question: AiExamQuestion;
  index: number;
}) {
  const normalizedQuestion = normalizeExamQuestion(question, index);

  if (!normalizedQuestion) return null;

  const options = normalizedQuestion.options || [];

  return (
    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Сұрақ {index + 1}</p>

        <StatusBadge tone="muted">
          {normalizedQuestion.type === 'multiple_choice'
            ? 'Жауап нұсқалары'
            : 'Қысқа жауап'}
        </StatusBadge>
      </div>

      <p className="whitespace-pre-line text-sm leading-7 text-foreground">
        {normalizedQuestion.question}
      </p>

      {options.length ? (
        <div className="mt-3 space-y-2">
          {options.map((option, optionIndex) => (
            <div
              key={cleanId(option.id) || `${normalizedQuestion.id}-${optionIndex}`}
              className={cn(
                'rounded-2xl border px-3 py-2 text-sm',
                option.isCorrect
                  ? 'border-success-muted bg-success-soft text-success-foreground'
                  : 'border-border bg-card text-muted-foreground',
              )}
            >
              {option.text}
            </div>
          ))}
        </div>
      ) : null}

      {normalizedQuestion.correctAnswer ? (
        <div className="mt-3 rounded-2xl border border-success-muted bg-success-soft/70 px-3 py-2 text-xs leading-5 text-success-foreground">
          <span className="font-semibold">Дұрыс жауап: </span>
          {normalizedQuestion.correctAnswer}
        </div>
      ) : null}

      {normalizedQuestion.explanation ? (
        <div className="mt-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Түсіндірме: </span>
          {normalizedQuestion.explanation}
        </div>
      ) : null}
    </div>
  );
}

export default function AiExamsPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [questionKind, setQuestionKind] = useState<AiQuestionKind>('mixed');
  const [examMode, setExamMode] = useState<ExamMode>('');

  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const [errorText, setErrorText] = useState('');
  const [latestDraft, setLatestDraft] = useState<CreateAiExamResponse | null>(null);
  const [exams, setExams] = useState<AiExamSummary[]>([]);

  const listAbortRef = useRef<AbortController | null>(null);
  const createAbortRef = useRef<AbortController | null>(null);
  const statusAbortRef = useRef<AbortController | null>(null);

  const listRequestIdRef = useRef(0);
  const createRequestIdRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const accessToken = session?.access_token;
  const isAdmin = user?.role === 'admin';
  const canUseAiExams = Boolean(user && isAdmin && accessToken);

  const draftExams = useMemo(
    () => exams.filter((item) => normalizeExamStatus(item.status) === 'draft'),
    [exams],
  );

  const publishedExams = useMemo(
    () => exams.filter((item) => normalizeExamStatus(item.status) === 'published'),
    [exams],
  );

  const archivedExams = useMemo(
    () => exams.filter((item) => normalizeExamStatus(item.status) === 'archived'),
    [exams],
  );

  const validationMessage = useMemo(
    () =>
      getCreateValidationMessage({
        title,
        subject,
        topic,
        sourceText,
      }),
    [sourceText, subject, title, topic],
  );

  const canCreateDraft = useMemo(
    () => Boolean(canUseAiExams && !isCreating && !validationMessage),
    [canUseAiExams, isCreating, validationMessage],
  );

  const isBusy = isCreating || isLoadingList || Boolean(statusUpdatingId);

  const clearError = () => {
    if (errorText) {
      setErrorText('');
    }
  };

  const abortAll = useCallback(() => {
    listAbortRef.current?.abort();
    createAbortRef.current?.abort();
    statusAbortRef.current?.abort();

    listAbortRef.current = null;
    createAbortRef.current = null;
    statusAbortRef.current = null;
  }, []);

  const loadExams = useCallback(async () => {
    listAbortRef.current?.abort();

    if (!user || !isAdmin) {
      setExams([]);
      setLatestDraft(null);
      setErrorText('');
      return;
    }

    if (!accessToken) {
      setExams([]);
      setLatestDraft(null);
      setErrorText('Белсенді сессия қажет.');
      return;
    }

    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;

    const controller = new AbortController();
    listAbortRef.current = controller;

    setIsLoadingList(true);
    setErrorText('');

    try {
      const response = await listAiExams({
        accessToken,
        signal: controller.signal,
        timeoutMs: LIST_TIMEOUT_MS,
      });

      if (!mountedRef.current || listRequestIdRef.current !== requestId) return;

      setExams(normalizeExamList(response.exams || []));
    } catch (loadError) {
      if (controller.signal.aborted || isAbortLikeError(loadError)) return;

      const message = getErrorMessage(
        loadError,
        'Емтихан тізімін жүктеу мүмкін болмады.',
      );

      if (mountedRef.current && listRequestIdRef.current === requestId) {
        setErrorText(message);
      }
    } finally {
      if (mountedRef.current && listRequestIdRef.current === requestId) {
        setIsLoadingList(false);
      }

      if (listAbortRef.current === controller) {
        listAbortRef.current = null;
      }
    }
  }, [accessToken, isAdmin, user]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortAll();
    };
  }, [abortAll]);

  const handleCreateDraft = async () => {
    createAbortRef.current?.abort();

    const trimmedTitle = cleanText(title, MAX_TITLE_CHARS);
    const trimmedSubject = cleanText(subject, MAX_SUBJECT_CHARS);
    const trimmedTopic = cleanText(topic, MAX_TOPIC_CHARS);
    const trimmedSource = cleanMultilineText(sourceText, MAX_SOURCE_TEXT_CHARS);

    const message = getCreateValidationMessage({
      title: trimmedTitle,
      subject: trimmedSubject,
      topic: trimmedTopic,
      sourceText: trimmedSource,
    });

    if (message) {
      setErrorText(message);
      return;
    }

    if (!user) {
      setErrorText('Жүйеге кіріңіз.');
      return;
    }

    if (!isAdmin) {
      setErrorText('Бұл бөлім тек админге арналған.');
      return;
    }

    if (!accessToken) {
      const authMessage = 'Белсенді сессия қажет.';

      setErrorText(authMessage);
      toast({
        title: 'Қате',
        description: authMessage,
        variant: 'destructive',
      });
      return;
    }

    const requestId = createRequestIdRef.current + 1;
    createRequestIdRef.current = requestId;

    const controller = new AbortController();
    createAbortRef.current = controller;

    setIsCreating(true);
    setErrorText('');

    try {
      const response = await createAiExam(
        {
          title: trimmedTitle,
          sourceText: trimmedSource || undefined,
          subject: trimmedSubject || undefined,
          topic: trimmedTopic || undefined,
          difficulty: normalizeDifficulty(difficulty),
          kind: normalizeQuestionKind(questionKind),
          examMode: normalizeExamMode(examMode) || undefined,
          questionCount: normalizeNumber(questionCount, 10, 5, 30),
          durationMinutes: normalizeNumber(durationMinutes, 30, 5, 180),
        },
        {
          accessToken,
          signal: controller.signal,
          timeoutMs: CREATE_TIMEOUT_MS,
        },
      );

      if (!mountedRef.current || createRequestIdRef.current !== requestId) return;

      const normalizedResponse = normalizeCreateResponse(response);

      setLatestDraft(normalizedResponse);
      setExams((prev) => normalizeExamList(upsertExam(prev, normalizedResponse.exam)));

      toast({
        title: 'Емтихан жобасы дайын',
        description: `${normalizeNumber(
          normalizedResponse.exam.questionCount || normalizedResponse.questions?.length,
          0,
          0,
          1_000,
        )} сұрақ құрылды.`,
      });
    } catch (createError) {
      if (controller.signal.aborted || isAbortLikeError(createError)) return;

      const message = getErrorMessage(
        createError,
        'Емтихан жобасын құру мүмкін болмады.',
      );

      if (mountedRef.current && createRequestIdRef.current === requestId) {
        setErrorText(message);
      }

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current && createRequestIdRef.current === requestId) {
        setIsCreating(false);
      }

      if (createAbortRef.current === controller) {
        createAbortRef.current = null;
      }
    }
  };

  const handleUpdateStatus = async (examId: string, status: ExamStatus) => {
    statusAbortRef.current?.abort();

    const safeExamId = cleanId(examId);
    const safeStatus = normalizeExamStatus(status);

    if (!safeExamId) {
      setErrorText('Емтихан ID анықталмады.');
      return;
    }

    if (!user) {
      setErrorText('Жүйеге кіріңіз.');
      return;
    }

    if (!isAdmin) {
      setErrorText('Бұл бөлім тек админге арналған.');
      return;
    }

    if (!accessToken) {
      const message = 'Белсенді сессия қажет.';

      setErrorText(message);
      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    const current = exams.find((item) => cleanId(item.id) === safeExamId);

    if (normalizeExamStatus(current?.status) === safeStatus) {
      return;
    }

    const requestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = requestId;

    const controller = new AbortController();
    statusAbortRef.current = controller;

    setStatusUpdatingId(safeExamId);
    setErrorText('');

    try {
      const response = await updateAiExamStatus(safeExamId, safeStatus, {
        accessToken,
        signal: controller.signal,
        timeoutMs: STATUS_TIMEOUT_MS,
      });

      if (!mountedRef.current || statusRequestIdRef.current !== requestId) return;

      const normalizedExam = normalizeExamSummary(response.exam);

      setExams((prev) =>
        normalizeExamList(
          prev.map((item) =>
            cleanId(item.id) === safeExamId && normalizedExam
              ? { ...item, ...normalizedExam }
              : item,
          ),
        ),
      );

      if (cleanId(latestDraft?.exam.id) === safeExamId && normalizedExam) {
        setLatestDraft((prev) =>
          prev ? { ...prev, exam: { ...prev.exam, ...normalizedExam } } : prev,
        );
      }

      toast({
        title: 'Статус жаңартылды',
        description: getStatusLabel(normalizedExam?.status || safeStatus),
      });
    } catch (statusError) {
      if (controller.signal.aborted || isAbortLikeError(statusError)) return;

      const message = getErrorMessage(
        statusError,
        'Емтихан статусын жаңарту мүмкін болмады.',
      );

      if (mountedRef.current && statusRequestIdRef.current === requestId) {
        setErrorText(message);
      }

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current && statusRequestIdRef.current === requestId) {
        setStatusUpdatingId(null);
      }

      if (statusAbortRef.current === controller) {
        statusAbortRef.current = null;
      }
    }
  };

  const handleReset = () => {
    createAbortRef.current?.abort();
    statusAbortRef.current?.abort();

    createAbortRef.current = null;
    statusAbortRef.current = null;
    createRequestIdRef.current += 1;
    statusRequestIdRef.current += 1;

    setTitle('');
    setSubject('');
    setTopic('');
    setSourceText('');
    setDifficulty('medium');
    setQuestionCount(10);
    setDurationMinutes(30);
    setQuestionKind('mixed');
    setExamMode('');
    setErrorText('');
    setLatestDraft(null);
    setIsCreating(false);
    setStatusUpdatingId(null);
  };

  const pageTitle = normalizeUiText(t('nav.ai_exams'));

  if (!user) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <PageHeader
            eyebrow={
              <>
                <WandSparkles size={13} />
                ЖИ құралдары
              </>
            }
            icon={<ClipboardList size={20} />}
            title={pageTitle}
          />

          <EmptyState
            title="Аккаунт анықталмады"
            text="Жүйеге кіріңіз."
            tone="ai"
          />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <PageHeader
            eyebrow={
              <>
                <WandSparkles size={13} />
                ЖИ құралдары
              </>
            }
            icon={<ClipboardList size={20} />}
            title={pageTitle}
          />

          <EmptyState
            title="Админ рөлі қажет"
            text="Бұл бөлім тек админге арналған."
            tone="ai"
          />
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
              <WandSparkles size={13} />
              ЖИ құралдары
            </>
          }
          icon={<ClipboardList size={20} />}
          title={pageTitle}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/create-test">
                  <ClipboardList size={14} className="mr-2" />
                  Тест құру
                </Link>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadExams()}
                disabled={isLoadingList || !accessToken}
              >
                {isLoadingList ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <RefreshCcw size={14} className="mr-2" />
                )}
                Жаңарту
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isBusy}
              >
                <RefreshCcw size={14} className="mr-2" />
                Тазалау
              </Button>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                  <WandSparkles size={16} />
                </span>
                Емтихан параметрлері
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-semibold text-foreground">
                  Емтихан атауы
                </Label>

                <Input
                  id="title"
                  value={title}
                  maxLength={MAX_TITLE_CHARS}
                  onChange={(event) => {
                    setTitle(sanitizeInputValue(event.target.value, MAX_TITLE_CHARS));
                    clearError();
                  }}
                  disabled={isCreating}
                  placeholder="Мысалы: Алгебра емтиханы"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-xs font-semibold text-foreground">
                    Пән
                  </Label>

                  <Input
                    id="subject"
                    value={subject}
                    maxLength={MAX_SUBJECT_CHARS}
                    onChange={(event) => {
                      setSubject(sanitizeInputValue(event.target.value, MAX_SUBJECT_CHARS));
                      clearError();
                    }}
                    disabled={isCreating}
                    placeholder="Мысалы: Математика"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="topic" className="text-xs font-semibold text-foreground">
                    Тақырып
                  </Label>

                  <Input
                    id="topic"
                    value={topic}
                    maxLength={MAX_TOPIC_CHARS}
                    onChange={(event) => {
                      setTopic(sanitizeInputValue(event.target.value, MAX_TOPIC_CHARS));
                      clearError();
                    }}
                    disabled={isCreating}
                    placeholder="Мысалы: Квадрат теңдеулер"
                  />
                </div>

                <SelectField
                  id="difficulty"
                  label="Қиындық"
                  value={difficulty}
                  onChange={(value) => setDifficulty(normalizeDifficulty(value))}
                  disabled={isCreating}
                >
                  <option value="easy">Оңай</option>
                  <option value="medium">Орташа</option>
                  <option value="hard">Қиын</option>
                </SelectField>

                <SelectField
                  id="questionCount"
                  label="Сұрақ саны"
                  value={questionCount}
                  onChange={(value) =>
                    setQuestionCount(normalizeNumber(value, 10, 5, 30))
                  }
                  disabled={isCreating}
                >
                  {QUESTION_COUNT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="questionKind"
                  label="Сұрақ түрі"
                  value={questionKind}
                  onChange={(value) => setQuestionKind(normalizeQuestionKind(value))}
                  disabled={isCreating}
                >
                  <option value="mixed">Аралас</option>
                  <option value="multiple_choice">Жауап нұсқалары</option>
                  <option value="short_answer">Қысқа жауап</option>
                </SelectField>

                <SelectField
                  id="examMode"
                  label="Режим"
                  value={examMode}
                  onChange={(value) => setExamMode(normalizeExamMode(value))}
                  disabled={isCreating}
                >
                  <option value="">Жалпы</option>
                  <option value="unt">ҰБТ</option>
                </SelectField>

                <div className="space-y-1.5 md:col-span-2">
                  <Label
                    htmlFor="durationMinutes"
                    className="text-xs font-semibold text-foreground"
                  >
                    Уақыт, минут
                  </Label>

                  <Input
                    id="durationMinutes"
                    type="number"
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(event) => {
                      setDurationMinutes(
                        normalizeNumber(event.target.value, 30, 5, 180),
                      );
                    }}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <Label
                    htmlFor="sourceText"
                    className="text-xs font-semibold text-foreground"
                  >
                    Қосымша мәтін
                  </Label>

                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone="muted">{getDifficultyLabel(difficulty)}</StatusBadge>
                    <StatusBadge tone="ai">{getQuestionKindLabel(questionKind)}</StatusBadge>
                    {examMode === 'unt' ? <StatusBadge tone="warning">ҰБТ</StatusBadge> : null}
                  </div>
                </div>

                <Textarea
                  id="sourceText"
                  value={sourceText}
                  maxLength={MAX_SOURCE_TEXT_CHARS}
                  onChange={(event) => {
                    setSourceText(
                      sanitizeInputValue(event.target.value, MAX_SOURCE_TEXT_CHARS),
                    );
                    clearError();
                  }}
                  disabled={isCreating}
                  placeholder="Теориялық мәтін немесе қысқа мазмұн"
                  rows={7}
                />

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {sourceText.length}/{MAX_SOURCE_TEXT_CHARS}
                </p>
              </div>

              <Button onClick={handleCreateDraft} disabled={!canCreateDraft}>
                {isCreating ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 size={16} className="mr-2" />
                )}
                {isCreating ? 'Құрылуда...' : 'Жоба құру'}
              </Button>

              {!accessToken ? (
                <p className="rounded-2xl border border-warning-muted bg-warning-soft px-3 py-2 text-xs leading-5 text-warning-foreground">
                  Белсенді сессия қажет.
                </p>
              ) : null}

              {accessToken && validationMessage ? (
                <p className="rounded-2xl border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {validationMessage}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-secondary-muted bg-secondary-soft text-secondary-foreground shadow-inner-soft">
                  <FileText size={16} />
                </span>
                Соңғы жоба
              </CardTitle>
            </CardHeader>

            <CardContent className="p-5">
              {latestDraft ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoCell
                    label="Атауы"
                    value={cleanText(latestDraft.exam.title, MAX_TITLE_CHARS)}
                  />
                  <InfoCell
                    label="Пән"
                    value={cleanText(latestDraft.exam.subject, MAX_SUBJECT_CHARS) || '—'}
                  />
                  <InfoCell
                    label="Тақырып"
                    value={cleanText(latestDraft.exam.topic, MAX_TOPIC_CHARS) || '—'}
                  />
                  <InfoCell label="Сұрақ түрі" value={getQuestionKindLabel(questionKind)} />
                  <InfoCell
                    label="Статус"
                    value={
                      <StatusBadge tone={getStatusTone(latestDraft.exam.status)}>
                        {getStatusLabel(latestDraft.exam.status)}
                      </StatusBadge>
                    }
                  />
                  <InfoCell
                    label="Сұрақ саны"
                    value={normalizeNumber(
                      latestDraft.exam.questionCount || latestDraft.questions?.length,
                      0,
                      0,
                      1_000,
                    )}
                  />
                </div>
              ) : (
                <EmptyState title="Жоба жоқ" text="Әзірге дерек жоқ." compact />
              )}
            </CardContent>
          </Card>
        </div>

        {isCreating || isLoadingList ? (
          <LoadingState
            text={isCreating ? 'Жоба құрылуда...' : 'Тізім жүктелуде...'}
          />
        ) : null}

        {errorText ? <ErrorState text={errorText} /> : null}

        {!isCreating && !errorText && latestDraft ? (
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-ai-border bg-ai-soft text-primary shadow-inner-soft">
                  <ListChecks size={16} />
                </span>
                Құрылған сұрақтар
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 p-5">
              {latestDraft.questions?.length ? (
                latestDraft.questions.map((question, index) => (
                  <QuestionPreview
                    key={`${cleanId(question.id) || 'question'}-${index}`}
                    question={question}
                    index={index}
                  />
                ))
              ) : (
                <EmptyState title="Сұрақ жоқ" text="Сервер сұрақ тізімін қайтармады." compact />
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold">Жобалар</CardTitle>
                <StatusBadge tone="warning">{draftExams.length}</StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 p-5 text-sm">
              {draftExams.length === 0 ? (
                <EmptyState title="Жоба жоқ" text="Әзірге дерек жоқ." compact />
              ) : (
                draftExams.map((item) => (
                  <ExamListItem
                    key={cleanId(item.id)}
                    item={item}
                    accessToken={accessToken}
                    statusUpdatingId={statusUpdatingId}
                    onUpdateStatus={handleUpdateStatus}
                    mode="draft"
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold">Жарияланған</CardTitle>
                <StatusBadge tone="success">{publishedExams.length}</StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 p-5 text-sm">
              {publishedExams.length === 0 ? (
                <EmptyState title="Емтихан жоқ" text="Әзірге дерек жоқ." compact />
              ) : (
                publishedExams.map((item) => (
                  <ExamListItem
                    key={cleanId(item.id)}
                    item={item}
                    accessToken={accessToken}
                    statusUpdatingId={statusUpdatingId}
                    onUpdateStatus={handleUpdateStatus}
                    mode="published"
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold">Архив</CardTitle>
                <StatusBadge tone="muted">{archivedExams.length}</StatusBadge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 p-5 text-sm">
              {archivedExams.length === 0 ? (
                <EmptyState title="Архив бос" text="Әзірге дерек жоқ." compact />
              ) : (
                archivedExams.map((item) => (
                  <ExamListItem
                    key={cleanId(item.id)}
                    item={item}
                    accessToken={accessToken}
                    statusUpdatingId={statusUpdatingId}
                    onUpdateStatus={handleUpdateStatus}
                    mode="archived"
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
