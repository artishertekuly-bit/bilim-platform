import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
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

type SavedLessonFilter = 'all' | 'active' | 'completed';

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase().trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
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
    active: 'Оқылмаған',
    completed: 'Аяқталған',
  };

  return labels[filter];
}

function SavedLessonStatus({ lesson }: { lesson: SavedLessonView }) {
  if (lesson.isLocked) {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
        Құлыпталған
      </span>
    );
  }

  if (lesson.isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
        <CheckCircle2 size={12} />
        Аяқталған
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
      Оқылуда
    </span>
  );
}

export default function SavedLessonsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SavedLessonFilter>('all');
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);

  const {
    data: savedLessons = [],
    isLoading,
    error,
  } = useSavedLessons(user?.id || '', Boolean(user?.id));

  const removeSavedLessonMutation = useRemoveSavedLessonMutation();

  const stats = useMemo(() => {
    const total = savedLessons.length;
    const completed = savedLessons.filter((lesson) => lesson.isCompleted).length;
    const active = total - completed;
    const subjects = new Set(
      savedLessons.map((lesson) => lesson.subjectName).filter(Boolean)
    ).size;

    return {
      total,
      completed,
      active,
      subjects,
    };
  }, [savedLessons]);

  const filteredLessons = useMemo(() => {
    const query = normalizeText(search);

    return savedLessons.filter((lesson) => {
      const matchesSearch =
        !query ||
        normalizeText(lesson.lessonTitle).includes(query) ||
        normalizeText(lesson.courseTitle).includes(query) ||
        normalizeText(lesson.moduleTitle).includes(query) ||
        normalizeText(lesson.subjectName).includes(query);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'completed' && lesson.isCompleted) ||
        (filter === 'active' && !lesson.isCompleted);

      return matchesSearch && matchesFilter;
    });
  }, [filter, savedLessons, search]);

  const handleRemove = async (lesson: SavedLessonView) => {
    if (!user?.id) {
      toast({
        title: 'Әрекет орындалмады',
        description: 'Аккаунт дерегі табылмады.',
        variant: 'destructive',
      });
      return;
    }

    setPendingLessonId(lesson.lessonId);

    try {
      await removeSavedLessonMutation.mutateAsync({
        studentId: user.id,
        lessonId: lesson.lessonId,
        courseId: lesson.courseId,
      });

      toast({
        title: 'Сабақ сақталғандардан алынды',
        description: lesson.lessonTitle,
      });
    } catch (removeError) {
      toast({
        title: 'Сабақты алып тастау мүмкін болмады',
        description:
          removeError instanceof Error
            ? removeError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    } finally {
      setPendingLessonId(null);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setFilter('all');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <Bookmark size={13} />
              Жеке оқу кеңістігі
            </div>

            <h2 className="text-xl font-bold">Сақталған сабақтар</h2>
            <p className="text-sm text-muted-foreground">
              Өзіңізге маңызды сабақтарды осы жерден тез ашып, оқуды жалғастырасыз.
            </p>
          </div>

          <Button type="button" variant="outline" onClick={() => navigate('/lessons')}>
            <BookOpen size={15} className="mr-2" />
            Сабақтарға өту
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Барлығы</p>
              <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Оқылуда</p>
              <p className="mt-1 text-2xl font-semibold">{stats.active}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Аяқталған</p>
              <p className="mt-1 text-2xl font-semibold">{stats.completed}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Пән саны</p>
              <p className="mt-1 text-2xl font-semibold">{stats.subjects}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Сабақ, курс, модуль немесе пән бойынша іздеу..."
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {(['all', 'active', 'completed'] as SavedLessonFilter[]).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={filter === item ? 'default' : 'outline'}
                    onClick={() => setFilter(item)}
                  >
                    {getFilterLabel(item)}
                  </Button>
                ))}

                {(search || filter !== 'all') ? (
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

            {isLoading ? (
              <LoadingState text="Сақталған сабақтар жүктелуде..." />
            ) : null}

            {error ? (
              <ErrorState text="Сақталған сабақтарды жүктеу мүмкін болмады." />
            ) : null}

            {!isLoading && !error && savedLessons.length === 0 ? (
              <EmptyState
                title="Сақталған сабақ жоқ"
                text="Сабақ бетінде “Сабақты сақтау” батырмасын бассаңыз, ол осы жерде пайда болады."
              />
            ) : null}

            {!isLoading &&
            !error &&
            savedLessons.length > 0 &&
            filteredLessons.length === 0 ? (
              <EmptyState
                title="Сүзгі бойынша сабақ табылмады"
                text="Іздеу сөзін өзгертіңіз немесе сүзгіні тазалаңыз."
              />
            ) : null}

            {!isLoading && !error && filteredLessons.length > 0 ? (
              <div className="grid gap-3">
                {filteredLessons.map((lesson) => {
                  const removing = pendingLessonId === lesson.lessonId;

                  return (
                    <Card key={lesson.bookmarkId} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <CardTitle className="truncate text-base">
                              {lesson.lessonTitle}
                            </CardTitle>

                            <p className="mt-1 text-xs text-muted-foreground">
                              {lesson.courseTitle} · {lesson.moduleTitle}
                            </p>
                          </div>

                          <SavedLessonStatus lesson={lesson} />
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                          <div>
                            <span className="block text-[11px] uppercase tracking-wide">
                              Пән
                            </span>
                            <span className="mt-0.5 block text-foreground">
                              {lesson.subjectName}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[11px] uppercase tracking-wide">
                              Сабақ реті
                            </span>
                            <span className="mt-0.5 block text-foreground">
                              №{lesson.sortOrder || 1}
                            </span>
                          </div>

                          <div>
                            <span className="block text-[11px] uppercase tracking-wide">
                              Сақталған күні
                            </span>
                            <span className="mt-0.5 block text-foreground">
                              {formatDate(lesson.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleRemove(lesson)}
                            disabled={removing}
                          >
                            <Trash2 size={15} className="mr-2" />
                            {removing ? 'Алынып жатыр...' : 'Сақтаудан алу'}
                          </Button>

                          <Button type="button" asChild disabled={lesson.isLocked}>
                            <Link to={`/lessons/${lesson.lessonId}`}>
                              Сабақты ашу
                              <ArrowRight size={15} className="ml-2" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}