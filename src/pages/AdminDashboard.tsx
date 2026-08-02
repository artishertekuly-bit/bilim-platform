import {
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileText,
  KeyRound,
  ListChecks,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import ProgressBar from '@/components/ProgressBar';
import StatusBadge from '@/components/common/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
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
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 180;
const MAX_TEXT_CHARS = 280;
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

type DashboardMetric = {
  label: string;
  value: number;
  icon: ReactNode;
  href: string;
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

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.round(numericValue));
}

function normalizeMoneyAmount(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, numericValue);
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, normalizeNumber(value)));
}

function getErrorMessage(
  error: unknown,
  fallback = 'Белгісіз қате пайда болды.',
): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function normalizeCurrency(value: unknown): string {
  return (
    cleanText(value, MAX_CURRENCY_CHARS).toUpperCase() || DEFAULT_CURRENCY
  );
}

function formatMoney(amount: unknown, currency?: unknown): string {
  const value = normalizeMoneyAmount(amount);
  const code = normalizeCurrency(currency);

  return `${value.toLocaleString('kk-KZ')} ${code}`;
}

function formatDateTime(value: string | null | undefined): string {
  const rawValue = cleanText(value, 80);

  if (!rawValue) {
    return '—';
  }

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString('kk-KZ', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateId(value: string | null | undefined): string {
  const id = cleanId(value);

  if (!id) {
    return '—';
  }

  if (id.length <= 14) {
    return id;
  }

  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function normalizeContentType(value: unknown): ContentType {
  const normalized = cleanText(value, 80).toLowerCase();

  if (
    normalized === 'course' ||
    normalized === 'lesson' ||
    normalized === 'test'
  ) {
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

function getContentTypeLabel(value: unknown): string {
  const normalized = normalizeContentType(value);

  const labels: Record<ContentType, string> = {
    course: 'Курс',
    lesson: 'Сабақ',
    test: 'Тест',
    unknown: 'Материал',
  };

  return labels[normalized];
}

function getOrderStatusLabel(value: unknown): string {
  const normalized = normalizeOrderStatus(value);

  const labels: Record<OrderStatus, string> = {
    pending: 'Күтуде',
    paid: 'Төленді',
    approved: 'Расталды',
    rejected: 'Қабылданбады',
    cancelled: 'Бас тартылды',
  };

  return labels[normalized];
}

function getProductTypeLabel(value: unknown): string {
  const normalized = cleanText(value, 80).toLowerCase();

  const labels: Record<string, string> = {
    course: 'Курс',
    lesson: 'Сабақ',
    test: 'Тест',
    bundle: 'Жинақ',
  };

  return labels[normalized] || 'Өнім';
}

function normalizePendingReviews(input: unknown): PendingReviewItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();

  return input.reduce<PendingReviewItem[]>((items, item) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id);

    if (!id || seen.has(id)) {
      return items;
    }

    seen.add(id);

    items.push({
      id,
      content_id: cleanId(row.content_id),
      content_type: normalizeContentType(row.content_type),
      status: normalizeReviewStatus(row.status),
      reviewed_at: cleanText(row.reviewed_at, 80) || null,
    });

    return items;
  }, []);
}

function normalizePendingOrders(input: unknown): PendingOrderItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();

  return input.reduce<PendingOrderItem[]>((items, item) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id);

    if (!id || seen.has(id)) {
      return items;
    }

    seen.add(id);

    items.push({
      id,
      status: normalizeOrderStatus(row.status),
      amount: normalizeMoneyAmount(row.amount),
      currency: normalizeCurrency(row.currency),
      product_type: cleanText(row.product_type, 80),
      buyer_id: cleanId(row.buyer_id),
      product_id: cleanId(row.product_id),
      created_at: cleanText(row.created_at, 80) || null,
    });

    return items;
  }, []);
}

function ActionCard({
  eyebrow,
  title,
  text,
  href,
  icon,
  featured = false,
}: {
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  icon: ReactNode;
  featured?: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        'group relative min-h-56 overflow-hidden rounded-[2rem] border p-5',
        'transition-[transform,border-color,box-shadow] duration-200 ease-soft',
        'hover:-translate-y-1 hover:shadow-soft-lg active:translate-y-0 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        featured
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground hover:border-foreground/20',
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl',
          featured ? 'bg-background/15' : 'bg-foreground/[0.04]',
        )}
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full border',
              featured
                ? 'border-background/20 bg-background/10'
                : 'border-border bg-background',
            )}
          >
            {icon}
          </span>

          <ArrowRight
            size={18}
            className="transition-transform duration-200 group-hover:translate-x-1"
          />
        </div>

        <div className="mt-auto pt-10">
          <p
            className={cn(
              'text-[10px] font-semibold uppercase tracking-[0.18em]',
              featured ? 'text-background/55' : 'text-muted-foreground',
            )}
          >
            {cleanText(eyebrow, 80)}
          </p>

          <h2
            className={cn(
              'mt-2 text-2xl font-black tracking-[-0.045em]',
              featured ? 'text-background' : 'text-foreground',
            )}
          >
            {cleanText(title, 120)}
          </h2>

          <p
            className={cn(
              'mt-3 max-w-md text-sm leading-6',
              featured ? 'text-background/65' : 'text-muted-foreground',
            )}
          >
            {cleanText(text)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <Link
      to={metric.href}
      className={cn(
        'group rounded-[1.5rem] border border-border bg-card p-4',
        'transition-[transform,border-color,box-shadow] duration-200 ease-soft',
        'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-soft-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          {metric.icon}
        </span>

        <ArrowRight
          size={14}
          className="text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>

      <p className="mt-5 text-3xl font-black tracking-[-0.045em]">
        {metric.value.toLocaleString('kk-KZ')}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {metric.label}
      </p>
    </Link>
  );
}

function AttentionCard({
  title,
  value,
  text,
  href,
  icon,
  urgent,
}: {
  title: string;
  value: number;
  text: string;
  href: string;
  icon: ReactNode;
  urgent?: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        'group flex items-center gap-4 rounded-[1.5rem] border p-4',
        'transition-[transform,border-color,background-color] duration-200 ease-soft',
        'hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        urgent
          ? 'border-warning-muted bg-warning-soft/55 hover:border-warning'
          : 'border-border bg-card hover:border-foreground/20',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border',
          urgent
            ? 'border-warning-muted bg-background text-warning-foreground'
            : 'border-border bg-background text-muted-foreground',
        )}
      >
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold">{title}</p>
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">
            {value}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
      </div>

      <ArrowRight
        size={16}
        className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1"
      />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.5rem] border border-border bg-card p-4"
          >
            <SkeletonBlock className="h-9 w-9 rounded-full" />
            <SkeletonBlock className="mt-5 h-8 w-20" />
            <SkeletonBlock className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-36 rounded-[2rem]" />
        <SkeletonBlock className="h-36 rounded-[2rem]" />
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

  const firstName = useMemo(() => {
    const fullName = cleanText(user?.fullName, MAX_NAME_CHARS);
    const emailName = cleanText(user?.email?.split('@')[0], MAX_NAME_CHARS);

    return fullName.split(/\s+/)[0] || emailName || 'Автор';
  }, [user?.email, user?.fullName]);

  const pendingReviews = useMemo(
    () =>
      normalizePendingReviews(data?.pendingReviews).sort((a, b) => {
        const firstDate = a.reviewed_at
          ? new Date(a.reviewed_at).getTime()
          : 0;
        const secondDate = b.reviewed_at
          ? new Date(b.reviewed_at).getTime()
          : 0;

        return secondDate - firstDate;
      }),
    [data?.pendingReviews],
  );

  const sortedPendingOrders = useMemo(
    () =>
      normalizePendingOrders(pendingOrders).sort((a, b) => {
        const firstDate = a.created_at
          ? new Date(a.created_at).getTime()
          : 0;
        const secondDate = b.created_at
          ? new Date(b.created_at).getTime()
          : 0;

        return secondDate - firstDate;
      }),
    [pendingOrders],
  );

  const stats = useMemo(
    () => ({
      students: normalizeNumber(data?.stats?.totalStudents),
      courses: normalizeNumber(data?.stats?.totalCourses),
      lessons: normalizeNumber(data?.stats?.totalLessons),
      tests: normalizeNumber(data?.stats?.totalTests),
      published: normalizeNumber(data?.contentStatus?.published),
      underReview: normalizeNumber(data?.contentStatus?.underReview),
      draft: normalizeNumber(data?.contentStatus?.draft),
      archived: normalizeNumber(data?.contentStatus?.archived),
    }),
    [data],
  );

  const metrics = useMemo<DashboardMetric[]>(
    () => [
      {
        label: 'Курс',
        value: stats.courses,
        icon: <BookOpen size={16} />,
        href: '/manage-courses',
      },
      {
        label: 'Сабақ',
        value: stats.lessons,
        icon: <FileText size={16} />,
        href: '/manage-lessons',
      },
      {
        label: 'Тест',
        value: stats.tests,
        icon: <ClipboardList size={16} />,
        href: '/manage-tests',
      },
      {
        label: 'Оқушы',
        value: stats.students,
        icon: <Users size={16} />,
        href: '/manage-users',
      },
    ],
    [stats],
  );

  const totalContent =
    stats.published + stats.underReview + stats.draft + stats.archived;

  const publishedRatio =
    totalContent > 0
      ? Math.round((stats.published / totalContent) * 100)
      : 0;

  const pendingOrdersCount = sortedPendingOrders.length;
  const pendingReviewsCount = pendingReviews.length;

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

    if (!safeOrderId) {
      return;
    }

    try {
      await approveOrderMutation.mutateAsync(safeOrderId);

      toast({
        title: 'Тапсырыс расталды',
        description: 'Курс оқушыға ашылды.',
      });
    } catch (approveError) {
      toast({
        title: 'Растау мүмкін болмады',
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
        title: 'Екі ID қажет',
        description: 'Оқушы мен курс ID өрістерін толтырыңыз.',
        variant: 'destructive',
      });
      return;
    }

    if (!safeAdminId) {
      toast({
        title: 'Автор аккаунты анықталмады',
        description: 'Қайта кіріп көріңіз.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await manualGrantMutation.mutateAsync({
        userId: studentId,
        courseId,
        reason: reason || 'Автор қолмен ашты',
        adminId: safeAdminId,
      });

      setManualGrantForm({
        userId: '',
        courseId: '',
        reason: '',
      });

      toast({
        title: 'Курс ашылды',
        description: 'Оқушы енді курсқа кіре алады.',
      });
    } catch (grantError) {
      toast({
        title: 'Қолжетімділік беру мүмкін болмады',
        description: getErrorMessage(grantError),
        variant: 'destructive',
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-8">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-border bg-card px-5 py-7 shadow-soft sm:px-8 sm:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-foreground/[0.045] blur-3xl"
          />

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Sana автор кеңістігі
              </p>

              <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Сәлем, {firstName}.
                <span className="block text-muted-foreground">
                  Бүгін не жасаймыз?
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Курсты жалғастырыңыз, жаңа идеяны бастаңыз немесе ЖИ-мен
                материалды тезірек дайындаңыз.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                asChild
              >
                <Link to="/manage-courses">
                  <BookOpen size={15} className="mr-2" />
                  Курстарым
                </Link>
              </Button>

              <Button type="button" className="rounded-full" asChild>
                <Link to="/create-course">
                  <Plus size={15} className="mr-2" />
                  Жаңа курс
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActionCard
              eyebrow="Бастау"
              title="Жаңа курсқа алғашқы қадам"
              text="Идеядан бастап модульдерге дейін курс құрылымын бір кеңістікте жинаңыз."
              href="/create-course"
              icon={<Plus size={20} />}
              featured
            />
          </div>

          <ActionCard
            eyebrow="ЖИ"
            title="Автор көмекшісі"
            text="Сабақ жоспарын ойлаңыз, мәтінді жинақтаңыз немесе жаңа бағыт табыңыз."
            href="/ai-assistant"
            icon={<Bot size={20} />}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ActionCard
            eyebrow="Тест"
            title="Сұрақ генераторы"
            text="Тақырыптан сұрақтар, жауап нұсқалары және түсіндірмелер дайындаңыз."
            href="/ai-question-builder"
            icon={<ListChecks size={20} />}
          />

          <ActionCard
            eyebrow="Жұмыс"
            title="Курстарды жалғастыру"
            text="Барлық курсты ашып, мазмұнды өңдеңіз немесе жариялауға дайындаңыз."
            href="/manage-courses"
            icon={<BookOpen size={20} />}
          />
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Қысқаша көрініс
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">
                Sana бүгін
              </h2>
            </div>

            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to="/admin-analytics">
                Толық талдау
                <ArrowRight size={14} className="ml-2" />
              </Link>
            </Button>
          </div>

          {isLoading ? <DashboardSkeleton /> : null}

          {!isLoading && error ? (
            <ErrorState
              text="Көрсеткіштерді жүктеу мүмкін болмады."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw size={15} className="mr-2" />
                  Қайта жүктеу
                </Button>
              }
            />
          ) : null}

          {!isLoading && !error ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <MetricCard key={metric.label} metric={metric} />
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Жариялау ырғағы
                      </p>
                      <p className="mt-2 text-4xl font-black tracking-[-0.05em]">
                        {publishedRatio}%
                      </p>
                      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        Материалдардың жарияланған бөлігі. Қалғаны черновикте
                        немесе тексеруде.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-56">
                      <div className="rounded-2xl bg-success-soft p-3">
                        <p className="font-bold text-success-foreground">
                          {stats.published}
                        </p>
                        <p className="mt-1 text-success-foreground/75">
                          Жарияланды
                        </p>
                      </div>
                      <div className="rounded-2xl bg-muted p-3">
                        <p className="font-bold">{stats.draft}</p>
                        <p className="mt-1 text-muted-foreground">Черновик</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <ProgressBar
                      value={publishedRatio}
                      size="sm"
                      tone="success"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <AttentionCard
                    title="Тексеру кезегі"
                    value={pendingReviewsCount}
                    text={
                      pendingReviewsCount > 0
                        ? 'Материалдар шешім күтіп тұр.'
                        : 'Кезек бос.'
                    }
                    href="/moderation"
                    icon={<ShieldCheck size={18} />}
                    urgent={pendingReviewsCount > 0}
                  />

                  <AttentionCard
                    title="Төлем сұраныстары"
                    value={pendingOrdersCount}
                    text={
                      pendingOrdersCount > 0
                        ? 'Курсқа кіруді растау керек.'
                        : 'Күтудегі сұраныс жоқ.'
                    }
                    href="#service-tools"
                    icon={<CircleDollarSign size={18} />}
                    urgent={pendingOrdersCount > 0}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section
          id="service-tools"
          className="scroll-mt-24 rounded-[2rem] border border-border bg-card shadow-soft"
        >
          <details className="group">
            <summary
              className={cn(
                'flex cursor-pointer list-none items-center gap-4 p-5 sm:p-6',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35',
              )}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                <KeyRound size={18} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Қызметтік құралдар</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Төлемді растау және курсқа қолмен қолжетімділік беру.
                </p>
              </div>

              <ChevronDown
                size={18}
                className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              />
            </summary>

            <div className="border-t border-border p-5 sm:p-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold">
                          Төлемді растау
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Күтудегі тапсырысты растағаннан кейін курс ашылады.
                        </p>
                      </div>

                      <StatusBadge
                        tone={pendingOrdersCount > 0 ? 'warning' : 'success'}
                      >
                        {pendingOrdersCount}
                      </StatusBadge>
                    </div>
                  </div>

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
                      title="Күтудегі төлем жоқ"
                      text="Қазір растауды қажет ететін сұраныс жоқ."
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
                          className="rounded-[1.5rem] border border-border bg-background p-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone="warning">
                                  {getOrderStatusLabel(order.status)}
                                </StatusBadge>
                                <StatusBadge tone="muted">
                                  {getProductTypeLabel(order.product_type)}
                                </StatusBadge>
                              </div>

                              <p className="mt-3 text-lg font-black tracking-[-0.03em]">
                                {formatMoney(order.amount, order.currency)}
                              </p>

                              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                #{truncateId(order.id)} ·{' '}
                                {formatDateTime(order.created_at)}
                              </p>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              onClick={() => approveOrder(order.id)}
                              disabled={approveOrderMutation.isPending}
                            >
                              <Check size={14} className="mr-2" />
                              {approveOrderMutation.isPending
                                ? 'Расталуда...'
                                : 'Растау'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[1.75rem] border border-border bg-background p-4 sm:p-5">
                  <h3 className="text-base font-bold">Курсты қолмен ашу</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Оқушы мен курс ID арқылы тікелей қолжетімділік беріңіз.
                  </p>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="manual-student-id">Оқушы ID</Label>
                      <Input
                        id="manual-student-id"
                        value={manualGrantForm.userId}
                        maxLength={MAX_ID_CHARS}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updateManualGrantForm(
                            'userId',
                            event.target.value,
                          )
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
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updateManualGrantForm(
                            'courseId',
                            event.target.value,
                          )
                        }
                        placeholder="Курс ID"
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <Label htmlFor="manual-grant-reason">
                      Түсініктеме
                    </Label>
                    <Input
                      id="manual-grant-reason"
                      value={manualGrantForm.reason}
                      maxLength={MAX_REASON_CHARS}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateManualGrantForm(
                          'reason',
                          event.target.value,
                        )
                      }
                      placeholder="Мысалы: офлайн төлем"
                    />
                  </div>

                  <Button
                    type="button"
                    className="mt-4 w-full"
                    onClick={grantManualAccess}
                    disabled={manualGrantMutation.isPending}
                  >
                    <KeyRound size={14} className="mr-2" />
                    {manualGrantMutation.isPending
                      ? 'Ашылуда...'
                      : 'Курсқа қолжетімділік беру'}
                  </Button>
                </div>
              </div>

              {pendingReviews.length > 0 ? (
                <div className="mt-6 border-t border-border pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold">
                        Соңғы тексеру кезегі
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Алғашқы үш материал көрсетілді.
                      </p>
                    </div>

                    <Button type="button" variant="ghost" size="sm" asChild>
                      <Link to="/moderation">
                        Барлығын ашу
                        <ArrowRight size={14} className="ml-2" />
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {pendingReviews.slice(0, 3).map((review) => (
                      <Link
                        key={review.id}
                        to="/moderation"
                        className="rounded-[1.5rem] border border-border bg-background p-4 transition-colors hover:border-foreground/20"
                      >
                        <p className="text-sm font-bold">
                          {getContentTypeLabel(review.content_type)}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          #{truncateId(review.content_id)}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </section>

        <section className="flex flex-col gap-4 rounded-[2rem] border border-border bg-muted/45 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm font-bold">Sana-ны басқару</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Қолданушылар, аналитика және ескі әкімшілік құралдар.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/manage-users">
                <Users size={14} className="mr-2" />
                Қолданушылар
              </Link>
            </Button>

            <Button type="button" variant="outline" asChild>
              <Link to="/admin-analytics">
                <BarChart3 size={14} className="mr-2" />
                Аналитика
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
