import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  ListChecks,
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
  type AiExamSummary,
  type CreateAiExamResponse,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';

type Difficulty = 'easy' | 'medium' | 'hard';
type ExamStatus = 'draft' | 'published' | 'archived';

function upsertExam(list: AiExamSummary[], incoming: AiExamSummary): AiExamSummary[] {
  const exists = list.some((item) => item.id === incoming.id);

  if (!exists) {
    return [incoming, ...list];
  }

  return list.map((item) => (item.id === incoming.id ? { ...item, ...incoming } : item));
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

function examMeta(item: AiExamSummary) {
  return `${item.subject || 'Пән көрсетілмеген'} · ${item.questionCount || 0} сұрақ · ${
    item.durationMinutes || '—'
  } мин`;
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-input bg-card px-4 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
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
  value: React.ReactNode;
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
              disabled={updating || !accessToken}
            >
              <ArrowRight size={14} className="mr-2" />
              Жариялау
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(item.id, 'archived')}
              disabled={updating || !accessToken}
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
            disabled={updating || !accessToken}
          >
            <Archive size={14} className="mr-2" />
            Архивке жіберу
          </Button>
        ) : null}

        {mode === 'archived' ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(item.id, 'draft')}
              disabled={updating || !accessToken}
            >
              Жобаға қайтару
            </Button>

            <Button
              size="sm"
              onClick={() => onUpdateStatus(item.id, 'published')}
              disabled={updating || !accessToken}
            >
              Қайта жариялау
            </Button>
          </>
        ) : null}
      </div>
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

  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const [errorText, setErrorText] = useState('');
  const [latestDraft, setLatestDraft] = useState<CreateAiExamResponse | null>(null);
  const [exams, setExams] = useState<AiExamSummary[]>([]);

  const accessToken = session?.access_token;

  const draftExams = useMemo(
    () => exams.filter((item) => item.status === 'draft'),
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

  const canCreateDraft = useMemo(
    () => Boolean(accessToken && !isCreating && title.trim().length > 0),
    [accessToken, isCreating, title]
  );

  const clearError = () => {
    if (errorText) {
      setErrorText('');
    }
  };

  const loadExams = useCallback(async () => {
    if (!accessToken) {
      setExams([]);
      setLatestDraft(null);
      setErrorText(user ? 'AI API үшін session access token табылмады.' : '');
      return;
    }

    setIsLoadingList(true);
    setErrorText('');

    try {
      const response = await listAiExams({
        accessToken,
      });

      setExams(response.exams);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'AI емтихан тізімін жүктеу мүмкін болмады.';
      setErrorText(message);
    } finally {
      setIsLoadingList(false);
    }
  }, [accessToken, user]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const handleCreateDraft = async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setErrorText('Емтихан атауын енгізіңіз.');
      return;
    }

    if (!accessToken) {
      const message = 'AI емтихан жобасын құру үшін белсенді сессия қажет.';
      setErrorText(message);
      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    setErrorText('');

    try {
      const response = await createAiExam(
        {
          title: trimmedTitle,
          sourceText: sourceText.trim() || undefined,
          subject: subject.trim() || undefined,
          topic: topic.trim() || undefined,
          difficulty,
          questionCount,
          durationMinutes,
        },
        {
          accessToken,
        }
      );

      setLatestDraft(response);
      setExams((prev) => upsertExam(prev, response.exam));

      toast({
        title: 'Емтихан жобасы дайын',
        description: `${response.exam.questionCount || response.questions?.length || 0} сұрақ құрылды.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'AI емтихан жобасын құру мүмкін болмады.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateStatus = async (examId: string, status: ExamStatus) => {
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

    setStatusUpdatingId(examId);
    setErrorText('');

    try {
      const response = await updateAiExamStatus(examId, status, {
        accessToken,
      });

      setExams((prev) =>
        prev.map((item) => (item.id === examId ? { ...item, ...response.exam } : item))
      );

      if (latestDraft?.exam.id === examId) {
        setLatestDraft((prev) =>
          prev ? { ...prev, exam: { ...prev.exam, ...response.exam } } : prev
        );
      }

      toast({
        title: 'Статус жаңартылды',
        description: `Емтихан статусы: ${getStatusLabel(response.exam.status || status)}`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Емтихан статусын жаңарту мүмкін болмады.';
      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleReset = () => {
    setTitle('');
    setSubject('');
    setTopic('');
    setSourceText('');
    setDifficulty('medium');
    setQuestionCount(10);
    setDurationMinutes(30);
    setErrorText('');
    setLatestDraft(null);
  };

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

              <Button variant="outline" size="sm" onClick={handleReset}>
                <RefreshCcw size={14} className="mr-2" />
                Тазалау
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
                  onChange={(event) => {
                    setTitle(event.target.value);
                    clearError();
                  }}
                  placeholder="Мысалы: Алгебра бойынша аралық емтихан"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Пән</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(event) => {
                      setSubject(event.target.value);
                      clearError();
                    }}
                    placeholder="Мысалы: Математика"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="topic">Тақырып</Label>
                  <Input
                    id="topic"
                    value={topic}
                    onChange={(event) => {
                      setTopic(event.target.value);
                      clearError();
                    }}
                    placeholder="Мысалы: Квадрат теңдеулер"
                  />
                </div>

                <SelectField
                  id="difficulty"
                  label="Қиындық деңгейі"
                  value={difficulty}
                  onChange={(value) => setDifficulty(value as Difficulty)}
                >
                  <option value="easy">Оңай</option>
                  <option value="medium">Орташа</option>
                  <option value="hard">Қиын</option>
                </SelectField>

                <SelectField
                  id="questionCount"
                  label="Сұрақ саны"
                  value={questionCount}
                  onChange={(value) => setQuestionCount(Number(value))}
                >
                  {[5, 10, 15, 20].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectField>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="durationMinutes">Уақыт (минут)</Label>
                  <Input
                    id="durationMinutes"
                    type="number"
                    min={5}
                    value={durationMinutes}
                    onChange={(event) =>
                      setDurationMinutes(Number(event.target.value) || 30)
                    }
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Label htmlFor="sourceText">Қосымша мазмұн немесе source text</Label>
                  <StatusBadge tone="muted">{getDifficultyLabel(difficulty)}</StatusBadge>
                </div>

                <Textarea
                  id="sourceText"
                  value={sourceText}
                  onChange={(event) => {
                    setSourceText(event.target.value);
                    clearError();
                  }}
                  placeholder="Қаласаңыз, AI-ға емтихан мазмұнын анықтау үшін теориялық мәтін немесе қысқаша контекст беріңіз..."
                  rows={7}
                />
              </div>

              <Button onClick={handleCreateDraft} disabled={!canCreateDraft}>
                <CheckCircle2 size={16} className="mr-2" />
                {isCreating ? 'Жоба құрылып жатыр...' : 'AI емтихан жобасын құру'}
              </Button>

              {!accessToken ? (
                <p className="rounded-2xl border border-warning-muted bg-warning-soft px-3 py-2 text-xs leading-5 text-warning-foreground">
                  AI емтихан жобасын құру үшін белсенді авторизация сессиясы қажет.
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
                  <InfoCell
                    label="Статус"
                    value={
                      <StatusBadge tone={getStatusTone(latestDraft.exam.status)}>
                        {getStatusLabel(latestDraft.exam.status)}
                      </StatusBadge>
                    }
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
                  <div
                    key={question.id}
                    className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        Сұрақ {index + 1}
                      </p>
                      <StatusBadge tone="muted">
                        {question.type === 'multiple_choice'
                          ? 'Таңдау сұрағы'
                          : 'Қысқа жауап'}
                      </StatusBadge>
                    </div>

                    <p className="text-sm leading-7 text-foreground">
                      {question.question}
                    </p>

                    {question.options?.length ? (
                      <div className="mt-3 space-y-2">
                        {question.options.map((option) => (
                          <div
                            key={option.id}
                            className="rounded-2xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
                          >
                            {option.text}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
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