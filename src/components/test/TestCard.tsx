import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  RotateCcw,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import t from '@/lib/i18n';
import { limitText, removeNullCharacters } from '@/lib/utils';

export type TestCardData = {
  id: string;
  subjectName: string;
  topic?: string | null;
  title: string;
  questionCount: number;
  durationMinutes?: number | null;
  bestScore?: number | null;
  attempts?: number | null;
};

type TestCardProps = {
  test: TestCardData;
  isStudent?: boolean;
  isStarting?: boolean;
  onStart?: (test: TestCardData) => void;
};

const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;

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
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.round(numberValue));
}

function clampScore(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.min(100, Math.max(0, Math.round(numberValue)));
}

function getScoreTone(score: number | null | undefined) {
  if (score === null || score === undefined) return 'muted' as const;

  const normalizedScore = clampScore(score);

  if (normalizedScore >= 80) return 'success' as const;
  if (normalizedScore >= 50) return 'warning' as const;

  return 'danger' as const;
}

function getScoreLabel(score: number | null | undefined) {
  if (score === null || score === undefined) return 'Тапсырылмаған';

  const normalizedScore = clampScore(score);

  if (normalizedScore >= 80) return 'Жақсы нәтиже';
  if (normalizedScore >= 50) return 'Орташа нәтиже';

  return 'Қайталау қажет';
}

function ScoreBar({ value }: { value: number }) {
  const normalized = clampScore(value);

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-soft"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

export default function TestCard({
  test,
  isStudent = false,
  isStarting = false,
  onStart,
}: TestCardProps) {
  const testId = cleanId(test.id);
  const subjectName = cleanText(test.subjectName, MAX_META_CHARS) || 'Пән';
  const title = cleanText(test.title) || 'Тест';
  const topic = cleanText(test.topic, MAX_META_CHARS);

  const hasAttempt = test.bestScore !== null && test.bestScore !== undefined;
  const bestScore = clampScore(test.bestScore);
  const attempts = normalizeNumber(test.attempts);
  const questionCount = normalizeNumber(test.questionCount);
  const durationMinutes = normalizeNumber(test.durationMinutes);

  const safeTest: TestCardData = {
    ...test,
    id: testId,
    subjectName,
    topic,
    title,
    questionCount,
    durationMinutes,
    bestScore: hasAttempt ? bestScore : null,
    attempts,
  };

  return (
    <Card className="group overflow-hidden transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="info">{subjectName}</StatusBadge>

              {hasAttempt ? (
                <StatusBadge
                  tone={getScoreTone(bestScore)}
                  icon={<CheckCircle2 size={12} />}
                >
                  {getScoreLabel(bestScore)}
                </StatusBadge>
              ) : (
                <StatusBadge tone="muted">Жаңа</StatusBadge>
              )}
            </div>

            <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-foreground">
              {title}
            </h3>

            {topic ? (
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                {topic}
              </p>
            ) : null}
          </div>

          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-soft text-muted-foreground shadow-inner-soft">
            <ClipboardList size={17} />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ClipboardList size={11} />
            {questionCount} {t('page.tests.questions_label')}
          </span>

          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            {durationMinutes} {t('common.minutes')}
          </span>
        </div>

        {hasAttempt ? (
          <div className="space-y-2 rounded-2xl border border-border bg-surface-soft/60 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {attempts} {t('page.tests.attempts_label')}
              </span>

              <span className="font-semibold text-foreground">
                {t('test.score')}: {bestScore}%
              </span>
            </div>

            <ScoreBar value={bestScore} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface-soft/50 px-3 py-2 text-xs text-muted-foreground">
            Бұл тест әлі тапсырылмаған.
          </div>
        )}

        {isStudent ? (
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => onStart?.(safeTest)}
            disabled={isStarting || !testId}
          >
            {hasAttempt ? (
              <>
                <RotateCcw size={14} className="mr-1.5" />
                {isStarting ? t('common.loading') : t('test.retake')}
              </>
            ) : (
              <>
                {isStarting ? t('common.loading') : t('test.start')}
                {!isStarting ? <ArrowRight size={14} className="ml-1.5" /> : null}
              </>
            )}
          </Button>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-soft/50 px-3 py-2 text-xs text-muted-foreground">
            {t('page.tests.published_status')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}