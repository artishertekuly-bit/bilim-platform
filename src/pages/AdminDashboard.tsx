import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  KeyRound,
  LayoutDashboard,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import ProgressBar from '@/components/ProgressBar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useAdminDashboard,
  useManualApproveOrderMutation,
  useManualGrantCourseAccessMutation,
  usePendingOrdersForAdmin,
} from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 180;
const MAX_TEXT_CHARS = 240;
const MAX_NAME_CHARS = 160;
const MAX_REASON_CHARS = 500;
const MAX_ERROR_CHARS = 700;
const MAX_CURRENCY_CHARS = 12;
const DEFAULT_CURRENCY = 'KZT';

type ReviewStatus = 'draft' | 'under_review' | 'published' | 'archived';
type ContentType = 'course' | 'lesson' | 'test' | 'unknown';
type OrderStatus = 'pending' | 'paid' | 'approved' | 'rejected' | 'cancelled';

type PendingReviewItem = {
  id: string;
  content_id: string;
  content_type: ContentType;
  status: ReviewStatus;
  reviewed_at: string | null;
};

type PendingOrderItem = {
  id: string;
  status: OrderStatus;
  amount: number;
  currency: string;
  product_type: string;
  buyer_id: string;
  product_id: string;
  created_at: string | null;
};

type SubjectStatItem = {
  name: string;
  courses: number;
  lessons: number;
  avgScore: number;
};

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TEXT_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function cleanReason(value: unknown): string {
  return cleanText(value, MAX_REASON_CHARS);
}

function normalizeNumber(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
}

function normalizeMoneyAmount(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, numericValue);
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, normalizeNumber(value)));
}

function getErrorMessage(error: unknown, fallback = 'Белгісіз қате пайда болды.'): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function formatReviewDate(value: string | null | undefined) {
  const rawValue = cleanText(value, 80);

  if (!rawValue) return t('page.admin_dashboard.not_available');

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) return t('page.admin_dashboard.not_available');

  return parsed.toLocaleDateString('kk-KZ');
}

function formatDateTime(value: string | null | undefined) {
  const rawValue = cleanText(value, 80);

  if (!rawValue) return '—';

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) return '—';

  return parsed.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeCurrency(value: unknown) {
  return cleanText(value, MAX_CURRENCY_CHARS).toUpperCase() || DEFAULT_CURRENCY;
}

function formatMoney(amount: unknown, currency?: unknown) {
  const value = normalizeMoneyAmount(amount);
  const code = normalizeCurrency(currency);

  return `${value.toLocaleString('kk-KZ')} ${code}`;
}

function truncateId(value: string | null | undefined) {
  const id = cleanId(value);

  if (!id) return '—';
  if (id.length <= 14) return id;

  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function normalizeContentType(value: unknown): ContentType {
  const normalized = cleanText(value, 80).toLowerCase();

  if (normalized === 'course' || normalized === 'lesson' || normalized === 'test') {
    return normalized;
  }

  return 'unknown';
}

function normalizeReviewStatus(value: unknown): ReviewStatus {
  const normalized = cleanText(value, 80).toLowerCase();

  if (
    normalized === 'draft' ||
    normalized === 'under_review' ||
    normalized === 'published' ||
    normalized === 'archived'
  ) {
    return normalized;
  }

  return 'draft';
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  const normalized = cleanText(value, 80).toLowerCase();

  if (
    normalized === 'pending' ||
    normalized === 'paid' ||
    normalized === 'approved' ||
    normalized === 'rejected' ||
    normalized === 'cancelled'
  ) {
    return normalized;
  }

  return 'pending';
}

function getContentTypeLabel(value: unknown) {
  const normalized = normalizeContentType(value);

  const map: Record<ContentType, string> = {
    course: t('nav.courses'),
    lesson: t('nav.lessons'),
    test: t('nav.tests'),
    unknown: 'Контент',
  };

  return map[normalized];
}

function getReviewStatusLabel(value: unknown) {
  const normalized = normalizeReviewStatus(value);

  const map: Record<ReviewStatus, string> = {
    under_review: t('page.admin_dashboard.review_status.under_review'),
    published: t('course.status.published'),
    draft: t('course.status.draft'),
    archived: t('course.status.archived'),
  };

  return map[normalized];
}

function getReviewStatusTone(value: unknown) {
  const normalized = normalizeReviewStatus(value);

  if (normalized === 'published') return 'success' as const;
  if (normalized === 'under_review') return 'warning' as const;
  if (normalized === 'archived') return 'muted' as const;

  return 'info' as const;
}

function getOrderStatusLabel(value: unknown): string {
  const normalized = normalizeOrderStatus(value);

  const map: Record<OrderStatus, string> = {
    pending: 'Күтуде',
    paid: 'Төленді',
    approved: 'Расталды',
    rejected: 'Қабылданбады',
    cancelled: 'Бас тартылды',
  };

  return map[normalized];
}

function getProductTypeLabel(value: unknown): string {
  const normalized = cleanText(value, 80).toLowerCase();

  const map: Record<string, string> = {
    course: 'Курс',
    lesson: 'Сабақ',
    test: 'Тест',
    bundle: 'Жинақ',
  };

  return map[normalized] || 'Өнім';
}

function getScoreTone(value: number | null | undefined) {
  const score = clampPercent(value);

  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;

  return 'danger' as const;
}

function getProgressTone(value: number | null | undefined) {
  const score = clampPercent(value);

  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;

  return 'primary' as const;
}

function formatScore(value: number | null | undefined) {
  const score = clampPercent(value);

  return `${score}%`;
}

function normalizePendingReviews(input: unknown): PendingReviewItem[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<PendingReviewItem[]>((acc, item) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id);

    if (!id || seen.has(id)) return acc;

    seen.add(id);

    acc.push({
      id,
      content_id: cleanId(row.content_id),
      content_type: normalizeContentType(row.content_type),
      status: normalizeReviewStatus(row.status),
      reviewed_at: cleanText(row.reviewed_at, 80) || null,
    });

    return acc;
  }, []);
}

function normalizePendingOrders(input: unknown): PendingOrderItem[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<PendingOrderItem[]>((acc, item) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id);

    if (!id || seen.has(id)) return acc;

    seen.add(id);

    acc.push({
      id,
      status: normalizeOrderStatus(row.status),
      amount: normalizeMoneyAmount(row.amount),
      currency: normalizeCurrency(row.currency),
      product_type: cleanText(row.product_type, 80),
      buyer_id: cleanId(row.buyer_id),
      product_id: cleanId(row.product_id),
      created_at: cleanText(row.created_at, 80) || null,
    });

    return acc;
  }, []);
}

function normalizeSubjectStats(input: unknown): SubjectStatItem[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<SubjectStatItem[]>((acc, item) => {
    const row = item as Record<string, unknown>;
    const name = cleanText(row.name, MAX_NAME_CHARS) || 'Пән';
    const key = name.toLowerCase();

    if (seen.has(key)) return acc;

    seen.add(key);

    acc.push({
      name,
      courses: normalizeNumber(row.courses),
      lessons: normalizeNumber(row.lessons),
      avgScore: clampPercent(row.avgScore),
    });

    return acc;
  }, []);
}

function StatRow({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'primary';
}) {
  const toneClassName = {
    default: 'border-border bg-surface-soft/60 text-muted-foreground',
    success: 'border-success-muted bg-success-soft/65 text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft/65 text-warning-foreground',
    primary: 'border-primary-muted bg-primary-soft/65 text-primary',
  }[tone];

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5',
        toneClassName,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-xs">
        {icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <span className="truncate">{cleanText(label, MAX_TEXT_CHARS)}</span>
      </span>

      <span className="shrink-0 text-right text-xs font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function PanelCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {icon ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                {icon}
              </span>
            ) : null}
            {cleanText(title, MAX_TEXT_CHARS)}
          </CardTitle>

          {action}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}

function QuickActionCard({
  title,
  text,
  to,
  icon,
  tone = 'primary',
}: {
  title: string;
  text: string;
  to: string;
  icon: ReactNode;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
}) {
  const toneClassName = {
    primary: {
      card: 'hover:border-primary-muted hover:bg-primary-soft/60',
      icon: 'border-primary-muted bg-primary-soft text-primary',
    },
    accent: {
      card: 'hover:border-accent-muted hover:bg-accent-soft/60',
      icon: 'border-accent-muted bg-accent-soft text-accent-foreground',
    },
    success: {
      card: 'hover:border-success-muted hover:bg-success-soft/60',
      icon: 'border-success-muted bg-success-soft text-success-foreground',
    },
    warning: {
      card: 'hover:border-warning-muted hover:bg-warning-soft/60',
      icon: 'border-warning-muted bg-warning-soft text-warning-foreground',
    },
  }[tone];

  return (
    <Link
      to={to}
      className={cn(
        'group rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-soft-md active:translate-y-0 active:scale-[0.99]',
        toneClassName.card,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            toneClassName.icon,
          )}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {cleanText(title, MAX_TEXT_CHARS)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {cleanText(text, MAX_TEXT_CHARS)}
          </p>
        </div>

        <ArrowRight
          size={15}
          className="mt-1 shrink-0 text-muted-foreground transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </div>
    </Link>
  );
}

function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-6 w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-border bg-card p-4 shadow-soft"
          >
            <div className="flex items-start gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, cardIndex) => (
            <div
              key={cardIndex}
              className="rounded-3xl border border-border bg-card p-5 shadow-soft"
            >
              <SkeletonBlock className="h-5 w-44" />

              <div className="mt-5 space-y-3">
                {Array.from({ length: 3 }).map((_, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="rounded-3xl border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <SkeletonBlock className="h-4 w-44" />
                        <SkeletonBlock className="h-3 w-72 max-w-full" />
                        <SkeletonBlock className="h-3 w-48 max-w-full" />
                      </div>

                      <SkeletonBlock className="h-9 w-24 rounded-2xl" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="rounded-3xl border border-border bg-card p-5 shadow-soft"
            >
              <SkeletonBlock className="h-5 w-36" />

              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const safeAdminId = cleanId(user?.id);

  const { data, isLoading, error } = useAdminDashboard(Boolean(safeAdminId));

  const {
    data: pendingOrders,
    isLoading: pendingOrdersLoading,
    error: pendingOrdersError,
  } = usePendingOrdersForAdmin(Boolean(safeAdminId));

  const approveOrderMutation = useManualApproveOrderMutation(safeAdminId);
  const manualGrantMutation = useManualGrantCourseAccessMutation(safeAdminId);

  const [manualGrantForm, setManualGrantForm] = useState({
    userId: '',
    courseId: '',
    reason: '',
  });

  const firstName = useMemo(
    () =>
      cleanText(user?.fullName, MAX_NAME_CHARS).split(/\s+/)[0] ||
      cleanText(user?.email?.split('@')[0], MAX_NAME_CHARS) ||
      t('role.admin'),
    [user?.email, user?.fullName],
  );

  const pendingReviews = useMemo(
    () =>
      normalizePendingReviews(data?.pendingReviews).sort((a, b) => {
        const da = a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0;
        const db = b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0;

        return db - da;
      }),
    [data?.pendingReviews],
  );

  const subjectStats = useMemo(
    () => normalizeSubjectStats(data?.subjectStats),
    [data?.subjectStats],
  );

  const sortedPendingOrders = useMemo(
    () =>
      normalizePendingOrders(pendingOrders).sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;

        return db - da;
      }),
    [pendingOrders],
  );

  const stats = useMemo(
    () => ({
      totalStudents: normalizeNumber(data?.stats?.totalStudents),
      totalCourses: normalizeNumber(data?.stats?.totalCourses),
      totalLessons: normalizeNumber(data?.stats?.totalLessons),
      totalTests: normalizeNumber(data?.stats?.totalTests),
      roleCounts: {
        students: normalizeNumber(data?.roleCounts?.students),
        teachers: normalizeNumber(data?.roleCounts?.teachers),
        parents: normalizeNumber(data?.roleCounts?.parents),
        admins: normalizeNumber(data?.roleCounts?.admins),
      },
      contentStatus: {
        published: normalizeNumber(data?.contentStatus?.published),
        underReview: normalizeNumber(data?.contentStatus?.underReview),
        draft: normalizeNumber(data?.contentStatus?.draft),
        archived: normalizeNumber(data?.contentStatus?.archived),
      },
    }),
    [data],
  );

  const updateManualGrantForm = (
    key: keyof typeof manualGrantForm,
    value: string,
  ) => {
    setManualGrantForm((previous) => ({
      ...previous,
      [key]: key === 'reason' ? cleanReason(value) : cleanId(value),
    }));
  };

  const approveOrder = async (orderId: string) => {
    const safeOrderId = cleanId(orderId);

    if (!safeOrderId) return;

    try {
      await approveOrderMutation.mutateAsync(safeOrderId);

      toast({
        title: 'Тапсырыс расталды',
        description: 'Оқушыға курс қолжетімділігі берілді.',
      });
    } catch (approveError) {
      toast({
        title: 'Тапсырысты растау мүмкін болмады',
        description: getErrorMessage(approveError),
        variant: 'destructive',
      });
    }
  };

  const grantManualAccess = async () => {
    const studentId = cleanId(manualGrantForm.userId);
    const courseId = cleanId(manualGrantForm.courseId);
    const reason = cleanReason(manualGrantForm.reason);

    if (!studentId || !courseId) {
      toast({
        title: 'Оқушы ID және курс ID қажет',
        description: 'Қолжетімділік беру үшін екі ID да толтырылуы керек.',
        variant: 'destructive',
      });

      return;
    }

    if (!safeAdminId) {
      toast({
        title: 'Әкімші аккаунты анықталмады',
        description: 'Қайта кіріп көріңіз.',
        variant: 'destructive',
      });

      return;
    }

    try {
      await manualGrantMutation.mutateAsync({
        userId: studentId,
        courseId,
        reason: reason || 'Әкімші қолмен берді',
        adminId: safeAdminId,
      });

      setManualGrantForm({
        userId: '',
        courseId: '',
        reason: '',
      });

      toast({
        title: 'Қолжетімділік берілді',
        description: 'Оқушыға курс ашылды.',
      });
    } catch (grantError) {
      toast({
        title: 'Қолжетімділік беру мүмкін болмады',
        description: getErrorMessage(grantError),
        variant: 'destructive',
      });
    }
  };

  const pendingOrdersCount = sortedPendingOrders.length;
  const pendingReviewsCount = pendingReviews.length;

  const publishedCount = stats.contentStatus.published;
  const underReviewCount = stats.contentStatus.underReview;
  const draftCount = stats.contentStatus.draft;
  const archivedCount = stats.contentStatus.archived;

  const totalContentStatus =
    publishedCount + underReviewCount + draftCount + archivedCount;

  const publishedRatio =
    totalContentStatus > 0
      ? Math.round((publishedCount / totalContentStatus) * 100)
      : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutDashboard size={13} />
              Әкімші кабинеті
            </>
          }
          icon={<ShieldCheck size={20} />}
          title={`${t('dashboard.welcome', { name: firstName })}!`}
          actions={
            <Button type="button" asChild>
              <Link to="/manage-users">
                Қолданушылар
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
          }
        />

        {isLoading ? <AdminDashboardSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.admin_dashboard.error')}
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

        {!isLoading && !error && !data ? (
          <EmptyState
            icon={<ShieldCheck size={18} />}
            title={t('page.admin_dashboard.empty.title')}
            text={t('page.admin_dashboard.empty.text')}
            action={
              <Button type="button" asChild>
                <Link to="/manage-users">
                  Қолданушыларға өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={t('dashboard.total_students')}
                value={stats.totalStudents}
                icon={<Users size={16} />}
                tone="primary"
              />
              <StatCard
                label={t('dashboard.total_courses')}
                value={stats.totalCourses}
                icon={<BookOpen size={16} />}
                tone="success"
              />
              <StatCard
                label={t('dashboard.total_lessons')}
                value={stats.totalLessons}
                icon={<FileText size={16} />}
                tone="secondary"
              />
              <StatCard
                label={t('dashboard.total_tests')}
                value={stats.totalTests}
                icon={<ClipboardList size={16} />}
                tone="accent"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <QuickActionCard
                title="Курстар"
                text="Курстарды басқару."
                to="/manage-courses"
                icon={<BookOpen size={18} />}
                tone="primary"
              />

              <QuickActionCard
                title="Сабақтар"
                text="Сабақтарды басқару."
                to="/manage-lessons"
                icon={<FileText size={18} />}
                tone="success"
              />

              <QuickActionCard
                title="Тесттер"
                text="Тесттерді басқару."
                to="/manage-tests"
                icon={<ClipboardList size={18} />}
                tone="accent"
              />

              <QuickActionCard
                title="Модерация"
                text={`${pendingReviewsCount} материал тексеруде.`}
                to="/moderation"
                icon={<Eye size={18} />}
                tone="warning"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <PanelCard
                  title="Ақылы курс сұраныстары"
                  icon={<CreditCard size={14} />}
                  action={
                    pendingOrdersCount > 0 ? (
                      <StatusBadge tone="warning">
                        {pendingOrdersCount} күтуде
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Таза</StatusBadge>
                    )
                  }
                >
                  {pendingOrdersLoading ? (
                    <LoadingState text="Сұраныстар жүктелуде..." compact />
                  ) : null}

                  {pendingOrdersError ? (
                    <ErrorState
                      text="Сұраныстарды жүктеу мүмкін болмады."
                      compact
                    />
                  ) : null}

                  {!pendingOrdersLoading &&
                  !pendingOrdersError &&
                  sortedPendingOrders.length === 0 ? (
                    <EmptyState
                      title="Күтудегі сұраныс жоқ"
                      text="Ақылы курсқа жаңа сұраныс түскен жоқ."
                      compact
                    />
                  ) : null}

                  {!pendingOrdersLoading &&
                  !pendingOrdersError &&
                  sortedPendingOrders.length > 0 ? (
                    <div className="space-y-3">
                      {sortedPendingOrders.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/45 hover:shadow-soft-md"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone="warning">
                                  {getOrderStatusLabel(order.status)}
                                </StatusBadge>

                                <StatusBadge tone="muted">
                                  {getProductTypeLabel(order.product_type)}
                                </StatusBadge>
                              </div>

                              <p className="text-base font-semibold text-foreground">
                                {formatMoney(order.amount, order.currency)}
                              </p>

                              <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                                <p>Тапсырыс: #{truncateId(order.id)}</p>
                                <p>Сатып алушы: #{truncateId(order.buyer_id)}</p>
                                <p>Өнім: #{truncateId(order.product_id)}</p>
                                <p>Жіберілді: {formatDateTime(order.created_at)}</p>
                              </div>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              onClick={() => approveOrder(order.id)}
                              disabled={approveOrderMutation.isPending}
                            >
                              <CheckCircle2 size={14} className="mr-1.5" />
                              {approveOrderMutation.isPending
                                ? 'Расталуда...'
                                : 'Растау'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </PanelCard>

                <PanelCard
                  title="Курсты қолмен ашу"
                  icon={<ShieldCheck size={14} />}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="manual-student-id">Оқушы ID</Label>
                      <Input
                        id="manual-student-id"
                        value={manualGrantForm.userId}
                        maxLength={MAX_ID_CHARS}
                        onChange={(event) =>
                          updateManualGrantForm('userId', event.target.value)
                        }
                        placeholder="Оқушы ID"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="manual-course-id">Курс ID</Label>
                      <Input
                        id="manual-course-id"
                        value={manualGrantForm.courseId}
                        maxLength={MAX_ID_CHARS}
                        onChange={(event) =>
                          updateManualGrantForm('courseId', event.target.value)
                        }
                        placeholder="Курс ID"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="manual-grant-reason">Себебі</Label>
                    <Input
                      id="manual-grant-reason"
                      value={manualGrantForm.reason}
                      maxLength={MAX_REASON_CHARS}
                      onChange={(event) =>
                        updateManualGrantForm('reason', event.target.value)
                      }
                      placeholder="Мысалы: қолма-қол төледі"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={grantManualAccess}
                      disabled={manualGrantMutation.isPending}
                    >
                      <KeyRound size={14} className="mr-1.5" />
                      {manualGrantMutation.isPending
                        ? 'Берілуде...'
                        : 'Қолжетімділік беру'}
                    </Button>
                  </div>
                </PanelCard>

                <PanelCard
                  title={t('nav.moderation')}
                  icon={<Eye size={14} />}
                  action={
                    <Button type="button" variant="ghost" size="sm" asChild>
                      <Link to="/moderation">
                        {t('common.view')}
                        <ArrowRight size={14} className="ml-1.5" />
                      </Link>
                    </Button>
                  }
                >
                  {pendingReviews.length === 0 ? (
                    <EmptyState
                      title={t('page.admin_dashboard.moderation_empty.title')}
                      text={t('page.admin_dashboard.moderation_empty.text')}
                      compact
                    />
                  ) : (
                    <div className="space-y-3">
                      {pendingReviews.map((review) => (
                        <Link
                          key={review.id}
                          to="/moderation"
                          className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/45 hover:shadow-soft-md"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-foreground">
                                {getContentTypeLabel(review.content_type)}
                              </p>

                              <StatusBadge tone={getReviewStatusTone(review.status)}>
                                {getReviewStatusLabel(review.status)}
                              </StatusBadge>
                            </div>

                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {t('page.admin_dashboard.review_label')} #
                              {truncateId(review.content_id)} ·{' '}
                              {formatReviewDate(review.reviewed_at)}
                            </p>
                          </div>

                          <ArrowRight size={14} className="text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  )}
                </PanelCard>

                <PanelCard
                  title={t('page.admin_dashboard.subject_stats_title')}
                  icon={<BarChart3 size={14} />}
                >
                  {subjectStats.length === 0 ? (
                    <EmptyState
                      title={t('page.admin_dashboard.subject_stats_empty.title')}
                      text={t('page.admin_dashboard.subject_stats_empty.text')}
                      compact
                    />
                  ) : (
                    <div className="space-y-3">
                      {subjectStats.map((subject) => (
                        <div
                          key={subject.name}
                          className="rounded-3xl border border-border bg-card p-4 shadow-soft"
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                {subject.name}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {subject.courses} {t('dashboard.total_courses')} ·{' '}
                                {subject.lessons} {t('dashboard.total_lessons')}
                              </p>
                            </div>

                            <StatusBadge tone={getScoreTone(subject.avgScore)}>
                              {formatScore(subject.avgScore)}
                            </StatusBadge>
                          </div>

                          <ProgressBar
                            value={subject.avgScore}
                            size="sm"
                            tone={getProgressTone(subject.avgScore)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </PanelCard>
              </div>

              <div className="space-y-4">
                <PanelCard title={t('page.admin_dashboard.content_status_title')}>
                  <div className="space-y-3">
                    <StatRow
                      label={t('course.status.published')}
                      value={publishedCount}
                      icon={<CheckCircle2 size={13} />}
                      tone="success"
                    />
                    <StatRow
                      label={t('page.admin_dashboard.review_status.under_review')}
                      value={underReviewCount}
                      icon={<Eye size={13} />}
                      tone="warning"
                    />
                    <StatRow
                      label={t('course.status.draft')}
                      value={draftCount}
                      icon={<FileText size={13} />}
                    />
                    <StatRow
                      label={t('course.status.archived')}
                      value={archivedCount}
                      icon={<BookOpen size={13} />}
                    />

                    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          Жарияланған үлесі
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {publishedRatio}%
                        </span>
                      </div>

                      <ProgressBar value={publishedRatio} size="sm" tone="success" />
                    </div>
                  </div>
                </PanelCard>

                <PanelCard
                  title={t('nav.users')}
                  action={
                    <Button type="button" variant="ghost" size="sm" asChild>
                      <Link to="/manage-users">
                        {t('common.view')}
                        <ArrowRight size={14} className="ml-1.5" />
                      </Link>
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    <StatRow
                      label={t('role.student')}
                      value={stats.roleCounts.students}
                      icon={<Users size={13} />}
                      tone="primary"
                    />
                    <StatRow
                      label={t('role.teacher')}
                      value={stats.roleCounts.teachers}
                      icon={<ShieldCheck size={13} />}
                    />
                    <StatRow
                      label={t('role.parent')}
                      value={stats.roleCounts.parents}
                      icon={<Users size={13} />}
                    />
                    <StatRow
                      label={t('role.admin')}
                      value={stats.roleCounts.admins}
                      icon={<ShieldCheck size={13} />}
                      tone="warning"
                    />
                  </div>
                </PanelCard>

                <PanelCard title="Қысқаша бақылау">
                  <div className="space-y-3">
                    <StatRow
                      label="Күтудегі төлем"
                      value={
                        <StatusBadge tone={pendingOrdersCount > 0 ? 'warning' : 'success'}>
                          {pendingOrdersCount}
                        </StatusBadge>
                      }
                      icon={<CreditCard size={13} />}
                      tone={pendingOrdersCount > 0 ? 'warning' : 'success'}
                    />

                    <StatRow
                      label="Тексеру кезегі"
                      value={
                        <StatusBadge tone={pendingReviewsCount > 0 ? 'warning' : 'success'}>
                          {pendingReviewsCount}
                        </StatusBadge>
                      }
                      icon={<Eye size={13} />}
                      tone={pendingReviewsCount > 0 ? 'warning' : 'success'}
                    />
                  </div>
                </PanelCard>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
