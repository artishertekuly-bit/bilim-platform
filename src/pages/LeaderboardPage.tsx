import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useLeaderboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { Trophy, Medal, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserAvatar from '@/components/UserAvatar';
import { useMemo } from 'react';

function formatRank(rank: number | null | undefined, fallback?: number) {
  return rank ? `#${rank}` : fallback ? `#${fallback}` : '—';
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useLeaderboard();

  const topThree = useMemo(() => (data || []).slice(0, 3), [data]);

  const currentUserEntry = useMemo(
    () => (data || []).find((entry) => entry.studentId === user?.id) || null,
    [data, user?.id]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{t('nav.leaderboard')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.leaderboard.description')}
          </p>
        </div>

        {isLoading ? <LoadingState text={t('page.leaderboard.loading')} /> : null}

        {error ? <ErrorState text={t('page.leaderboard.error')} /> : null}

        {!isLoading && !error && (!data || data.length === 0) ? (
          <EmptyState
            title={t('page.leaderboard.empty.title')}
            text={t('page.leaderboard.empty.text')}
          />
        ) : null}

        {!isLoading && !error && data && data.length > 0 ? (
          <>
            {currentUserEntry ? (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    {t('page.leaderboard.my_position_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {formatRank(currentUserEntry.rank)}
                      </div>

                      <UserAvatar
                        name={currentUserEntry.name}
                        avatarUrl={currentUserEntry.avatarUrl}
                        className="h-10 w-10"
                        fallbackClassName="bg-accent text-sm font-semibold"
                      />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {currentUserEntry.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('page.leaderboard.avg_score_label')}:{' '}
                          {formatPercent(currentUserEntry.avgScore)} ·{' '}
                          {t('page.leaderboard.lessons_completed_label')}:{' '}
                          {currentUserEntry.lessonsCompleted}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold">{currentUserEntry.points}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('page.leaderboard.points_label')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              {topThree.map((entry, index) => {
                const isCurrentUser = entry.studentId === user?.id;

                return (
                  <Card
                    key={entry.id}
                    className={isCurrentUser ? 'border-primary/30 bg-primary/5' : ''}
                  >
                    <CardContent className="space-y-3 p-5 text-center">
                      <div className="relative mx-auto w-fit">
                        <UserAvatar
                          name={entry.name}
                          avatarUrl={entry.avatarUrl}
                          className="h-12 w-12"
                          fallbackClassName="bg-accent text-sm font-semibold"
                        />

                        <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border bg-background">
                          {index === 0 ? (
                            <Trophy size={14} className="text-warning" />
                          ) : (
                            <Medal
                              size={14}
                              className={index === 1 ? 'text-muted-foreground' : 'text-amber-600'}
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-semibold">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRank(entry.rank, index + 1)}
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-1 text-sm font-semibold">
                        <Star size={14} />
                        {entry.points}
                      </div>

                      <div className="space-y-1 text-[11px] text-muted-foreground">
                        <p>
                          {t('page.leaderboard.avg_score_label')}: {formatPercent(entry.avgScore)}
                        </p>
                        <p>
                          {t('page.leaderboard.lessons_completed_label')}: {entry.lessonsCompleted}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  {t('page.leaderboard.full_title')}
                </CardTitle>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {data.map((entry, index) => {
                    const isCurrentUser = entry.studentId === user?.id;

                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                          isCurrentUser ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                            {entry.rank || index + 1}
                          </div>

                          <UserAvatar
                            name={entry.name}
                            avatarUrl={entry.avatarUrl}
                            className="h-9 w-9"
                            fallbackClassName="bg-accent text-xs font-semibold"
                          />

                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {entry.name}
                              {isCurrentUser ? ` · ${t('page.leaderboard.you_label')}` : ''}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t('page.leaderboard.avg_score_label')}:{' '}
                              {formatPercent(entry.avgScore)} ·{' '}
                              {t('page.leaderboard.lessons_completed_label')}:{' '}
                              {entry.lessonsCompleted}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold">{entry.points}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t('page.leaderboard.points_label')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}