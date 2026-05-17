import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import {
  CourseGridSkeleton,
  FilterPanelSkeleton,
} from '@/components/common/SkeletonBlocks';
import CourseCard from '@/components/course/CourseCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useCourseCatalog,
  useRedeemCourseInviteMutation,
  useRequestPaidCourseAccessMutation,
  useSubjects,
} from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import { bookmarkCourse, enrollInCourse, unbookmarkCourse } from '@/lib/app-data';
import type { CourseView } from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type CatalogMode = 'student' | 'teacher' | 'admin';

const MAX_ID_CHARS = 180;
const MAX_SEARCH_CHARS = 160;
const MAX_INVITE_CODE_CHARS = 120;
const MAX_TEXT_CHARS = 500;
const MAX_SUBJECT_CHARS = 160;
const MAX_ERROR_CHARS = 700;

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

function normalizeSearchInput(value: unknown): string {
  return cleanText(value, MAX_SEARCH_CHARS);
}

function normalizeInviteCode(value: unknown): string {
  return cleanText(value, MAX_INVITE_CODE_CHARS);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function getCatalogMode(pathname: string, role?: string): CatalogMode {
  if (pathname.startsWith('/manage-courses') || role === 'admin') return 'admin';
  if (pathname.startsWith('/my-courses') || role === 'teacher') return 'teacher';

  return 'student';
}

function buildCourseDetailPath(courseId: string) {
  return `/courses/${encodeURIComponent(cleanId(courseId))}`;
}

function getModeEyebrow({
  isTeacherView,
  isAdminView,
}: {
  isTeacherView: boolean;
  isAdminView: boolean;
}) {
  if (isTeacherView) return 'Мұғалім';
  if (isAdminView) return 'Әкімші';

  return 'Курстар';
}

function getModeBadge({
  isTeacherView,
  isAdminView,
}: {
  isTeacherView: boolean;
  isAdminView: boolean;
}) {
  if (isTeacherView) {
    return (
      <Badge variant="secondary" className="text-[11px]">
        Мұғалім
      </Badge>
    );
  }

  if (isAdminView) {
    return (
      <Badge variant="warning" className="text-[11px]">
        Әкімші
      </Badge>
    );
  }

  return null;
}

function buildCourseSearchHaystack(course: CourseView): string {
  return normalizeText(
    [
      course.title,
      course.teacherName,
      course.description,
      course.subjectName,
    ]
      .map((item) => cleanText(item, MAX_TEXT_CHARS))
      .filter(Boolean)
      .join(' '),
  );
}

export default function CourseCatalogPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const mode = getCatalogMode(location.pathname, user?.role);
  const isStudentView = mode === 'student';
  const isTeacherView = mode === 'teacher';
  const isAdminView = mode === 'admin';

  const safeUserId = cleanId(user?.id);

  const [search, setSearch] = useState('');
  const [activeSubject, setActiveSubject] = useState('all');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [pendingBookmarkCourseId, setPendingBookmarkCourseId] = useState<string | null>(
    null,
  );
  const [inviteCourseId, setInviteCourseId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');

  const { data: subjects } = useSubjects();

  const { data, isLoading, error } = useCourseCatalog(
    user?.role === 'student' ? safeUserId : undefined,
    isTeacherView ? safeUserId : undefined,
    Boolean(safeUserId),
  );

  const redeemInviteMutation = useRedeemCourseInviteMutation(safeUserId);
  const requestPaidAccessMutation = useRequestPaidCourseAccessMutation(safeUserId);

  const invalidateCatalogData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['courses'] }),
      queryClient.invalidateQueries({ queryKey: ['course-progress'] }),
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['my-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] }),
    ]);
  };

  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const safeCourseId = cleanId(courseId);

      if (!safeUserId) {
        throw new Error('Кіру қажет.');
      }

      if (!safeCourseId) {
        throw new Error('Курс анықталмады.');
      }

      setPendingCourseId(safeCourseId);
      await enrollInCourse(safeUserId, safeCourseId);

      return safeCourseId;
    },
    onSuccess: async (courseId) => {
      await invalidateCatalogData();

      toast({
        title: t('page.course_catalog.toast.enroll_success'),
      });

      navigate(buildCourseDetailPath(courseId));
    },
    onError: (mutationError) =>
      toast({
        title: t('page.course_catalog.toast.error_title'),
        description: getErrorMessage(
          mutationError,
          t('page.course_catalog.toast.error_text'),
        ),
        variant: 'destructive',
      }),
    onSettled: () => {
      setPendingCourseId(null);
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async ({
      courseId,
      bookmarked,
    }: {
      courseId: string;
      bookmarked: boolean;
    }) => {
      const safeCourseId = cleanId(courseId);

      if (!safeUserId) {
        throw new Error('Кіру қажет.');
      }

      if (!safeCourseId) {
        throw new Error('Курс анықталмады.');
      }

      setPendingBookmarkCourseId(safeCourseId);

      return bookmarked
        ? unbookmarkCourse(safeUserId, safeCourseId)
        : bookmarkCourse(safeUserId, safeCourseId);
    },
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['courses'] });

      toast({
        title: variables.bookmarked
          ? t('page.course_catalog.toast.bookmark_removed')
          : t('page.course_catalog.toast.bookmark_added'),
      });
    },
    onError: (bookmarkError) =>
      toast({
        title: t('page.course_catalog.toast.error_title'),
        description: getErrorMessage(
          bookmarkError,
          t('page.course_catalog.toast.error_text'),
        ),
        variant: 'destructive',
      }),
    onSettled: () => {
      setPendingBookmarkCourseId(null);
    },
  });

  const subjectFilters = useMemo(() => {
    const output = [
      {
        value: 'all',
        label: t('common.all'),
      },
    ];

    const seen = new Set(['all']);

    (subjects || []).forEach((subject) => {
      const subjectName = cleanText(subject.name_kk, MAX_SUBJECT_CHARS);

      if (!subjectName) return;

      const key = subjectName.toLowerCase();

      if (seen.has(key)) return;

      seen.add(key);
      output.push({
        value: subjectName,
        label: subjectName,
      });
    });

    return output;
  }, [subjects]);

  const normalizedSearch = useMemo(() => normalizeText(search), [search]);

  const filtered = useMemo(
    () =>
      (data || []).filter((course) => {
        const haystack = buildCourseSearchHaystack(course);

        const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
        const matchesSubject =
          activeSubject === 'all' ||
          cleanText(course.subjectName, MAX_SUBJECT_CHARS) === activeSubject;
        const matchesBookmarks = !showBookmarksOnly || Boolean(course.bookmarked);

        return matchesSearch && matchesSubject && matchesBookmarks;
      }),
    [activeSubject, data, normalizedSearch, showBookmarksOnly],
  );

  const resetFilters = () => {
    setSearch('');
    setActiveSubject('all');
    setShowBookmarksOnly(false);
  };

  const handleBookmarkToggle = (course: CourseView) => {
    const courseId = cleanId(course.id);

    if (!safeUserId) {
      toast({
        title: 'Кіру қажет',
        description: 'Курсты сақтау үшін жүйеге кіріңіз.',
        variant: 'destructive',
      });
      return;
    }

    if (!courseId) {
      toast({
        title: t('page.course_catalog.toast.error_title'),
        description: 'Курс анықталмады.',
        variant: 'destructive',
      });
      return;
    }

    bookmarkMutation.mutate({
      courseId,
      bookmarked: course.bookmarked,
    });
  };

  const handleStudentCourseAction = async (course: CourseView) => {
    const courseId = cleanId(course.id);

    if (!safeUserId) {
      toast({
        title: 'Кіру қажет',
        description: 'Курсқа кіру үшін жүйеге кіріңіз.',
        variant: 'destructive',
      });
      return;
    }

    if (!courseId) {
      toast({
        title: t('page.course_catalog.toast.error_title'),
        description: 'Курс анықталмады.',
        variant: 'destructive',
      });
      return;
    }

    const access = course.access;

    if (course.enrolled) {
      navigate(buildCourseDetailPath(courseId));
      return;
    }

    if (!access || access.unlockAction === 'enroll') {
      enrollMutation.mutate(courseId);
      return;
    }

    if (access.unlockAction === 'open_course') {
      navigate(buildCourseDetailPath(courseId));
      return;
    }

    if (access.unlockAction === 'redeem_invite') {
      setInviteCourseId((current) => (current === courseId ? null : courseId));
      setInviteCode('');
      return;
    }

    if (access.unlockAction === 'request_paid_access') {
      setPendingCourseId(courseId);

      try {
        await requestPaidAccessMutation.mutateAsync({
          courseId,
          userId: safeUserId,
        });

        await invalidateCatalogData();

        toast({
          title: 'Қолжетімділік сұранысы жіберілді',
          description: 'Расталғаннан кейін курс ашылады.',
        });
      } catch (requestError) {
        toast({
          title: t('page.course_catalog.toast.error_title'),
          description: getErrorMessage(
            requestError,
            'Ақылы курсқа сұраныс жіберу мүмкін болмады.',
          ),
          variant: 'destructive',
        });
      } finally {
        setPendingCourseId(null);
      }

      return;
    }

    toast({
      title: 'Курс қолжетімсіз',
      description:
        access?.accessState === 'requires_invite'
          ? 'Бұл жабық курс. Шақыру коды қажет.'
          : 'Бұл курсқа қазір кіру мүмкін емес.',
      variant: 'destructive',
    });
  };

  const handleRedeemInvite = async (course: CourseView) => {
    const courseId = cleanId(course.id);
    const code = normalizeInviteCode(inviteCode);

    if (!code) {
      toast({
        title: 'Шақыру кодын енгізіңіз',
        variant: 'destructive',
      });
      return;
    }

    if (!safeUserId) {
      toast({
        title: 'Кіру қажет',
        description: 'Шақыру кодын қолдану үшін жүйеге кіріңіз.',
        variant: 'destructive',
      });
      return;
    }

    if (!courseId) {
      toast({
        title: t('page.course_catalog.toast.error_title'),
        description: 'Курс анықталмады.',
        variant: 'destructive',
      });
      return;
    }

    setPendingCourseId(courseId);

    try {
      await redeemInviteMutation.mutateAsync({
        code,
        userId: safeUserId,
      });

      await invalidateCatalogData();

      setInviteCourseId(null);
      setInviteCode('');

      toast({
        title: 'Шақыру коды қабылданды',
        description: 'Курс ашылды.',
      });

      navigate(buildCourseDetailPath(courseId));
    } catch (inviteError) {
      toast({
        title: 'Шақыру коды қате',
        description: getErrorMessage(inviteError, 'Курсты ашу мүмкін болмады.'),
        variant: 'destructive',
      });
    } finally {
      setPendingCourseId(null);
    }
  };

  const handleInviteCodeChange = (value: string) => {
    setInviteCode(normalizeInviteCode(value));
  };

  const handleSearchChange = (value: string) => {
    setSearch(normalizeSearchInput(value));
  };

  const handleSubjectChange = (value: string) => {
    const nextSubject = cleanText(value, MAX_SUBJECT_CHARS);

    setActiveSubject(nextSubject || 'all');
  };

  const pageTitle = isTeacherView
    ? t('nav.my_courses')
    : isAdminView
      ? t('nav.manage_courses')
      : t('course.catalog');

  const emptyTitle = isTeacherView
    ? t('page.course_catalog.empty.teacher_title')
    : isAdminView
      ? t('page.course_catalog.empty.admin_title')
      : t('page.course_catalog.empty.student_title');

  const emptyText = isTeacherView
    ? t('page.course_catalog.empty.teacher_text')
    : isAdminView
      ? t('page.course_catalog.empty.admin_text')
      : t('page.course_catalog.empty.student_text');

  const totalCourses = data?.length || 0;
  const filteredCourses = filtered.length;
  const hasActiveFilters =
    Boolean(search.trim()) || activeSubject !== 'all' || showBookmarksOnly;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <BookOpen size={13} />
              {getModeEyebrow({ isTeacherView, isAdminView })}
            </>
          }
          icon={<BookOpen size={20} />}
          title={pageTitle}
          actions={
            isTeacherView ? (
              <Button type="button" asChild>
                <Link to="/create-course">
                  <Plus size={15} className="mr-2" />
                  Курс құру
                </Link>
              </Button>
            ) : null
          }
        />

        {!user ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="Аккаунт анықталмады"
            text="Курстарды көру үшін жүйеге кіріңіз."
          />
        ) : null}

        {user && isLoading ? (
          <>
            <FilterPanelSkeleton />
            <CourseGridSkeleton count={8} />
          </>
        ) : null}

        {user && !isLoading && error ? (
          <ErrorState
            text={t('page.course_catalog.error')}
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
          <Card className="overflow-hidden border-border bg-card">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative w-full lg:max-w-md">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />

                    <Input
                      placeholder={t('page.course_catalog.search_placeholder')}
                      value={search}
                      maxLength={MAX_SEARCH_CHARS}
                      onChange={(event) => handleSearchChange(event.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted" className="text-[11px]">
                      Барлығы: {totalCourses}
                    </Badge>

                    <Badge
                      variant={hasActiveFilters ? 'default' : 'outline'}
                      className="text-[11px]"
                    >
                      Көрсетілді: {filteredCourses}
                    </Badge>

                    {getModeBadge({ isTeacherView, isAdminView })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isStudentView ? (
                    <Button
                      type="button"
                      variant={showBookmarksOnly ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowBookmarksOnly((previous) => !previous)}
                    >
                      <Bookmark size={14} className="mr-1.5" />
                      {showBookmarksOnly
                        ? t('page.course_catalog.bookmarks.all')
                        : t('page.course_catalog.bookmarks.saved')}
                    </Button>
                  ) : null}

                  {hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetFilters}
                    >
                      <RotateCcw size={14} className="mr-1.5" />
                      Тазалау
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {subjectFilters.map((subject) => {
                  const active = activeSubject === subject.value;

                  return (
                    <button
                      key={subject.value}
                      type="button"
                      onClick={() => handleSubjectChange(subject.value)}
                      aria-pressed={active}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors active:scale-[0.99]',
                        active
                          ? 'border-primary-muted bg-primary-soft text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft/45 hover:text-primary',
                      )}
                    >
                      {subject.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {user && !isLoading && !error && data && data.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title={emptyTitle}
            text={emptyText}
            action={
              isTeacherView ? (
                <Button type="button" asChild>
                  <Link to="/create-course">
                    <Plus size={15} className="mr-2" />
                    Курс құру
                  </Link>
                </Button>
              ) : isStudentView ? (
                <Button type="button" variant="outline" asChild>
                  <Link to="/dashboard">
                    Басты бетке қайту
                    <ArrowRight size={15} className="ml-2" />
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : null}

        {user && !isLoading && !error && data && data.length > 0 && filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={18} />}
            title={t('page.course_catalog.empty.filtered_title')}
            text={
              showBookmarksOnly
                ? t('page.course_catalog.empty.bookmarks_text')
                : t('page.course_catalog.empty.filtered_text')
            }
            action={
              <Button type="button" onClick={resetFilters}>
                <RotateCcw size={15} className="mr-2" />
                Сүзгіні тазалау
              </Button>
            }
            secondaryAction={
              isTeacherView ? (
                <Button type="button" variant="outline" asChild>
                  <Link to="/create-course">
                    <Plus size={15} className="mr-2" />
                    Курс құру
                  </Link>
                </Button>
              ) : isStudentView ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowBookmarksOnly(false);
                    setActiveSubject('all');
                  }}
                >
                  Барлық курстар
                </Button>
              ) : null
            }
          />
        ) : null}

        {user && !isLoading && !error && filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((course) => {
              const courseId = cleanId(course.id);

              return (
                <CourseCard
                  key={courseId}
                  course={course}
                  mode={mode}
                  pendingCourseId={pendingCourseId}
                  pendingBookmarkCourseId={pendingBookmarkCourseId}
                  inviteCourseId={inviteCourseId}
                  inviteCode={inviteCode}
                  onBookmarkToggle={handleBookmarkToggle}
                  onStudentAction={handleStudentCourseAction}
                  onRedeemInvite={handleRedeemInvite}
                  onInviteCodeChange={handleInviteCodeChange}
                  onCloseInvite={() => {
                    setInviteCourseId(null);
                    setInviteCode('');
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}