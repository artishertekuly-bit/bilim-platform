import { useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import {
  useAdminDashboard,
  useManualApproveOrderMutation,
  useManualGrantCourseAccessMutation,
  usePendingOrdersForAdmin,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  KeyRound,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

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

function StatRow({
  label,
  value,
  valueClassName = 'font-medium',
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClassName}>{value}</span>
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">
            {t('dashboard.welcome', { name: firstName })}!
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('page.admin_dashboard.subtitle')}
          </p>
        </div>

        {isLoading ? <LoadingState text={t('page.admin_dashboard.loading')} /> : null}

        {error ? <ErrorState text={t('page.admin_dashboard.error')} /> : null}

        {!isLoading && !error && !data ? (
          <EmptyState
            title={t('page.admin_dashboard.empty.title')}
            text={t('page.admin_dashboard.empty.text')}
          />
        ) : null}

        {!isLoading && !error && data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={t('dashboard.total_students')}
                value={data.stats.totalStudents}
                icon={<Users size={16} />}
              />
              <StatCard
                label={t('dashboard.total_courses')}
                value={data.stats.totalCourses}
                icon={<BookOpen size={16} />}
              />
              <StatCard
                label={t('dashboard.total_lessons')}
                value={data.stats.totalLessons}
                icon={<FileText size={16} />}
              />
              <StatCard
                label={t('dashboard.total_tests')}
                value={data.stats.totalTests}
                icon={<ClipboardList size={16} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <CreditCard size={14} />
                      Ақылы курс сұраныстары
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {pendingOrdersLoading ? (
                      <LoadingState text="Pending order-лар жүктелуде..." />
                    ) : null}

                    {pendingOrdersError ? (
                      <ErrorState text="Pending order-ларды жүктеу мүмкін болмады." />
                    ) : null}

                    {!pendingOrdersLoading &&
                    !pendingOrdersError &&
                    sortedPendingOrders.length === 0 ? (
                      <EmptyState
                        title="Pending order жоқ"
                        text="Оқушылардан ақылы курсқа access сұранысы түскен жоқ."
                      />
                    ) : null}

                    {!pendingOrdersLoading &&
                    !pendingOrdersError &&
                    sortedPendingOrders.length > 0 ? (
                      <div className="space-y-3">
                        {sortedPendingOrders.map((order) => (
                          <div
                            key={order.id}
                            className="rounded-xl border border-border p-4"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                                    {order.status}
                                  </span>
                                  <span className="rounded-full border px-2 py-1 text-[10px] text-muted-foreground">
                                    {order.product_type}
                                  </span>
                                </div>

                                <p className="text-sm font-semibold">
                                  {formatMoney(order.amount, order.currency)}
                                </p>

                                <p className="text-[11px] text-muted-foreground">
                                  Order: #{truncateId(order.id)}
                                </p>

                                <p className="text-[11px] text-muted-foreground">
                                  Buyer: #{truncateId(order.buyer_id)}
                                </p>

                                <p className="text-[11px] text-muted-foreground">
                                  Course/Product: #{truncateId(order.product_id)}
                                </p>

                                <p className="text-[11px] text-muted-foreground">
                                  Жіберілген уақыты: {formatDateTime(order.created_at)}
                                </p>
                              </div>

                              <Button
                                size="sm"
                                onClick={() => approveOrder(order.id)}
                                disabled={approveOrderMutation.isPending}
                              >
                                <CheckCircle2 size={14} className="mr-1.5" />
                                Approve
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck size={14} />
                      Manual course access
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Бұл бөлім payment қоспай тұрып, admin арқылы оқушыға ақылы
                      немесе жабық курсқа қолмен access беру үшін керек.
                    </p>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>User ID</Label>
                        <Input
                          value={manualGrantForm.userId}
                          onChange={(e) =>
                            setManualGrantForm((prev) => ({
                              ...prev,
                              userId: e.target.value,
                            }))
                          }
                          placeholder="student user_id"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Course ID</Label>
                        <Input
                          value={manualGrantForm.courseId}
                          onChange={(e) =>
                            setManualGrantForm((prev) => ({
                              ...prev,
                              courseId: e.target.value,
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
                        onChange={(e) =>
                          setManualGrantForm((prev) => ({
                            ...prev,
                            reason: e.target.value,
                          }))
                        }
                        placeholder="Мысалы: қолма-қол төледі / тест үшін ашылды"
                      />
                    </div>

                    <Button
                      onClick={grantManualAccess}
                      disabled={manualGrantMutation.isPending}
                    >
                      <KeyRound size={14} className="mr-1.5" />
                      Access беру
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Eye size={14} />
                      {t('nav.moderation')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {pendingReviews.length === 0 ? (
                      <EmptyState
                        title={t('page.admin_dashboard.moderation_empty.title')}
                        text={t('page.admin_dashboard.moderation_empty.text')}
                      />
                    ) : (
                      pendingReviews.map((review) => (
                        <div
                          key={review.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {getContentTypeLabel(review.content_type)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t('page.admin_dashboard.review_label')} #{review.content_id} ·{' '}
                              {formatReviewDate(review.reviewed_at)}
                            </p>
                          </div>

                          <span className="text-[11px] text-warning">
                            {getReviewStatusLabel(review.status)}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('page.admin_dashboard.subject_stats_title')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    {subjectStats.length === 0 ? (
                      <EmptyState
                        title={t('page.admin_dashboard.subject_stats_empty.title')}
                        text={t('page.admin_dashboard.subject_stats_empty.text')}
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="py-2 text-left font-medium text-muted-foreground">
                                {t('page.admin_dashboard.table.subject')}
                              </th>
                              <th className="py-2 text-center font-medium text-muted-foreground">
                                {t('dashboard.total_courses')}
                              </th>
                              <th className="py-2 text-center font-medium text-muted-foreground">
                                {t('dashboard.total_lessons')}
                              </th>
                              <th className="py-2 text-center font-medium text-muted-foreground">
                                {t('page.admin_dashboard.table.avg_score')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {subjectStats.map((s) => (
                              <tr key={s.name} className="border-b border-border last:border-0">
                                <td className="py-2.5 font-medium">{s.name}</td>
                                <td className="py-2.5 text-center">{s.courses}</td>
                                <td className="py-2.5 text-center">{s.lessons}</td>
                                <td className="py-2.5 text-center">{s.avgScore}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('page.admin_dashboard.content_status_title')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2.5">
                    <StatRow
                      label={t('course.status.published')}
                      value={data.contentStatus.published}
                    />
                    <StatRow
                      label={t('page.admin_dashboard.review_status.under_review')}
                      value={data.contentStatus.underReview}
                      valueClassName="font-medium text-warning"
                    />
                    <StatRow
                      label={t('course.status.draft')}
                      value={data.contentStatus.draft}
                    />
                    <StatRow
                      label={t('course.status.archived')}
                      value={data.contentStatus.archived}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('nav.users')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2.5">
                    <StatRow
                      label={t('role.student')}
                      value={data.roleCounts.students}
                    />
                    <StatRow
                      label={t('role.teacher')}
                      value={data.roleCounts.teachers}
                    />
                    <StatRow
                      label={t('role.parent')}
                      value={data.roleCounts.parents}
                    />
                    <StatRow
                      label={t('role.admin')}
                      value={data.roleCounts.admins}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}