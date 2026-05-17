import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  Gamepad2,
  Lock,
  RotateCcw,
  Star,
  Trophy,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/StatCard';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAchievements } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type GamificationMode = 'games' | 'achievements';

type AchievementItem = {
  id: string;
  displayName: string;
  displayDescription: string;
  earned: boolean;
  points: number;
};

type GameItem = {
  id: string;
  displayName: string;
  displayDescription: string;
  gameType: string;
};

const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 180;
const MAX_DESCRIPTION_CHARS = 700;
const MAX_TYPE_CHARS = 80;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeNumber(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
}

function getMode(pathname: string): GamificationMode {
  return pathname.startsWith('/achievements') ? 'achievements' : 'games';
}

function normalizeUiText(value: unknown, limit = MAX_DESCRIPTION_CHARS): string {
  return cleanText(value, limit).replace(/\bAI\b/g, 'ЖИ');
}

function normalizeGameType(value: unknown): string {
  return cleanText(value, MAX_TYPE_CHARS) || 'Ойын';
}

function normalizeAchievements(input: unknown): AchievementItem[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<AchievementItem[]>((acc, item, index) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id) || `achievement-${index}`;

    if (seen.has(id)) return acc;

    seen.add(id);

    acc.push({
      id,
      displayName:
        normalizeUiText(row.displayName, MAX_TITLE_CHARS) || 'Жетістік',
      displayDescription: normalizeUiText(
        row.displayDescription,
        MAX_DESCRIPTION_CHARS,
      ),
      earned: Boolean(row.earned),
      points: normalizeNumber(row.points),
    });

    return acc;
  }, []);
}

function normalizeGames(input: unknown): GameItem[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<GameItem[]>((acc, item, index) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id) || `game-${index}`;

    if (seen.has(id)) return acc;

    seen.add(id);

    acc.push({
      id,
      displayName: normalizeUiText(row.displayName, MAX_TITLE_CHARS) || 'Ойын',
      displayDescription: normalizeUiText(
        row.displayDescription,
        MAX_DESCRIPTION_CHARS,
      ),
      gameType: normalizeGameType(row.game_type),
    });

    return acc;
  }, []);
}

function AchievementCard({ item }: { item: AchievementItem }) {
  return (
    <div
      className={cn(
        'rounded-3xl border p-4 transition-colors',
        item.earned
          ? 'border-success-muted bg-success-soft/55'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.earned ? (
              <CheckCircle2 size={15} className="shrink-0 text-success-foreground" />
            ) : (
              <Lock size={15} className="shrink-0 text-muted-foreground" />
            )}

            <p className="line-clamp-2 text-sm font-semibold text-foreground">
              {item.displayName}
            </p>
          </div>

          {item.displayDescription ? (
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
              {item.displayDescription}
            </p>
          ) : null}

          <p className="mt-2 text-[11px] font-medium text-muted-foreground">
            {item.earned
              ? t('page.gamification.earned_status')
              : t('page.gamification.locked_status')}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
          +{item.points}
        </span>
      </div>
    </div>
  );
}

function GameCard({ item }: { item: GameItem }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
          <Gamepad2 size={17} />
        </span>

        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {item.displayName}
          </p>

          {item.displayDescription ? (
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
              {item.displayDescription}
            </p>
          ) : null}

          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('page.gamification.game_type_label')}: {item.gameType}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GamificationPage() {
  const { user } = useAuth();
  const location = useLocation();
  const mode = getMode(location.pathname);

  const safeUserId = cleanId(user?.id);

  const { data, isLoading, error } = useAchievements(
    safeUserId,
    Boolean(safeUserId),
  );

  const achievements = useMemo(() => {
    const items = normalizeAchievements(data?.achievements);

    return [...items].sort((a, b) => {
      const earnedDiff = Number(b.earned) - Number(a.earned);
      if (earnedDiff !== 0) return earnedDiff;

      return b.points - a.points;
    });
  }, [data?.achievements]);

  const games = useMemo(() => normalizeGames(data?.games), [data?.games]);

  const earnedCount = useMemo(
    () => achievements.filter((item) => item.earned).length,
    [achievements],
  );

  const totalPoints = normalizeNumber(data?.totalPoints);

  const pageTitle =
    mode === 'achievements'
      ? normalizeUiText(t('page.gamification.title.achievements'), MAX_TITLE_CHARS)
      : normalizeUiText(t('page.gamification.title.games'), MAX_TITLE_CHARS);

  const hasData = Boolean(data);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              {mode === 'achievements' ? (
                <Trophy size={13} />
              ) : (
                <Gamepad2 size={13} />
              )}
              {mode === 'achievements' ? 'Жетістіктер' : 'Ойындар'}
            </>
          }
          icon={mode === 'achievements' ? <Trophy size={20} /> : <Gamepad2 size={20} />}
          title={pageTitle}
        />

        {isLoading ? (
          <LoadingState text={t('page.gamification.loading')} />
        ) : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.gamification.error')}
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

        {!isLoading && !error && !hasData ? (
          <EmptyState
            title={t('page.gamification.empty.title')}
            text={t('page.gamification.empty.text')}
          />
        ) : null}

        {!isLoading && !error && hasData ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatCard
                label={t('page.gamification.stats.points')}
                value={totalPoints}
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
              <Card
                className={mode === 'achievements' ? 'order-1' : 'order-2 lg:order-1'}
              >
                <CardHeader className="border-b border-border/70 bg-card pb-4">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Trophy size={16} />
                    {t('page.gamification.achievements_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 p-4 sm:p-5">
                  {achievements.length === 0 ? (
                    <EmptyState
                      title={t('page.gamification.empty.achievements_title')}
                      text={t('page.gamification.empty.achievements_text')}
                    />
                  ) : (
                    achievements.map((item) => (
                      <AchievementCard key={item.id} item={item} />
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className={mode === 'games' ? 'order-1' : 'order-2'}>
                <CardHeader className="border-b border-border/70 bg-card pb-4">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Gamepad2 size={16} />
                    {t('page.gamification.games_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 p-4 sm:p-5">
                  {games.length === 0 ? (
                    <EmptyState
                      title={t('page.gamification.empty.games_title')}
                      text={t('page.gamification.empty.games_text')}
                    />
                  ) : (
                    games.map((item) => <GameCard key={item.id} item={item} />)
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
