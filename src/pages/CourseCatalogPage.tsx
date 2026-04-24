import DashboardLayout from '@/components/DashboardLayout';
import ProgressBar from '@/components/ProgressBar';
import TeacherProfileCard from '@/components/TeacherProfileCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
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
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Clock,
  KeyRound,
  Lock,
  Tag,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type CatalogMode = 'student' | 'teacher' | 'admin';

function getCatalogMode(pathname: string, role?: string): CatalogMode {
  if (pathname.startsWith('/manage-courses') || role === 'admin') return 'admin';
  if (pathname.startsWith('/my-courses') || role === 'teacher') return 'teacher';
  return 'student';
}

function getCourseStatusLabel(status: string) {
  const map: Record<string, string> = {
    draft: t('course.status.draft'),
    under_review: t('course.status.review'),
    published: t('course.status.published'),
    archived: t('course.status.archived'),
  };

  return map[status] || status;
}

function buildCourseEditPath(courseId: string) {
  return `/create-course?courseId=${encodeURIComponent(courseId)}`;
}

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase().trim();
}

function formatCoursePrice(course: CourseView) {
  const accessType = getNormalizedCatalogAccessType(course);
  const price = Number(course.price ?? course.access?.price ?? 0);
  const currency = course.currency ?? course.access?.currency ?? 'KZT';

  if (accessType !== 'paid') return 'Тегін';
  if (!price) return 'Ақылы';

  return `${price.toLocaleString('kk-KZ')} ${currency}`;
}

function getNormalizedCatalogAccessType(course: CourseView) {
  const accessType = course.accessType ?? course.access?.accessType ?? 'public_free';

  if (accessType === 'subscription_only') return 'paid';
  if (accessType === 'school_only') return 'private_invite';

  return accessType;
}

function getCourseAccessBadge(course: CourseView) {
  const accessType = getNormalizedCatalogAccessType(course);

  const map: Record<string, { label: string; className: string }> = {
    public_free: {
      label: 'Ашық',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    private_invite: {
      label: 'Жабық',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    paid: {
      label: 'Ақылы',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
  };

  return map[accessType] || {
    label: 'Белгісіз',
    className: 'border-border bg-muted text-muted-foreground',
  };
}

function getStudentActionLabel(course: CourseView) {
  const access = course.access;

  if (course.enrolled) return t('course.continue');

  if (!access) return t('course.enroll');

  if (access.pendingOrderId) return 'Сұраныс қаралуда';

  switch (access.unlockAction) {
    case 'open_course':
    case 'enroll':
      return 'Курсты бастау';
    case 'redeem_invite':
      return 'Invite code енгізу';
    case 'request_paid_access':
      return 'Access сұрау';
      case 'subscribe':
  return 'Ақылы access қажет';
case 'request_school_access':
  return 'Жабық курс';
    case 'manage_course':
      return t('common.edit');
    default:
      if (access.accessState === 'draft_or_unpublished') return 'Жарияланбаған';
      if (access.accessState === 'enrollment_closed') return 'Жазылу жабық';
      return 'Қолжетімсіз';
  }
}

function getStudentActionDisabled(course: CourseView, pendingCourseId: string | null) {
  const access = course.access;

  if (pendingCourseId === course.id) return true;
  if (course.enrolled) return false;
  if (!access) return false;

  if (access.pendingOrderId) return true;

  return (
    access.unlockAction === 'none' ||
    access.unlockAction === 'subscribe' ||
    access.unlockAction === 'request_school_access'
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
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
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
      return enrollInCourse(user.id, courseId);
    },
    onSuccess: async () => {
      await invalidateCatalogData();

      toast({ title: t('page.course_catalog.toast.enroll_success') });
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

  const handleStudentCourseAction = async (course: CourseView) => {
    const access = course.access;

    if (course.enrolled) {
      navigate('/lessons');
      return;
    }

    if (!access || access.unlockAction === 'enroll' || access.unlockAction === 'open_course') {
      enrollMutation.mutate(course.id);
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
    course.access?.accessState === 'requires_invite'
      ? 'Бұл жабық курс. Мұғалім берген invite code қажет.'
      : getStudentActionLabel(course),
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
        <div>
          <h2 className="text-xl font-bold">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>

        {isLoading ? <LoadingState text={t('page.course_catalog.loading')} /> : null}

        {error ? <ErrorState text={t('page.course_catalog.error')} /> : null}

        {!isLoading && !error ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder={t('page.course_catalog.search_placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />

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

            <div className="flex flex-wrap gap-1.5">
              {subjectFilters.map((subject) => (
                <button
                  key={subject.value}
                  onClick={() => setActiveSubject(subject.value)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                    activeSubject === subject.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {subject.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!isLoading && !error && data && data.length === 0 ? (
          <EmptyState title={emptyTitle} text={emptyText} />
        ) : null}

        {!isLoading && !error && data && data.length > 0 && filtered.length === 0 ? (
          <EmptyState
            title={t('page.course_catalog.empty.filtered_title')}
            text={
              showBookmarksOnly
                ? t('page.course_catalog.empty.bookmarks_text')
                : t('page.course_catalog.empty.filtered_text')
            }
          />
        ) : null}

        {!isLoading && !error && filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((course) => {
              const accessBadge = getCourseAccessBadge(course);
              const actionLabel = getStudentActionLabel(course);
              const actionDisabled = getStudentActionDisabled(course, pendingCourseId);
              const showInviteInput =
                isStudentView &&
                inviteCourseId === course.id &&
                course.access?.unlockAction === 'redeem_invite';

              const cardBody = (
                <>
                  <div className="relative flex h-28 items-center justify-center border-b border-border bg-accent">
                    <BookOpen
                      size={28}
                      className="text-muted-foreground/40 transition-transform duration-200 group-hover:scale-110"
                    />

                    <div
                      className={`absolute left-3 top-3 rounded-full border px-2 py-1 text-[10px] font-medium ${accessBadge.className}`}
                    >
                      {accessBadge.label}
                    </div>

                    {course.access?.pendingOrderId ? (
                      <div className="absolute bottom-3 left-3 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                        Сұраныс қаралуда
                      </div>
                    ) : null}
                  </div>

                  <CardContent className="space-y-3 p-4">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {course.subjectName}
                      </span>

                      <h3 className="mt-0.5 text-sm font-semibold group-hover:underline">
                        {course.title}
                      </h3>

                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {course.description || t('page.course_catalog.no_description')}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {course.students}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {course.lessons} {t('course.lessons_count')}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <Tag size={11} />
                        {formatCoursePrice(course)}
                      </span>
                    </div>

                    {course.access?.accessState === 'enrollment_closed' ? (
                      <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                        <Lock size={12} />
                        Курсқа жазылу уақытша жабық
                      </div>
                    ) : null}

                    <TeacherProfileCard
                      compact
                      teacher={{
                        id: course.teacherId,
                        fullName: course.teacherName,
                        avatarUrl: course.teacherAvatarUrl,
                        bio: course.teacherBio,
                        coursesCount: course.teacherCoursesCount,
                      }}
                    />
                  </CardContent>
                </>
              );

              return (
                <Card
                  key={course.id}
                  className="group overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative">
                    {isStudentView && course.enrolled ? (
                      <Link to="/lessons" className="block">
                        {cardBody}
                      </Link>
                    ) : isTeacherView ? (
                      <Link to={buildCourseEditPath(course.id)} className="block">
                        {cardBody}
                      </Link>
                    ) : (
                      <div className="block">{cardBody}</div>
                    )}

                    {isStudentView ? (
                      <button
                        type="button"
                        disabled={pendingBookmarkCourseId === course.id}
                        className={`absolute right-3 top-3 z-10 rounded-full border p-2 transition-colors ${
                          course.bookmarked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background/80 hover:bg-background'
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          bookmarkMutation.mutate({
                            courseId: course.id,
                            bookmarked: course.bookmarked,
                          });
                        }}
                        aria-label={
                          course.bookmarked
                            ? t('page.course_catalog.bookmark.remove')
                            : t('page.course_catalog.bookmark.add')
                        }
                      >
                        <Bookmark
                          size={14}
                          fill={course.bookmarked ? 'currentColor' : 'none'}
                        />
                      </button>
                    ) : null}

                    <div className="space-y-2 px-4 pb-4">
                      {isStudentView && course.enrolled ? (
                        <div className="space-y-2">
                          <ProgressBar value={course.progress} size="sm" />
                          <button
                            onClick={() => navigate('/lessons')}
                            className="flex w-full items-center justify-center gap-1 rounded-md bg-primary py-2 text-xs text-primary-foreground transition-opacity hover:opacity-90"
                          >
                            {t('course.continue')} <ArrowRight size={12} />
                          </button>
                        </div>
                      ) : isStudentView ? (
                        <>
                          {showInviteInput ? (
                            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                                <KeyRound size={12} />
                                Invite code
                              </div>
                              <Input
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value)}
                                placeholder="Мысалы: ABC123XYZ"
                                className="h-8 text-xs uppercase"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => {
                                    setInviteCourseId(null);
                                    setInviteCode('');
                                  }}
                                >
                                  Жабу
                                </Button>
                                <Button
                                  size="sm"
                                  className="text-xs"
                                  disabled={pendingCourseId === course.id}
                                  onClick={() => handleRedeemInvite(course)}
                                >
                                  Қабылдау
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          <Button
                            size="sm"
                            variant={
                              course.access?.unlockAction === 'request_paid_access'
                                ? 'default'
                                : 'outline'
                            }
                            className="w-full text-xs"
                            onClick={() => handleStudentCourseAction(course)}
                            disabled={actionDisabled}
                          >
                            {pendingCourseId === course.id
                              ? t('page.course_catalog.enrolling')
                              : actionLabel}
                          </Button>
                        </>
                      ) : isTeacherView ? (
                        <Link
                          to={buildCourseEditPath(course.id)}
                          className="flex w-full items-center justify-center gap-1 rounded-md bg-primary py-2 text-xs text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          {t('common.edit')} <ArrowRight size={12} />
                        </Link>
                      ) : (
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          <div>
                            {t('page.course_catalog.current_status')}:{' '}
                            {getCourseStatusLabel(course.status)}
                          </div>
                          <div>
                            Access: {accessBadge.label} · {formatCoursePrice(course)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}