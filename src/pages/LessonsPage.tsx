import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Lock,
  PlayCircle,
  RotateCcw,
  Search,
  type LucideIcon,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import LessonCard from '@/components/lesson/LessonCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { platformKeys, useLessons } from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import { markLessonComplete } from '@/lib/app-data';
import type { LessonView } from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';

type LessonStatusFilter = 'all' | 'available' | 'completed' | 'locked';

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase().trim();
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

function LessonStatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'muted';
}) {
  const toneClassName = {
    primary: 'border-primary-muted bg-primary-soft text-primary',
    success: 'border-success-muted bg-success-soft text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    muted: 'border-border bg-muted text-muted-foreground',
  }[tone];

  return (
    <Card interactive className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${toneClassName}`}
        >
          <Icon size={18} />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LessonsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-11 w-11 rounded-2xl" />
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-6 w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SkeletonBlock className="h-11 w-full rounded-2xl lg:max-w-md" />

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

      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="rounded-3xl border border-border bg-card p-4 shadow-soft"
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
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] ${
        active
          ? 'border-primary-muted bg-primary-soft text-primary shadow-soft'
          : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}

export default function LessonsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeSubject, setActiveSubject] = useState('all');
  const [activeStatus, setActiveStatus] = useState<LessonStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [pendingCompleteLessonId, setPendingCompleteLessonId] = useState<
    string | null
  >(null);

  const isStudent = user?.role === 'student';

  const { data, isLoading, error } = useLessons(
    isStudent ? user?.id : undefined,
    !!user
  );

  const completeMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      if (!user?.id) {
        throw new Error('User not found');
      }

      setPendingCompleteLessonId(lessonId);

      return markLessonComplete(user.id, lessonId);
    },
    onSuccess: async () => {
      if (!user?.id) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lessons'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-progress'] }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.studentDashboard(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.analytics(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.achievements(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.leaderboard,
        }),
        queryClient.invalidateQueries({
          queryKey: ['parent-dashboard'],
        }),
      ]);

      toast({
        title: t('lesson.toast.complete_title'),
        description: t('lesson.toast.complete_text'),
      });
    },
    onError: () => {
      toast({
        title: t('lesson.toast.error_title'),
        description: t('lesson.toast.error_text'),
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setPendingCompleteLessonId(null);
    },
  });

  const lessons = data || [];

  const subjects = useMemo(
    () => [
      'all',
      ...Array.from(
        new Set(lessons.map((item) => item.subjectName).filter(Boolean))
      ),
    ],
    [lessons]
  );

  const stats = useMemo(() => {
    const total = lessons.length;
    const completed = lessons.filter((lesson) => lesson.isCompleted).length;
    const locked = lessons.filter((lesson) => lesson.isLocked).length;
    const available = lessons.filter(
      (lesson) => !lesson.isCompleted && !lesson.isLocked
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
      const matchesSubject =
        activeSubject === 'all' || lesson.subjectName === activeSubject;

      const lessonStatus = getLessonStatusFilter(lesson);
      const matchesStatus = activeStatus === 'all' || lessonStatus === activeStatus;

      const matchesSearch =
        !query ||
        normalizeText(lesson.title).includes(query) ||
        normalizeText(lesson.courseTitle).includes(query) ||
        normalizeText(lesson.moduleTitle).includes(query) ||
        normalizeText(lesson.subjectName).includes(query);

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
    if (lesson.isLocked) return;
    navigate(`/lessons/${lesson.id}`);
  };

  const handleCompleteLesson = (lesson: LessonView) => {
    if (!isStudent || lesson.isCompleted || lesson.isLocked) return;
    completeMutation.mutate(lesson.id);
  };

  const pageTitle = isStudent
    ? t('page.lessons.title.student')
    : t('page.lessons.title.admin');

  const pageDescription = isStudent
    ? t('page.lessons.description.student')
    : t('page.lessons.description.admin');

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
              {isStudent ? 'Оқу материалдары' : 'Сабақтарды басқару'}
            </>
          }
          icon={<BookOpen size={20} />}
          title={pageTitle}
          description={pageDescription}
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

        {isLoading ? <LessonsPageSkeleton /> : null}

        {!isLoading && error ? (
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

        {!isLoading && !error ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LessonStatCard
                label="Барлығы"
                value={stats.total}
                icon={BookOpen}
                tone="primary"
              />
              <LessonStatCard
                label="Ашық"
                value={stats.available}
                icon={PlayCircle}
                tone="warning"
              />
              <LessonStatCard
                label="Аяқталған"
                value={stats.completed}
                icon={CheckCircle2}
                tone="success"
              />
              <LessonStatCard
                label="Құлыпталған"
                value={stats.locked}
                icon={Lock}
                tone="muted"
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
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Сабақ, курс, модуль немесе пән бойынша іздеу..."
                      className="pl-10"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['all', 'available', 'completed', 'locked'] as LessonStatusFilter[]).map(
                      (status) => (
                        <Button
                          key={status}
                          type="button"
                          size="sm"
                          variant={activeStatus === status ? 'default' : 'outline'}
                          onClick={() => setActiveStatus(status)}
                        >
                          {getStatusFilterLabel(status)}
                        </Button>
                      )
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
                      <FilterChip
                        key={subject}
                        active={activeSubject === subject}
                        onClick={() => setActiveSubject(subject)}
                      >
                        {subject === 'all' ? t('common.all') : subject}
                      </FilterChip>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

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
              <Card className="overflow-hidden">
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {listTitle}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {filtered.length} сабақ көрсетіліп тұр
                      </p>
                    </div>

                    {hasActiveFilters ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={resetFilters}
                      >
                        <RotateCcw size={14} className="mr-1.5" />
                        Reset
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3">
                    {filtered.map((lesson) => (
                      <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        isStudent={isStudent}
                        isCompleting={pendingCompleteLessonId === lesson.id}
                        onOpen={handleOpenLesson}
                        onComplete={handleCompleteLesson}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}