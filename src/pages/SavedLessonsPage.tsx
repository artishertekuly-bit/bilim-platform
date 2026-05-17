import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Lock,
  RotateCcw,
  Search,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import {
  FilterPanelSkeleton,
  SavedLessonsListSkeleton,
  StatsGridSkeleton,
} from '@/components/common/SkeletonBlocks';
import {
  useRemoveSavedLessonMutation,
  useSavedLessons,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { SavedLessonView } from '@/lib/app-data-types';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type SavedLessonFilter = 'all' | 'available' | 'locked' | 'completed';
type SavedLessonMode = 'saved' | 'review';

const MAX_ID_CHARS = 180;
const MAX_SEARCH_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_ERROR_CHARS = 700;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeText(value: unknown) {
  return cleanText(value, MAX_TITLE_CHARS).toLowerCase();
}

function normalizeSearchInput(value: unknown) {
  return cleanText(value, MAX_SEARCH_CHARS);
}

function getErrorMessage(error: unknown, fallback = 'Белгісіз қате пайда болды.'): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function buildLessonPath(lessonId: unknown) {
  return `/lessons/${encodeURIComponent(cleanId(lessonId))}`;
}

function formatNumber(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.round(numberValue));
}

function formatDate(value: string | null | undefined) {
  const rawValue = cleanText(value, 80);

  if (!rawValue) return '—';

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return rawValue;
  }

  return parsed.toLocaleDateString('kk-KZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getFilterLabel(filter: SavedLessonFilter) {
  const labels: Record<SavedLessonFilter, string> = {
    all: 'Барлығы',
    available: 'Оқылуда',
    locked: 'Құлыпталған',
    completed: 'Аяқталған',
  };

  return labels[filter];
}

function getLessonStatus(lesson: SavedLessonView): SavedLessonFilter {
  if (lesson.isLocked) return 'locked';
  if (lesson.isCompleted) return 'completed';

  return 'available';
}

function buildSearchHaystack(lesson: SavedLessonView): string {
  return normalizeText(
    [
      lesson.lessonTitle,
      lesson.courseTitle,
      lesson.moduleTitle,
      lesson.subjectName,
    ]
      .map((item) => cleanText(item))
      .filter(Boolean)
      .join(' '),
  );
}

function SavedLessonStatus({ lesson }: { lesson: SavedLessonView }) {
  if (lesson.isLocked) {
    return (
      <StatusBadge tone="muted">
        <Lock size={12} />
        Құлыпталған
      </StatusBadge>
    );
  }

  if (lesson.isCompleted) {
    return (
      <StatusBadge tone="success">
        <CheckCircle2 size={12} />
        Аяқталған
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="warning">
      <Clock size={12} />
      Қайталау керек
    </StatusBadge>
  );
}

function SavedStatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'primary' | 'secondary' | 'success' | 'warning' | 'muted';
}) {
  const toneClassName = {
    primary: 'border-primary-muted bg-primary-soft text-primary',
    secondary: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',
    success: 'border-success-muted bg-success-soft text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    muted: 'border-border bg-muted text-muted-foreground',
  }[tone];

  return (
    <Card interactive className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            toneClassName,
          )}
        >
          <Icon size={18} />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {cleanText(label, MAX_META_CHARS)}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ModeTab({
  active,
  title,
  text,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  text: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-3xl border p-4 text-left shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-soft-md active:translate-y-0 active:scale-[0.99]',
        active
          ? 'border-primary-muted bg-primary-soft'
          : 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/55',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            active
              ? 'border-primary-muted bg-card text-primary'
              : 'border-border bg-surface-soft text-muted-foreground',
          )}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {cleanText(title, MAX_META_CHARS)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {cleanText(text, MAX_META_CHARS)}
          </p>
        </div>
      </div>
    </button>
  );
}

function SubjectChip({
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
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]',
        active
          ? 'border-primary-muted bg-primary-soft text-primary shadow-soft'
          : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}

function SavedLessonMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-soft/60 p-3 shadow-inner-soft">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {cleanText(label, MAX_META_CHARS)}
      </span>
      <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function SavedLessonCard({
  lesson,
  removing,
  onRemove,
}: {
  lesson: SavedLessonView;
  removing: boolean;
  onRemove: (lesson: SavedLessonView) => void;
}) {
  const lessonId = cleanId(lesson.lessonId);
  const lessonTitle = cleanText(lesson.lessonTitle) || 'Сабақ';
  const subjectName = cleanText(lesson.subjectName, MAX_META_CHARS) || 'Пән';
  const courseTitle = cleanText(lesson.courseTitle, MAX_META_CHARS);
  const moduleTitle = cleanText(lesson.moduleTitle, MAX_META_CHARS);
  const sortOrder = formatNumber(lesson.sortOrder || 1) || 1;

  return (
    <Card
      interactive={!lesson.isLocked}
      className={cn(
        'overflow-hidden',
        lesson.isLocked ? 'bg-muted/35 opacity-85' : 'bg-card',
      )}
    >
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="primary">
                <BookOpen size={12} />
                {subjectName}
              </StatusBadge>

              <SavedLessonStatus lesson={lesson} />
            </div>

            <CardTitle className="line-clamp-2 text-base">
              {lessonTitle}
            </CardTitle>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {[courseTitle, moduleTitle].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <SavedLessonMetric label="Пән" value={subjectName} />

          <SavedLessonMetric
            label="Сабақ реті"
            value={`№${sortOrder}`}
          />

          <SavedLessonMetric
            label="Сақталған күні"
            value={formatDate(lesson.createdAt)}
          />
        </div>

        {lesson.isLocked ? (
          <div className="rounded-3xl border border-border bg-muted/55 p-4 text-xs leading-5 text-muted-foreground">
            Бұл сабақ қазір жабық. Курс шарты орындалғаннан кейін ашылады.
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onRemove(lesson)}
            disabled={removing}
          >
            <Trash2 size={15} className="mr-2" />
            {removing ? 'Алынып жатыр...' : 'Сақтаудан алу'}
          </Button>

          {lesson.isLocked || !lessonId ? (
            <Button type="button" disabled>
              <Lock size={15} className="mr-2" />
              Сабақ жабық
            </Button>
          ) : (
            <Button type="button" asChild>
              <Link to={buildLessonPath(lessonId)}>
                Сабақты ашу
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SavedLessonsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<SavedLessonMode>('saved');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SavedLessonFilter>('all');
  const [activeSubject, setActiveSubject] = useState('all');
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);

  const safeUserId = cleanId(user?.id);

  const {
    data: savedLessons = [],
    isLoading,
    error,
  } = useSavedLessons(safeUserId, Boolean(safeUserId));

  const removeSavedLessonMutation = useRemoveSavedLessonMutation();

  const stats = useMemo(() => {
    const total = savedLessons.length;
    const completed = savedLessons.filter((lesson) => lesson.isCompleted).length;
    const locked = savedLessons.filter((lesson) => lesson.isLocked).length;
    const active = savedLessons.filter(
      (lesson) => !lesson.isCompleted && !lesson.isLocked,
    ).length;
    const subjects = new Set(
      savedLessons
        .map((lesson) => cleanText(lesson.subjectName, MAX_META_CHARS))
        .filter(Boolean),
    ).size;

    return {
      total,
      completed,
      active,
      locked,
      subjects,
    };
  }, [savedLessons]);

  const subjects = useMemo(() => {
    const output = ['all'];
    const seen = new Set(output);

    savedLessons.forEach((lesson) => {
      const subjectName = cleanText(lesson.subjectName, MAX_META_CHARS);

      if (!subjectName) return;

      const key = subjectName.toLowerCase();

      if (seen.has(key)) return;

      seen.add(key);
      output.push(subjectName);
    });

    return output;
  }, [savedLessons]);

  const filteredLessons = useMemo(() => {
    const query = normalizeText(search);

    return savedLessons.filter((lesson) => {
      const lessonStatus = getLessonStatus(lesson);
      const lessonSubject = cleanText(lesson.subjectName, MAX_META_CHARS);

      const matchesMode =
        mode === 'saved' || (!lesson.isCompleted && !lesson.isLocked);

      const matchesSearch =
        !query || buildSearchHaystack(lesson).includes(query);

      const matchesFilter = filter === 'all' || lessonStatus === filter;

      const matchesSubject =
        activeSubject === 'all' || lessonSubject === activeSubject;

      return matchesMode && matchesSearch && matchesFilter && matchesSubject;
    });
  }, [activeSubject, filter, mode, savedLessons, search]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    filter !== 'all' ||
    activeSubject !== 'all' ||
    mode !== 'saved';

  const handleRemove = async (lesson: SavedLessonView) => {
    const lessonId = cleanId(lesson.lessonId);
    const courseId = cleanId(lesson.courseId);
    const lessonTitle = cleanText(lesson.lessonTitle) || 'Сабақ';

    if (!safeUserId) {
      toast({
        title: 'Әрекет орындалмады',
        description: 'Аккаунт дерегі табылмады.',
        variant: 'destructive',
      });
      return;
    }

    if (!lessonId || !courseId) {
      toast({
        title: 'Сабақты алып тастау мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    setPendingLessonId(lessonId);

    try {
      await removeSavedLessonMutation.mutateAsync({
        studentId: safeUserId,
        lessonId,
        courseId,
      });

      toast({
        title: 'Сабақ сақталғандардан алынды',
        description: lessonTitle,
      });
    } catch (removeError) {
      toast({
        title: 'Сабақты алып тастау мүмкін болмады',
        description: getErrorMessage(removeError),
        variant: 'destructive',
      });
    } finally {
      setPendingLessonId(null);
    }
  };

  const resetFilters = () => {
    setMode('saved');
    setSearch('');
    setFilter('all');
    setActiveSubject('all');
  };

  const handleSearchChange = (value: string) => {
    setSearch(normalizeSearchInput(value));
  };

  const handleSubjectChange = (value: string) => {
    const nextSubject = cleanText(value, MAX_META_CHARS);

    setActiveSubject(nextSubject || 'all');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Bookmark size={13} />
              Жеке оқу кеңістігі
            </>
          }
          icon={<Bookmark size={20} />}
          title="Сақталған сабақтар"
          actions={
            <Button type="button" variant="outline" asChild>
              <Link to="/lessons">
                <BookOpen size={15} className="mr-2" />
                Сабақтарға өту
              </Link>
            </Button>
          }
        />

        {isLoading ? (
          <>
            <StatsGridSkeleton count={4} />
            <FilterPanelSkeleton />
            <SavedLessonsListSkeleton count={4} />
          </>
        ) : null}

        {!isLoading && error ? (
          <ErrorState
            text="Сақталған сабақтарды жүктеу мүмкін болмады."
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
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SavedStatCard
                label="Барлығы"
                value={stats.total}
                icon={Bookmark}
                tone="primary"
              />
              <SavedStatCard
                label="Қайталау"
                value={stats.active}
                icon={Clock}
                tone="warning"
              />
              <SavedStatCard
                label="Аяқталған"
                value={stats.completed}
                icon={CheckCircle2}
                tone="success"
              />
              <SavedStatCard
                label="Құлыпталған"
                value={stats.locked}
                icon={Lock}
                tone="muted"
              />
              <SavedStatCard
                label="Пән саны"
                value={stats.subjects}
                icon={GraduationCap}
                tone="secondary"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ModeTab
                active={mode === 'saved'}
                title="Сақталғандар"
                text="Барлық сақталған сабақтар."
                icon={<Bookmark size={17} />}
                onClick={() => setMode('saved')}
              />
              <ModeTab
                active={mode === 'review'}
                title="Қайталау керек"
                text="Әлі аяқталмаған ашық сабақтар."
                icon={<Clock size={17} />}
                onClick={() => setMode('review')}
              />
            </div>

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
                      onChange={(event) => handleSearchChange(event.target.value)}
                      placeholder="Сабақ, курс, модуль немесе пән"
                      className="pl-10"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['all', 'available', 'locked', 'completed'] as SavedLessonFilter[]).map(
                      (item) => (
                        <Button
                          key={item}
                          type="button"
                          size="sm"
                          variant={filter === item ? 'default' : 'outline'}
                          onClick={() => setFilter(item)}
                        >
                          {getFilterLabel(item)}
                        </Button>
                      ),
                    )}

                    {hasActiveFilters ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={resetFilters}
                      >
                        <RotateCcw size={14} className="mr-1.5" />
                        Тазалау
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-surface-soft/60 p-3 shadow-inner-soft">
                  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {subjects.map((subject) => (
                      <SubjectChip
                        key={subject}
                        active={activeSubject === subject}
                        onClick={() => handleSubjectChange(subject)}
                      >
                        {subject === 'all' ? 'Барлық пән' : subject}
                      </SubjectChip>
                    ))}
                  </div>
                </div>

                {savedLessons.length === 0 ? (
                  <EmptyState
                    icon={<Bookmark size={18} />}
                    title="Сақталған сабақ жоқ"
                    text="Сабақ бетінде сақтау батырмасын бассаңыз, ол осы жерде пайда болады."
                    action={
                      <Button type="button" asChild>
                        <Link to="/lessons">
                          <BookOpen size={15} className="mr-2" />
                          Сабақтарға өту
                        </Link>
                      </Button>
                    }
                    secondaryAction={
                      <Button type="button" variant="outline" asChild>
                        <Link to="/courses">
                          Курстарды қарау
                          <ArrowRight size={15} className="ml-2" />
                        </Link>
                      </Button>
                    }
                  />
                ) : null}

                {savedLessons.length > 0 && filteredLessons.length === 0 ? (
                  <EmptyState
                    icon={<Search size={18} />}
                    title="Сүзгі бойынша сабақ табылмады"
                    text="Іздеу сөзін өзгертіңіз немесе сүзгіні тазалаңыз."
                    action={
                      <Button type="button" onClick={resetFilters}>
                        <RotateCcw size={15} className="mr-2" />
                        Сүзгіні тазалау
                      </Button>
                    }
                    secondaryAction={
                      <Button type="button" variant="outline" asChild>
                        <Link to="/lessons">
                          Сабақтарға өту
                          <ArrowRight size={15} className="ml-2" />
                        </Link>
                      </Button>
                    }
                  />
                ) : null}

                {filteredLessons.length > 0 ? (
                  <div className="grid gap-3">
                    {filteredLessons.map((lesson, index) => {
                      const bookmarkId = cleanId(lesson.bookmarkId);
                      const lessonId = cleanId(lesson.lessonId);

                      return (
                        <SavedLessonCard
                          key={bookmarkId || lessonId || `${cleanText(lesson.lessonTitle)}-${index}`}
                          lesson={lesson}
                          removing={cleanId(pendingLessonId) === lessonId}
                          onRemove={handleRemove}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}