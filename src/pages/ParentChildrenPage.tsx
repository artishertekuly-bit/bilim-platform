import { FormEvent, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  useCancelParentLinkRequestMutation,
  useParentDashboard,
  useParentLinkRequests,
  useRequestParentLinkMutation,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import ProgressBar from '@/components/ProgressBar';
import UserAvatar from '@/components/UserAvatar';

type ParentViewMode = 'children' | 'progress' | 'tests' | 'achievements';

type ParentLinkRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled';

type ParentLinkRequestItem = {
  id: string;
  childEmail: string;
  childName?: string | null;
  status: ParentLinkRequestStatus;
  requestedAt?: string | null;
  respondedAt?: string | null;
  expiresAt?: string | null;
};

function getViewMode(pathname: string): ParentViewMode {
  if (pathname.startsWith('/child-progress')) return 'progress';
  if (pathname.startsWith('/child-tests')) return 'tests';
  if (pathname.startsWith('/child-achievements')) return 'achievements';
  return 'children';
}

const pageCopy: Record<
  ParentViewMode,
  {
    title: string;
    description: string;
    loadingText: string;
    emptyTitle: string;
    emptyText: string;
  }
> = {
  children: {
    title: 'Балалар',
    description:
      'Осы бөлімде байланыстырылған балалар, жіберілген сұраныстар және жалпы оқу көрсеткіштері көрінеді.',
    loadingText: 'Балалар туралы мәлімет жүктеліп жатыр...',
    emptyTitle: 'Байланыстырылған балалар әзірге жоқ',
    emptyText:
      'Алдымен баланы email арқылы байланыстырып, оның растауын күтіңіз.',
  },
  progress: {
    title: 'Бала үлгерімі',
    description:
      'Бұл бөлімде балалардың оқу қарқыны, аяқталған сабақтары және жалпы үлгерім көрсеткіштері жиналады.',
    loadingText: 'Үлгерім деректері жүктеліп жатыр...',
    emptyTitle: 'Үлгерім туралы мәлімет әлі жоқ',
    emptyText:
      'Бала байланыстырылып, оқу белсенділігі пайда болғаннан кейін үлгерім осы жерде көрсетіледі.',
  },
  tests: {
    title: 'Бала тесттері',
    description:
      'Бұл бөлімде балалардың соңғы тест нәтижелері мен пәндер бойынша алған ұпайлары көрсетіледі.',
    loadingText: 'Тест нәтижелері жүктеліп жатыр...',
    emptyTitle: 'Тест нәтижелері әлі жоқ',
    emptyText: 'Бала тест тапсырғаннан кейін нәтижелер осы жерде көрінеді.',
  },
  achievements: {
    title: 'Бала жетістіктері',
    description:
      'Бұл бөлімде балалардың оқу белсенділігі, күшті пәндері және жалпы алға жылжу көрсеткіштері көрсетіледі.',
    loadingText: 'Жетістік көрсеткіштері жүктеліп жатыр...',
    emptyTitle: 'Жетістік көрсеткіштері әлі қалыптаспаған',
    emptyText:
      'Оқу белсенділігі артқан сайын бұл бөлімде баланың алға жылжуы көрінеді.',
  },
};

function getProgressValue(completedLessons: number, avgScore: number) {
  const lessonsPart = Math.min(60, completedLessons * 8);
  const scorePart = Math.min(40, Math.round(avgScore * 0.4));
  return Math.min(100, lessonsPart + scorePart);
}

function getLearningStatus(avgScore: number, completedLessons: number) {
  if (avgScore >= 80 && completedLessons >= 5) {
    return 'Үлгерімі тұрақты';
  }

  if (avgScore >= 60 || completedLessons >= 3) {
    return 'Жақсы қарқын көрсетіп келеді';
  }

  return 'Қосымша назар қажет';
}

function safeText(value: string | null | undefined, fallback = 'Әзірге анықталмаған') {
  return value?.trim() || fallback;
}

function formatAttemptScore(score: number | null | undefined) {
  return score === null || score === undefined ? '—' : `${score}%`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('kk-KZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getRequestStatusMeta(status: ParentLinkRequestStatus) {
  switch (status) {
    case 'pending':
      return {
        label: 'Күтуде',
        className:
          'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
      };
    case 'accepted':
      return {
        label: 'Расталды',
        className:
          'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
      };
    case 'declined':
      return {
        label: 'Қабылданбады',
        className:
          'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
      };
    case 'expired':
      return {
        label: 'Уақыты өтті',
        className:
          'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300',
      };
    case 'cancelled':
      return {
        label: 'Тоқтатылды',
        className:
          'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300',
      };
    default:
      return {
        label: 'Белгісіз',
        className:
          'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300',
      };
  }
}

function getSummaryCards(
  mode: ParentViewMode,
  summary: {
    totalChildren: number;
    totalCourses: number;
    totalTests: number;
    totalLessons: number;
    totalScore: number;
  },
  averageScore: number,
  pendingRequestsCount: number
) {
  if (mode === 'children') {
    return [
      { label: 'Байланысқан балалар', value: summary.totalChildren },
      { label: 'Күтудегі сұраныстар', value: pendingRequestsCount },
      { label: 'Барлық курстар', value: summary.totalCourses },
      { label: 'Орташа нәтиже', value: `${averageScore}%` },
    ];
  }

  if (mode === 'progress') {
    return [
      { label: 'Байланысқан балалар', value: summary.totalChildren },
      { label: 'Аяқталған сабақтар', value: summary.totalLessons },
      { label: 'Орташа нәтиже', value: `${averageScore}%` },
      { label: 'Жалпы курстар', value: summary.totalCourses },
    ];
  }

  if (mode === 'tests') {
    return [
      { label: 'Байланысқан балалар', value: summary.totalChildren },
      { label: 'Барлық тесттер', value: summary.totalTests },
      { label: 'Орташа нәтиже', value: `${averageScore}%` },
      { label: 'Барлық курстар', value: summary.totalCourses },
    ];
  }

  return [
    { label: 'Байланысқан балалар', value: summary.totalChildren },
    { label: 'Орташа нәтиже', value: `${averageScore}%` },
    { label: 'Аяқталған сабақтар', value: summary.totalLessons },
    { label: 'Барлық тесттер', value: summary.totalTests },
  ];
}

export default function ParentChildrenPage() {
  const { user } = useAuth();
  const location = useLocation();
  const mode = getViewMode(location.pathname);
  const copy = pageCopy[mode];

  const [childEmail, setChildEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const parentId = user?.id || '';
  const isEnabled = !!user?.id;

  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    error: dashboardError,
  } = useParentDashboard(parentId, isEnabled);

  const {
    data: requestsData,
    isLoading: isRequestsLoading,
    error: requestsError,
  } = useParentLinkRequests(parentId, isEnabled);

  const requestParentLinkMutation = useRequestParentLinkMutation(parentId);
  const cancelParentLinkRequestMutation = useCancelParentLinkRequestMutation(parentId);

  const children = useMemo(() => dashboardData || [], [dashboardData]);

  const requests = useMemo<ParentLinkRequestItem[]>(
    () =>
      [...((requestsData as ParentLinkRequestItem[] | undefined) || [])].sort((a, b) => {
        const aTime = new Date(a.requestedAt || 0).getTime();
        const bTime = new Date(b.requestedAt || 0).getTime();

        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;

        return bTime - aTime;
      }),
    [requestsData]
  );

  const summary = useMemo(
    () =>
      children.reduce(
        (acc, child) => {
          acc.totalChildren += 1;
          acc.totalCourses += Number(child.summary.stats.enrolledCourses || 0);
          acc.totalTests += Number(child.summary.stats.totalTests || 0);
          acc.totalLessons += Number(child.summary.stats.completedLessons || 0);
          acc.totalScore += Number(child.summary.stats.avgScore || 0);
          return acc;
        },
        {
          totalChildren: 0,
          totalCourses: 0,
          totalTests: 0,
          totalLessons: 0,
          totalScore: 0,
        }
      ),
    [children]
  );

  const averageScore = useMemo(
    () => (summary.totalChildren > 0 ? Math.round(summary.totalScore / summary.totalChildren) : 0),
    [summary]
  );

  const pendingRequestsCount = useMemo(
    () => requests.filter((request) => request.status === 'pending').length,
    [requests]
  );

  const summaryCards = useMemo(
    () => getSummaryCards(mode, summary, averageScore, pendingRequestsCount),
    [mode, summary, averageScore, pendingRequestsCount]
  );

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(childEmail);

    setFormError(null);

    if (!normalizedEmail) {
      setFormError('Баланың email адресін енгізіңіз.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setFormError('Email форматы дұрыс емес.');
      return;
    }

    const hasPendingDuplicate = requests.some(
      (request) =>
        normalizeEmail(request.childEmail) === normalizedEmail &&
        request.status === 'pending'
    );

    if (hasPendingDuplicate) {
      setFormError('Осы email бойынша белсенді сұраныс бұрын жіберілген.');
      return;
    }

    try {
      await requestParentLinkMutation.mutateAsync({
        childEmail: normalizedEmail,
      });

      setChildEmail('');
      setFormError(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Сұранысты жіберу мүмкін болмады. Қайтадан көріңіз.';
      setFormError(message);
    }
  }

  async function handleCancelRequest(requestId: string) {
    try {
      await cancelParentLinkRequestMutation.mutateAsync({ requestId });
    } catch {
      // mutation layer өзі өңдейді
    }
  }

  const showModeEmptyState =
    !isDashboardLoading && !dashboardError && children.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">{copy.title}</h2>
            <p className="text-sm text-muted-foreground">{copy.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-auto xl:grid-cols-4">
            {summaryCards.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border bg-background px-4 py-3 text-center shadow-sm"
              >
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-xl font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {mode === 'children' ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Баланы байланыстыру</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Баланың email адресін енгізіңіз. Сұраныс жіберілгеннен кейін бала өз
                  аккаунтында немесе email арқылы оны растауы керек.
                </p>
              </CardHeader>

              <CardContent className="space-y-4">
                <form onSubmit={handleSubmitRequest} className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      type="email"
                      value={childEmail}
                      onChange={(event) => setChildEmail(event.target.value)}
                      placeholder="student@example.com"
                      className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={requestParentLinkMutation.isPending}
                    />

                    <button
                      type="submit"
                      disabled={requestParentLinkMutation.isPending}
                      className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {requestParentLinkMutation.isPending
                        ? 'Жіберіліп жатыр...'
                        : 'Сұраныс жіберу'}
                    </button>
                  </div>

                  {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

                  <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm font-medium">1. Email енгізу</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ата-ана баланың жүйеде тіркелген email адресін жазады.
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">2. Растау сұранысы</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Балаға растау туралы хабарлама жіберіледі.
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">3. Байланыс орнатылады</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Бала сұранысты растағаннан кейін оқу деректері осы бөлімге шығады.
                      </p>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Байланыс сұраныстары</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Мұнда жіберілген сұраныстардың ағымдағы мәртебесі көрсетіледі.
                </p>
              </CardHeader>

              <CardContent className="space-y-3">
                {isRequestsLoading ? <LoadingState text="Сұраныстар жүктеліп жатыр..." /> : null}

                {requestsError ? (
                  <ErrorState text="Сұраныстарды жүктеу мүмкін болмады." />
                ) : null}

                {!isRequestsLoading && !requestsError && requests.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Әзірге ешқандай сұраныс жіберілмеген.
                  </div>
                ) : null}

                {!isRequestsLoading && !requestsError && requests.length > 0
                  ? requests.map((request) => {
                      const statusMeta = getRequestStatusMeta(request.status);

                      return (
                        <div
                          key={request.id}
                          className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">
                                {request.childName?.trim() || request.childEmail}
                              </p>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusMeta.className}`}
                              >
                                {statusMeta.label}
                              </span>
                            </div>

                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <p>Email: {request.childEmail}</p>
                              <p>Жіберілген уақыты: {formatDateTime(request.requestedAt)}</p>
                              {request.expiresAt ? (
                                <p>Жарамдылық мерзімі: {formatDateTime(request.expiresAt)}</p>
                              ) : null}
                              {request.respondedAt ? (
                                <p>Жауап берілген уақыты: {formatDateTime(request.respondedAt)}</p>
                              ) : null}
                            </div>
                          </div>

                          {request.status === 'pending' ? (
                            <div className="flex shrink-0 gap-2">
                              <button
                                type="button"
                                onClick={() => handleCancelRequest(request.id)}
                                disabled={cancelParentLinkRequestMutation.isPending}
                                className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                              >
                                {cancelParentLinkRequestMutation.isPending
                                  ? 'Тоқтатылып жатыр...'
                                  : 'Сұранысты тоқтату'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  : null}
              </CardContent>
            </Card>
          </>
        ) : null}

        {isDashboardLoading ? <LoadingState text={copy.loadingText} /> : null}

        {dashboardError ? (
          <ErrorState text="Бұл бөлімдегі мәліметтерді жүктеу мүмкін болмады." />
        ) : null}

        {showModeEmptyState ? (
          <EmptyState
            title={copy.emptyTitle}
            text={
              mode === 'children' && pendingRequestsCount > 0
                ? 'Қазір байланысқан бала жоқ. Жіберілген сұраныстар расталғаннан кейін оқу деректері осы жерде көрінеді.'
                : copy.emptyText
            }
          />
        ) : null}

        {!isDashboardLoading && !dashboardError && children.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {children.map((child) => {
              const avgScore = Number(child.summary.stats.avgScore || 0);
              const completedLessons = Number(child.summary.stats.completedLessons || 0);
              const enrolledCourses = Number(child.summary.stats.enrolledCourses || 0);
              const totalTests = Number(child.summary.stats.totalTests || 0);
              const bestSubject = safeText(child.summary.stats.bestSubject);
              const weakSubject = safeText(child.summary.stats.weakSubject);
              const progressValue = getProgressValue(completedLessons, avgScore);
              const learningStatus = getLearningStatus(avgScore, completedLessons);

              return (
                <Card key={child.studentId}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={child.name}
                        avatarUrl={child.avatarUrl}
                        className="h-10 w-10"
                        fallbackClassName="bg-accent text-sm font-semibold"
                      />
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base font-semibold">
                          {child.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Курстар: {enrolledCourses} · Тесттер: {totalTests}
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 text-sm">
                    {mode === 'children' ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Орташа нәтиже</p>
                            <p className="text-lg font-semibold">{avgScore}%</p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Аяқталған сабақтар</p>
                            <p className="text-lg font-semibold">{completedLessons}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Күшті пән</span>
                            <span className="text-right">{bestSubject}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Назар аудару керек пән</span>
                            <span className="text-right">{weakSubject}</span>
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 flex justify-between gap-3">
                            <span className="text-muted-foreground">Жалпы оқу белсенділігі</span>
                            <span>{completedLessons} сабақ аяқталған</span>
                          </div>
                          <ProgressBar value={progressValue} size="sm" />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium">Соңғы тесттер</p>
                          {child.summary.recentAttempts.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Әзірге тест нәтижелері жоқ.
                            </p>
                          ) : (
                            child.summary.recentAttempts.map((attempt) => (
                              <div
                                key={attempt.id}
                                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{attempt.title}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {attempt.subjectName}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold">
                                  {formatAttemptScore(attempt.score)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    ) : null}

                    {mode === 'progress' ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Аяқталған сабақтар</p>
                            <p className="text-lg font-semibold">{completedLessons}</p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Орташа нәтиже</p>
                            <p className="text-lg font-semibold">{avgScore}%</p>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border p-3">
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Үлгерім мәртебесі</span>
                            <span className="text-right font-medium">{learningStatus}</span>
                          </div>

                          <div>
                            <div className="mb-1 flex justify-between gap-3">
                              <span className="text-muted-foreground">Жалпы прогресс</span>
                              <span>{progressValue}%</span>
                            </div>
                            <ProgressBar value={progressValue} size="sm" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Күшті пән</span>
                            <span className="text-right">{bestSubject}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Назар аудару керек пән</span>
                            <span className="text-right">{weakSubject}</span>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {mode === 'tests' ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Барлық тесттер</p>
                            <p className="text-lg font-semibold">{totalTests}</p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Орташа нәтиже</p>
                            <p className="text-lg font-semibold">{avgScore}%</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium">Соңғы тест нәтижелері</p>

                          {child.summary.recentAttempts.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Бұл бала бойынша тест нәтижелері әлі тіркелмеген.
                            </p>
                          ) : (
                            child.summary.recentAttempts.map((attempt) => (
                              <div
                                key={attempt.id}
                                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{attempt.title}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {attempt.subjectName}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold">
                                  {formatAttemptScore(attempt.score)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    ) : null}

                    {mode === 'achievements' ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Оқу белсенділігі</p>
                            <p className="text-lg font-semibold">{completedLessons} сабақ</p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Орташа нәтиже</p>
                            <p className="text-lg font-semibold">{avgScore}%</p>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border p-3">
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Қазіргі деңгейі</span>
                            <span className="text-right font-medium">{learningStatus}</span>
                          </div>

                          <div>
                            <div className="mb-1 flex justify-between gap-3">
                              <span className="text-muted-foreground">Алға жылжу көрсеткіші</span>
                              <span>{progressValue}%</span>
                            </div>
                            <ProgressBar value={progressValue} size="sm" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Күшті пән</span>
                            <span className="text-right">{bestSubject}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Назар аудару керек пән</span>
                            <span className="text-right">{weakSubject}</span>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}