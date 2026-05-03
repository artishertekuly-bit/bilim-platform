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

const MAX_TITLE_CHARS = 200;
const MAX_SUBJECT_CHARS = 120;
const MAX_TOPIC_CHARS = 200;
const MAX_SOURCE_TEXT_CHARS = 16_000;
const LIST_TIMEOUT_MS = 60_000;
const CREATE_TIMEOUT_MS = 360_000;
const STATUS_TIMEOUT_MS = 60_000;

type Difficulty = 'easy' | 'medium' | 'hard';
type ExamStatus = 'draft' | 'published' | 'archived';
type ExamMode = '' | 'unt';

type SelectFieldProps = {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
};

function cleanText(value: string, limit: number) {
  return value.replace(/\x00/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function isAbortLikeError(error: unknown) {
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

function upsertExam(list: AiExamSummary[], incoming: AiExamSummary): AiExamSummary[] {
  if (!incoming.id) return list;

  const exists = list.some((item) => item.id === incoming.id);

  if (!exists) {
    return [incoming, ...list];
  }

  return list.map((item) => (item.id === incoming.id ? { ...item, ...incoming } : item));
}

function normalizeExamList(items: AiExamSummary[]) {
  const seen = new Set<string>();
  const normalized: AiExamSummary[] = [];

  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
  }

  return normalized;
}

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'published':
      return 'Жарияланған';
    case 'archived':
      return 'Архивте';
    default:
      return 'Жоба';
  }
}

function getStatusTone(status: string | null | undefined) {
  switch (status) {
    case 'published':
      return 'success';
    case 'archived':
      return 'muted';
    default:
      return 'warning';
  }
}

function getDifficultyLabel(difficulty: Difficulty) {
  const labels: Record<Difficulty, string> = {
    easy: 'Оңай',
    medium: 'Орташа',
    hard: 'Қиын',
  };

  return labels[difficulty];
}

function getQuestionKindLabel(kind: AiQuestionKind) {
  const labels: Record<AiQuestionKind, string> = {
    mixed: 'Аралас',
    multiple_choice: 'Multiple choice',
    short_answer: 'Қысқа жауап',
  };

  return labels[kind];
}

function examMeta(item: AiExamSummary) {
  return `${item.subject || 'Пән көрсетілмеген'} · ${item.questionCount || 0} сұрақ · ${
    item.durationMinutes || '—'
  } мин`;
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
}) {
  if (!cleanText(title, MAX_TITLE_CHARS)) {
    return 'Емтихан атауын енгізіңіз.';
  }

  if (
    !cleanText(subject, MAX_SUBJECT_CHARS) &&
    !cleanText(topic, MAX_TOPIC_CHARS) &&
    !cleanText(sourceText, MAX_SOURCE_TEXT_CHARS)
  ) {
    return 'Емтихан мазмұнын нақтылау үшін пән, тақырып немесе source text енгізіңіз.';
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
      <Label htmlFor={id}>{label}</Label>
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

function StatBox({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  tone?: 'primary' | 'success' | 'warning' | 'muted';
}) {
  const toneClassName = {
    primary: 'border-primary-muted bg-primary-soft text-primary',
    success: 'border-success-muted bg-success-soft text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    muted: 'border-border bg-muted text-muted-foreground',
  }[tone];

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-foreground">{value}</p>
      <div className={`mt-3 h-1.5 rounded-full border ${toneClassName}`} />
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
      <p className="text-xs text-muted-foreground">{label}</p>
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
  mode: 'draft' | 'published' | 'archived';
}) {
  const updating = statusUpdatingId === item.id;
  const disabled = updating || !accessToken || !item.id;

  return (
    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {item.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{examMeta(item)}</p>
        </div>

        <StatusBadge tone={getStatusTone(item.status)}>
          {getStatusLabel(item.status)}
        </StatusBadge>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {mode === 'draft' ? (
          <>
            <Button
              size="sm"
              onClick={() => onUpdateStatus(item.id, 'published')}
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
              onClick={() => onUpdateStatus(item.id, 'archived')}
              disabled={disabled}
            >
              <Archive size={14} className="mr-2" />
              Архивке жіберу
            </Button>
          </>
        ) : null}

        {mode === 'published' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateStatus(item.id, 'archived')}
            disabled={disabled}
          >
            {updating ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Archive size={14} className="mr-2" />
            )}
            Архивке жіберу
          </Button>
        ) : null}

        {mode === 'archived' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(item.id, 'draft')}
              disabled={disabled}
            >
              Жобаға қайтару
            </Button>

            <Button
              size="sm"
              onClick={() => onUpdateStatus(item.id, 'published')}
              disabled={disabled}
            >
              {updating ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              Қайта жариялау
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function QuestionPreview({ question, index }: { question: AiExamQuestion; index: number }) {
  return (
    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Сұрақ {index + 1}</p>
        <StatusBadge tone="muted">
          {question.type === 'multiple_choice' ? 'Таңдау сұрағы' : 'Қысқа жауап'}
        </StatusBadge>
      </div>

      <p className="text-sm leading-7 text-foreground">{question.question}</p>

      {question.options?.length ? (
        <div className="mt-3 space-y-2">
          {question.options.map((option) => (
            <div
              key={option.id}
              className={`rounded-2xl border px-3 py-2 text-sm ${
                option.isCorrect
                  ? 'border-success-muted bg-success-soft text-success-foreground'
                  : 'border-border bg-card text-muted-foreground'
              }`}
            >
              {option.text}
            </div>
          ))}
        </div>
      ) : null}

      {question.correctAnswer ? (
        <div className="mt-3 rounded-2xl border border-success-muted bg-success-soft/70 px-3 py-2 text-xs leading-5 text-success-foreground">
          <span className="font-semibold">Дұрыс жауап: </span>
          {question.correctAnswer}
        </div>
      ) : null}

      {question.explanation ? (
        <div className="mt-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Түсіндірме: </span>
          {question.explanation}
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
  const isTeacher = user?.role === 'teacher';
  const canUseAiExams = Boolean(user && isTeacher && accessToken);

  const draftExams = useMemo(
    () => exams.filter((item) => item.status === 'draft' || !item.status),
    [exams]
  );

  const publishedExams = useMemo(
    () => exams.filter((item) => item.status === 'published'),
    [exams]
  );

  const archivedExams = useMemo(
    () => exams.filter((item) => item.status === 'archived'),
    [exams]
  );

  const validationMessage = useMemo(
    () =>
      getCreateValidationMessage({
        title,
        subject,
        topic,
        sourceText,
      }),
    [sourceText, subject, title, topic]
  );

  const canCreateDraft = useMemo(
    () => Boolean(canUseAiExams && !isCreating && !validationMessage),
    [canUseAiExams, isCreating, validationMessage]
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

    if (!user) {
      setExams([]);
      setLatestDraft(null);
      setErrorText('');
      return;
    }

    if (!isTeacher) {
      setExams([]);
      setLatestDraft(null);
      setErrorText('');
      return;
    }

    if (!accessToken) {
      setExams([]);
      setLatestDraft(null);
      setErrorText('AI API үшін session access token табылмады.');
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

      setExams(normalizeExamList(response.exams));
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const message =
        error instanceof Error
          ? error.message
          : 'AI емтихан тізімін жүктеу мүмкін болмады.';

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
  }, [accessToken, isTeacher, user]);

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
    const trimmedSource = cleanText(sourceText, MAX_SOURCE_TEXT_CHARS);

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
      setErrorText('AI емтихан жобасын құру үшін жүйеге кіру қажет.');
      return;
    }

    if (!isTeacher) {
      setErrorText('AI емтихан жобасын тек мұғалім аккаунтымен құруға болады.');
      return;
    }

    if (!accessToken) {
      const authMessage = 'AI емтихан жобасын құру үшін белсенді сессия қажет.';
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
          difficulty,
          kind: questionKind,
          examMode: examMode || undefined,
          questionCount,
          durationMinutes,
        },
        {
          accessToken,
          signal: controller.signal,
          timeoutMs: CREATE_TIMEOUT_MS,
        }
      );

      if (!mountedRef.current || createRequestIdRef.current !== requestId) return;

      setLatestDraft(response);
      setExams((prev) => normalizeExamList(upsertExam(prev, response.exam)));

      toast({
        title: 'Емтихан жобасы дайын',
        description: `${response.exam.questionCount || response.questions?.length || 0} сұрақ құрылды.`,
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'AI емтихан жобасын құру мүмкін болмады.';

      if (mountedRef.current && createRequestIdRef.current === requestId) {
        setErrorText(errorMessage);
      }

      toast({
        title: 'Қате',
        description: errorMessage,
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

    const cleanExamId = cleanText(examId, 120);

    if (!cleanExamId) {
      setErrorText('Емтихан id анықталмады.');
      return;
    }

    if (!user) {
      setErrorText('Емтихан статусын жаңарту үшін жүйеге кіру қажет.');
      return;
    }

    if (!isTeacher) {
      setErrorText('Емтихан статусын тек мұғалім аккаунтымен жаңартуға болады.');
      return;
    }

    if (!accessToken) {
      const message = 'Емтихан статусын жаңарту үшін белсенді сессия қажет.';
      setErrorText(message);
      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    const current = exams.find((item) => item.id === cleanExamId);
    if (current?.status === status) {
      return;
    }

    const requestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = requestId;

    const controller = new AbortController();
    statusAbortRef.current = controller;

    setStatusUpdatingId(cleanExamId);
    setErrorText('');

    try {
      const response = await updateAiExamStatus(cleanExamId, status, {
        accessToken,
        signal: controller.signal,
        timeoutMs: STATUS_TIMEOUT_MS,
      });

      if (!mountedRef.current || statusRequestIdRef.current !== requestId) return;

      setExams((prev) =>
        normalizeExamList(
          prev.map((item) =>
            item.id === cleanExamId ? { ...item, ...response.exam } : item
          )
        )
      );

      if (latestDraft?.exam.id === cleanExamId) {
        setLatestDraft((prev) =>
          prev ? { ...prev, exam: { ...prev.exam, ...response.exam } } : prev
        );
      }

      toast({
        title: 'Статус жаңартылды',
        description: `Емтихан статусы: ${getStatusLabel(response.exam.status || status)}`,
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortLikeError(error)) return;

      const errorMessage =
        error instanceof Error ? error.message : 'Емтихан статусын жаңарту мүмкін болмады.';

      if (mountedRef.current && statusRequestIdRef.current === requestId) {
        setErrorText(errorMessage);
      }

      toast({
        title: 'Қате',
        description: errorMessage,
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

  if (!user) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <PageHeader
            eyebrow={
              <>
                <WandSparkles size={13} />
                AI құралдар
              </>
            }
            icon={<ClipboardList size={20} />}
            title={t('nav.ai_exams')}
            description="AI емтихан жобаларын құру үшін мұғалім аккаунтымен кіріңіз."
          />

          <EmptyState
            title="Аккаунт анықталмады"
            text="AI емтихан бөлімін қолдану үшін жүйеге кіру қажет."
            tone="ai"
          />
        </div>
      </DashboardLayout>
    );
  }

  if (!isTeacher) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <PageHeader
            eyebrow={
              <>
                <WandSparkles size={13} />
                AI құралдар
              </>
            }
            icon={<ClipboardList size={20} />}
            title={t('nav.ai_exams')}
            description="Бұл бөлім мұғалімдерге арналған."
          />

          <EmptyState
            title="Мұғалім рөлі қажет"
            text="AI емтихан жобаларын тек мұғалім аккаунтымен құруға және басқаруға болады."
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
              AI құралдар
            </>
          }
          icon={<ClipboardList size={20} />}
          title={t('nav.ai_exams')}
          description="AI көмегімен емтихан жобасын құрып, оны жариялау, архивтеу және басқару бөлімі."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/create-test">
                  <ClipboardList size={14} className="mr-2" />
                  Қолмен тест жасау
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
                Тізімді жаңарту
              </Button>

              <Button variant="outline" size="sm" onClick={handleReset} disabled={isBusy}>
                <RefreshCcw size={14} className="mr-2" />
                Форманы тазалау
              </Button>
            </div>
          }
        />

        <Card className="overflow-hidden">
          <CardContent className="grid gap-3 p-4 sm:p-5 md:grid-cols-4">
            <StatBox label="Жоба" value={draftExams.length} tone="warning" />
            <StatBox label="Жарияланған" value={publishedExams.length} tone="success" />
            <StatBox label="Архив" value={archivedExams.length} tone="muted" />
            <StatBox label="Соңғы жоба" value={latestDraft?.exam.title || '—'} tone="primary" />
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
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
                <Label htmlFor="title">Емтихан атауы</Label>
                <Input
                  id="title"
                  value={title}
                  maxLength={MAX_TITLE_CHARS}
                  onChange={(event) => {
                    setTitle(event.target.value.slice(0, MAX_TITLE_CHARS));
                    clearError();
                  }}
                  disabled={isCreating}
                  placeholder="Мысалы: Алгебра бойынша аралық емтихан"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Пән</Label>
                  <Input
                    id="subject"
                    value={subject}
                    maxLength={MAX_SUBJECT_CHARS}
                    onChange={(event) => {
                      setSubject(event.target.value.slice(0, MAX_SUBJECT_CHARS));
                      clearError();
                    }}
                    disabled={isCreating}
                    placeholder="Мысалы: Математика"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="topic">Тақырып</Label>
                  <Input
                    id="topic"
                    value={topic}
                    maxLength={MAX_TOPIC_CHARS}
                    onChange={(event) => {
                      setTopic(event.target.value.slice(0, MAX_TOPIC_CHARS));
                      clearError();
                    }}
                    disabled={isCreating}
                    placeholder="Мысалы: Квадрат теңдеулер"
                  />
                </div>

                <SelectField
                  id="difficulty"
                  label="Қиындық деңгейі"
                  value={difficulty}
                  onChange={(value) => setDifficulty(value as Difficulty)}
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
                  onChange={(value) => setQuestionCount(Number(value) || 10)}
                  disabled={isCreating}
                >
                  {[5, 10, 15, 20, 30].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="questionKind"
                  label="Сұрақ түрі"
                  value={questionKind}
                  onChange={(value) => setQuestionKind(value as AiQuestionKind)}
                  disabled={isCreating}
                >
                  <option value="mixed">Аралас</option>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="short_answer">Қысқа жауап</option>
                </SelectField>

                <SelectField
                  id="examMode"
                  label="Емтихан режимі"
                  value={examMode}
                  onChange={(value) => setExamMode(value as ExamMode)}
                  disabled={isCreating}
                >
                  <option value="">Жалпы</option>
                  <option value="unt">ҰБТ</option>
                </SelectField>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="durationMinutes">Уақыт (минут)</Label>
                  <Input
                    id="durationMinutes"
                    type="number"
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(event) => {
                      const next = Number(event.target.value) || 30;
                      setDurationMinutes(Math.max(5, Math.min(180, next)));
                    }}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <Label htmlFor="sourceText">Қосымша мазмұн немесе source text</Label>
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
                    setSourceText(event.target.value.slice(0, MAX_SOURCE_TEXT_CHARS));
                    clearError();
                  }}
                  disabled={isCreating}
                  placeholder="Қаласаңыз, AI-ға емтихан мазмұнын анықтау үшін теориялық мәтін немесе қысқаша контекст беріңіз..."
                  rows={7}
                />

                <p className="mt-2 text-[11px] text-muted-foreground">
                  {sourceText.length}/{MAX_SOURCE_TEXT_CHARS} символ
                </p>
              </div>

              <Button onClick={handleCreateDraft} disabled={!canCreateDraft}>
                {isCreating ? (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 size={16} className="mr-2" />
                )}
                {isCreating ? 'Жоба құрылып жатыр...' : 'AI емтихан жобасын құру'}
              </Button>

              {!accessToken ? (
                <p className="rounded-2xl border border-warning-muted bg-warning-soft px-3 py-2 text-xs leading-5 text-warning-foreground">
                  AI емтихан жобасын құру үшін белсенді авторизация сессиясы қажет.
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
                  <InfoCell label="Атауы" value={latestDraft.exam.title} />
                  <InfoCell label="Пән" value={latestDraft.exam.subject || '—'} />
                  <InfoCell label="Тақырып" value={latestDraft.exam.topic || '—'} />
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
                    value={latestDraft.exam.questionCount || latestDraft.questions?.length || 0}
                  />
                </div>
              ) : (
                <EmptyState
                  title="Жоба әлі жоқ"
                  text="Жаңа AI емтихан жобасы құрылғаннан кейін қысқаша ақпарат осы жерде көрінеді."
                  compact
                />
              )}
            </CardContent>
          </Card>
        </div>

        {isCreating || isLoadingList ? (
          <LoadingState
            text={
              isCreating
                ? 'AI емтихан жобасы дайындалып жатыр...'
                : 'AI емтихан тізімі жүктеліп жатыр...'
            }
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
                Құрылған сұрақтар preview
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 p-5">
              {latestDraft.questions?.length ? (
                latestDraft.questions.map((question, index) => (
                  <QuestionPreview key={`${question.id}-${index}`} question={question} index={index} />
                ))
              ) : (
                <EmptyState
                  title="Сұрақ preview бос"
                  text="Бұл жоба үшін backend сұрақ тізімін қайтармады немесе preview қолжетімсіз."
                  compact
                />
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
              <CardTitle className="text-base font-semibold">Жобалар</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 p-5 text-sm">
              {draftExams.length === 0 ? (
                <EmptyState
                  title="Жоба жоқ"
                  text="Жаңа AI емтихан жобасы құрылғаннан кейін ол осы жерде көрінеді."
                  compact
                />
              ) : (
                draftExams.map((item) => (
                  <ExamListItem
                    key={item.id}
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
              <CardTitle className="text-base font-semibold">
                Жарияланған емтихандар
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 p-5 text-sm">
              {publishedExams.length === 0 ? (
                <EmptyState
                  title="Жарияланған емтихан жоқ"
                  text="Жоба жарияланғаннан кейін осы жерде көрінеді."
                  compact
                />
              ) : (
                publishedExams.map((item) => (
                  <ExamListItem
                    key={item.id}
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
              <CardTitle className="text-base font-semibold">
                Архивтегі емтихандар
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 p-5 text-sm">
              {archivedExams.length === 0 ? (
                <EmptyState
                  title="Архивтегі емтихан жоқ"
                  text="Архивке жіберілген емтихандар осы жерде көрінеді."
                  compact
                />
              ) : (
                archivedExams.map((item) => (
                  <ExamListItem
                    key={item.id}
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
