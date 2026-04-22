import { useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useAchievements } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gamepad2, Star, Trophy, CheckCircle2, Lock } from 'lucide-react';

type GamificationMode = 'games' | 'achievements';

function getMode(pathname: string): GamificationMode {
  return pathname.startsWith('/achievements') ? 'achievements' : 'games';
}

function getSafeText(value: string | null | undefined) {
  return value?.trim() || '—';
}

export default function GamificationPage() {
  const { user } = useAuth();
  const location = useLocation();
  const mode = getMode(location.pathname);

  const { data, isLoading, error } = useAchievements(user?.id || '', !!user?.id);

  const achievements = useMemo(() => {
    const items = data?.achievements || [];
    return [...items].sort((a, b) => Number(b.earned) - Number(a.earned));
  }, [data?.achievements]);

  const games = useMemo(() => data?.games || [], [data?.games]);

  const earnedCount = useMemo(
    () => achievements.filter((item) => item.earned).length,
    [achievements]
  );

  const pageTitle =
    mode === 'achievements'
      ? t('page.gamification.title.achievements')
      : t('page.gamification.title.games');

  const pageDescription =
    mode === 'achievements'
      ? t('page.gamification.description.achievements')
      : t('page.gamification.description.games');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>

        {isLoading ? <LoadingState text={t('page.gamification.loading')} /> : null}

        {error ? <ErrorState text={t('page.gamification.error')} /> : null}

        {!isLoading && !error && !data ? (
          <EmptyState
            title={t('page.gamification.empty.title')}
            text={t('page.gamification.empty.text')}
          />
        ) : null}

        {!isLoading && !error && data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatCard
                label={t('page.gamification.stats.points')}
                value={data.totalPoints}
                icon={<Star size={16} />}
              />
              <StatCard
                label={t('page.gamification.stats.achievements')}
                value={`${earnedCount}/${achievements.length}`}
                icon={<Trophy size={16} />}
              />
              <StatCard
                label={t('page.gamification.stats.games')}
                value={games.length}
                icon={<Gamepad2 size={16} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className={mode === 'achievements' ? 'order-1' : 'order-2 lg:order-1'}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    {t('page.gamification.achievements_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  {achievements.length === 0 ? (
                    <EmptyState
                      title={t('page.gamification.empty.achievements_title')}
                      text={t('page.gamification.empty.achievements_text')}
                    />
                  ) : (
                    achievements.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-lg border p-4 ${
                          item.earned ? 'border-success/30 bg-success/5' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {item.earned ? (
                                <CheckCircle2 size={14} className="shrink-0 text-success" />
                              ) : (
                                <Lock size={14} className="shrink-0 text-muted-foreground" />
                              )}

                              <p className="text-sm font-medium">{getSafeText(item.displayName)}</p>
                            </div>

                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {getSafeText(item.displayDescription)}
                            </p>

                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {item.earned
                                ? t('page.gamification.earned_status')
                                : t('page.gamification.locked_status')}
                            </p>
                          </div>

                          <span className="text-xs font-semibold">+{item.points}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className={mode === 'games' ? 'order-1' : 'order-2'}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    {t('page.gamification.games_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  {games.length === 0 ? (
                    <EmptyState
                      title={t('page.gamification.empty.games_title')}
                      text={t('page.gamification.empty.games_text')}
                    />
                  ) : (
                    games.map((item) => (
                      <div key={item.id} className="rounded-lg border p-4">
                        <p className="text-sm font-medium">{getSafeText(item.displayName)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {getSafeText(item.displayDescription)}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {t('page.gamification.game_type_label')}: {item.game_type}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}