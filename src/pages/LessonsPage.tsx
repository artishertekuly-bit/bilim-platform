import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Lock,
  PlayCircle,
  RotateCcw,
  Search,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import LessonCard from '@/components/lesson/LessonCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLessons } from '@/hooks/use-platform-data';
import type { LessonView } from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type LessonStatusFilter = 'all' | 'available' | 'completed' | 'locked';

const MAX_ID_CHARS = 180;
const MAX_SEARCH_CHARS = 160;
const MAX_TEXT_CHARS = 500;
const MAX_SUBJECT_CHARS = 160;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TEXT_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeText(value: unknown) {
  return cleanText(value, MAX_TEXT_CHARS).toLowerCase();
}

function normalizeSearchInput(value: unknown) {
  return cleanText(value, MAX_SEARCH_CHARS);
}

function buildLessonPath(lessonId: unknown) {
  return `/lessons/${encodeURIComponent(cleanId(lessonId))}`;
}

function getStatusFilterLabel(filter: LessonStatusFilter) {
  const labels: Record<LessonStatusFilter, string> = {
    all: 'Барлығы',
    available: 'Ашық',
    completed: 'Аяқталған',
    locked: 'Құлыпталған',
  };

  return labels[filter];
}

function getLessonStatusFilter(lesson: LessonView): LessonStatusFilter {
  if (lesson.isCompleted) return 'completed';
  if (lesson.isLocked) return 'locked';

  return 'available';
}

function buildLessonSearchHaystack(lesson: LessonView): string {
  return normalizeText(
    [
      lesson.title,
      lesson.courseTitle,
      lesson.moduleTitle,
      lesson.subjectName,
    ]
      .map((item) => cleanText(item))
      .filter(Boolean)
      .join(' '),
  );
}

function LessonsPageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SkeletonBlock className="h-10 w-full rounded-2xl lg:max-w-md" />

          <div className="flex gap-2 overflow-hidden">
            <SkeletonBlock className="h-9 w-20 rounded-2xl" />
            <SkeletonBlock className="h-9 w-20 rounded-2xl" />
            <SkeletonBlock className="h-9 w-24 rounded-2xl" />
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock
              key={index}
              className="h-7 w-20 shrink-0 rounded-full"
            />
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-card p-4 sm:p-5 shadow-xs">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl bg-muted/40 p-4"
            >
              <div className="flex gap-4">
                <SkeletonBlock className="h-11 w-11 rounded-2xl" />

                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <SkeletonBlock className="h-5 w-20 rounded-full" />
                    <SkeletonBlock className="h-5 w-24 rounded-full" />
                  </div>

                  <SkeletonBlock className="h-4 w-2/3" />
                  <SkeletonBlock className="h-3 w-1/2" />
                </div>

                <SkeletonBlock className="hidden h-9 w-28 rounded-2xl sm:block" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
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
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.99]',
        active
          ? 'bg-foreground text-background'
          : 'bg-muted/60 text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export default function LessonsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeSubject, setActiveSubject] = useState('all');
  const [activeStatus, setActiveStatus] = useState<LessonStatusFilter>('all');
  const [search, setSearch] = useState('');

  const isStudent = user?.role === 'student';
  const safeUserId = cleanId(user?.id);

  const { data, isLoading, error } = useLessons(
    isStudent ? safeUserId : undefined,
    Boolean(user),
  );

  const lessons = useMemo(() => data || [], [data]);

  const subjects = useMemo(() => {
    const output = ['all'];
    const seen = new Set(output);

    lessons.forEach((lesson) => {
      const subjectName = cleanText(lesson.subjectName, MAX_SUBJECT_CHARS);

      if (!subjectName) return;

      const key = subjectName.toLowerCase();

      if (seen.has(key)) return;

      seen.add(key);
      output.push(subjectName);
    });

    return output;
  }, [lessons]);

  const stats = useMemo(() => {
    const total = lessons.length;
    const completed = lessons.filter((lesson) => lesson.isCompleted).length;
    const locked = lessons.filter((lesson) => lesson.isLocked).length;
    const available = lessons.filter(
      (lesson) => !lesson.isCompleted && !lesson.isLocked,
    ).length;

    return {
      total,
      completed,
      locked,
      available,
    };
  }, [lessons]);

  const filtered = useMemo(() => {
    const query = normalizeText(search);

    return lessons.filter((lesson) => {
      const lessonSubject = cleanText(lesson.subjectName, MAX_SUBJECT_CHARS);

      const matchesSubject =
        activeSubject === 'all' || lessonSubject === activeSubject;

      const lessonStatus = getLessonStatusFilter(lesson);
      const matchesStatus =
        activeStatus === 'all' || lessonStatus === activeStatus;

      const matchesSearch =
        !query || buildLessonSearchHaystack(lesson).includes(query);

      return matchesSubject && matchesStatus && matchesSearch;
    });
  }, [activeStatus, activeSubject, lessons, search]);

  const hasActiveFilters =
    Boolean(search.trim()) || activeSubject !== 'all' || activeStatus !== 'all';

  const resetFilters = () => {
    setSearch('');
    setActiveSubject('all');
    setActiveStatus('all');
  };

  const handleOpenLesson = (lesson: LessonView) => {
    const lessonId = cleanId(lesson.id);

    if (lesson.isLocked || !lessonId) return;

    navigate(buildLessonPath(lessonId));
  };

  const handleSearchChange = (value: string) => {
    setSearch(normalizeSearchInput(value));
  };

  const handleSubjectChange = (value: string) => {
    const nextSubject = cleanText(value, MAX_SUBJECT_CHARS);

    setActiveSubject(nextSubject || 'all');
  };

  const pageTitle = isStudent
    ? t('page.lessons.title.student')
    : t('page.lessons.title.admin');

  const emptyTitle = isStudent
    ? t('page.lessons.empty.title.student')
    : t('page.lessons.empty.title.admin');

  const emptyText = isStudent
    ? t('page.lessons.empty.text.student')
    : t('page.lessons.empty.text.admin');

  const listTitle = isStudent
    ? t('page.lessons.list_title.student')
    : t('page.lessons.list_title.admin');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <FileText size={13} />
              {isStudent ? 'Сабақтар' : 'Сабақтарды басқару'}
            </>
          }
          icon={<BookOpen size={20} />}
          title={pageTitle}
          actions={
            isStudent ? (
              <Button type="button" variant="outline" asChild>
                <Link to="/courses">
                  Курстарға өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            ) : null
          }
        />

        {!user ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="Аккаунт анықталмады"
            text="Сабақтарды көру үшін жүйеге кіріңіз."
          />
        ) : null}

        {user && isLoading ? <LessonsPageSkeleton /> : null}

        {user && !isLoading && error ? (
          <ErrorState
            text={t('page.lessons.error')}
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

        {user && !isLoading && !error ? (
          <>
            <div className="rounded-3xl bg-card p-4 sm:p-5 shadow-xs space-y-4">
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
                    placeholder="Сабақ немесе курс бойынша іздеу"
                    className="h-11 rounded-full pl-10 bg-muted/40 border-0"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Tabs
                    value={activeStatus}
                    onValueChange={(val) => setActiveStatus(val as LessonStatusFilter)}
                  >
                    <TabsList>
                      <TabsTrigger value="all">Барлығы</TabsTrigger>
                      <TabsTrigger value="available">Ашық</TabsTrigger>
                      <TabsTrigger value="completed">Аяқталған</TabsTrigger>
                      <TabsTrigger value="locked">Құлыпталған</TabsTrigger>
                    </TabsList>
                  </Tabs>

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

              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="info">
                  <BookOpen size={12} />
                  Барлығы: {stats.total}
                </StatusBadge>

                <StatusBadge tone="warning">
                  <PlayCircle size={12} />
                  Ашық: {stats.available}
                </StatusBadge>

                <StatusBadge tone="success">
                  <CheckCircle2 size={12} />
                  Аяқталған: {stats.completed}
                </StatusBadge>

                <StatusBadge tone="muted">
                  <Lock size={12} />
                  Құлыпталған: {stats.locked}
                </StatusBadge>
              </div>

              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {subjects.map((subject) => (
                  <FilterChip
                    key={subject}
                    active={activeSubject === subject}
                    onClick={() => handleSubjectChange(subject)}
                  >
                    {subject === 'all' ? t('common.all') : subject}
                  </FilterChip>
                ))}
              </div>
            </div>

            {lessons.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={18} />}
                title={emptyTitle}
                text={emptyText}
                action={
                  isStudent ? (
                    <Button type="button" asChild>
                      <Link to="/courses">
                        Курстарды қарау
                        <ArrowRight size={15} className="ml-2" />
                      </Link>
                    </Button>
                  ) : null
                }
              />
            ) : null}

            {lessons.length > 0 && filtered.length === 0 ? (
              <EmptyState
                icon={<Search size={18} />}
                title={t('page.lessons.empty.title.filtered')}
                text={t('page.lessons.empty.text.filtered')}
                action={
                  <Button type="button" onClick={resetFilters}>
                    <RotateCcw size={15} className="mr-2" />
                    Сүзгіні тазалау
                  </Button>
                }
              />
            ) : null}

            {filtered.length > 0 ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {listTitle}
                  </h2>

                  <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {filtered.length}
                  </span>
                </div>

                <div className="grid gap-3">
                  {filtered.map((lesson, index) => {
                    const lessonId = cleanId(lesson.id);

                    return (
                      <LessonCard
                        key={lessonId || `${cleanText(lesson.title)}-${index}`}
                        lesson={lesson}
                        isStudent={isStudent}
                        onOpen={handleOpenLesson}
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}