import { useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useUsers } from '@/hooks/use-platform-data';
import t from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import UserAvatar from '@/components/UserAvatar';

function formatRole(role: string) {
  const roleMap: Record<string, string> = {
    student: t('role.student'),
    teacher: t('role.teacher'),
    parent: t('role.parent'),
    admin: t('role.admin'),
  };

  return roleMap[role] || role;
}

function formatDate(value: string | null | undefined) {
  if (!value) return t('page.admin_users.not_available');

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t('page.admin_users.not_available');
  }

  return parsed.toLocaleString('kk-KZ');
}

function shortenId(value: string | null | undefined) {
  if (!value) return t('page.admin_users.not_available');
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function safeName(value: string | null | undefined) {
  return value?.trim() || t('page.admin_users.unnamed_user');
}

function roleOrder(role: string) {
  const order: Record<string, number> = {
    admin: 0,
    teacher: 1,
    parent: 2,
    student: 3,
  };

  return order[role] ?? 99;
}

function InfoRow({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[200px] truncate text-right" title={title || value}>
        {value}
      </span>
    </div>
  );
}

export default function AdminUsersPage() {
  const { data, isLoading, error } = useUsers(true);

  const users = useMemo(
    () =>
      [...(data || [])].sort((a, b) => {
        const roleDiff = roleOrder(a.role) - roleOrder(b.role);
        if (roleDiff !== 0) return roleDiff;

        const nameDiff = safeName(a.fullName).localeCompare(safeName(b.fullName), 'kk');
        if (nameDiff !== 0) return nameDiff;

        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      }),
    [data]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{t('nav.users')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.admin_users.subtitle')}
          </p>
        </div>

        {isLoading ? <LoadingState text={t('page.admin_users.loading')} /> : null}

        {error ? <ErrorState text={t('page.admin_users.error')} /> : null}

        {!isLoading && !error && users.length === 0 ? (
          <EmptyState
            title={t('page.admin_users.empty.title')}
            text={t('page.admin_users.empty.text')}
          />
        ) : null}

        {!isLoading && !error && users.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {users.map((item) => {
              const fullName = safeName(item.fullName);

              return (
                <Card key={`${item.userId}-${item.role}`}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={fullName}
                        avatarUrl={item.avatarUrl}
                        className="h-10 w-10"
                        fallbackClassName="bg-accent text-sm font-semibold"
                      />

                      <div className="min-w-0">
                        <CardTitle className="truncate text-sm font-semibold">
                          {fullName}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {t('page.admin_users.profile_meta')}
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2 text-sm">
                    <InfoRow
                      label={t('page.admin_users.field.role')}
                      value={formatRole(item.role)}
                    />

                    <InfoRow
                      label={t('page.admin_users.field.user_id')}
                      value={shortenId(item.userId)}
                      title={item.userId}
                    />

                    <InfoRow
                      label={t('page.admin_users.field.created_at')}
                      value={formatDate(item.createdAt)}
                    />
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