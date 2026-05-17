import { useMemo } from 'react';
import {
  Medal,
  RotateCcw,
  Star,
  Trophy,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import StatCard from '@/components/StatCard';
import UserAvatar from '@/components/UserAvatar';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeaderboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type LeaderboardEntry = {
  id: string;
  studentId: string;
  name: string;
  avatarUrl: string | null;
  rank: number | null;
  points: number;
  avgScore: number | null;
  lessonsCompleted: number;
};

const MAX_ID_CHARS = 180;
const MAX_NAME_CHARS = 160;
const MAX_URL_CHARS = 2_000;
const MAX_SCORE = 100;
const MAX_RANK = 999_999;
const MAX_POINTS = 999_999_999;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_NAME_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeNumber(value: unknown, max = MAX_POINTS): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.min(max, Math.round(numericValue)));
}

function normalizeRank(value: unknown): number | null {
  const rank = normalizeNumber(value, MAX_RANK);

  return rank > 0 ? rank : null;
}

function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return null;

  return Math.max(0, Math.min(MAX_SCORE, Math.round(numericValue)));
}

function normalizeHttpUrl(value: unknown): string | null {
  const rawUrl = cleanText(value, MAX_URL_CHARS);

  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function formatRank(rank: number | null | undefined, fallback?: number) {
  if (rank && rank > 0) return `#${rank}`;
  if (fallback && fallback > 0) return `#${fallback}`;

  return '—';
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function normalizeLeaderboard(input: unknown): LeaderboardEntry[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<LeaderboardEntry[]>((acc, item, index) => {
    const row = item as Record<string, unknown>;
    const studentId = cleanId(row.studentId);
    const id = cleanId(row.id) || studentId || `leaderboard-${index}`;

    if (!id || seen.has(id)) return acc;

    seen.add(id);

    acc.push({
      id,
      studentId,
      name: cleanText(row.name) || 'Оқушы',
      avatarUrl: normalizeHttpUrl(row.avatarUrl),
      rank: normalizeRank(row.rank),
      points: normalizeNumber(row.points),
      avgScore: normalizeScore(row.avgScore),
      lessonsCompleted: normalizeNumber(row.lessonsCompleted),
    });

    return acc;
  }, []);
}

function LeaderboardMetricLine({ entry }: { entry: LeaderboardEntry }) {
  return (
    <p className="text-[11px] text-muted-foreground">
      {t('page.leaderboard.avg_score_label')}: {formatPercent(entry.avgScore)} ·{' '}
      {t('page.leaderboard.lessons_completed_label')}: {entry.lessonsCompleted}
    </p>
  );
}

function TopStudentCard({
  entry,
  index,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  index: number;
  isCurrentUser: boolean;
}) {
  return (
    <Card
      className={cn(
        'overflow-hidden',
        isCurrentUser ? 'border-primary-muted bg-primary-soft/45' : 'bg-card',
      )}
    >
      <CardContent className="space-y-3 p-5 text-center">
        <div className="relative mx-auto w-fit">
          <UserAvatar
            name={entry.name}
            avatarUrl={entry.avatarUrl}
            className="h-12 w-12"
            fallbackClassName="bg-accent text-sm font-semibold"
          />

          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
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
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {entry.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatRank(entry.rank, index + 1)}
          </p>
        </div>

        <div className="flex items-center justify-center gap-1 text-sm font-semibold">
          <Star size={14} />
          {entry.points}
        </div>

        <div className="space-y-1">
          <LeaderboardMetricLine entry={entry} />
          {isCurrentUser ? (
            <StatusBadge tone="primary">{t('page.leaderboard.you_label')}</StatusBadge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardRow({
  entry,
  index,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  index: number;
  isCurrentUser: boolean;
}) {
  const rank = entry.rank || index + 1;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border p-3 transition-colors',
        isCurrentUser
          ? 'border-primary-muted bg-primary-soft/45'
          : 'border-border bg-card',
      )}
    >
      <div className="min-w-0 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
          {rank}
        </div>

        <UserAvatar
          name={entry.name}
          avatarUrl={entry.avatarUrl}
          className="h-9 w-9"
          fallbackClassName="bg-accent text-xs font-semibold"
        />

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {entry.name}
            {isCurrentUser ? ` · ${t('page.leaderboard.you_label')}` : ''}
          </p>
          <LeaderboardMetricLine entry={entry} />
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-foreground">{entry.points}</p>
        <p className="text-[11px] text-muted-foreground">
          {t('page.leaderboard.points_label')}
        </p>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useLeaderboard();

  const safeUserId = cleanId(user?.id);

  const entries = useMemo(() => normalizeLeaderboard(data), [data]);

  const topThree = useMemo(() => entries.slice(0, 3), [entries]);

  const currentUserEntry = useMemo(
    () => entries.find((entry) => entry.studentId === safeUserId) || null,
    [entries, safeUserId],
  );

  const averageScore = useMemo(() => {
    const scoredEntries = entries.filter((entry) => entry.avgScore !== null);

    if (scoredEntries.length === 0) return 0;

    const total = scoredEntries.reduce(
      (sum, entry) => sum + (entry.avgScore || 0),
      0,
    );

    return Math.round(total / scoredEntries.length);
  }, [entries]);

  const totalPoints = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.points, 0),
    [entries],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Trophy size={13} />
              Рейтинг
            </>
          }
          icon={<Trophy size={20} />}
          title={t('nav.leaderboard')}
        />

        {isLoading ? (
          <LoadingState text={t('page.leaderboard.loading')} />
        ) : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.leaderboard.error')}
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

        {!isLoading && !error && entries.length === 0 ? (
          <EmptyState
            title={t('page.leaderboard.empty.title')}
            text={t('page.leaderboard.empty.text')}
          />
        ) : null}

        {!isLoading && !error && entries.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatCard
                label={t('page.leaderboard.full_title')}
                value={entries.length}
                icon={<Trophy size={16} />}
              />
              <StatCard
                label={t('page.leaderboard.avg_score_label')}
                value={`${averageScore}%`}
                icon={<Medal size={16} />}
              />
              <StatCard
                label={t('page.leaderboard.points_label')}
                value={totalPoints}
                icon={<Star size={16} />}
              />
            </div>

            {currentUserEntry ? (
              <Card className="border-primary-muted bg-primary-soft/45">
                <CardHeader className="border-b border-primary-muted/70 pb-3">
                  <CardTitle className="text-sm font-semibold">
                    {t('page.leaderboard.my_position_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-4 sm:p-5">
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
                        <p className="truncate text-sm font-semibold text-foreground">
                          {currentUserEntry.name}
                        </p>
                        <LeaderboardMetricLine entry={currentUserEntry} />
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-foreground">
                        {currentUserEntry.points}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('page.leaderboard.points_label')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              {topThree.map((entry, index) => (
                <TopStudentCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  isCurrentUser={entry.studentId === safeUserId}
                />
              ))}
            </div>

            <Card>
              <CardHeader className="border-b border-border/70 pb-3">
                <CardTitle className="text-sm font-semibold">
                  {t('page.leaderboard.full_title')}
                </CardTitle>
              </CardHeader>

              <CardContent className="p-4 sm:p-5">
                <div className="space-y-3">
                  {entries.map((entry, index) => (
                    <LeaderboardRow
                      key={entry.id}
                      entry={entry}
                      index={index}
                      isCurrentUser={entry.studentId === safeUserId}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
