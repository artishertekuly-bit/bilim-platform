import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import t from '@/lib/i18n';

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

function getScoreTone(score: number | null | undefined) {
  if (score === null || score === undefined) return 'muted';
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function getScoreLabel(score: number | null | undefined) {
  if (score === null || score === undefined) return 'Тапсырылмаған';
  if (score >= 80) return 'Жақсы нәтиже';
  if (score >= 50) return 'Орташа нәтиже';
  return 'Қайталау қажет';
}

function ScoreBar({ value }: { value: number }) {
  const normalized = Math.min(100, Math.max(0, Math.round(value || 0)));

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
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
  const hasAttempt = test.bestScore !== null && test.bestScore !== undefined;
  const bestScore = Number(test.bestScore ?? 0);
  const attempts = Number(test.attempts ?? 0);

  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      <div className="relative flex h-24 items-center justify-center border-b bg-accent">
        <ClipboardList
          size={28}
          className="text-muted-foreground/40 transition-transform duration-200 group-hover:scale-110"
        />

        <StatusBadge
          tone="info"
          icon={<Sparkles size={12} />}
          className="absolute left-3 top-3"
        >
          {test.subjectName}
        </StatusBadge>

        {hasAttempt ? (
          <StatusBadge
            tone={getScoreTone(test.bestScore)}
            icon={<CheckCircle2 size={12} />}
            className="absolute bottom-3 left-3"
          >
            {getScoreLabel(test.bestScore)}
          </StatusBadge>
        ) : null}
      </div>

      <CardContent className="space-y-4 p-4">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {test.topic || test.subjectName}
          </span>

          <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold">
            {test.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <ClipboardList size={11} />
            {test.questionCount} {t('page.tests.questions_label')}
          </span>

          <span className="flex items-center gap-1">
            <Clock size={11} />
            {test.durationMinutes || 0} {t('common.minutes')}
          </span>
        </div>

        {hasAttempt ? (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {attempts} {t('page.tests.attempts_label')}
              </span>

              <span className="font-semibold">
                {t('test.score')}: {bestScore}%
              </span>
            </div>

            <ScoreBar value={bestScore} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
            Бұл тест әлі тапсырылмаған.
          </div>
        )}

        {isStudent ? (
          <Button
            type="button"
            size="sm"
            className="w-full text-xs"
            onClick={() => onStart?.(test)}
            disabled={isStarting}
          >
            {hasAttempt ? (
              <>
                <RotateCcw size={13} className="mr-1.5" />
                {t('test.retake')}
              </>
            ) : (
              <>
                {t('test.start')}
                <ArrowRight size={13} className="ml-1.5" />
              </>
            )}
          </Button>
        ) : (
          <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
            {t('page.tests.published_status')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}