import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { listPublishedAiExams, type AiExamSummary } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';

import {
  AlertTriangle,
  BookOpen,
  ClipboardList,
  Clock3,
  Hash,
  Link2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const MAX_MANUAL_EXAM_INPUT_CHARS = 240;
const MAX_EXAMS_TO_RENDER = 100;
const AI_EXAMS_TIMEOUT_MS = 90_000;

function cleanText(value: unknown, limit?: number) {
  const text = String(value ?? '')
    .replace(/\x00/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return typeof limit === 'number' ? text.slice(0, limit) : text;
}

function normalizeDate(value?: string | null) {
  if (!value) return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return cleanText(value, 80) || '—';

  return parsed.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractExamIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    const queryExamId = url.searchParams.get('examId') || url.searchParams.get('exam_id');
    if (queryExamId) return queryExamId;

    const segments = url.pathname.split('/').filter(Boolean);
    const aiExamIndex = segments.findIndex((segment) => segment.toLowerCase() === 'ai-exam');

    if (aiExamIndex >= 0 && segments[aiExamIndex + 1]) {
      return decodeURIComponent(segments[aiExamIndex + 1]);
    }

    return segments.at(-1) || '';
  } catch {
    return '';
  }
}

function parseExamId(raw: string): string {
  const value = cleanText(raw, MAX_MANUAL_EXAM_INPUT_CHARS);
  if (!value) return '';

  const fromUrl = /^https?:\/\//i.test(value) ? extractExamIdFromUrl(value) : value;
  const withoutFragment = fromUrl.split('#')[0]?.split('?')[0] || '';
  const normalized = cleanText(decodeURIComponent(withoutFragment), 160);

  if (!normalized) return '';

  const pathMatch = normalized.match(/(?:^|\/)ai-exam\/([^/?#\s]+)/i);
  if (pathMatch?.[1]) {
    return cleanText(pathMatch[1], 160);
  }

  return normalized.replace(/^\/+|\/+$/g, '');
}

function isSafeExamId(value: string) {
  if (!value || value.length > 160) return false;

  /**
   * Backend-generated ids are usually UUID-like or draft-<hex>.
   * Keep the frontend path-safe and reject slash/query/control characters.
   */
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function sortPublishedExams(exams: AiExamSummary[]) {
  return [...exams].sort((a, b) => {
    const aDate = new Date(a.publishedAt || a.createdAt || 0).getTime();
    const bDate = new Date(b.publishedAt || b.createdAt || 0).getTime();
    return bDate - aDate;
  });
}

function normalizePublishedExamList(exams: AiExamSummary[]) {
  const seen = new Set<string>();
  const normalized: AiExamSummary[] = [];

  for (const exam of exams) {
    const id = cleanText(exam.id, 160);
    if (!id || seen.has(id)) continue;
    if (exam.status && exam.status !== 'published') continue;

    seen.add(id);
    normalized.push({
      ...exam,
      id,
      title: cleanText(exam.title, 220) || 'AI емтихан',
      subject: exam.subject === null ? null : cleanText(exam.subject, 120) || null,
      topic: exam.topic === null ? null : cleanText(exam.topic, 200) || null,
      status: 'published',
      questionCount: Number.isFinite(Number(exam.questionCount))
        ? Math.max(0, Number(exam.questionCount))
        : 0,
      durationMinutes: Number.isFinite(Number(exam.durationMinutes))
        ? Math.max(0, Number(exam.durationMinutes))
        : null,
    });
  }

  return sortPublishedExams(normalized).slice(0, MAX_EXAMS_TO_RENDER);
}

function getErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'AI емтихандар тізімін жүктеу мүмкін болмады.';
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof ClipboardList;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AiStudentExamsPage() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();

  const accessToken = session?.access_token;
  const isStudent = user?.role === 'student';

  const [exams, setExams] = useState<AiExamSummary[]>([]);
  const [manualExamInput, setManualExamInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestCounterRef = useRef(0);

  const loadPublishedExams = useCallback(async () => {
    abortControllerRef.current?.abort();

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;

    if (!user) {
      setExams([]);
      setErrorText('');
      setIsLoading(false);
      return;
    }

    if (!isStudent) {
      setExams([]);
      setErrorText('');
      setIsLoading(false);
      return;
    }

    if (!accessToken) {
      setExams([]);
      setErrorText('AI емтихандарын жүктеу үшін белсенді session access token қажет.');
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setErrorText('');

    try {
      const response = await listPublishedAiExams({
        accessToken,
        signal: abortController.signal,
        timeoutMs: AI_EXAMS_TIMEOUT_MS,
      });

      if (requestCounterRef.current !== requestId) return;

      setExams(normalizePublishedExamList(response.exams));
    } catch (error) {
      if (requestCounterRef.current !== requestId) return;

      const message = getErrorMessage(error);
      if (message) {
        setErrorText(message);
      }
    } finally {
      if (requestCounterRef.current === requestId) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [accessToken, isStudent, user]);

  useEffect(() => {
    void loadPublishedExams();
  }, [loadPublishedExams]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      requestCounterRef.current += 1;
    };
  }, []);

  const publishedCount = exams.length;
  const hasExams = exams.length > 0;
  const parsedManualExamId = parseExamId(manualExamInput);
  const canOpenManual = Boolean(isStudent && accessToken && isSafeExamId(parsedManualExamId));
  const canRefresh = Boolean(isStudent && accessToken && !isLoading);

  const totalQuestions = useMemo(
    () => exams.reduce((sum, exam) => sum + Number(exam.questionCount || 0), 0),
    [exams]
  );

  const handleManualInputChange = (value: string) => {
    setManualExamInput(value.replace(/\x00/g, ' ').slice(0, MAX_MANUAL_EXAM_INPUT_CHARS));

    if (errorText) {
      setErrorText('');
    }
  };

  const handleOpenExam = (examId: string) => {
    if (!user) {
      toast({
        title: 'Авторизация қажет',
        description: 'AI емтиханды ашу үшін жүйеге кіру керек.',
        variant: 'destructive',
      });
      return;
    }

    if (!isStudent) {
      toast({
        title: 'Рұқсат жоқ',
        description: 'AI емтиханды тек оқушы аккаунты аша алады.',
        variant: 'destructive',
      });
      return;
    }

    if (!accessToken) {
      toast({
        title: 'Session қажет',
        description: 'AI емтиханды ашу үшін белсенді session access token қажет.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedExamId = parseExamId(examId);

    if (!isSafeExamId(normalizedExamId)) {
      toast({
        title: 'Exam ID жарамсыз',
        description: 'Жарамды exam ID немесе толық /ai-exam/... сілтемесін енгізіңіз.',
        variant: 'destructive',
      });
      return;
    }

    navigate(`/ai-exam/${encodeURIComponent(normalizedExamId)}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              AI құралдар
            </>
          }
          icon={<ClipboardList size={20} />}
          title="AI емтихандар"
          description="Жарияланған AI емтихандарды ашу немесе мұғалім жіберген exam ID арқылы тікелей кіру бөлімі."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/tests')}>
                <ClipboardList size={14} className="mr-2" />
                Тесттерге қайту
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadPublishedExams()}
                disabled={!canRefresh}
              >
                <RefreshCw size={14} className="mr-2" />
                {isLoading ? 'Жүктелуде...' : 'Жаңарту'}
              </Button>
            </div>
          }
        />

        {!user ? (
          <EmptyState
            title="Авторизация қажет"
            text="AI емтихандарды көру және тапсыру үшін оқушы аккаунтымен жүйеге кіріңіз."
            tone="ai"
          />
        ) : null}

        {user && !isStudent ? (
          <EmptyState
            title="Бұл бет оқушыға арналған"
            text="Жарияланған AI емтихандарды тапсыру бөлімі тек student role үшін ашық. Мұғалім емтихан құру үшін AI Exams бетін қолданады."
            tone="ai"
          />
        ) : null}

        {user && isStudent ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                label="Жарияланған емтихандар"
                value={publishedCount}
                icon={ClipboardList}
              />
              <StatCard label="Жалпы сұрақ саны" value={totalQuestions} icon={Hash} />
              <StatCard label="Кіру жолы" value="Тізім / exam ID" icon={Link2} />
            </div>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                    <Link2 size={16} />
                  </span>
                  Exam ID немесе сілтеме арқылы кіру
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-3 md:flex-row">
                  <div className="flex-1">
                    <Input
                      value={manualExamInput}
                      onChange={(event) => handleManualInputChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleOpenExam(manualExamInput);
                        }
                      }}
                      placeholder="examId немесе толық /ai-exam/... сілтемесін енгізіңіз..."
                      disabled={!accessToken || isLoading}
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => handleOpenExam(manualExamInput)}
                    disabled={!canOpenManual}
                  >
                    <PlayCircle size={16} className="mr-2" />
                    Емтиханды ашу
                  </Button>
                </div>

                <div className="rounded-2xl border border-border bg-surface-soft/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck size={13} className="mr-1 inline text-primary" />
                  Тікелей сілтеме енгізсеңіз де, backend емтиханның жарияланғанын және сіздің session-ыңызды тексереді.
                </div>

                {manualExamInput && !isSafeExamId(parsedManualExamId) ? (
                  <div className="rounded-2xl border border-warning-muted bg-warning-soft px-3 py-2 text-xs leading-5 text-warning-foreground">
                    <AlertTriangle size={13} className="mr-1 inline" />
                    Exam ID форматында slash, query немесе бос орын болмауы керек. Толық сілтеме болса, /ai-exam/ бөлігіндегі ID автоматты алынады.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {isLoading ? <LoadingState text="AI емтихандар жүктеліп жатыр..." /> : null}
            {errorText ? <ErrorState text={errorText} /> : null}

            {!isLoading && !errorText && !hasExams ? (
              <EmptyState
                title="Жарияланған емтихандар табылмады"
                text="Қазір тізімде қолжетімді published AI exam жоқ. Мұғалім жіберген exam ID болса, жоғарыдағы өріс арқылы тікелей ашуға болады."
                tone="ai"
              />
            ) : null}

            {!isLoading && !errorText && hasExams ? (
              <div className="space-y-4">
                {exams.map((exam) => (
                  <Card key={exam.id} className="overflow-hidden">
                    <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <CardTitle className="line-clamp-2 text-base font-semibold">
                            {exam.title}
                          </CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Жарияланған уақыты: {normalizeDate(exam.publishedAt || exam.createdAt)}
                          </p>
                        </div>

                        <StatusBadge tone="success">Жарияланған</StatusBadge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <BookOpen size={13} />
                            Пән
                          </div>
                          <p className="line-clamp-2 text-sm font-medium text-foreground">
                            {exam.subject || '—'}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <ClipboardList size={13} />
                            Тақырып
                          </div>
                          <p className="line-clamp-2 text-sm font-medium text-foreground">
                            {exam.topic || '—'}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Hash size={13} />
                            Сұрақ саны
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {exam.questionCount || 0}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock3 size={13} />
                            Уақыты
                          </div>
                          <p className="text-sm font-medium text-foreground">
                            {exam.durationMinutes ? `${exam.durationMinutes} мин` : 'Шектелмеген'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <p className="text-xs leading-5 text-muted-foreground">
                          Емтихан ашылғанда сұрақтар жеке session бетінде жүктеледі. Нәтиже тек сіздің аккаунтқа сақталады.
                        </p>

                        <Button type="button" onClick={() => handleOpenExam(exam.id)}>
                          <PlayCircle size={16} className="mr-2" />
                          Емтиханды бастау
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
