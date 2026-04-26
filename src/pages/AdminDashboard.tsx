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
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
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

function formatReviewDate(value: string | null | undefined) {
  if (!value) return t('page.admin_dashboard.not_available');

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString('kk-KZ');
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(amount: number | string | null | undefined, currency?: string | null) {
  const value = Number(amount || 0);
  const code = currency || 'KZT';

  if (!Number.isFinite(value)) return `0 ${code}`;

  return `${value.toLocaleString('kk-KZ')} ${code}`;
}

function truncateId(value: string | null | undefined) {
  if (!value) return '—';
  if (value.length <= 14) return value;

  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function getContentTypeLabel(value: string) {
  const map: Record<string, string> = {
    course: t('nav.courses'),
    lesson: t('nav.lessons'),
    test: t('nav.tests'),
  };

  return map[value] || value;
}

function getReviewStatusLabel(value: string) {
  const map: Record<string, string> = {
    under_review: t('page.admin_dashboard.review_status.under_review'),
    published: t('course.status.published'),
    draft: t('course.status.draft'),
    archived: t('course.status.archived'),
  };

  return map[value] || value;
}

function getReviewStatusTone(value: string) {
  if (value === 'published') return 'success' as const;
  if (value === 'under_review') return 'warning' as const;
  if (value === 'archived') return 'muted' as const;
  return 'completed' as const;
}

function getScoreTone(value: number | null | undefined) {
  const score = Number(value || 0);

  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
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
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 ${toneClassName}`}>
      <span className="inline-flex min-w-0 items-center gap-2 text-xs">
        {icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
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
            {title}
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
      className={`group rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-soft-md active:translate-y-0 active:scale-[0.99] ${toneClassName.card}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${toneClassName.icon}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
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
          <div key={index} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
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
          <div key={index} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
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
            <div key={cardIndex} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <SkeletonBlock className="h-5 w-44" />

              <div className="mt-5 space-y-3">
                {Array.from({ length: 3 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="rounded-3xl border border-border p-3">
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
            <div key={index} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
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

  const { data, isLoading, error } = useAdminDashboard(!!user?.id);
  const {
    data: pendingOrders,
    isLoading: pendingOrdersLoading,
    error: pendingOrdersError,
  } = usePendingOrdersForAdmin(!!user?.id);

  const approveOrderMutation = useManualApproveOrderMutation(user?.id);
  const manualGrantMutation = useManualGrantCourseAccessMutation(user?.id);

  const [manualGrantForm, setManualGrantForm] = useState({
    userId: '',
    courseId: '',
    reason: '',
  });

  const firstName = useMemo(
    () => user?.fullName?.trim().split(/\s+/)[0] || t('role.admin'),
    [user?.fullName]
  );

  const pendingReviews = useMemo(
    () =>
      [...(data?.pendingReviews || [])].sort((a, b) => {
        const da = a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0;
        const db = b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0;
        return db - da;
      }),
    [data?.pendingReviews]
  );

  const subjectStats = useMemo(
    () => data?.subjectStats || [],
    [data?.subjectStats]
  );

  const sortedPendingOrders = useMemo(
    () =>
      [...(pendingOrders || [])].sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      }),
    [pendingOrders]
  );

  const approveOrder = async (orderId: string) => {
    try {
      await approveOrderMutation.mutateAsync(orderId);

      toast({
        title: 'Order расталды',
        description: 'Оқушыға курс access берілді.',
      });
    } catch (approveError) {
      toast({
        title: 'Order растау мүмкін болмады',
        description:
          approveError instanceof Error
            ? approveError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const grantManualAccess = async () => {
    const userId = manualGrantForm.userId.trim();
    const courseId = manualGrantForm.courseId.trim();
    const reason = manualGrantForm.reason.trim();

    if (!userId || !courseId) {
      toast({
        title: 'User ID және Course ID қажет',
        description: 'Manual access беру үшін екі ID да толтырылуы керек.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await manualGrantMutation.mutateAsync({
        userId,
        courseId,
        reason: reason || 'Manual admin grant',
        adminId: user?.id,
      });

      setManualGrantForm({
        userId: '',
        courseId: '',
        reason: '',
      });

      toast({
        title: 'Access берілді',
        description: 'Оқушыға курс entitlement қосылды.',
      });
    } catch (grantError) {
      toast({
        title: 'Manual access беру мүмкін болмады',
        description:
          grantError instanceof Error
            ? grantError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const pendingOrdersCount = sortedPendingOrders.length;
  const pendingReviewsCount = pendingReviews.length;
  const publishedCount = data?.contentStatus.published || 0;
  const underReviewCount = data?.contentStatus.underReview || 0;
  const draftCount = data?.contentStatus.draft || 0;
  const archivedCount = data?.contentStatus.archived || 0;
  const totalContentStatus =
    publishedCount + underReviewCount + draftCount + archivedCount;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutDashboard size={13} />
              Admin dashboard
            </>
          }
          icon={<ShieldCheck size={20} />}
          title={`${t('dashboard.welcome', { name: firstName })}!`}
          description={t('page.admin_dashboard.subtitle')}
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
                value={data.stats.totalStudents}
                icon={<Users size={16} />}
                tone="primary"
              />
              <StatCard
                label={t('dashboard.total_courses')}
                value={data.stats.totalCourses}
                icon={<BookOpen size={16} />}
                tone="success"
              />
              <StatCard
                label={t('dashboard.total_lessons')}
                value={data.stats.totalLessons}
                icon={<FileText size={16} />}
                tone="secondary"
              />
              <StatCard
                label={t('dashboard.total_tests')}
                value={data.stats.totalTests}
                icon={<ClipboardList size={16} />}
                tone="accent"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <QuickActionCard
                title="Курстар"
                text="Курстарды қарау, тексеру және басқару."
                to="/manage-courses"
                icon={<BookOpen size={18} />}
                tone="primary"
              />

              <QuickActionCard
                title="Сабақтар"
                text="Сабақ контентін басқару және модерациялау."
                to="/manage-lessons"
                icon={<FileText size={18} />}
                tone="success"
              />

              <QuickActionCard
                title="Тесттер"
                text="Тесттерді қарап, жалпы контент сапасын бақылау."
                to="/manage-tests"
                icon={<ClipboardList size={18} />}
                tone="accent"
              />

              <QuickActionCard
                title="Модерация"
                text={`${pendingReviewsCount} review элементі бақылауда.`}
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
                        {pendingOrdersCount} pending
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Таза</StatusBadge>
                    )
                  }
                >
                  {pendingOrdersLoading ? (
                    <LoadingState text="Pending order-лар жүктелуде..." compact />
                  ) : null}

                  {pendingOrdersError ? (
                    <ErrorState text="Pending order-ларды жүктеу мүмкін болмады." compact />
                  ) : null}

                  {!pendingOrdersLoading &&
                  !pendingOrdersError &&
                  sortedPendingOrders.length === 0 ? (
                    <EmptyState
                      title="Pending order жоқ"
                      text="Оқушылардан ақылы курсқа access сұранысы түскен жоқ."
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
                                  {order.status}
                                </StatusBadge>

                                <StatusBadge tone="muted">
                                  {order.product_type}
                                </StatusBadge>
                              </div>

                              <p className="text-base font-semibold text-foreground">
                                {formatMoney(order.amount, order.currency)}
                              </p>

                              <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                                <p>Order: #{truncateId(order.id)}</p>
                                <p>Buyer: #{truncateId(order.buyer_id)}</p>
                                <p>Course/Product: #{truncateId(order.product_id)}</p>
                                <p>Жіберілген уақыты: {formatDateTime(order.created_at)}</p>
                              </div>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              onClick={() => approveOrder(order.id)}
                              disabled={approveOrderMutation.isPending}
                            >
                              <CheckCircle2 size={14} className="mr-1.5" />
                              {approveOrderMutation.isPending ? 'Расталуда...' : 'Approve'}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </PanelCard>

                <PanelCard
                  title="Manual course access"
                  icon={<ShieldCheck size={14} />}
                >
                  <div className="rounded-3xl border border-ai-border bg-ai-soft/65 p-4 text-xs leading-5 text-muted-foreground">
                    Payment толық қосылмай тұрып, admin оқушыға ақылы немесе жабық
                    курсқа access бере алады. Бұл MVP кезеңіндегі қолмен басқару құралы.
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>User ID</Label>
                      <Input
                        value={manualGrantForm.userId}
                        onChange={(event) =>
                          setManualGrantForm((previous) => ({
                            ...previous,
                            userId: event.target.value,
                          }))
                        }
                        placeholder="student user_id"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Course ID</Label>
                      <Input
                        value={manualGrantForm.courseId}
                        onChange={(event) =>
                          setManualGrantForm((previous) => ({
                            ...previous,
                            courseId: event.target.value,
                          }))
                        }
                        placeholder="course id"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Себебі</Label>
                    <Input
                      value={manualGrantForm.reason}
                      onChange={(event) =>
                        setManualGrantForm((previous) => ({
                          ...previous,
                          reason: event.target.value,
                        }))
                      }
                      placeholder="Мысалы: қолма-қол төледі / тест үшін ашылды"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={grantManualAccess}
                      disabled={manualGrantMutation.isPending}
                    >
                      <KeyRound size={14} className="mr-1.5" />
                      {manualGrantMutation.isPending ? 'Беріліп жатыр...' : 'Access беру'}
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
                        <div
                          key={review.id}
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
                              {t('page.admin_dashboard.review_label')} #{review.content_id} ·{' '}
                              {formatReviewDate(review.reviewed_at)}
                            </p>
                          </div>

                          <ArrowRight size={14} className="text-muted-foreground" />
                        </div>
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
                              {subject.avgScore}%
                            </StatusBadge>
                          </div>

                          <ProgressBar
                            value={subject.avgScore}
                            size="sm"
                            tone={getScoreTone(subject.avgScore)}
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
                          Published ratio
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {totalContentStatus > 0
                            ? Math.round((publishedCount / totalContentStatus) * 100)
                            : 0}
                          %
                        </span>
                      </div>

                      <ProgressBar
                        value={
                          totalContentStatus > 0
                            ? Math.round((publishedCount / totalContentStatus) * 100)
                            : 0
                        }
                        size="sm"
                        tone="success"
                      />
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
                      value={data.roleCounts.students}
                      icon={<Users size={13} />}
                      tone="primary"
                    />
                    <StatRow
                      label={t('role.teacher')}
                      value={data.roleCounts.teachers}
                      icon={<ShieldCheck size={13} />}
                    />
                    <StatRow
                      label={t('role.parent')}
                      value={data.roleCounts.parents}
                      icon={<Users size={13} />}
                    />
                    <StatRow
                      label={t('role.admin')}
                      value={data.roleCounts.admins}
                      icon={<ShieldCheck size={13} />}
                      tone="warning"
                    />
                  </div>
                </PanelCard>

                <PanelCard title="Admin қысқаша бақылау">
                  <div className="space-y-3">
                    <StatRow
                      label="Pending order"
                      value={
                        <StatusBadge tone={pendingOrdersCount > 0 ? 'warning' : 'success'}>
                          {pendingOrdersCount}
                        </StatusBadge>
                      }
                      icon={<CreditCard size={13} />}
                      tone={pendingOrdersCount > 0 ? 'warning' : 'success'}
                    />

                    <StatRow
                      label="Review queue"
                      value={
                        <StatusBadge tone={pendingReviewsCount > 0 ? 'warning' : 'success'}>
                          {pendingReviewsCount}
                        </StatusBadge>
                      }
                      icon={<Eye size={13} />}
                      tone={pendingReviewsCount > 0 ? 'warning' : 'success'}
                    />

                    <div className="rounded-3xl border border-ai-border bg-ai-soft/65 p-4 text-xs leading-5 text-muted-foreground">
                      Бұл dashboard MVP admin бақылауын көрсетеді: user саны,
                      контент статусы, ақылы course access және moderation queue.
                    </div>
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