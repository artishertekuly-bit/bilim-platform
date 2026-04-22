import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import t from '@/lib/i18n';
import { updateCourseStatus, updateTestStatus } from '@/lib/app-data';
import { platformKeys, useModerationQueue } from '@/hooks/use-platform-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';

const statuses = ['draft', 'under_review', 'published', 'archived'] as const;
type ModerationStatus = (typeof statuses)[number];
type ContentType = 'course' | 'test';

type ModerationMode = 'moderation' | 'tests';

function getMode(pathname: string): ModerationMode {
  if (pathname.startsWith('/manage-tests')) return 'tests';
  return 'moderation';
}

function getStatusLabel(status: ModerationStatus) {
  const statusMap: Record<ModerationStatus, string> = {
    draft: t('course.status.draft'),
    under_review: t('page.admin_moderation.status.under_review'),
    published: t('course.status.published'),
    archived: t('course.status.archived'),
  };

  return statusMap[status];
}

function getTypeLabel(type: ContentType) {
  const typeMap: Record<ContentType, string> = {
    course: t('nav.courses'),
    test: t('nav.tests'),
  };

  return typeMap[type];
}

function formatDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return t('page.admin_moderation.not_available');
  }

  return parsed.toLocaleString('kk-KZ');
}

function asModerationStatus(value: string): ModerationStatus {
  return statuses.includes(value as ModerationStatus)
    ? (value as ModerationStatus)
    : 'draft';
}

function asContentType(value: string): ContentType {
  return value === 'test' ? 'test' : 'course';
}

export default function AdminModerationPage() {
  const location = useLocation();
  const mode = getMode(location.pathname);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useModerationQueue(true);

  const visibleItems = useMemo(() => {
    const items = (data || []).filter((item) =>
      mode === 'tests' ? item.type === 'test' : true
    );

    return [...items].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
  }, [data, mode]);

  const pageTitle =
    mode === 'tests'
      ? t('page.admin_moderation.title.tests')
      : t('page.admin_moderation.title.moderation');

  const pageDescription =
    mode === 'tests'
      ? t('page.admin_moderation.description.tests')
      : t('page.admin_moderation.description.moderation');

  const emptyTitle =
    mode === 'tests'
      ? t('page.admin_moderation.empty.tests_title')
      : t('page.admin_moderation.empty.moderation_title');

  const emptyText =
    mode === 'tests'
      ? t('page.admin_moderation.empty.tests_text')
      : t('page.admin_moderation.empty.moderation_text');

  const mutation = useMutation({
    mutationFn: async ({
      type,
      id,
      status,
    }: {
      type: ContentType;
      id: string;
      status: ModerationStatus;
    }) => {
      if (type === 'course') return updateCourseStatus(id, status);
      return updateTestStatus(id, status);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: platformKeys.moderationQueue }),
        queryClient.invalidateQueries({ queryKey: platformKeys.adminDashboard }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['tests'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-course-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-tests-workspace'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-dashboard'] }),
      ]);

      toast({ title: t('page.admin_moderation.toast.status_updated') });
    },
    onError: () =>
      toast({
        title: t('page.admin_moderation.toast.error_title'),
        description: t('page.admin_moderation.toast.error_text'),
        variant: 'destructive',
      }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>

        {isLoading ? <LoadingState text={t('page.admin_moderation.loading')} /> : null}

        {error ? <ErrorState text={t('page.admin_moderation.error')} /> : null}

        {!isLoading && !error && visibleItems.length === 0 ? (
          <EmptyState title={emptyTitle} text={emptyText} />
        ) : null}

        {!isLoading && !error && visibleItems.length > 0 ? (
          <div className="grid gap-4">
            {visibleItems.map((item) => {
              const itemType = asContentType(item.type);
              const itemStatus = asModerationStatus(item.status);

              return (
                <Card key={`${item.type}-${item.id}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span>{item.title}</span>
                      <span className="rounded-full border px-2 py-1 text-[10px] uppercase">
                        {getTypeLabel(itemType)}
                      </span>
                    </CardTitle>

                    <p className="text-xs text-muted-foreground">
                      {[item.subjectName, item.authorName, formatDate(item.createdAt)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {item.extra || t('page.admin_moderation.no_description')}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t('page.admin_moderation.current_status')}:
                      </span>

                      <span className="rounded-full border px-2 py-1 text-xs">
                        {getStatusLabel(itemStatus)}
                      </span>

                      {statuses.map((status) => (
                        <button
                          key={status}
                          onClick={() =>
                            mutation.mutate({
                              type: itemType,
                              id: item.id,
                              status,
                            })
                          }
                          disabled={mutation.isPending || itemStatus === status}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            itemStatus === status
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'hover:bg-accent'
                          }`}
                        >
                          {getStatusLabel(status)}
                        </button>
                      ))}
                    </div>
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