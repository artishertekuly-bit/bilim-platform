import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useUsers } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { setUserRole } from '@/lib/classes-api';
import t, { getLocale } from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type AdminUserRole = 'student' | 'teacher' | 'parent' | 'admin';
type RoleFilter = 'all' | AdminUserRole | 'unknown';

type AdminUserRow = {
  userId?: string | null;
  id?: string | null;
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
  createdAt?: string | null;
};

const ROLE_FILTERS: RoleFilter[] = ['all', 'admin', 'teacher', 'parent', 'student'];

const MAX_ID_CHARS = 180;
const MAX_NAME_CHARS = 160;
const MAX_EMAIL_CHARS = 240;
const MAX_ROLE_CHARS = 40;
const MAX_SEARCH_CHARS = 160;
const MAX_URL_CHARS = 2_000;
const MAX_DATE_CHARS = 80;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_NAME_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeText(value: unknown, limit = MAX_NAME_CHARS): string {
  return cleanText(value, limit).toLowerCase();
}

function normalizeSearchInput(value: unknown): string {
  return cleanText(value, MAX_SEARCH_CHARS);
}

function normalizeRole(value: unknown): AdminUserRole | 'unknown' {
  const role = cleanText(value, MAX_ROLE_CHARS).toLowerCase();

  if (role === 'student' || role === 'teacher' || role === 'parent' || role === 'admin') {
    return role;
  }

  return 'unknown';
}

function formatRole(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  const roleMap: Record<AdminUserRole | 'unknown', string> = {
    student: t('role.student'),
    teacher: t('role.teacher'),
    parent: t('role.parent'),
    admin: t('role.admin'),
    unknown: 'Белгісіз',
  };

  return roleMap[normalizedRole];
}

function getRoleTone(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'admin') return 'danger' as const;
  if (normalizedRole === 'teacher') return 'warning' as const;
  if (normalizedRole === 'parent') return 'info' as const;
  if (normalizedRole === 'student') return 'success' as const;

  return 'muted' as const;
}

function getRoleIcon(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'admin') return <ShieldCheck size={12} />;
  if (normalizedRole === 'teacher') return <GraduationCap size={12} />;
  if (normalizedRole === 'parent') return <Users size={12} />;

  return <UserRound size={12} />;
}

function getRoleFilterLabel(filter: RoleFilter) {
  if (filter === 'all') return 'Барлығы';
  if (filter === 'unknown') return 'Белгісіз';

  return formatRole(filter);
}

function roleOrder(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role);

  const order: Record<AdminUserRole | 'unknown', number> = {
    admin: 0,
    teacher: 1,
    parent: 2,
    student: 3,
    unknown: 99,
  };

  return order[normalizedRole];
}

function formatDate(value: string | null | undefined) {
  const rawValue = cleanText(value, MAX_DATE_CHARS);

  if (!rawValue) return t('page.admin_users.not_available');

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return t('page.admin_users.not_available');
  }

  const locale = getLocale() === 'ru' ? 'ru-RU' : 'kk-KZ';

  return parsed.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortenId(value: string | null | undefined) {
  const safeId = cleanId(value);

  if (!safeId) return t('page.admin_users.not_available');
  if (safeId.length <= 16) return safeId;

  return `${safeId.slice(0, 8)}...${safeId.slice(-6)}`;
}

function safeName(value: string | null | undefined) {
  return cleanText(value, MAX_NAME_CHARS) || t('page.admin_users.unnamed_user');
}

function safeEmail(value: string | null | undefined) {
  return cleanText(value, MAX_EMAIL_CHARS);
}

function cleanAvatarUrl(value: string | null | undefined): string | undefined {
  const rawUrl = cleanText(value, MAX_URL_CHARS);

  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

function getUserId(item: AdminUserRow) {
  return cleanId(item.userId || item.id || '');
}

function buildUserSearchHaystack(item: AdminUserRow) {
  return normalizeText(
    [
      getUserId(item),
      item.fullName,
      item.email,
      formatRole(item.role),
      normalizeRole(item.role),
    ]
      .map((value) => cleanText(value, MAX_EMAIL_CHARS))
      .filter(Boolean)
      .join(' '),
    MAX_EMAIL_CHARS,
  );
}

function InfoRow({
  label,
  value,
  title,
}: {
  label: string;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className="flex justify-between gap-3 rounded-2xl border border-border bg-muted/35 px-3 py-2.5">
      <span className="text-muted-foreground">{cleanText(label, MAX_NAME_CHARS)}</span>
      <span className="max-w-[220px] truncate text-right font-medium text-foreground" title={title}>
        {value}
      </span>
    </div>
  );
}

function UserCard({
  item,
  isCurrentUser,
}: {
  item: AdminUserRow;
  isCurrentUser: boolean;
}) {
  const userId = getUserId(item);
  const fullName = safeName(item.fullName);
  const email = safeEmail(item.email);
  const normalizedRole = normalizeRole(item.role);
  const avatarUrl = cleanAvatarUrl(item.avatarUrl);

  return (
    <Card className="overflow-hidden border-border bg-card">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex items-start gap-3">
          <UserAvatar
            name={fullName}
            avatarUrl={avatarUrl}
            className="h-11 w-11"
            fallbackClassName="bg-accent text-sm font-semibold"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate text-sm font-semibold">
                {fullName}
              </CardTitle>

              {isCurrentUser ? (
                <StatusBadge tone="primary">Бұл аккаунт</StatusBadge>
              ) : null}
            </div>

            <p className="mt-1 truncate text-xs text-muted-foreground">
              {email || t('page.admin_users.profile_meta')}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 p-4 text-sm sm:p-5">
        <InfoRow
          label={t('page.admin_users.field.role')}
          value={
            <StatusBadge tone={getRoleTone(normalizedRole)} icon={getRoleIcon(normalizedRole)}>
              {formatRole(normalizedRole)}
            </StatusBadge>
          }
        />

        <InfoRow
          label={t('page.admin_users.field.user_id')}
          value={shortenId(userId)}
          title={userId || undefined}
        />

        <InfoRow
          label={t('page.admin_users.field.created_at')}
          value={formatDate(item.createdAt)}
        />

        {!isCurrentUser && userId && normalizedRole !== 'admin' && normalizedRole !== 'unknown' ? (
          <RoleControl userId={userId} fullName={fullName} role={normalizedRole} />
        ) : null}
      </CardContent>
    </Card>
  );
}

type AssignableRole = 'student' | 'teacher' | 'parent';

const ROLE_CHANGE: Record<AssignableRole, { label: string; confirm: (name: string) => string }> = {
  teacher: {
    label: 'Мұғалім ету',
    confirm: (name) => `${name} мұғалім болсын ба? Ол сынып жасап, өз сыныбындағы оқушылардың нәтижесін көре алады.`,
  },
  parent: {
    label: 'Ата-ана ету',
    confirm: (name) =>
      `${name} ата-ана болсын ба? Ол баласына сұраныс жібере алады; бала растаса, тек оның P1…P4 нәтижесін көреді.`,
  },
  student: {
    label: 'Оқушы ету',
    confirm: (name) => `${name} қайта оқушы болсын ба? Сыныптары мен байланыстары сақталады, бірақ бұрынғы панеліне кіре алмайды.`,
  },
};

/** D83, D85: мұғалім мен ата-ана рөлін тек әкімші береді (тіркелген адам әрқашан оқушы болып басталады). */
function RoleControl({ userId, fullName, role }: { userId: string; fullName: string; role: AssignableRole }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (next: AssignableRole) => setUserRole(userId, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
  const options = (['teacher', 'parent', 'student'] as const).filter((next) => next !== role);

  return (
    <div className="flex flex-col gap-1.5 pt-2">
      <div className="flex flex-wrap gap-2">
        {options.map((next) => (
          <Button
            key={next}
            type="button"
            variant="outline"
            size="sm"
            disabled={change.isPending}
            onClick={() => {
              if (window.confirm(ROLE_CHANGE[next].confirm(fullName))) change.mutate(next);
            }}
          >
            <GraduationCap size={14} className="mr-1.5" />
            {ROLE_CHANGE[next].label}
          </Button>
        ))}
      </div>
      {change.isError ? (
        <p className="text-xs text-destructive">Рөл өзгермеді: {(change.error as Error).message}</p>
      ) : null}
    </div>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const safeCurrentUserId = cleanId(user?.id);
  const { data, isLoading, error } = useUsers(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const users = useMemo(() => {
    const locale = getLocale() === 'ru' ? 'ru' : 'kk';

    return ([...(data || [])] as AdminUserRow[]).sort((a, b) => {
      const roleDiff = roleOrder(a.role) - roleOrder(b.role);
      if (roleDiff !== 0) return roleDiff;

      const nameDiff = safeName(a.fullName).localeCompare(safeName(b.fullName), locale);
      if (nameDiff !== 0) return nameDiff;

      const da = a.createdAt ? new Date(cleanText(a.createdAt, MAX_DATE_CHARS)).getTime() : 0;
      const db = b.createdAt ? new Date(cleanText(b.createdAt, MAX_DATE_CHARS)).getTime() : 0;

      return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
    });
  }, [data]);

  const filteredUsers = useMemo(() => {
    const query = normalizeText(search, MAX_SEARCH_CHARS);

    return users.filter((item) => {
      const role = normalizeRole(item.role);
      const matchesRole = roleFilter === 'all' || role === roleFilter;
      const matchesSearch = !query || buildUserSearchHaystack(item).includes(query);

      return matchesRole && matchesSearch;
    });
  }, [roleFilter, search, users]);

  const roleCounts = useMemo(() => {
    const counts: Record<RoleFilter, number> = {
      all: users.length,
      admin: 0,
      teacher: 0,
      parent: 0,
      student: 0,
      unknown: 0,
    };

    users.forEach((item) => {
      counts[normalizeRole(item.role)] += 1;
    });

    return counts;
  }, [users]);

  const hasActiveFilters = Boolean(search.trim()) || roleFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <ShieldCheck size={13} />
              Әкімші
            </>
          }
          icon={<Users size={20} />}
          title={t('nav.users')}
          actions={
            <StatusBadge tone="muted">
              {filteredUsers.length}/{users.length}
            </StatusBadge>
          }
        />

        {isLoading ? <LoadingState text={t('page.admin_users.loading')} /> : null}

        {error ? (
          <ErrorState
            text={t('page.admin_users.error')}
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
          <Card className="overflow-hidden border-border bg-card">
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
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(normalizeSearchInput(event.target.value))}
                    placeholder="Аты, email, рөлі немесе ID"
                    className="pl-10"
                  />
                </div>

                {hasActiveFilters ? (
                  <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                    <RotateCcw size={14} className="mr-1.5" />
                    Тазалау
                  </Button>
                ) : null}
              </div>

              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ROLE_FILTERS.map((filter) => {
                  const active = roleFilter === filter;

                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setRoleFilter(filter)}
                      aria-pressed={active}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors active:scale-[0.99]',
                        active
                          ? 'border-primary-muted bg-primary-soft text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft/45 hover:text-primary',
                      )}
                    >
                      {getRoleFilterLabel(filter)}: {roleCounts[filter]}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !error && users.length === 0 ? (
          <EmptyState
            title={t('page.admin_users.empty.title')}
            text={t('page.admin_users.empty.text')}
          />
        ) : null}

        {!isLoading && !error && users.length > 0 && filteredUsers.length === 0 ? (
          <EmptyState
            icon={<Search size={18} />}
            title="Қолданушы табылмады"
            text="Іздеу сөзін өзгертіңіз немесе сүзгіні тазалаңыз."
            action={
              <Button type="button" onClick={resetFilters}>
                <RotateCcw size={15} className="mr-2" />
                Сүзгіні тазалау
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && filteredUsers.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredUsers.map((item, index) => {
              const userId = getUserId(item);
              const role = normalizeRole(item.role);

              return (
                <UserCard
                  key={userId || `${role}-${safeName(item.fullName)}-${index}`}
                  item={item}
                  isCurrentUser={Boolean(userId && userId === safeCurrentUserId)}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
