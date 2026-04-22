import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import t from '@/lib/i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  createAiExam,
  listAiExams,
  updateAiExamStatus,
  type CreateAiExamResponse,
  type AiExamSummary,
} from '@/lib/ai-api';
import {
  ClipboardList,
  RefreshCcw,
  CheckCircle2,
  ArrowRight,
  Archive,
} from 'lucide-react';

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
      return 'Published';
    case 'archived':
      return 'Archived';
    default:
      return 'Draft';
  }
}

function examMeta(item: AiExamSummary) {
  return `${item.subject || '—'} · ${item.questionCount || 0} сұрақ · ${item.durationMinutes || '—'} мин`;
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
    () => !!accessToken && !isCreating && title.trim().length > 0,
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
        error instanceof Error ? error.message : 'AI exam тізімін жүктеу мүмкін болмады.';
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
      const message = 'AI exam draft құру үшін белсенді сессия қажет.';
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
        title: 'Draft exam дайын',
        description: `${response.exam.questionCount || response.questions?.length || 0} сұрақ құрылды.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI exam draft құру мүмкін болмады.';

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
        description: `Емтихан статусы: ${response.exam.status || status}`,
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('nav.ai_exams')}</h2>
            <p className="text-sm text-muted-foreground">
              AI көмегімен емтихан draft құрып, оларды жариялау, архивтеу және басқару бөлімі.
            </p>
          </div>

          <div className="flex gap-2">
            <Link to="/create-test">
              <Button variant="outline" size="sm">
                <ClipboardList size={14} className="mr-2" />
                Қолмен тест жасау
              </Button>
            </Link>

            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCcw size={14} className="mr-2" />
              Тазалау
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Draft</p>
              <p className="mt-1 text-sm font-medium">{draftExams.length}</p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Published</p>
              <p className="mt-1 text-sm font-medium">{publishedExams.length}</p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Archived</p>
              <p className="mt-1 text-sm font-medium">{archivedExams.length}</p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Соңғы draft</p>
              <p className="mt-1 text-sm font-medium">{latestDraft?.exam.title || '—'}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Exam draft параметрлері</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Емтихан атауы</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
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
                    onChange={(e) => {
                      setSubject(e.target.value);
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
                    onChange={(e) => {
                      setTopic(e.target.value);
                      clearError();
                    }}
                    placeholder="Мысалы: Квадрат теңдеулер"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="difficulty">Қиындық деңгейі</Label>
                  <select
                    id="difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="easy">Оңай</option>
                    <option value="medium">Орташа</option>
                    <option value="hard">Қиын</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="questionCount">Сұрақ саны</Label>
                  <select
                    id="questionCount"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {[5, 10, 15, 20].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="durationMinutes">Уақыт (минут)</Label>
                  <Input
                    id="durationMinutes"
                    type="number"
                    min={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sourceText">Қосымша мазмұн немесе source text</Label>
                <Textarea
                  id="sourceText"
                  value={sourceText}
                  onChange={(e) => {
                    setSourceText(e.target.value);
                    clearError();
                  }}
                  placeholder="Қаласаңыз, AI-ға емтихан мазмұнын анықтау үшін теориялық мәтін немесе қысқаша контекст беріңіз..."
                  rows={7}
                />
              </div>

              <Button onClick={handleCreateDraft} disabled={!canCreateDraft}>
                <CheckCircle2 size={16} className="mr-2" />
                {isCreating ? 'Draft құрылып жатыр...' : 'AI exam draft құру'}
              </Button>

              {!accessToken ? (
                <p className="text-xs text-muted-foreground">
                  AI exam draft құру үшін белсенді авторизация сессиясы қажет.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Соңғы draft</CardTitle>
            </CardHeader>
            <CardContent>
              {latestDraft ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Атауы</p>
                    <p className="mt-1 text-sm font-medium">{latestDraft.exam.title}</p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Пән</p>
                    <p className="mt-1 text-sm font-medium">{latestDraft.exam.subject || '—'}</p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Тақырып</p>
                    <p className="mt-1 text-sm font-medium">{latestDraft.exam.topic || '—'}</p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Статус</p>
                    <p className="mt-1 text-sm font-medium">
                      {getStatusLabel(latestDraft.exam.status)}
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Draft әлі жоқ"
                  text="Жаңа AI exam draft құрылғаннан кейін қысқаша ақпарат осы жерде көрінеді."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {isCreating || isLoadingList ? (
          <LoadingState
            text={
              isCreating
                ? 'AI exam draft дайындалып жатыр...'
                : 'AI exam тізімі жүктеліп жатыр...'
            }
          />
        ) : null}

        {errorText ? <ErrorState text={errorText} /> : null}

        {!isCreating && !errorText && latestDraft ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Generated question preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latestDraft.questions?.length ? (
                latestDraft.questions.map((question, index) => (
                  <div key={question.id} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Сұрақ {index + 1}</p>
                      <span className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
                        {question.type === 'multiple_choice' ? 'Multiple choice' : 'Қысқа жауап'}
                      </span>
                    </div>

                    <p className="text-sm leading-7">{question.question}</p>

                    {question.options?.length ? (
                      <div className="mt-3 space-y-2">
                        {question.options.map((option) => (
                          <div
                            key={option.id}
                            className="rounded-md border px-3 py-2 text-sm text-muted-foreground"
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
                  text="Бұл draft үшін backend сұрақ тізімін қайтармады немесе preview қолжетімсіз."
                />
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Draft exams</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {draftExams.length === 0 ? (
                <EmptyState
                  title="Draft жоқ"
                  text="Жаңа AI exam draft құрылғаннан кейін ол осы жерде көрінеді."
                />
              ) : (
                draftExams.map((item) => (
                  <div key={item.id} className="rounded-lg border p-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{examMeta(item)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatus(item.id, 'published')}
                        disabled={statusUpdatingId === item.id || !accessToken}
                      >
                        <ArrowRight size={14} className="mr-2" />
                        Жариялау
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus(item.id, 'archived')}
                        disabled={statusUpdatingId === item.id || !accessToken}
                      >
                        <Archive size={14} className="mr-2" />
                        Архивке жіберу
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Published exams</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {publishedExams.length === 0 ? (
                <EmptyState
                  title="Published емтихан жоқ"
                  text="Draft exam жарияланғаннан кейін осы жерде көрінеді."
                />
              ) : (
                publishedExams.map((item) => (
                  <div key={item.id} className="rounded-lg border p-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{examMeta(item)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus(item.id, 'archived')}
                        disabled={statusUpdatingId === item.id || !accessToken}
                      >
                        <Archive size={14} className="mr-2" />
                        Архивке жіберу
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Archived exams</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {archivedExams.length === 0 ? (
                <EmptyState
                  title="Archived емтихан жоқ"
                  text="Архивке жіберілген емтихандар осы жерде көрінеді."
                />
              ) : (
                archivedExams.map((item) => (
                  <div key={item.id} className="rounded-lg border p-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.subject || '—'} · {item.questionCount || 0} сұрақ
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus(item.id, 'draft')}
                        disabled={statusUpdatingId === item.id || !accessToken}
                      >
                        Draft-қа қайтару
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatus(item.id, 'published')}
                        disabled={statusUpdatingId === item.id || !accessToken}
                      >
                        Қайта жариялау
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}