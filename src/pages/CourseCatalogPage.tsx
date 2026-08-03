import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bookmark,
  Bot,
  Eye,
  FileText,
  Layers3,
  Plus,
  RotateCcw,
  Search,
  Users,
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
import { Input } from '@/components/ui/input';
import {
  useCourseCatalog,
  useRedeemCourseInviteMutation,
  useRequestPaidCourseAccessMutation,
  useSubjects,
} from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import { bookmarkCourse, enrollInCourse, unbookmarkCourse } from '@/lib/app-data';
import type { CourseAccessType, CourseView } from '@/lib/app-data-types';
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


type TeacherStatusFilter =
  | 'all'
  | 'published'
  | 'draft'
  | 'under_review'
  | 'archived';

const TEACHER_STATUS_FILTERS: Array<{
  value: TeacherStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'Барлығы' },
  { value: 'published', label: 'Жарияланған' },
  { value: 'draft', label: 'Жоба' },
  { value: 'under_review', label: 'Тексерілуде' },
  { value: 'archived', label: 'Мұрағат' },
];

function formatMetric(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function buildCourseEditPath(courseId: string) {
  return `/create-course?courseId=${encodeURIComponent(cleanId(courseId))}`;
}

function normalizeCourseAccessType(course: CourseView): CourseAccessType {
  const raw = cleanText(
    course.accessType ?? course.access?.accessType ?? 'public_free',
    80,
  ).toLowerCase();

  if (raw === 'private_invite' || raw === 'closed') return 'private_invite';
  if (raw === 'paid') return 'paid';
  if (raw === 'subscription_only') return 'subscription_only';
  if (raw === 'school_only') return 'school_only';

  return 'public_free';
}

type CourseWithThumbnail = CourseView & {
  thumbnailUrl?: string | null;
};

function getCourseThumbnailUrl(course: CourseView): string {
  const raw = cleanRawText(
    (course as CourseWithThumbnail).thumbnailUrl,
  ).trim();

  if (!raw || raw.length > 2048) return '';

  return /^(https?:\/\/|\/)/i.test(raw) ? raw : '';
}

function getTeacherCourseStatusLabel(status: CourseView['status']): string {
  const normalized = cleanText(status, 80).toLowerCase();

  if (normalized === 'published') return 'Жарияланды';
  if (normalized === 'draft') return 'Жоба';
  if (normalized === 'review' || normalized === 'under_review') {
    return 'Тексерісте';
  }
  if (normalized === 'archived') return 'Мұрағат';

  return 'Курс';
}

function getTeacherAccessLabel(accessType: CourseAccessType): string {
  if (accessType === 'private_invite') return 'Шақырумен';
  if (accessType === 'paid') return 'Ақылы';
  if (accessType === 'subscription_only') return 'Жазылым';
  if (accessType === 'school_only') return 'Мектепке';

  return 'Ашық';
}

function TeacherMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof BookOpen;
}) {
  return (
    <div className="flex min-h-[148px] flex-col justify-between rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
          <Icon size={17} />
        </span>

        <span className="text-4xl font-black tracking-[-0.055em] sm:text-5xl">
          {value}
        </span>
      </div>

      <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function TeacherCourseCard({
  course,
  sequence,
}: {
  course: CourseView;
  sequence: number;
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const courseId = cleanId(course.id);
  const title = cleanText(course.title) || 'Атаусыз курс';
  const description = cleanText(course.description, MAX_TEXT_CHARS);
  const subjectName =
    cleanText(course.subjectName, MAX_SUBJECT_CHARS) || 'Жалпы';
  const editPath = buildCourseEditPath(courseId);
  const detailPath = buildCourseDetailPath(courseId);
  const accessType = normalizeCourseAccessType(course);
  const thumbnailUrl = getCourseThumbnailUrl(course);
  const showThumbnail = Boolean(thumbnailUrl && !thumbnailFailed);
  const courseNumber = String(sequence + 1).padStart(2, '0');

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-[1.9rem] border border-border bg-card',
        'transition-[transform,border-color,box-shadow] duration-200 ease-soft',
        'hover:-translate-y-1 hover:border-foreground/20 hover:shadow-soft-lg',
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-border bg-muted">
        {showThumbnail ? (
          <img
            src={thumbnailUrl}
            alt={`${title} курсының мұқабасы`}
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-soft group-hover:scale-[1.035]"
          />
        ) : (
          <div className="relative flex h-full items-center justify-center overflow-hidden bg-muted">
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-foreground/10"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full border border-foreground/[0.07]"
            />

            <div className="relative text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-soft">
                <BookOpen size={21} />
              </span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {subjectName}
              </p>
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-white/45 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
            {getTeacherCourseStatusLabel(course.status)}
          </span>
          <span className="rounded-full border border-white/45 bg-white/85 px-2.5 py-1 text-[10px] font-semibold text-black backdrop-blur-md">
            {getTeacherAccessLabel(accessType)}
          </span>
        </div>

        <span className="absolute right-3 top-3 rounded-full border border-white/35 bg-black/45 px-2.5 py-1 font-mono text-[10px] font-bold text-white backdrop-blur-md">
          {courseNumber}
        </span>
      </div>

      <div className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
          {subjectName}
        </p>

        <Link
          to={editPath}
          className="mt-2 block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
        >
          <h3 className="line-clamp-2 text-2xl font-black tracking-[-0.04em] text-foreground">
            {title}
          </h3>
        </Link>

        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
          {description || 'Курс сипаттамасы әлі толтырылмаған.'}
        </p>

        <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-[1.25rem] border border-border bg-background">
          <div className="px-3 py-3 text-center">
            <p className="text-base font-black">
              {formatMetric(course.lessons)}
            </p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Сабақ
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-base font-black">
              {formatMetric(course.students)}
            </p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Оқушы
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-base font-black">
              {formatMetric(course.courseAssetsCount)}
            </p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Файл
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <Button type="button" className="rounded-full" asChild>
            <Link to={editPath}>
              Өңдеу
              <ArrowRight size={14} className="ml-2" />
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            asChild
          >
            <Link to={detailPath} aria-label={`${title} курсын көру`}>
              <Eye size={15} />
            </Link>
          </Button>
        </div>
      </div>
    </article>
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
  const [activeTeacherStatus, setActiveTeacherStatus] =
    useState<TeacherStatusFilter>('all');
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
        const matchesTeacherStatus =
          !isTeacherView ||
          activeTeacherStatus === 'all' ||
          course.status === activeTeacherStatus;

        return (
          matchesSearch &&
          matchesSubject &&
          matchesBookmarks &&
          matchesTeacherStatus
        );
      }),
    [
      activeSubject,
      activeTeacherStatus,
      data,
      isTeacherView,
      normalizedSearch,
      showBookmarksOnly,
    ],
  );

  const resetFilters = () => {
    setSearch('');
    setActiveSubject('all');
    setShowBookmarksOnly(false);
    setActiveTeacherStatus('all');
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
    Boolean(search.trim()) ||
    activeSubject !== 'all' ||
    showBookmarksOnly ||
    (isTeacherView && activeTeacherStatus !== 'all');

  const teacherSummary = useMemo(() => {
    const courses = data || [];

    return {
      courses: courses.length,
      lessons: courses.reduce(
        (total, course) => total + formatMetric(course.lessons),
        0,
      ),
      students: courses.reduce(
        (total, course) => total + formatMetric(course.students),
        0,
      ),
      published: courses.filter((course) => course.status === 'published').length,
    };
  }, [data]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl animate-fade-in space-y-6">
        {isTeacherView ? (
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card px-5 py-6 shadow-soft sm:px-7">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-foreground/[0.045] blur-3xl"
              />

              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-5xl">
                  Курстарым
                </h1>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    asChild
                  >
                    <Link to="/ai-assistant">
                      <Bot size={15} className="mr-2" />
                      Автор көмекшісі
                    </Link>
                  </Button>

                  <Button type="button" className="rounded-full" asChild>
                    <Link to="/create-course">
                      <Plus size={15} className="mr-2" />
                      Жаңа курс
                    </Link>
                  </Button>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <TeacherMetric
                label="Курс"
                value={teacherSummary.courses}
                icon={BookOpen}
              />
              <TeacherMetric
                label="Сабақ"
                value={teacherSummary.lessons}
                icon={FileText}
              />
              <TeacherMetric
                label="Қатысушы"
                value={teacherSummary.students}
                icon={Users}
              />
              <TeacherMetric
                label="Жарияланған"
                value={teacherSummary.published}
                icon={BarChart3}
              />
            </section>
          </div>
        ) : (
          <PageHeader
            eyebrow={
              <>
                <BookOpen size={13} />
                {getModeEyebrow({ isTeacherView, isAdminView })}
              </>
            }
            icon={<BookOpen size={20} />}
            title={pageTitle}
          />
        )}

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
            <CourseGridSkeleton count={6} />
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
          <section
            className={cn(
              'overflow-hidden rounded-[2rem] border border-border bg-card',
              isTeacherView && 'shadow-soft',
            )}
          >
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative w-full lg:max-w-md">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      placeholder={
                        isTeacherView
                          ? 'Курс атауы немесе пән бойынша іздеу'
                          : t('page.course_catalog.search_placeholder')
                      }
                      value={search}
                      maxLength={MAX_SEARCH_CHARS}
                      onChange={(event) => handleSearchChange(event.target.value)}
                      className="h-11 rounded-full pl-10"
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
                    {!isTeacherView
                      ? getModeBadge({ isTeacherView, isAdminView })
                      : null}
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

                  {isTeacherView ? (
                    <Button type="button" size="sm" className="rounded-full" asChild>
                      <Link to="/create-course">
                        <Plus size={14} className="mr-1.5" />
                        Курс қосу
                      </Link>
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

              {isTeacherView ? (
                <div className="flex flex-wrap gap-2 border-t border-border/75 pt-4">
                  {TEACHER_STATUS_FILTERS.map((status) => {
                    const active = activeTeacherStatus === status.value;
                    return (
                      <button
                        key={status.value}
                        type="button"
                        onClick={() => setActiveTeacherStatus(status.value)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {status.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

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
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                      )}
                    >
                      {subject.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {user && !isLoading && !error && data && data.length === 0 ? (
          isTeacherView ? (
            <section className="relative overflow-hidden rounded-[2.25rem] border border-dashed border-foreground/25 bg-card p-8 text-center sm:p-12">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background">
                <BookOpen size={21} />
              </div>
              <h2 className="mt-6 text-2xl font-black tracking-[-0.04em]">
                Алғашқы курсыңызды бастаңыз
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                Курс идеясы, сабақ құрылымы және материалдар бір жұмыс
                кеңістігінде жиналады.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button type="button" className="rounded-full" asChild>
                  <Link to="/create-course">
                    <Plus size={15} className="mr-2" />
                    Курс құру
                  </Link>
                </Button>
                <Button type="button" variant="outline" className="rounded-full" asChild>
                  <Link to="/ai-assistant">
                    <Bot size={15} className="mr-2" />
                    Идея дайындау
                  </Link>
                </Button>
              </div>
            </section>
          ) : (
            <EmptyState
              icon={<BookOpen size={18} />}
              title={emptyTitle}
              text={emptyText}
              action={
                isStudentView ? (
                  <Button type="button" variant="outline" asChild>
                    <Link to="/dashboard">
                      Басты бетке қайту
                      <ArrowRight size={15} className="ml-2" />
                    </Link>
                  </Button>
                ) : null
              }
            />
          )
        ) : null}

        {user && !isLoading && !error && data && data.length > 0 && filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={18} />}
            title={t('page.course_catalog.empty.filtered_title')}
            text={
              showBookmarksOnly
                ? t('page.course_catalog.empty.bookmarks_text')
                : 'Таңдалған сүзгіге сәйкес курс табылмады.'
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
              ) : null
            }
          />
        ) : null}

        {user && !isLoading && !error && filtered.length > 0 ? (
          isTeacherView ? (
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-black tracking-[-0.04em]">
                  Курстар
                </h2>
                <span className="text-xs text-muted-foreground">
                  {filtered.length} курс
                </span>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((course, index) => (
                  <TeacherCourseCard
                    key={cleanId(course.id)}
                    course={course}
                    sequence={index}
                  />
                ))}
              </div>
            </section>
          ) : (
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
          )
        ) : null}
      </div>
    </DashboardLayout>
  );
}
