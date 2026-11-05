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
        'group relative min-h-36 overflow-hidden rounded-2xl p-5 shadow-xs',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        featured
          ? 'bg-foreground text-background'
          : 'bg-card text-foreground hover:bg-card/90',
      )}
    >
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              featured
                ? 'bg-background/15 text-background'
                : 'bg-muted/60 text-foreground',
            )}
          >
            {icon}
          </span>

          <ArrowRight
            size={16}
            className={cn(
              'transition-transform duration-200 group-hover:translate-x-1',
              featured ? 'text-background/60' : 'text-muted-foreground',
            )}
          />
        </div>

        <div className="mt-auto pt-4">
          <p
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wider',
              featured ? 'text-background/50' : 'text-muted-foreground',
            )}
          >
            {cleanText(eyebrow, 80)}
          </p>

          <h2
            className={cn(
              'mt-1 text-lg font-bold tracking-tight',
              featured ? 'text-background' : 'text-foreground',
            )}
          >
            {cleanText(title, 120)}
          </h2>

          <p
            className={cn(
              'mt-0.5 text-xs leading-5',
              featured ? 'text-background/70' : 'text-muted-foreground',
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
        'group rounded-2xl bg-card p-4 shadow-xs',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
          {metric.icon}
        </span>

        <ArrowRight
          size={14}
          className="text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">
        {metric.value.toLocaleString('kk-KZ')}
      </p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">
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
        'group flex items-center gap-3.5 rounded-2xl p-4 shadow-xs',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        urgent
          ? 'bg-warning-soft/60'
          : 'bg-card hover:bg-card/90',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          urgent
            ? 'bg-warning-soft text-warning-foreground'
            : 'bg-muted/60 text-muted-foreground',
        )}
      >
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-bold text-foreground">{title}</p>
          <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background">
            {value}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{text}</p>
      </div>

      <ArrowRight
        size={14}
        className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
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
            className="rounded-2xl bg-card p-4 shadow-xs"
          >
            <SkeletonBlock className="h-9 w-9 rounded-full" />
            <SkeletonBlock className="mt-5 h-8 w-20" />
            <SkeletonBlock className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-36 rounded-2xl" />
        <SkeletonBlock className="h-36 rounded-2xl" />
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
        <section className="relative overflow-hidden rounded-3xl bg-card px-5 py-7 shadow-xs sm:px-8 sm:py-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-foreground/[0.045] blur-3xl"
          />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Sana автор кеңістігі
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] sm:text-4xl lg:text-5xl">
                Сәлем, {firstName}
              </h1>
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
              title="Жаңа курс құру"
              text="Құрылымды жинақтау және модульдер қосу"
              href="/create-course"
              icon={<Plus size={20} />}
              featured
            />
          </div>

          <ActionCard
            eyebrow="ЖИ"
            title="Автор көмекшісі"
            text="Сабақ жоспары мен мазмұн генерациясы"
            href="/ai-assistant"
            icon={<Bot size={20} />}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ActionCard
            eyebrow="Тест"
            title="Сұрақ генераторы"
            text="Сұрақтар мен жауап нұсқаларын дайындау"
            href="/ai-question-builder"
            icon={<ListChecks size={20} />}
          />

          <ActionCard
            eyebrow="Жұмыс"
            title="Курстарды басқару"
            text="Барлық курстар мен материалдар тізімі"
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
                <div className="rounded-3xl bg-card p-5 shadow-xs sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Жариялау ырғағы
                      </p>
                      <p className="mt-2 text-4xl font-black tracking-[-0.05em]">
                        {publishedRatio}%
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
                        ? 'Шешім күтуде'
                        : 'Кезек бос'
                    }
                    href="/moderation"
                    icon={<ShieldCheck size={18} />}
                    urgent={pendingReviewsCount > 0}
                  />


                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm font-bold">Басқару құралдары</p>
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
