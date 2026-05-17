import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  platformKeys,
  useModerationQueue,
} from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import { updateCourseStatus, updateTestStatus } from '@/lib/app-data';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const statuses = ['draft', 'under_review', 'published', 'archived'] as const;
type ModerationStatus = (typeof statuses)[number];
type ContentType = 'course' | 'test';
type ModerationMode = 'moderation' | 'tests';
type TypeFilter = 'all' | ContentType;
type StatusFilter = 'all' | ModerationStatus;

type ModerationQueueItem = {
  id: string;
  type: ContentType;
  status: ModerationStatus;
  title: string;
  subjectName: string;
  authorName: string;
  createdAt: string | null;
  extra: string;
};

const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_EXTRA_CHARS = 900;
const MAX_SEARCH_CHARS = 160;
const MAX_ERROR_CHARS = 700;
const DATE_FALLBACK = t('page.admin_moderation.not_available');

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_EXTRA_CHARS): string {
  return limitText(
    cleanRawText(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
    limit,
  );
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeSearchInput(value: unknown): string {
  return cleanText(value, MAX_SEARCH_CHARS);
}

function normalizeSearchText(value: unknown): string {
  return cleanText(value, MAX_EXTRA_CHARS).toLowerCase();
}

function getMode(pathname: string): ModerationMode {
  return pathname.startsWith('/manage-tests') ? 'tests' : 'moderation';
}

function normalizeStatus(value: unknown): ModerationStatus {
  return statuses.includes(value as ModerationStatus)
    ? (value as ModerationStatus)
    : 'draft';
}

function normalizeContentType(value: unknown): ContentType {
  return value === 'test' ? 'test' : 'course';
}

function formatDate(value: unknown) {
  const rawValue = cleanText(value, 80);

  if (!rawValue) return DATE_FALLBACK;

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return DATE_FALLBACK;
  }

  return parsed.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return t('page.admin_moderation.toast.error_text');
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

function getStatusTone(status: ModerationStatus) {
  if (status === 'published') return 'success' as const;
  if (status === 'under_review') return 'warning' as const;
  if (status === 'archived') return 'muted' as const;

  return 'info' as const;
}

function getStatusIcon(status: ModerationStatus) {
  if (status === 'published') return <CheckCircle2 size={12} />;
  if (status === 'under_review') return <Clock size={12} />;
  if (status === 'archived') return <Archive size={12} />;

  return <ClipboardList size={12} />;
}

function getTypeLabel(type: ContentType) {
  const typeMap: Record<ContentType, string> = {
    course: t('nav.courses'),
    test: t('nav.tests'),
  };

  return typeMap[type];
}

function getTypeTone(type: ContentType) {
  return type === 'test' ? 'ai' : 'primary';
}

function getTypeIcon(type: ContentType) {
  return type === 'test' ? <ClipboardList size={12} /> : <BookOpen size={12} />;
}

function normalizeModerationQueue(input: unknown): ModerationQueueItem[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<ModerationQueueItem[]>((acc, item) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id);
    const type = normalizeContentType(row.type);
    const key = `${type}:${id}`;

    if (!id || seen.has(key)) return acc;

    seen.add(key);

    acc.push({
      id,
      type,
      status: normalizeStatus(row.status),
      title: cleanText(row.title, MAX_TITLE_CHARS) || 'Материал',
      subjectName: cleanText(row.subjectName, MAX_META_CHARS),
      authorName: cleanText(row.authorName, MAX_META_CHARS),
      createdAt: cleanText(row.createdAt, 80) || null,
      extra: cleanMultilineText(row.extra, MAX_EXTRA_CHARS),
    });

    return acc;
  }, []);
}

function buildSearchHaystack(item: ModerationQueueItem): string {
  return normalizeSearchText(
    [
      item.id,
      getTypeLabel(item.type),
      getStatusLabel(item.status),
      item.title,
      item.subjectName,
      item.authorName,
      item.extra,
      formatDate(item.createdAt),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function getPageCopy(mode: ModerationMode) {
  if (mode === 'tests') {
    return {
      title: t('page.admin_moderation.title.tests'),
      emptyTitle: t('page.admin_moderation.empty.tests_title'),
      emptyText: t('page.admin_moderation.empty.tests_text'),
      eyebrow: 'Тесттер',
    };
  }

  return {
    title: t('page.admin_moderation.title.moderation'),
    emptyTitle: t('page.admin_moderation.empty.moderation_title'),
    emptyText: t('page.admin_moderation.empty.moderation_text'),
    eyebrow: 'Модерация',
  };
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors active:scale-[0.99]',
        active
          ? 'border-primary-muted bg-primary-soft text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft/45 hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}

function ModerationItemCard({
  item,
  pending,
  onStatusChange,
}: {
  item: ModerationQueueItem;
  pending: boolean;
  onStatusChange: (item: ModerationQueueItem, status: ModerationStatus) => void;
}) {
  const meta = [
    item.subjectName,
    item.authorName,
    formatDate(item.createdAt),
  ].filter(Boolean);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone={getTypeTone(item.type)}>
                {getTypeIcon(item.type)}
                {getTypeLabel(item.type)}
              </StatusBadge>

              <StatusBadge tone={getStatusTone(item.status)}>
                {getStatusIcon(item.status)}
                {getStatusLabel(item.status)}
              </StatusBadge>
            </div>

            <CardTitle className="line-clamp-2 text-base font-semibold">
              {item.title}
            </CardTitle>

            {meta.length > 0 ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {meta.join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
          {item.extra || t('page.admin_moderation.no_description')}
        </p>

        <div className="rounded-3xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            {t('page.admin_moderation.current_status')}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {statuses.map((status) => {
              const active = item.status === status;

              return (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  disabled={pending || active}
                  onClick={() => onStatusChange(item, status)}
                >
                  {getStatusLabel(status)}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminModerationPage() {
  const location = useLocation();
  const mode = getMode(location.pathname);
  const pageCopy = getPageCopy(mode);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(
    mode === 'tests' ? 'test' : 'all',
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data, isLoading, error } = useModerationQueue(true);

  const normalizedItems = useMemo(
    () => normalizeModerationQueue(data),
    [data],
  );

  const visibleItems = useMemo(() => {
    const normalizedSearch = normalizeSearchText(search);

    return normalizedItems
      .filter((item) => {
        const matchesMode = mode === 'tests' ? item.type === 'test' : true;
        const matchesType = typeFilter === 'all' || item.type === typeFilter;
        const matchesStatus =
          statusFilter === 'all' || item.status === statusFilter;
        const matchesSearch =
          !normalizedSearch || buildSearchHaystack(item).includes(normalizedSearch);

        return matchesMode && matchesType && matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;

        return db - da;
      });
  }, [mode, normalizedItems, search, statusFilter, typeFilter]);

  const stats = useMemo(
    () =>
      normalizedItems.reduce(
        (acc, item) => {
          if (mode === 'tests' && item.type !== 'test') return acc;

          acc.total += 1;
          acc[item.status] += 1;

          if (item.type === 'course') acc.courses += 1;
          if (item.type === 'test') acc.tests += 1;

          return acc;
        },
        {
          total: 0,
          courses: 0,
          tests: 0,
          draft: 0,
          under_review: 0,
          published: 0,
          archived: 0,
        },
      ),
    [mode, normalizedItems],
  );

  const hasActiveFilters =
    Boolean(search.trim()) ||
    statusFilter !== 'all' ||
    typeFilter !== (mode === 'tests' ? 'test' : 'all');

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter(mode === 'tests' ? 'test' : 'all');
  };

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
      const safeId = cleanId(id);
      const safeType = normalizeContentType(type);
      const safeStatus = normalizeStatus(status);

      if (!safeId) {
        throw new Error('Материал анықталмады.');
      }

      if (safeType === 'course') {
        return updateCourseStatus(safeId, safeStatus);
      }

      return updateTestStatus(safeId, safeStatus);
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
    onError: (mutationError: unknown) =>
      toast({
        title: t('page.admin_moderation.toast.error_title'),
        description: getErrorMessage(mutationError),
        variant: 'destructive',
      }),
  });

  const handleStatusChange = (
    item: ModerationQueueItem,
    status: ModerationStatus,
  ) => {
    const safeId = cleanId(item.id);
    const safeStatus = normalizeStatus(status);

    if (!safeId || item.status === safeStatus) return;

    mutation.mutate({
      type: item.type,
      id: safeId,
      status: safeStatus,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <ShieldCheck size={13} />
              {pageCopy.eyebrow}
            </>
          }
          icon={<ShieldCheck size={20} />}
          title={pageCopy.title}
        />

        {isLoading ? (
          <LoadingState text={t('page.admin_moderation.loading')} />
        ) : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.admin_moderation.error')}
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

        {!isLoading && !error ? (
          <Card className="overflow-hidden">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />

                  <Input
                    value={search}
                    maxLength={MAX_SEARCH_CHARS}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSearch(normalizeSearchInput(event.target.value))
                    }
                    placeholder="Атауы, авторы, пәні немесе мәртебе"
                    className="pl-10"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="muted">Барлығы: {stats.total}</StatusBadge>
                  {mode !== 'tests' ? (
                    <StatusBadge tone="primary">Курстар: {stats.courses}</StatusBadge>
                  ) : null}
                  <StatusBadge tone="ai">Тесттер: {stats.tests}</StatusBadge>
                  <StatusBadge tone="warning">
                    Тексерісте: {stats.under_review}
                  </StatusBadge>
                </div>
              </div>

              <div className="space-y-2">
                {mode !== 'tests' ? (
                  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {(['all', 'course', 'test'] as TypeFilter[]).map((type) => (
                      <FilterButton
                        key={type}
                        active={typeFilter === type}
                        onClick={() => setTypeFilter(type)}
                      >
                        {type === 'all' ? 'Барлық түрі' : getTypeLabel(type)}
                      </FilterButton>
                    ))}
                  </div>
                ) : null}

                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {(['all', ...statuses] as StatusFilter[]).map((status) => (
                    <FilterButton
                      key={status}
                      active={statusFilter === status}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === 'all' ? 'Барлық мәртебе' : getStatusLabel(status)}
                    </FilterButton>
                  ))}

                  {hasActiveFilters ? (
                    <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                      <RotateCcw size={14} className="mr-1.5" />
                      Тазалау
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !error && normalizedItems.length === 0 ? (
          <EmptyState title={pageCopy.emptyTitle} text={pageCopy.emptyText} />
        ) : null}

        {!isLoading &&
        !error &&
        normalizedItems.length > 0 &&
        visibleItems.length === 0 ? (
          <EmptyState
            title="Сүзгі бойынша материал табылмады"
            text="Іздеу сөзін өзгертіңіз немесе сүзгіні тазалаңыз."
            action={
              <Button type="button" onClick={resetFilters}>
                <RotateCcw size={15} className="mr-2" />
                Сүзгіні тазалау
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && visibleItems.length > 0 ? (
          <div className="grid gap-4">
            {visibleItems.map((item) => (
              <ModerationItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                pending={mutation.isPending}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
