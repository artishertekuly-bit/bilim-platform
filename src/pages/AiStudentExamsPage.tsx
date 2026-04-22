import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';

import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { listPublishedAiExams, type AiExamSummary } from '@/lib/ai-api';

import {
  ClipboardList,
  PlayCircle,
  Link2,
  Clock3,
  BookOpen,
  Hash,
  RefreshCw,
} from 'lucide-react';

function normalizeDate(value?: string | null) {
  if (!value) return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}

function parseExamId(raw: string): string {
  const value = raw.trim();
  if (!value) return '';

  const match = value.match(/\/ai-exam\/([^/?#]+)/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  return value;
}

function sortPublishedExams(exams: AiExamSummary[]) {
  return [...exams].sort((a, b) => {
    const aDate = new Date(a.publishedAt || a.createdAt || 0).getTime();
    const bDate = new Date(b.publishedAt || b.createdAt || 0).getTime();
    return bDate - aDate;
  });
}

export default function AiStudentExamsPage() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();

  const accessToken = session?.access_token;

  const [exams, setExams] = useState<AiExamSummary[]>([]);
  const [manualExamInput, setManualExamInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const loadPublishedExams = useCallback(async () => {
    if (!accessToken) {
      setExams([]);
      setErrorText(
        user ? 'AI емтихандарын жүктеу үшін белсенді сессия қажет.' : 'Авторизация қажет.'
      );
      return;
    }

    setIsLoading(true);
    setErrorText('');

    try {
      const response = await listPublishedAiExams({
        accessToken,
      });

      setExams(sortPublishedExams(response.exams));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'AI емтихандар тізімін жүктеу мүмкін болмады.';

      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, user]);

  useEffect(() => {
    void loadPublishedExams();
  }, [loadPublishedExams]);

  const publishedCount = exams.length;
  const hasExams = exams.length > 0;
  const parsedManualExamId = parseExamId(manualExamInput);
  const canOpenManual = parsedManualExamId.length > 0;
  const canRefresh = !!accessToken && !isLoading;

  const totalQuestions = useMemo(
    () => exams.reduce((sum, exam) => sum + Number(exam.questionCount || 0), 0),
    [exams]
  );

  const handleOpenExam = (examId: string) => {
    const normalizedExamId = parseExamId(examId);

    if (!normalizedExamId) {
      toast({
        title: 'Exam ID жоқ',
        description: 'Алдымен жарамды exam ID немесе толық сілтеме енгізіңіз.',
        variant: 'destructive',
      });
      return;
    }

    navigate(`/ai-exam/${normalizedExamId}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">AI емтихандар</h2>
            <p className="text-sm text-muted-foreground">
              Жарияланған емтихандарды ашу немесе мұғалім жіберген exam ID арқылы тікелей кіру бөлімі.
            </p>
          </div>

          <div className="flex gap-2">
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
              Жаңарту
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Жарияланған емтихандар</p>
              <p className="mt-1 text-2xl font-semibold">{publishedCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Жалпы сұрақ саны</p>
              <p className="mt-1 text-2xl font-semibold">{totalQuestions}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Кіру жолы</p>
              <p className="mt-1 text-sm font-medium">Тізімнен немесе exam ID арқылы</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Exam ID немесе сілтеме арқылы кіру
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex-1">
                <Input
                  value={manualExamInput}
                  onChange={(e) => {
                    setManualExamInput(e.target.value);
                    if (errorText) setErrorText('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleOpenExam(manualExamInput);
                    }
                  }}
                  placeholder="examId немесе толық сілтеме енгізіңіз..."
                />
              </div>

              <Button onClick={() => handleOpenExam(manualExamInput)} disabled={!canOpenManual}>
                <Link2 size={16} className="mr-2" />
                Емтиханды ашу
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Егер жарияланған емтихан тізімі бос тұрса, мұғалім жіберген тікелей сілтеме не exam ID арқылы кіруге болады.
            </p>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState text="AI емтихандар жүктеліп жатыр..." /> : null}
        {errorText ? <ErrorState text={errorText} /> : null}

        {!isLoading && !errorText && !hasExams ? (
          <EmptyState
            title="Жарияланған емтихандар табылмады"
            text="Қазір тізімде қолжетімді published AI exam жоқ. Мұғалім жіберген exam ID болса, жоғарыдағы өріс арқылы тікелей ашуға болады."
          />
        ) : null}

        {!isLoading && !errorText && hasExams ? (
          <div className="space-y-4">
            {exams.map((exam) => (
              <Card key={exam.id}>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">{exam.title}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <BookOpen size={13} />
                        Пән
                      </div>
                      <p className="text-sm font-medium">{exam.subject || '—'}</p>
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <ClipboardList size={13} />
                        Тақырып
                      </div>
                      <p className="text-sm font-medium">{exam.topic || '—'}</p>
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Hash size={13} />
                        Сұрақ саны
                      </div>
                      <p className="text-sm font-medium">{exam.questionCount || 0}</p>
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 size={13} />
                        Уақыты
                      </div>
                      <p className="text-sm font-medium">
                        {exam.durationMinutes ? `${exam.durationMinutes} мин` : 'Шектелмеген'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-xs text-muted-foreground">
                      Жарияланған уақыты: {normalizeDate(exam.publishedAt || exam.createdAt)}
                    </div>

                    <Button onClick={() => handleOpenExam(exam.id)}>
                      <PlayCircle size={16} className="mr-2" />
                      Емтиханды бастау
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}