import { FormEvent, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  GraduationCap,
  Mail,
  RotateCcw,
  Target,
  Trophy,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import ProgressBar from '@/components/ProgressBar';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useCancelParentLinkRequestMutation,
  useParentDashboard,
  useParentLinkRequests,
  useRequestParentLinkMutation,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 180;
const MAX_EMAIL_CHARS = 254;
const MAX_NAME_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_URL_CHARS = 2_000;
const MAX_ERROR_CHARS = 700;

type ParentViewMode = 'children' | 'progress' | 'tests' | 'achievements';

type ParentLinkRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled';

type NormalizedParentLinkRequest = {
  id: string;
  childEmail: string;
  childName: string | null;
  status: ParentLinkRequestStatus;
  requestedAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
};

type NormalizedParentAttempt = {
  id: string;
  title: string;
  subjectName: string;
  score: number | null;
  completedAt: string | null;
};

type NormalizedChildStats = {
  avgScore: number;
  totalTests: number;
  completedLessons: number;
  enrolledCourses: number;
  bestSubject: string;
  weakSubject: string;
};

type NormalizedParentChild = {
  studentId: string;
  name: string;
  avatarUrl: string | null;
  summary: {
    stats: NormalizedChildStats;
    recentAttempts: NormalizedParentAttempt[];
  };
};

type SummaryTotals = {
  totalChildren: number;
  totalCourses: number;
  totalTests: number;
  totalLessons: number;
  totalScore: number;
};

type UnknownRecord = Record<string, unknown>;

const pageCopy: Record<
  ParentViewMode,
  {
    title: string;
    loadingText: string;
    emptyTitle: string;
    emptyText: string;
  }
> = {
  children: {
    title: 'Балалар',
    loadingText: 'Балалар туралы мәлімет жүктеліп жатыр...',
    emptyTitle: 'Байланыстырылған бала жоқ',
    emptyText: 'Баланы email арқылы байланыстырып, оның растауын күтіңіз.',
  },
  progress: {
    title: 'Бала үлгерімі',
    loadingText: 'Үлгерім деректері жүктеліп жатыр...',
    emptyTitle: 'Үлгерім туралы мәлімет жоқ',
    emptyText: 'Бала оқуды бастағаннан кейін үлгерім осы жерде көрсетіледі.',
  },
  tests: {
    title: 'Бала тесттері',
    loadingText: 'Тест нәтижелері жүктеліп жатыр...',
    emptyTitle: 'Тест нәтижелері жоқ',
    emptyText: 'Бала тест тапсырғаннан кейін нәтижелер осы жерде көрінеді.',
  },
  achievements: {
    title: 'Бала жетістіктері',
    loadingText: 'Жетістік көрсеткіштері жүктеліп жатыр...',
    emptyTitle: 'Жетістік көрсеткіштері жоқ',
    emptyText: 'Оқу белсенділігі артқан сайын жетістіктер осы жерде көрінеді.',
  },
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function sanitizeEmailInput(value: unknown): string {
  return limitText(cleanRawText(value).replace(/\s+/g, '').trim(), MAX_EMAIL_CHARS);
}

function normalizeEmail(value: unknown): string {
  return sanitizeEmailInput(value).toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeExternalUrl(value: unknown): string | null {
  const rawUrl = cleanText(value, MAX_URL_CHARS);

  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    return parsed.toString();
  } catch {
    return null;
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toNonNegativeInt(value: unknown): number {
  return Math.max(0, Math.round(toNumber(value, 0)));
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(toNumber(value, 0))));
}

function nullablePercent(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return null;

  return clampPercent(numberValue);
}

function formatPercent(value: unknown): string {
  return `${clampPercent(value)}%`;
}

function formatAttemptScore(score: number | null | undefined): string {
  return score === null || score === undefined ? '—' : `${clampPercent(score)}%`;
}

function formatDateTime(value: unknown): string {
  const rawValue = cleanText(value, 80);

  if (!rawValue) return '—';

  const date = new Date(rawValue);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('kk-KZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getViewMode(pathname: string): ParentViewMode {
  if (pathname.startsWith('/child-progress')) return 'progress';
  if (pathname.startsWith('/child-tests')) return 'tests';
  if (pathname.startsWith('/child-achievements')) return 'achievements';

  return 'children';
}

function normalizeRequestStatus(value: unknown): ParentLinkRequestStatus {
  const status = cleanText(value, 40).toLowerCase();

  if (
    status === 'pending' ||
    status === 'accepted' ||
    status === 'declined' ||
    status === 'expired' ||
    status === 'cancelled'
  ) {
    return status;
  }

  return 'pending';
}

function getRequestStatusMeta(status: ParentLinkRequestStatus): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
} {
  if (status === 'accepted') return { label: 'Расталды', tone: 'success' };
  if (status === 'declined') return { label: 'Қабылданбады', tone: 'danger' };
  if (status === 'expired') return { label: 'Уақыты өтті', tone: 'muted' };
  if (status === 'cancelled') return { label: 'Тоқтатылды', tone: 'muted' };

  return { label: 'Күтуде', tone: 'warning' };
}

function getProgressValue(completedLessons: unknown, avgScore: unknown): number {
  const lessonsPart = Math.min(60, toNonNegativeInt(completedLessons) * 8);
  const scorePart = Math.min(40, Math.round(clampPercent(avgScore) * 0.4));

  return clampPercent(lessonsPart + scorePart);
}

function getLearningStatus(avgScore: number, completedLessons: number): string {
  if (avgScore >= 80 && completedLessons >= 5) return 'Үлгерімі тұрақты';
  if (avgScore >= 60 || completedLessons >= 3) return 'Жақсы қарқын';

  return 'Назар қажет';
}

function getErrorMessage(error: unknown, fallback = 'Әрекет орындалмады.'): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function normalizeAttempt(value: unknown, index: number): NormalizedParentAttempt | null {
  const row = asRecord(value);
  const id = cleanId(row.id) || `attempt-${index}`;
  const title = cleanText(row.title) || 'Тест';
  const subjectName = cleanText(row.subjectName ?? row.subject_name, MAX_META_CHARS) || 'Пән';
  const score = nullablePercent(row.score);
  const completedAt = cleanText(row.completedAt ?? row.completed_at, 80) || null;

  return {
    id,
    title,
    subjectName,
    score,
    completedAt,
  };
}

function normalizeChildren(input: unknown): NormalizedParentChild[] {
  const source = Array.isArray(input) ? input : [];

  return source
    .map((item, index): NormalizedParentChild | null => {
      const row = asRecord(item);
      const summary = asRecord(row.summary);
      const stats = asRecord(summary.stats);
      const recentAttempts = Array.isArray(summary.recentAttempts)
        ? summary.recentAttempts
        : Array.isArray(summary.recent_attempts)
          ? summary.recent_attempts
          : [];

      const studentId = cleanId(row.studentId ?? row.student_id) || `child-${index}`;
      const name = cleanText(row.name, MAX_NAME_CHARS) || 'Оқушы';

      return {
        studentId,
        name,
        avatarUrl: normalizeExternalUrl(row.avatarUrl ?? row.avatar_url),
        summary: {
          stats: {
            avgScore: clampPercent(stats.avgScore ?? stats.avg_score),
            totalTests: toNonNegativeInt(stats.totalTests ?? stats.total_tests),
            completedLessons: toNonNegativeInt(
              stats.completedLessons ?? stats.completed_lessons,
            ),
            enrolledCourses: toNonNegativeInt(
              stats.enrolledCourses ?? stats.enrolled_courses,
            ),
            bestSubject:
              cleanText(stats.bestSubject ?? stats.best_subject, MAX_META_CHARS) || '—',
            weakSubject:
              cleanText(stats.weakSubject ?? stats.weak_subject, MAX_META_CHARS) || '—',
          },
          recentAttempts: recentAttempts
            .map((attempt, attemptIndex) => normalizeAttempt(attempt, attemptIndex))
            .filter((attempt): attempt is NormalizedParentAttempt => Boolean(attempt)),
        },
      };
    })
    .filter((child): child is NormalizedParentChild => Boolean(child));
}

function normalizeRequests(input: unknown): NormalizedParentLinkRequest[] {
  const source = Array.isArray(input) ? input : [];

  return source
    .map((item, index): NormalizedParentLinkRequest | null => {
      const row = asRecord(item);
      const id = cleanId(row.id) || `request-${index}`;
      const childEmail = normalizeEmail(row.childEmail ?? row.child_email);

      if (!childEmail) return null;

      return {
        id,
        childEmail,
        childName: cleanText(row.childName ?? row.child_name, MAX_NAME_CHARS) || null,
        status: normalizeRequestStatus(row.status),
        requestedAt: cleanText(row.requestedAt ?? row.requested_at, 80) || null,
        respondedAt: cleanText(row.respondedAt ?? row.responded_at, 80) || null,
        expiresAt: cleanText(row.expiresAt ?? row.expires_at, 80) || null,
      };
    })
    .filter((request): request is NormalizedParentLinkRequest => Boolean(request))
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;

      const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;

      return bTime - aTime;
    });
}

function getSummaryCards(
  mode: ParentViewMode,
  summary: SummaryTotals,
  averageScore: number,
  pendingRequestsCount: number,
) {
  if (mode === 'children') {
    return [
      { label: 'Балалар', value: summary.totalChildren },
      { label: 'Күтудегі сұраныс', value: pendingRequestsCount },
      { label: 'Курстар', value: summary.totalCourses },
      { label: 'Орташа нәтиже', value: `${averageScore}%` },
    ];
  }

  if (mode === 'progress') {
    return [
      { label: 'Балалар', value: summary.totalChildren },
      { label: 'Аяқталған сабақ', value: summary.totalLessons },
      { label: 'Орташа нәтиже', value: `${averageScore}%` },
      { label: 'Курстар', value: summary.totalCourses },
    ];
  }

  if (mode === 'tests') {
    return [
      { label: 'Балалар', value: summary.totalChildren },
      { label: 'Тесттер', value: summary.totalTests },
      { label: 'Орташа нәтиже', value: `${averageScore}%` },
      { label: 'Курстар', value: summary.totalCourses },
    ];
  }

  return [
    { label: 'Балалар', value: summary.totalChildren },
    { label: 'Орташа нәтиже', value: `${averageScore}%` },
    { label: 'Аяқталған сабақ', value: summary.totalLessons },
    { label: 'Тесттер', value: summary.totalTests },
  ];
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-[11px] font-medium text-muted-foreground">
          {cleanText(label, MAX_META_CHARS)}
        </p>
        <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChildMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{cleanText(label, MAX_META_CHARS)}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-3 rounded-2xl border border-border bg-muted/25 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{cleanText(label, MAX_META_CHARS)}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function AttemptList({ attempts }: { attempts: NormalizedParentAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="text-xs text-muted-foreground">Тест нәтижелері жоқ.</p>;
  }

  return (
    <div className="space-y-2">
      {attempts.slice(0, 4).map((attempt, index) => (
        <div
          key={attempt.id || `${attempt.title}-${index}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {attempt.title}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {attempt.subjectName}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-foreground">
            {formatAttemptScore(attempt.score)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RequestStatusBadge({ status }: { status: ParentLinkRequestStatus }) {
  const meta = getRequestStatusMeta(status);

  return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
}

function ChildCard({ child, mode }: { child: NormalizedParentChild; mode: ParentViewMode }) {
  const stats = child.summary.stats;
  const progressValue = getProgressValue(stats.completedLessons, stats.avgScore);
  const learningStatus = getLearningStatus(stats.avgScore, stats.completedLessons);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
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
              Курстар: {stats.enrolledCourses} · Тесттер: {stats.totalTests}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        {mode === 'children' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ChildMetric label="Орташа нәтиже" value={`${stats.avgScore}%`} />
              <ChildMetric label="Аяқталған сабақ" value={stats.completedLessons} />
            </div>

            <div className="space-y-2">
              <InfoRow label="Күшті пән" value={stats.bestSubject} />
              <InfoRow label="Назар қажет пән" value={stats.weakSubject} />
            </div>

            <div>
              <div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground">
                <span>Оқу белсенділігі</span>
                <span>{stats.completedLessons} сабақ</span>
              </div>
              <ProgressBar value={progressValue} size="sm" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Соңғы тесттер</p>
              <AttemptList attempts={child.summary.recentAttempts} />
            </div>
          </>
        ) : null}

        {mode === 'progress' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ChildMetric label="Аяқталған сабақ" value={stats.completedLessons} />
              <ChildMetric label="Орташа нәтиже" value={`${stats.avgScore}%`} />
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-3">
              <InfoRow label="Үлгерім мәртебесі" value={learningStatus} />
              <div>
                <div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Оқу барысы</span>
                  <span>{progressValue}%</span>
                </div>
                <ProgressBar value={progressValue} size="sm" />
              </div>
            </div>

            <InfoRow label="Күшті пән" value={stats.bestSubject} />
            <InfoRow label="Назар қажет пән" value={stats.weakSubject} />
          </>
        ) : null}

        {mode === 'tests' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ChildMetric label="Тесттер" value={stats.totalTests} />
              <ChildMetric label="Орташа нәтиже" value={`${stats.avgScore}%`} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Соңғы нәтижелер</p>
              <AttemptList attempts={child.summary.recentAttempts} />
            </div>
          </>
        ) : null}

        {mode === 'achievements' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ChildMetric label="Оқу белсенділігі" value={`${stats.completedLessons} сабақ`} />
              <ChildMetric label="Орташа нәтиже" value={`${stats.avgScore}%`} />
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-3">
              <InfoRow label="Қазіргі деңгейі" value={learningStatus} />
              <div>
                <div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Алға жылжу</span>
                  <span>{progressValue}%</span>
                </div>
                <ProgressBar value={progressValue} size="sm" />
              </div>
            </div>

            <InfoRow label="Күшті пән" value={stats.bestSubject} />
            <InfoRow label="Назар қажет пән" value={stats.weakSubject} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ParentChildrenPage() {
  const { user } = useAuth();
  const location = useLocation();
  const mode = getViewMode(location.pathname);
  const copy = pageCopy[mode];

  const [childEmail, setChildEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const parentId = cleanId(user?.id);
  const isEnabled = Boolean(parentId);

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

  const children = useMemo(() => normalizeChildren(dashboardData), [dashboardData]);
  const requests = useMemo(() => normalizeRequests(requestsData), [requestsData]);

  const summary = useMemo<SummaryTotals>(
    () =>
      children.reduce(
        (acc, child) => {
          acc.totalChildren += 1;
          acc.totalCourses += child.summary.stats.enrolledCourses;
          acc.totalTests += child.summary.stats.totalTests;
          acc.totalLessons += child.summary.stats.completedLessons;
          acc.totalScore += child.summary.stats.avgScore;

          return acc;
        },
        {
          totalChildren: 0,
          totalCourses: 0,
          totalTests: 0,
          totalLessons: 0,
          totalScore: 0,
        },
      ),
    [children],
  );

  const averageScore =
    summary.totalChildren > 0
      ? clampPercent(summary.totalScore / summary.totalChildren)
      : 0;

  const pendingRequestsCount = requests.filter(
    (request) => request.status === 'pending',
  ).length;

  const summaryCards = getSummaryCards(
    mode,
    summary,
    averageScore,
    pendingRequestsCount,
  );

  const normalizedEmail = normalizeEmail(childEmail);
  const canSubmitRequest =
    isValidEmail(normalizedEmail) &&
    !requestParentLinkMutation.isPending &&
    Boolean(parentId);

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        request.childEmail === normalizedEmail && request.status === 'pending',
    );

    if (hasPendingDuplicate) {
      setFormError('Осы email бойынша белсенді сұраныс бар.');
      return;
    }

    try {
      await requestParentLinkMutation.mutateAsync({ childEmail: normalizedEmail });
      setChildEmail('');
      setFormError(null);
    } catch (error) {
      setFormError(getErrorMessage(error, 'Сұранысты жіберу мүмкін болмады.'));
    }
  }

  async function handleCancelRequest(requestId: string) {
    const safeRequestId = cleanId(requestId);

    if (!safeRequestId) return;

    try {
      await cancelParentLinkRequestMutation.mutateAsync({ requestId: safeRequestId });
    } catch {
      // Mutation layer shows the error state/toast in the app data layer.
    }
  }

  const showModeEmptyState =
    !isDashboardLoading && !dashboardError && children.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Users size={13} />
              Ата-ана кабинеті
            </>
          }
          icon={<GraduationCap size={20} />}
          title={copy.title}
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <SummaryCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>

        {mode === 'children' ? (
          <>
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/70 bg-card pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <UserPlus size={16} />
                  Баланы байланыстыру
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 p-4 sm:p-5">
                <form onSubmit={handleSubmitRequest} className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row">
                    <div className="relative flex-1">
                      <Mail
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        type="email"
                        value={childEmail}
                        maxLength={MAX_EMAIL_CHARS}
                        onChange={(event) => {
                          setChildEmail(sanitizeEmailInput(event.target.value));
                          if (formError) setFormError(null);
                        }}
                        placeholder="student@example.com"
                        className="pl-9"
                        disabled={requestParentLinkMutation.isPending}
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={!canSubmitRequest}
                      className="md:w-auto"
                    >
                      {requestParentLinkMutation.isPending
                        ? 'Жіберілуде...'
                        : 'Сұраныс жіберу'}
                    </Button>
                  </div>

                  {formError ? (
                    <p className="text-sm text-destructive">
                      {cleanText(formError, MAX_ERROR_CHARS)}
                    </p>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/70 bg-card pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Clock size={16} />
                  Байланыс сұраныстары
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 p-4 sm:p-5">
                {isRequestsLoading ? (
                  <LoadingState text="Сұраныстар жүктеліп жатыр..." compact />
                ) : null}

                {requestsError ? (
                  <ErrorState text="Сұраныстарды жүктеу мүмкін болмады." compact />
                ) : null}

                {!isRequestsLoading && !requestsError && requests.length === 0 ? (
                  <EmptyState
                    title="Сұраныс жоқ"
                    text="Байланыс сұранысы жіберілгеннен кейін осы жерде көрінеді."
                    compact
                  />
                ) : null}

                {!isRequestsLoading && !requestsError && requests.length > 0
                  ? requests.map((request) => (
                      <div
                        key={request.id}
                        className="rounded-3xl border border-border bg-card p-4 shadow-soft"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {request.childName || request.childEmail}
                              </p>
                              <RequestStatusBadge status={request.status} />
                            </div>

                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <p>Email: {request.childEmail}</p>
                              <p>Жіберілді: {formatDateTime(request.requestedAt)}</p>
                              {request.expiresAt ? (
                                <p>Мерзімі: {formatDateTime(request.expiresAt)}</p>
                              ) : null}
                              {request.respondedAt ? (
                                <p>Жауап: {formatDateTime(request.respondedAt)}</p>
                              ) : null}
                            </div>
                          </div>

                          {request.status === 'pending' ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleCancelRequest(request.id)}
                              disabled={cancelParentLinkRequestMutation.isPending}
                            >
                              <XCircle size={14} className="mr-2" />
                              {cancelParentLinkRequestMutation.isPending
                                ? 'Тоқтатылуда...'
                                : 'Тоқтату'}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  : null}
              </CardContent>
            </Card>
          </>
        ) : null}

        {isDashboardLoading ? <LoadingState text={copy.loadingText} /> : null}

        {dashboardError ? (
          <ErrorState
            text="Мәліметтерді жүктеу мүмкін болмады."
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
          />
        ) : null}

        {showModeEmptyState ? (
          <EmptyState
            title={copy.emptyTitle}
            text={
              mode === 'children' && pendingRequestsCount > 0
                ? 'Жіберілген сұраныс расталғаннан кейін оқу деректері көрінеді.'
                : copy.emptyText
            }
          />
        ) : null}

        {!isDashboardLoading && !dashboardError && children.length > 0 ? (
          <div className={cn('grid gap-4 lg:grid-cols-2')}>
            {children.map((child) => (
              <ChildCard key={child.studentId} child={child} mode={mode} />
            ))}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
