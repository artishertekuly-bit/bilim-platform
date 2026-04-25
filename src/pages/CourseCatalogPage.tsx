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
import {
  useCourseCatalog,
  useRedeemCourseInviteMutation,
  useRequestPaidCourseAccessMutation,
  useSubjects,
} from '@/hooks/use-platform-data';
import { bookmarkCourse, enrollInCourse, unbookmarkCourse } from '@/lib/app-data';
import type { CourseView } from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type CatalogMode = 'student' | 'teacher' | 'admin';

function getCatalogMode(pathname: string, role?: string): CatalogMode {
  if (pathname.startsWith('/manage-courses') || role === 'admin') return 'admin';
  if (pathname.startsWith('/my-courses') || role === 'teacher') return 'teacher';
  return 'student';
}

function buildCourseDetailPath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}`;
}

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase().trim();
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

  const [search, setSearch] = useState('');
  const [activeSubject, setActiveSubject] = useState('all');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [pendingBookmarkCourseId, setPendingBookmarkCourseId] = useState<string | null>(null);
  const [inviteCourseId, setInviteCourseId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');

  const { data: subjects } = useSubjects();
  const { data, isLoading, error } = useCourseCatalog(
    user?.role === 'student' ? user.id : undefined,
    isTeacherView ? user?.id : undefined,
    !!user?.id
  );

  const redeemInviteMutation = useRedeemCourseInviteMutation(user?.id);
  const requestPaidAccessMutation = useRequestPaidCourseAccessMutation(user?.id);

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
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      setPendingCourseId(courseId);
      await enrollInCourse(user.id, courseId);

      return courseId;
    },
    onSuccess: async (courseId) => {
      await invalidateCatalogData();

      toast({ title: t('page.course_catalog.toast.enroll_success') });

      navigate(buildCourseDetailPath(courseId));
    },
    onError: (mutationError) =>
      toast({
        title: t('page.course_catalog.toast.error_title'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('page.course_catalog.toast.error_text'),
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
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      setPendingBookmarkCourseId(courseId);

      return bookmarked
        ? unbookmarkCourse(user.id, courseId)
        : bookmarkCourse(user.id, courseId);
    },
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ['courses'] });

      toast({
        title: vars.bookmarked
          ? t('page.course_catalog.toast.bookmark_removed')
          : t('page.course_catalog.toast.bookmark_added'),
      });
    },
    onError: () =>
      toast({
        title: t('page.course_catalog.toast.error_title'),
        description: t('page.course_catalog.toast.error_text'),
        variant: 'destructive',
      }),
    onSettled: () => {
      setPendingBookmarkCourseId(null);
    },
  });

  const subjectFilters = useMemo(
    () => [
      { value: 'all', label: t('common.all') },
      ...((subjects || []).map((subject) => ({
        value: subject.name_kk,
        label: subject.name_kk,
      }))),
    ],
    [subjects]
  );

  const normalizedSearch = useMemo(() => normalizeText(search), [search]);

  const filtered = useMemo(
    () =>
      (data || []).filter((course) => {
        const haystack = normalizeText(
          `${course.title} ${course.teacherName || ''} ${course.description || ''}`
        );

        const matchSearch = haystack.includes(normalizedSearch);
        const matchSubject = activeSubject === 'all' || course.subjectName === activeSubject;
        const matchBookmarks = !showBookmarksOnly || course.bookmarked;

        return matchSearch && matchSubject && matchBookmarks;
      }),
    [activeSubject, data, normalizedSearch, showBookmarksOnly]
  );

  const resetFilters = () => {
    setSearch('');
    setActiveSubject('all');
    setShowBookmarksOnly(false);
  };

  const handleBookmarkToggle = (course: CourseView) => {
    bookmarkMutation.mutate({
      courseId: course.id,
      bookmarked: course.bookmarked,
    });
  };

  const handleStudentCourseAction = async (course: CourseView) => {
    const access = course.access;

    if (course.enrolled) {
      navigate(buildCourseDetailPath(course.id));
      return;
    }

    if (!access || access.unlockAction === 'enroll') {
      enrollMutation.mutate(course.id);
      return;
    }

    if (access.unlockAction === 'open_course') {
      navigate(buildCourseDetailPath(course.id));
      return;
    }

    if (access.unlockAction === 'redeem_invite') {
      setInviteCourseId((current) => (current === course.id ? null : course.id));
      setInviteCode('');
      return;
    }

    if (access.unlockAction === 'request_paid_access') {
      setPendingCourseId(course.id);

      try {
        await requestPaidAccessMutation.mutateAsync({
          courseId: course.id,
          userId: user?.id,
        });

        await invalidateCatalogData();

        toast({
          title: 'Access сұранысы жіберілді',
          description: 'Admin растағаннан кейін курс ашылады.',
        });
      } catch (requestError) {
        toast({
          title: t('page.course_catalog.toast.error_title'),
          description:
            requestError instanceof Error
              ? requestError.message
              : 'Ақылы курсқа сұраныс жіберу мүмкін болмады.',
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
          ? 'Бұл жабық курс. Мұғалім берген invite code қажет.'
          : 'Бұл курсқа қазір кіру мүмкін емес.',
      variant: 'destructive',
    });
  };

  const handleRedeemInvite = async (course: CourseView) => {
    if (!inviteCode.trim()) {
      toast({
        title: 'Invite code енгізіңіз',
        variant: 'destructive',
      });
      return;
    }

    setPendingCourseId(course.id);

    try {
      await redeemInviteMutation.mutateAsync({
        code: inviteCode,
        userId: user?.id,
      });

      await invalidateCatalogData();

      setInviteCourseId(null);
      setInviteCode('');

      toast({
        title: 'Invite қабылданды',
        description: 'Курс сізге ашылды.',
      });

      navigate(buildCourseDetailPath(course.id));
    } catch (inviteError) {
      toast({
        title: 'Invite code қате',
        description:
          inviteError instanceof Error
            ? inviteError.message
            : 'Invite code арқылы курс ашу мүмкін болмады.',
        variant: 'destructive',
      });
    } finally {
      setPendingCourseId(null);
    }
  };

  const pageTitle = isTeacherView
    ? t('nav.my_courses')
    : isAdminView
      ? t('nav.manage_courses')
      : t('course.catalog');

  const pageDescription = isTeacherView
    ? t('page.course_catalog.description.teacher')
    : isAdminView
      ? t('page.course_catalog.description.admin')
      : t('page.course_catalog.description.student');

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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <BookOpen size={13} />
              {isTeacherView
                ? 'Мұғалім кеңістігі'
                : isAdminView
                  ? 'Admin басқару'
                  : 'Курс каталогы'}
            </>
          }
          icon={<BookOpen size={20} />}
          title={pageTitle}
          description={pageDescription}
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

        {isLoading ? (
          <>
            <FilterPanelSkeleton />
            <CourseGridSkeleton count={8} />
          </>
        ) : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.course_catalog.error')}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error ? (
          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    placeholder={t('page.course_catalog.search_placeholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {isStudentView ? (
                  <Button
                    type="button"
                    variant={showBookmarksOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowBookmarksOnly((prev) => !prev)}
                  >
                    <Bookmark size={14} className="mr-1.5" />
                    {showBookmarksOnly
                      ? t('page.course_catalog.bookmarks.all')
                      : t('page.course_catalog.bookmarks.saved')}
                  </Button>
                ) : null}
              </div>

              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {subjectFilters.map((subject) => (
                  <button
                    key={subject.value}
                    type="button"
                    onClick={() => setActiveSubject(subject.value)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                      activeSubject === subject.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {subject.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !error && data && data.length === 0 ? (
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
                    Dashboard-қа қайту
                    <ArrowRight size={15} className="ml-2" />
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : null}

        {!isLoading && !error && data && data.length > 0 && filtered.length === 0 ? (
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

        {!isLoading && !error && filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                mode={mode}
                pendingCourseId={pendingCourseId}
                pendingBookmarkCourseId={pendingBookmarkCourseId}
                inviteCourseId={inviteCourseId}
                inviteCode={inviteCode}
                onBookmarkToggle={handleBookmarkToggle}
                onStudentAction={handleStudentCourseAction}
                onRedeemInvite={handleRedeemInvite}
                onInviteCodeChange={setInviteCode}
                onCloseInvite={() => {
                  setInviteCourseId(null);
                  setInviteCode('');
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}