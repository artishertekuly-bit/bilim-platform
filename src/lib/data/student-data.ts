import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

import { isSoftSchemaError, queryOrThrow } from './common';
import type { Locale } from './common';

import type {
  CourseAccessState,
  CourseAccessType,
  CourseAccessView,
  CourseUnlockAction,
  CourseProgressLessonStatus,
  CourseProgressLessonView,
  CourseProgressModuleView,
  CourseProgressTimelineView,
  CourseView,
  CourseVisibility,
  CurrencyCode,
  DashboardStudentData,
  EntitlementRow,
  LessonDetailView,
  LessonLockedReason,
  LeaderboardView,
  OrderRow,
  ProfileMap,
  RpcMutationResponse,
  SubjectMap,
  SubjectRow,
  TestAttemptBreakdownItem,
  TestCatalogItem,
  LessonView,
} from '@/lib/app-data-types';

type CourseRowWithAccess = Tables<'courses'> & {
  access_type?: CourseAccessType | null;
  visibility?: CourseVisibility | null;
  price?: number | null;
  currency?: CurrencyCode | null;
  published_at?: string | null;
  enrollment_open?: boolean | null;
  max_students?: number | null;
};

type DynamicSupabaseError = {
  message: string;
};

type DynamicSupabaseResult<TData = unknown> = {
  data: TData | null;
  error: DynamicSupabaseError | null;
  count?: number | null;
};

type DynamicSupabaseQuery<TData = unknown> =
  PromiseLike<DynamicSupabaseResult<TData>> & {
    select: (columns?: string) => DynamicSupabaseQuery<TData>;
    eq: (column: string, value: unknown) => DynamicSupabaseQuery<TData>;
    is: (column: string, value: unknown) => DynamicSupabaseQuery<TData>;
    gt: (column: string, value: unknown) => DynamicSupabaseQuery<TData>;
    order: (
      column: string,
      options?: {
        ascending?: boolean;
      },
    ) => DynamicSupabaseQuery<TData>;
    insert: (values: unknown) => DynamicSupabaseQuery<TData>;
    update: (values: unknown) => DynamicSupabaseQuery<TData>;
    upsert: (
      values: unknown,
      options?: {
        onConflict?: string;
        ignoreDuplicates?: boolean;
      },
    ) => DynamicSupabaseQuery<TData>;
    single: () => PromiseLike<DynamicSupabaseResult<TData>>;
    maybeSingle: () => PromiseLike<DynamicSupabaseResult<TData>>;
  };

type DynamicSupabaseClient = {
  from: (table: string) => DynamicSupabaseQuery;
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => DynamicSupabaseQuery;
};

function localizedText(locale: Locale, kk: string, ru: string) {
  return locale === 'ru' ? ru : kk;
}

function unknownCourseLabel(locale: Locale) {
  return localizedText(locale, 'Белгісіз курс', 'Неизвестный курс');
}

function unknownStudentLabel(locale: Locale) {
  return localizedText(locale, 'Белгісіз оқушы', 'Неизвестный ученик');
}

function unknownTeacherLabel(locale: Locale) {
  return localizedText(locale, 'Белгісіз мұғалім', 'Неизвестный преподаватель');
}

function recentTestActionLabel(locale: Locale) {
  return localizedText(locale, 'Тест тапсырды', 'Прошел тест');
}

function analyticsDerivedTopicLabel(locale: Locale) {
  return localizedText(locale, 'Талдау деректері негізінде', 'На основе аналитических данных');
}

export function subjectLabel(
  subject: Pick<SubjectRow, 'name_kk' | 'name_ru'> | null | undefined,
  locale: 'kk' | 'ru' = 'kk'
) {
  if (!subject) return '—';
  return locale === 'ru' ? (subject.name_ru || subject.name_kk) : subject.name_kk;
}

function normalizeAnswerIndexes(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .sort((a, b) => a - b);
  }

  if (value === null || value === undefined) return [];

  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? [asNumber] : [];
}

function buildSubjectMap(subjects: SubjectRow[]) {
  return Object.fromEntries(subjects.map((subject) => [subject.id, subject])) as SubjectMap;
}

function groupLessonsByModuleId(rows: Tables<'lessons'>[]) {
  const map = new Map<string, Tables<'lessons'>[]>();

  rows.forEach((row) => {
    const current = map.get(row.module_id) || [];
    current.push(row);
    map.set(row.module_id, current);
  });

  return map;
}

function getLessonCompletedAt(
  progressRow: Tables<'lesson_progress'> | null | undefined
) {
  if (!progressRow) return null;

  const maybeCompletedAt = (progressRow as { completed_at?: string | null })
    .completed_at;

  return maybeCompletedAt || null;
}

function calculateProgressPct(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}


/* ================= COURSE ACCESS HELPERS ================= */

function getCourseAccessType(course: CourseRowWithAccess | null | undefined): CourseAccessType {
  return course?.access_type || 'public_free';
}

function getCourseVisibility(course: CourseRowWithAccess | null | undefined): CourseVisibility {
  return course?.visibility || 'public';
}

function getCoursePrice(course: CourseRowWithAccess | null | undefined): number {
  return Number(course?.price ?? 0);
}

function getCourseCurrency(course: CourseRowWithAccess | null | undefined): CurrencyCode {
  return course?.currency || 'KZT';
}

function getCourseEnrollmentOpen(course: CourseRowWithAccess | null | undefined): boolean {
  return course?.enrollment_open ?? true;
}

function getCourseMaxStudents(course: CourseRowWithAccess | null | undefined): number | null {
  return course?.max_students ?? null;
}

function getCoursePublishedAt(course: CourseRowWithAccess | null | undefined): string | null {
  return course?.published_at ?? null;
}

function isCoursePublished(course: CourseRowWithAccess | null | undefined) {
  return course?.status === 'published';
}


async function getActiveCourseEntitlementsSafe(_userId?: string) {
  return [] as EntitlementRow[];
}

async function getPendingCourseOrdersSafe(_userId?: string) {
  return [] as OrderRow[];
}

async function userHasCourseEntitlementSafe(userId: string, courseId: string) {
  const entitlements = await getActiveCourseEntitlementsSafe(userId);
  return entitlements.some((row) => row.resource_id === courseId);
}

async function getCourseStudentCountSafe(courseId: string) {
  const { count, error } = await supabase
    .from('course_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function resolveCourseAccess(input: {
  course: CourseRowWithAccess;
  userId?: string;
  teacherId?: string;
  isEnrolled: boolean;
  hasEntitlement: boolean;
  pendingOrder: OrderRow | null;
}): CourseAccessView {
  const { course, userId, teacherId, isEnrolled, hasEntitlement, pendingOrder } = input;

  const accessType = getCourseAccessType(course);
  const visibility = getCourseVisibility(course);
  const price = getCoursePrice(course);
  const currency = getCourseCurrency(course);
  const publishedAt = getCoursePublishedAt(course);
  const enrollmentOpen = getCourseEnrollmentOpen(course);
  const maxStudents = getCourseMaxStudents(course);

  const isFree = accessType === 'public_free';
  const isPaid = accessType === 'paid';
  const isInviteOnly = accessType === 'private_invite';
  const isSubscriptionOnly = accessType === 'subscription_only';
  const isSchoolOnly = accessType === 'school_only';

  const isOwner = Boolean(teacherId && course.teacher_id === teacherId);

  let canAccess = false;
  let accessState: CourseAccessState = 'unknown';
  let unlockAction: CourseUnlockAction = 'none';

  if (isOwner) {
    canAccess = true;
    accessState = 'owner';
    unlockAction = 'manage_course';
  } else if (!isCoursePublished(course)) {
    canAccess = false;
    accessState = 'draft_or_unpublished';
    unlockAction = 'none';
  } else if (isEnrolled || hasEntitlement) {
    canAccess = true;
    accessState = isEnrolled ? 'enrolled' : 'has_entitlement';
    unlockAction = 'open_course';
  } else if (!enrollmentOpen) {
    canAccess = false;
    accessState = 'enrollment_closed';
    unlockAction = 'none';
  } else if (visibility === 'private' && !userId) {
    canAccess = false;
    accessState = 'not_available';
    unlockAction = 'none';
  } else if (accessType === 'public_free') {
    canAccess = true;
    accessState = 'public_free';
    unlockAction = 'enroll';
  } else if (accessType === 'private_invite') {
    canAccess = false;
    accessState = 'requires_invite';
    unlockAction = 'redeem_invite';
  } else if (accessType === 'paid') {
    canAccess = false;
    accessState = 'requires_payment';
    unlockAction = pendingOrder ? 'none' : 'request_paid_access';
  } else if (accessType === 'subscription_only') {
    canAccess = false;
    accessState = 'requires_subscription';
    unlockAction = 'subscribe';
  } else if (accessType === 'school_only') {
    canAccess = false;
    accessState = 'requires_school_access';
    unlockAction = 'request_school_access';
  } else {
    canAccess = false;
    accessState = 'not_available';
    unlockAction = 'none';
  }

  return {
    accessType,
    visibility,
    price,
    currency,
    publishedAt,
    enrollmentOpen,
    maxStudents,

    canAccess,
    accessState,
    unlockAction,

    isFree,
    isPaid,
    isInviteOnly,
    isSubscriptionOnly,
    isSchoolOnly,

    hasEntitlement,
    isEnrolled,

    pendingOrderId: pendingOrder?.id || null,
    pendingOrderStatus: pendingOrder?.status || null,
  };
}

function shouldShowCourseInStudentCatalog(input: {
  course: CourseRowWithAccess;
  isEnrolled: boolean;
  hasEntitlement: boolean;
  hasPendingOrder: boolean;
}) {
  const { course, isEnrolled, hasEntitlement, hasPendingOrder } = input;

  if (!isCoursePublished(course)) return false;

  const accessType = getCourseAccessType(course);

  /**
   * Жабық курс:
   * - басқа оқушыларға каталогта көрінбейді
   * - тек invite алған / enrolled / entitlement бар user ғана көреді
   */
  if (accessType === 'private_invite') {
    return isEnrolled || hasEntitlement || hasPendingOrder;
  }

  /**
   * Ашық және ақылы курстар каталогта көрінуі керек.
   * Ақылы курсқа кіру кейін order/payment/subscription арқылы ашылады.
   */
  if (accessType === 'public_free' || accessType === 'paid') {
    return true;
  }

  /**
   * Бұрын қосылған legacy түрлер.
   * UI-дан алып тастаймыз, бірақ база ішінде бұрыннан бар row-лар болса,
   * build/runtime сынбасын деп fallback қалдырамыз.
   */
  if (accessType === 'subscription_only') {
    return true;
  }

  if (accessType === 'school_only') {
    return isEnrolled || hasEntitlement || hasPendingOrder;
  }

  return false;
} 

async function canAccessCourseByRpc(courseId: string, userId?: string) {
  const db = supabase as unknown as DynamicSupabaseClient;

  const args = userId
    ? {
        p_course_id: courseId,
        p_user_id: userId,
      }
    : {
        p_course_id: courseId,
      };

  const { data, error } = await db.rpc('can_access_course', args);

  if (error) {
    if (isSoftSchemaError(error.message || '') || /function .* does not exist/i.test(error.message || '')) {
      return null;
    }

    throw new Error(error.message);
  }

  return Boolean(data);
}

/* ================= COMMON DATA ================= */

export async function getSubjects() {
  return queryOrThrow(
    supabase.from('subjects').select('*').order('sort_order', { ascending: true })
  );
}

export async function getProfilesMap(userIds: string[]): Promise<ProfileMap> {
  if (userIds.length === 0) return {} as ProfileMap;

  const rows = await queryOrThrow(
    supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url, bio')
      .in('user_id', [...new Set(userIds)])
  );

  return Object.fromEntries(
    rows.map((row) => [
      row.user_id,
      {
        full_name: row.full_name,
        avatar_url: row.avatar_url,
        bio: row.bio,
      },
    ])
  ) as ProfileMap;
}

async function getBookmarkedRowsSafe(studentId: string) {
  const { data, error } = await supabase
    .from('course_bookmarks')
    .select('*')
    .eq('student_id', studentId);

  if (error) {
    const message = `${error.message ?? ''}`;
    const missingTable =
      /course_bookmarks/i.test(message) ||
      /does not exist/i.test(message) ||
      /schema cache/i.test(message);

    if (missingTable) return [] as Tables<'course_bookmarks'>[];

    throw new Error(error.message);
  }

  return (data || []) as Tables<'course_bookmarks'>[];
}

/* ================= STUDENT DASHBOARD ================= */

export async function getStudentDashboard(
  userId: string,
  locale: Locale = 'kk'
): Promise<DashboardStudentData> {
  const [
    subjects,
    enrollments,
    lessonProgress,
    studentPoints,
    leaderboardRows,
    attempts,
    rawCourses,
    modules,
    lessons,
    tests,
    entitlements,
    pendingOrders,
  ] = await Promise.all([
    getSubjects(),
    queryOrThrow(
      supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', userId)
        .order('enrolled_at', { ascending: false })
    ),
    queryOrThrow(supabase.from('lesson_progress').select('*').eq('student_id', userId)),
    queryOrThrow(
      supabase
        .from('student_points')
        .select('points, created_at')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
    ),
    queryOrThrow(
      supabase.from('leaderboard_entries').select('*').eq('student_id', userId).limit(1)
    ),
    queryOrThrow(
      supabase
        .from('test_attempts')
        .select('*')
        .eq('student_id', userId)
        .order('started_at', { ascending: false })
    ),
    queryOrThrow(supabase.from('courses').select('*')),
    queryOrThrow(supabase.from('modules').select('*')),
    queryOrThrow(
      supabase
        .from('lessons')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
    ),
    queryOrThrow(supabase.from('tests').select('*')),
    getActiveCourseEntitlementsSafe(userId),
    getPendingCourseOrdersSafe(userId),
  ]);

  const courses = rawCourses as CourseRowWithAccess[];
  const subjectMap = buildSubjectMap(subjects);
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const moduleMap = new Map(modules.map((module) => [module.id, module]));
  const testMap = new Map(tests.map((test) => [test.id, test]));
  const teacherIds = courses.map((course) => course.teacher_id);
  const profiles = await getProfilesMap(teacherIds);

  const entitlementCourseIds = new Set(entitlements.map((row) => row.resource_id));
  const pendingOrderByCourseId = new Map(
    pendingOrders.map((order) => [order.product_id, order])
  );

  const lessonsByModuleId = groupLessonsByModuleId(lessons as Tables<'lessons'>[]);
  const lessonProgressMap = new Map(lessonProgress.map((row) => [row.lesson_id, row]));
  const enrolledCourseIds = new Set(enrollments.map((row) => row.course_id));

  const teacherCourseCountMap = new Map<string, number>();
  courses.forEach((course) => {
    teacherCourseCountMap.set(
      course.teacher_id,
      (teacherCourseCountMap.get(course.teacher_id) || 0) + 1
    );
  });

  const enrolledCourses: CourseView[] = enrollments.map((enrollment) => {
    const course = courseMap.get(enrollment.course_id);

    if (!course) {
      return {
        id: enrollment.course_id,
        title: unknownCourseLabel(locale),
        description: null,
        subjectName: '—',
        teacherId: '',
        teacherName: unknownTeacherLabel(locale),
        teacherAvatarUrl: null,
        teacherBio: null,
        teacherCoursesCount: 0,
        students: 0,
        lessons: 0,
        enrolled: true,
        progress: enrollment.progress_pct,
        status: 'unknown',
        bookmarked: false,
      };
    }

    const lessonCount = lessons.filter(
      (lesson) => moduleMap.get(lesson.module_id)?.course_id === course.id
    ).length;
    const studentCount = enrollments.filter((row) => row.course_id === course.id).length;

    const access = resolveCourseAccess({
      course,
      userId,
      isEnrolled: true,
      hasEntitlement: entitlementCourseIds.has(course.id),
      pendingOrder: pendingOrderByCourseId.get(course.id) || null,
    });

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      subjectName: subjectLabel(
        course.subject_id ? subjectMap[course.subject_id] : null,
        locale
      ),
      teacherId: course.teacher_id,
      teacherName: profiles[course.teacher_id]?.full_name || unknownTeacherLabel(locale),
      teacherAvatarUrl: profiles[course.teacher_id]?.avatar_url || null,
      teacherBio: profiles[course.teacher_id]?.bio || null,
      teacherCoursesCount: teacherCourseCountMap.get(course.teacher_id) || 0,
      students: studentCount,
      lessons: lessonCount,
      enrolled: true,
      progress: enrollment.progress_pct,
      status: course.status,
      bookmarked: false,

      accessType: access.accessType,
      visibility: access.visibility,
      price: access.price,
      currency: access.currency,
      publishedAt: access.publishedAt,
      enrollmentOpen: access.enrollmentOpen,
      maxStudents: access.maxStudents,
      access,
    };
  });

  const nextLessons = lessons
    .filter((lesson) => {
      const courseId = moduleMap.get(lesson.module_id)?.course_id;
      return courseId && enrolledCourseIds.has(courseId);
    })
    .map((lesson) => {
      const completed = lessonProgressMap.get(lesson.id)?.is_completed || false;
      const module = moduleMap.get(lesson.module_id);
      const course = module ? courseMap.get(module.course_id) : null;
      const siblings = (lessonsByModuleId.get(lesson.module_id) || [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
      const lessonIndex = siblings.findIndex((item) => item.id === lesson.id);
      const previous = lessonIndex > 0 ? siblings[lessonIndex - 1] : null;
      const isLocked = Boolean(previous && !lessonProgressMap.get(previous.id)?.is_completed);
      const lockedReason: LessonLockedReason = isLocked
        ? 'previous_lesson_required'
        : 'none';

      return {
        id: lesson.id,
        courseId: course?.id,
        moduleId: module?.id,
        subjectId: lesson.subject_id,
        title: lesson.title,
        subjectName: subjectLabel(
          lesson.subject_id ? subjectMap[lesson.subject_id] : null,
          locale
        ),
        moduleTitle: module?.title || '—',
        courseTitle: course?.title || '—',
        sortOrder: lesson.sort_order,
        isCompleted: completed,
        isLocked,
        lockedReason,
      };
    })
    .filter((lesson) => !lesson.isCompleted)
    .sort((a, b) => Number(a.isLocked) - Number(b.isLocked) || a.sortOrder - b.sortOrder)
    .slice(0, 5);

  const recentAttempts = attempts.slice(0, 5).map((attempt) => {
    const test = testMap.get(attempt.test_id);

    return {
      id: attempt.id,
      title: test?.title || '—',
      subjectName: subjectLabel(
        test?.subject_id ? subjectMap[test.subject_id] : null,
        locale
      ),
      score: attempt.score,
      completedAt: attempt.completed_at,
    };
  });

  const totalPoints = studentPoints.reduce((sum, item) => sum + item.points, 0);
  const leaderboard = leaderboardRows[0] || null;
  const completedLessons = lessonProgress.filter((row) => row.is_completed).length;

  const scoredAttempts = attempts.filter((row) => row.score !== null);
  const avgScore = scoredAttempts.length
    ? Math.round(
        scoredAttempts.reduce((sum, item) => sum + Number(item.score || 0), 0) /
          scoredAttempts.length
      )
    : 0;

  const subjectScores = new Map<string, number[]>();
  attempts.forEach((attempt) => {
    const test = testMap.get(attempt.test_id);
    if (!test?.subject_id || attempt.score === null) return;

    const key = subjectLabel(subjectMap[test.subject_id], locale);
    const current = subjectScores.get(key) || [];
    current.push(attempt.score);
    subjectScores.set(key, current);
  });

  const subjectAverages = [...subjectScores.entries()].map(([name, values]) => ({
    name,
    avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
  }));

  const bestSubject = [...subjectAverages].sort((a, b) => b.avg - a.avg)[0]?.name || null;
  const weakSubject = [...subjectAverages].sort((a, b) => a.avg - b.avg)[0]?.name || null;

  return {
    enrolledCourses,
    recentAttempts,
    nextLessons,
    stats: {
      enrolledCourses: enrollments.length,
      avgScore,
      completedLessons,
      points: totalPoints,
      streakDays: Math.min(30, studentPoints.length),
      rank: leaderboard?.rank || null,
      bestSubject,
      weakSubject,
      totalTests: attempts.length,
    },
  };
}

/* ================= COURSE CATALOG ================= */

export async function getCourseCatalog(
  userId?: string,
  teacherId?: string,
  locale: Locale = 'kk'
) {
  const [subjects, rawCourses, enrollments, modules, lessons, bookmarks, entitlements, pendingOrders] = await Promise.all([
    getSubjects(),
    queryOrThrow(
      teacherId
        ? supabase
            .from('courses')
            .select('*')
            .eq('teacher_id', teacherId)
            .order('created_at', { ascending: false })
        : supabase.from('courses').select('*').order('created_at', { ascending: false })
    ),
    userId
      ? queryOrThrow(supabase.from('course_enrollments').select('*').eq('student_id', userId))
      : Promise.resolve([] as Tables<'course_enrollments'>[]),
    queryOrThrow(supabase.from('modules').select('*')),
    queryOrThrow(supabase.from('lessons').select('id, module_id')),
    userId ? getBookmarkedRowsSafe(userId) : Promise.resolve([] as Tables<'course_bookmarks'>[]),
    getActiveCourseEntitlementsSafe(userId),
    getPendingCourseOrdersSafe(userId),
  ]);

  const allCourses = rawCourses as CourseRowWithAccess[];

  const progressMap = new Map(
    (enrollments as Tables<'course_enrollments'>[]).map((row) => [row.course_id, row.progress_pct])
  );
  const enrolledIds = new Set(
    (enrollments as Tables<'course_enrollments'>[]).map((row) => row.course_id)
  );
  const bookmarkedIds = new Set(
    (bookmarks as Tables<'course_bookmarks'>[]).map((row) => row.course_id)
  );
  const entitlementCourseIds = new Set(entitlements.map((row) => row.resource_id));
  const pendingOrderByCourseId = new Map(
    pendingOrders.map((order) => [order.product_id, order])
  );

  const courses =
    userId && !teacherId
      ? allCourses.filter((course) =>
          shouldShowCourseInStudentCatalog({
            course,
            isEnrolled: enrolledIds.has(course.id),
            hasEntitlement: entitlementCourseIds.has(course.id),
            hasPendingOrder: pendingOrderByCourseId.has(course.id),
          })
        )
      : allCourses;

  const subjectMap = buildSubjectMap(subjects);
  const profiles = await getProfilesMap(courses.map((course) => course.teacher_id));
  const moduleMap = new Map(modules.map((module) => [module.id, module.course_id]));

  const courseStudentCounts = new Map<string, number>();
  const teacherCourseCounts = new Map<string, number>();

  courses.forEach((course) => {
    teacherCourseCounts.set(
      course.teacher_id,
      (teacherCourseCounts.get(course.teacher_id) || 0) + 1
    );
  });

  if (courses.length > 0) {
    const allEnrollments = await queryOrThrow(
      supabase
        .from('course_enrollments')
        .select('course_id')
        .in('course_id', courses.map((course) => course.id))
    );

    allEnrollments.forEach((row) => {
      courseStudentCounts.set(
        row.course_id,
        (courseStudentCounts.get(row.course_id) || 0) + 1
      );
    });
  }

  return courses.map((course) => {
    const access = resolveCourseAccess({
      course,
      userId,
      teacherId,
      isEnrolled: enrolledIds.has(course.id),
      hasEntitlement: entitlementCourseIds.has(course.id),
      pendingOrder: pendingOrderByCourseId.get(course.id) || null,
    });

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      subjectName: subjectLabel(
        course.subject_id ? subjectMap[course.subject_id] : null,
        locale
      ),
      teacherId: course.teacher_id,
      teacherName: profiles[course.teacher_id]?.full_name || unknownTeacherLabel(locale),
      teacherAvatarUrl: profiles[course.teacher_id]?.avatar_url || null,
      teacherBio: profiles[course.teacher_id]?.bio || null,
      teacherCoursesCount: teacherCourseCounts.get(course.teacher_id) || 0,
      students: courseStudentCounts.get(course.id) || 0,
      lessons: lessons.filter(
        (lesson) => moduleMap.get(lesson.module_id) === course.id
      ).length,
      enrolled: enrolledIds.has(course.id),
      progress: progressMap.get(course.id) || 0,
      status: course.status,
      bookmarked: bookmarkedIds.has(course.id),

      accessType: access.accessType,
      visibility: access.visibility,
      price: access.price,
      currency: access.currency,
      publishedAt: access.publishedAt,
      enrollmentOpen: access.enrollmentOpen,
      maxStudents: access.maxStudents,
      access,
    };
  }) satisfies CourseView[];
}

/* ================= ENROLLMENT / BOOKMARKS ================= */

export async function enrollInCourse(studentId: string, courseId: string, locale: Locale = 'kk') {
  const course = await queryOrThrow(
    supabase.from('courses').select('*').eq('id', courseId).single()
  ) as CourseRowWithAccess;

  if (!course) {
    throw new Error(localizedText(locale, 'Курс табылмады.', 'Курс не найден.'));
  }

  if (!isCoursePublished(course)) {
    throw new Error(
      localizedText(
        locale,
        'Бұл курс әлі жарияланбаған.',
        'Этот курс еще не опубликован.'
      )
    );
  }

  if (!getCourseEnrollmentOpen(course)) {
    throw new Error(
      localizedText(
        locale,
        'Бұл курсқа жазылу уақытша жабық.',
        'Запись на этот курс временно закрыта.'
      )
    );
  }

  const maxStudents = getCourseMaxStudents(course);

  if (maxStudents !== null) {
    const currentStudents = await getCourseStudentCountSafe(courseId);

    if (currentStudents >= maxStudents) {
      throw new Error(
        localizedText(
          locale,
          'Бұл курста орын қалмаған.',
          'В этом курсе больше нет свободных мест.'
        )
      );
    }
  }

  const accessType = getCourseAccessType(course);
  const rpcAccess = await canAccessCourseByRpc(courseId, studentId);

  const canAccess =
  rpcAccess ??
  (accessType === 'public_free' ||
    (await userHasCourseEntitlementSafe(studentId, courseId)));

  if (!canAccess) {
    if (accessType === 'private_invite') {
      throw new Error(
        localizedText(
          locale,
          'Бұл курсқа кіру үшін invite code қажет.',
          'Для доступа к этому курсу нужен invite code.'
        )
      );
    }

    if (accessType === 'paid') {
      throw new Error(
        localizedText(
          locale,
          'Бұл ақылы курс. Алдымен access сұранысын жіберіңіз.',
          'Это платный курс. Сначала отправьте запрос на доступ.'
        )
      );
    }

    if (accessType === 'subscription_only') {
      throw new Error(
        localizedText(
          locale,
          'Бұл курс subscription арқылы ашылады.',
          'Этот курс открывается через подписку.'
        )
      );
    }

    if (accessType === 'school_only') {
      throw new Error(
        localizedText(
          locale,
          'Бұл курс тек мектеп/ұйым оқушыларына арналған.',
          'Этот курс доступен только ученикам школы/организации.'
        )
      );
    }

    throw new Error(
      localizedText(
        locale,
        'Бұл курсқа кіруге рұқсат жоқ.',
        'Нет доступа к этому курсу.'
      )
    );
  }

  const { error } = await supabase
    .from('course_enrollments')
    .insert({ student_id: studentId, course_id: courseId, progress_pct: 0 });

  if (error && !error.message.toLowerCase().includes('duplicate')) {
    throw new Error(error.message);
  }
}

export async function bookmarkCourse(studentId: string, courseId: string) {
  const { error } = await supabase
    .from('course_bookmarks')
    .insert({ student_id: studentId, course_id: courseId });

  if (error && !error.message.toLowerCase().includes('duplicate')) {
    throw new Error(error.message);
  }
}

export async function unbookmarkCourse(studentId: string, courseId: string) {
  const { error } = await supabase
    .from('course_bookmarks')
    .delete()
    .eq('student_id', studentId)
    .eq('course_id', courseId);

  if (error) throw new Error(error.message);
}

/* ================= COURSE PROGRESS TIMELINE ================= */

export async function getCourseProgressTimeline(
  studentId: string,
  courseId: string,
  locale: Locale = 'kk'
): Promise<CourseProgressTimelineView> {
  if (!studentId) {
    throw new Error(
      localizedText(
        locale,
        'Оқушы идентификаторы берілмеген.',
        'Не передан идентификатор ученика.'
      )
    );
  }

  if (!courseId) {
    throw new Error(
      localizedText(
        locale,
        'Курс идентификаторы берілмеген.',
        'Не передан идентификатор курса.'
      )
    );
  }

  const [subjects, course, modules, lessons, progressRows, enrollments] =
    await Promise.all([
      getSubjects(),
      queryOrThrow(
        supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single()
      ) as Promise<CourseRowWithAccess>,
      queryOrThrow(
        supabase
          .from('modules')
          .select('*')
          .eq('course_id', courseId)
          .order('sort_order', { ascending: true })
      ),
      queryOrThrow(
        supabase
          .from('lessons')
          .select('*')
          .eq('is_published', true)
          .order('sort_order', { ascending: true })
      ),
      queryOrThrow(
        supabase
          .from('lesson_progress')
          .select('*')
          .eq('student_id', studentId)
      ),
      queryOrThrow(
        supabase
          .from('course_enrollments')
          .select('*')
          .eq('student_id', studentId)
          .eq('course_id', courseId)
      ),
    ]);

  const subjectMap = buildSubjectMap(subjects);
  const profiles = await getProfilesMap([course.teacher_id]);

  const isEnrolled = enrollments.length > 0;
  const rpcAccess = await canAccessCourseByRpc(courseId, studentId);
  const hasEntitlement = await userHasCourseEntitlementSafe(studentId, courseId);

  const canAccess =
    rpcAccess ??
    (isEnrolled ||
      getCourseAccessType(course) === 'public_free' ||
      hasEntitlement);

  const moduleIds = new Set(modules.map((module) => module.id));
  const courseLessons = (lessons as Tables<'lessons'>[])
    .filter((lesson) => moduleIds.has(lesson.module_id))
    .sort((a, b) => a.sort_order - b.sort_order);

  const lessonsByModuleId = groupLessonsByModuleId(courseLessons);
  const progressMap = new Map(
    (progressRows as Tables<'lesson_progress'>[]).map((row) => [
      row.lesson_id,
      row,
    ])
  );

  const completedLessonIds = new Set(
    (progressRows as Tables<'lesson_progress'>[])
      .filter((row) => row.is_completed)
      .map((row) => row.lesson_id)
  );

  let nextLessonId: string | null = null;

  const timelineModules: CourseProgressModuleView[] = modules.map((module) => {
    const moduleLessons = (lessonsByModuleId.get(module.id) || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    const mappedLessons: CourseProgressLessonView[] = moduleLessons.map((lesson, index) => {
      const progressRow = progressMap.get(lesson.id);
      const isCompleted = completedLessonIds.has(lesson.id);

      const previousLesson = index > 0 ? moduleLessons[index - 1] : null;
      const previousLessonLocked = Boolean(
        previousLesson && !completedLessonIds.has(previousLesson.id)
      );

      const courseAccessLocked = !canAccess;
      const lessonUnpublishedLocked = !lesson.is_published;

      const isLocked =
        courseAccessLocked || previousLessonLocked || lessonUnpublishedLocked;

      const lockedReason: LessonLockedReason = courseAccessLocked
        ? 'course_access_required'
        : lessonUnpublishedLocked
          ? 'lesson_unpublished'
          : previousLessonLocked
            ? 'previous_lesson_required'
            : 'none';

      const status: CourseProgressLessonStatus = isCompleted
        ? 'completed'
        : isLocked
          ? 'locked'
          : !nextLessonId
            ? 'current'
            : 'available';

      if (status === 'current') {
        nextLessonId = lesson.id;
      }

      return {
        id: lesson.id,
        title: lesson.title,
        subjectName: subjectLabel(
          lesson.subject_id ? subjectMap[lesson.subject_id] : null,
          locale
        ),
        sortOrder: lesson.sort_order,
        status,
        isCompleted,
        isLocked,
        lockedReason,
        completedAt: getLessonCompletedAt(progressRow),
      };
    });

    const completedLessons = mappedLessons.filter(
      (lesson) => lesson.isCompleted
    ).length;

    return {
      id: module.id,
      title: module.title,
      sortOrder: module.sort_order,
      totalLessons: mappedLessons.length,
      completedLessons,
      progressPct: calculateProgressPct(completedLessons, mappedLessons.length),
      lessons: mappedLessons,
    };
  });

  const totalLessons = timelineModules.reduce(
    (sum, module) => sum + module.totalLessons,
    0
  );

  const completedLessons = timelineModules.reduce(
    (sum, module) => sum + module.completedLessons,
    0
  );

  return {
    courseId: course.id,
    courseTitle: course.title,
    subjectName: subjectLabel(
      course.subject_id ? subjectMap[course.subject_id] : null,
      locale
    ),
    teacherName:
      profiles[course.teacher_id]?.full_name || unknownTeacherLabel(locale),
    progressPct: calculateProgressPct(completedLessons, totalLessons),
    totalLessons,
    completedLessons,
    nextLessonId,
    modules: timelineModules,
  };
}


/* ================= LESSONS ================= */

export async function getLessonDetail(
  lessonId: string,
  studentId?: string,
  locale: 'kk' | 'ru' = 'kk'
): Promise<LessonDetailView> {
  const [subjects, lesson, modules, lessons, progress] = await Promise.all([
    getSubjects(),
    queryOrThrow(supabase.from('lessons').select('*').eq('id', lessonId).single()),
    queryOrThrow(supabase.from('modules').select('*')),
    queryOrThrow(
      supabase
        .from('lessons')
        .select('id, module_id, sort_order, is_published')
        .eq('is_published', true)
    ),
    studentId
      ? queryOrThrow(supabase.from('lesson_progress').select('*').eq('student_id', studentId))
      : Promise.resolve([] as Tables<'lesson_progress'>[]),
  ]);

  const module = modules.find((row) => row.id === lesson.module_id) ?? null;

  const course: CourseRowWithAccess | null = module
    ? await queryOrThrow(
        supabase
          .from('courses')
          .select('*')
          .eq('id', module.course_id)
          .single()
      ) as CourseRowWithAccess
    : null;

  const subjectMap = buildSubjectMap(subjects);
  const progressSet = new Set(
    (progress as Tables<'lesson_progress'>[])
      .filter((row) => row.is_completed)
      .map((row) => row.lesson_id)
  );

  const siblings = (lessons as Array<{
    id: string;
    module_id: string;
    sort_order: number;
    is_published: boolean | null;
  }>)
    .filter((row) => row.module_id === lesson.module_id)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  /**
   * sort_order мәндері 1,2,3 болып келмеуі мүмкін.
   * Сондықтан previous lesson index арқылы табылады.
   */
  const lessonIndex = siblings.findIndex((row) => row.id === lesson.id);
  const previous = lessonIndex > 0 ? siblings[lessonIndex - 1] : null;
  const previousLessonLocked = Boolean(previous && !progressSet.has(previous.id));

  let courseAccessLocked = false;

  if (studentId && course) {
    const [rpcAccess, enrollmentRows, hasEntitlement] = await Promise.all([
      canAccessCourseByRpc(course.id, studentId),
      queryOrThrow(
        supabase
          .from('course_enrollments')
          .select('id')
          .eq('student_id', studentId)
          .eq('course_id', course.id)
          .limit(1)
      ),
      userHasCourseEntitlementSafe(studentId, course.id),
    ]);

    const isEnrolled = enrollmentRows.length > 0;

    const canAccess =
      rpcAccess ??
      (isEnrolled ||
        getCourseAccessType(course) === 'public_free' ||
        hasEntitlement);

    courseAccessLocked = !canAccess;
  }

  /**
   * Direct URL арқылы unpublished lesson ашылып кетпеуі керек.
   */
  const lessonUnpublishedLocked = !lesson.is_published;

  const isLocked =
    courseAccessLocked || lessonUnpublishedLocked || previousLessonLocked;

  const lockedReason: LessonLockedReason = courseAccessLocked
    ? 'course_access_required'
    : lessonUnpublishedLocked
      ? 'lesson_unpublished'
      : previousLessonLocked
        ? 'previous_lesson_required'
        : 'none';

  return {
    id: lesson.id,
    courseId: course?.id,
    moduleId: module?.id,
    subjectId: lesson.subject_id,
    title: lesson.title,
    subjectName: subjectLabel(
      lesson.subject_id ? subjectMap[lesson.subject_id] : null,
      locale
    ),
    moduleTitle: module?.title || '—',
    courseTitle: course?.title || '—',

    /**
     * UI деңгейіндегі қорғаныс:
     * access жоқ болса, сабақ контентін қайтармаймыз.
     * Нақты security бәрібір Supabase RLS/RPC арқылы қатайтылуы керек.
     */
    contentBody: isLocked ? null : lesson.content_body,
    practiceContent: isLocked ? null : lesson.practice_content,
    mediaUrl: isLocked ? null : lesson.media_url,

    sortOrder: lesson.sort_order,
    isCompleted: progressSet.has(lesson.id),
    isLocked,
    lockedReason,
  };
}


export async function getLessonsForStudent(
  studentId?: string,
  locale: 'kk' | 'ru' = 'kk'
): Promise<LessonView[]> {
  const [subjects, enrollments, modules, lessons, progress] = await Promise.all([
    getSubjects(),
    studentId
      ? queryOrThrow(
          supabase.from('course_enrollments').select('course_id').eq('student_id', studentId)
        )
      : Promise.resolve([] as Array<{ course_id: string }>),
    queryOrThrow(supabase.from('modules').select('*').order('sort_order', { ascending: true })),
    queryOrThrow(
      supabase
        .from('lessons')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
    ),
    studentId
      ? queryOrThrow(supabase.from('lesson_progress').select('*').eq('student_id', studentId))
      : Promise.resolve([] as Tables<'lesson_progress'>[]),
  ]);

  const enrolledCourseIds = new Set(enrollments.map((row) => row.course_id));

  const courses = enrollments.length
    ? await queryOrThrow(
        supabase
          .from('courses')
          .select('*')
          .in('id', enrollments.map((row) => row.course_id))
      )
    : await queryOrThrow(supabase.from('courses').select('*'));

  const subjectMap = buildSubjectMap(subjects);
  const progressSet = new Set(
    (progress as Tables<'lesson_progress'>[])
      .filter((row) => row.is_completed)
      .map((row) => row.lesson_id)
  );
  const courseMap = new Map((courses as CourseRowWithAccess[]).map((course) => [course.id, course]));
  const moduleMap = new Map(modules.map((module) => [module.id, module]));
  const lessonsByModuleId = groupLessonsByModuleId(lessons as Tables<'lessons'>[]);

  return lessons
    .filter((lesson) => {
      if (!studentId) return true;
      const courseId = moduleMap.get(lesson.module_id)?.course_id;
      return Boolean(courseId && enrolledCourseIds.has(courseId));
    })
    .map((lesson) => {
      const module = moduleMap.get(lesson.module_id) ?? null;
      const course = module ? courseMap.get(module.course_id) ?? null : null;
      const siblings = (lessonsByModuleId.get(lesson.module_id) || [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
      const lessonIndex = siblings.findIndex((row) => row.id === lesson.id);
      const previous = lessonIndex > 0 ? siblings[lessonIndex - 1] : null;

      const previousLessonLocked = Boolean(previous && !progressSet.has(previous.id));
      const courseAccessLocked = Boolean(
        studentId &&
        course &&
        !enrolledCourseIds.has(course.id) &&
        getCourseAccessType(course) !== 'public_free'
      );

      const isLocked = courseAccessLocked || previousLessonLocked;
      const lockedReason: LessonLockedReason = courseAccessLocked
        ? 'course_access_required'
        : previousLessonLocked
          ? 'previous_lesson_required'
          : 'none';

      return {
        id: lesson.id,
        courseId: course?.id,
        moduleId: module?.id,
        subjectId: lesson.subject_id,
        title: lesson.title,
        subjectName: subjectLabel(
          lesson.subject_id ? subjectMap[lesson.subject_id] : null,
          locale
        ),
        moduleTitle: module?.title || '—',
        courseTitle: course?.title || '—',
        sortOrder: lesson.sort_order,
        isCompleted: progressSet.has(lesson.id),
        isLocked,
        lockedReason,
      };
    });
}

export async function markLessonComplete(_studentId: string, lessonId: string) {
  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId });
  if (error) throw new Error(error.message);
  return (data || null) as RpcMutationResponse | null;
}

/* ================= TESTS ================= */

export async function getTestsCatalog(
  studentId?: string,
  locale: Locale = 'kk'
): Promise<TestCatalogItem[]> {
  const [subjects, rawTests, questions, attempts] = await Promise.all([
    getSubjects(),
    queryOrThrow(supabase.from('tests').select('*').order('created_at', { ascending: false })),
    queryOrThrow(supabase.from('test_questions').select('id, test_id')),
    studentId
      ? queryOrThrow(supabase.from('test_attempts').select('*').eq('student_id', studentId))
      : Promise.resolve([] as Tables<'test_attempts'>[]),
  ]);

  const tests = studentId
    ? rawTests.filter((test) => test.status === 'published')
    : rawTests;

  const subjectMap = buildSubjectMap(subjects);
  const questionCountMap = new Map<string, number>();

  questions.forEach((question) => {
    questionCountMap.set(
      question.test_id,
      (questionCountMap.get(question.test_id) || 0) + 1
    );
  });

  return tests.map((test) => {
    const testAttempts = attempts.filter((attempt) => attempt.test_id === test.id);
    const bestScore = testAttempts.reduce<number | null>((best, item) => {
      if (item.score === null) return best;
      return best === null ? item.score : Math.max(best, item.score);
    }, null);

    return {
      id: test.id,
      subjectName: subjectLabel(
        test.subject_id ? subjectMap[test.subject_id] : null,
        locale
      ),
      title: test.title,
      topic: test.topic,
      questionCount: questionCountMap.get(test.id) || 0,
      durationMinutes: test.duration_minutes,
      attempts: testAttempts.length,
      bestScore,
    };
  });
}

export async function getTestQuestions(testId: string) {
  return queryOrThrow(
    supabase
      .from('test_questions')
      .select('*')
      .eq('test_id', testId)
      .order('sort_order', { ascending: true })
  );
}

export async function submitTestAttempt(
  _studentId: string,
  testId: string,
  answers: Record<string, number[]>
) {
  const questions = await getTestQuestions(testId);
  const normalizedAnswers = Object.fromEntries(
    Object.entries(answers).map(([questionId, selected]) => [
      questionId,
      [...selected].map(Number).sort((a, b) => a - b),
    ])
  );

  const { data, error } = await supabase.rpc('submit_test_attempt', {
    p_test_id: testId,
    p_answers: normalizedAnswers,
  });

  if (error) throw new Error(error.message);

  const payload = (data || {}) as RpcMutationResponse;

  return {
    attempt: payload.attempt_id ? { id: payload.attempt_id } : null,
    questions,
    score: Number(payload.score || 0),
    correctCount: Number(payload.correct_count || 0),
  };
}

export async function getTestAttemptBreakdown(
  attemptId: string
): Promise<TestAttemptBreakdownItem[]> {
  const [answerRows, questionRows] = await Promise.all([
    queryOrThrow(
      supabase
        .from('test_attempt_answers')
        .select('attempt_id, question_id, selected_answer, is_correct')
        .eq('attempt_id', attemptId)
    ),
    queryOrThrow(
      supabase.from('test_attempt_answers').select('question_id').eq('attempt_id', attemptId)
    ),
  ]);

  const questionIds = [...new Set(questionRows.map((row) => row.question_id))];
  if (questionIds.length === 0) return [];

  const questions = await queryOrThrow(
    supabase
      .from('test_questions')
      .select(
        'id, question_text, question_type, options, correct_answer, explanation, sort_order'
      )
      .in('id', questionIds)
      .order('sort_order', { ascending: true })
  );

  const questionMap = new Map(questions.map((question) => [question.id, question]));

  return answerRows
    .map((row) => {
      const question = questionMap.get(row.question_id);
      if (!question) return null;

      return {
        attemptId: row.attempt_id,
        questionId: row.question_id,
        questionText: question.question_text,
        questionType: question.question_type,
        options: Array.isArray(question.options)
          ? question.options.map((item) => String(item))
          : [],
        selectedAnswer: normalizeAnswerIndexes(row.selected_answer),
        correctAnswer: normalizeAnswerIndexes(question.correct_answer),
        explanation: question.explanation,
        isCorrect: row.is_correct,
        questionOrder: question.sort_order,
      } satisfies TestAttemptBreakdownItem;
    })
    .filter((item): item is TestAttemptBreakdownItem => item !== null)
    .sort((a, b) => a.questionOrder - b.questionOrder);
}

/* ================= ANALYTICS / ACHIEVEMENTS / LEADERBOARD ================= */

export async function getAnalytics(userId: string, locale: Locale = 'kk') {
  const [subjects, tests, attempts, _lessons, progress, enrollments] = await Promise.all([
    getSubjects(),
    queryOrThrow(supabase.from('tests').select('*')),
    queryOrThrow(
      supabase
        .from('test_attempts')
        .select('*')
        .eq('student_id', userId)
        .order('started_at', { ascending: false })
    ),
    queryOrThrow(supabase.from('lessons').select('id, title, subject_id')),
    queryOrThrow(supabase.from('lesson_progress').select('*').eq('student_id', userId)),
    queryOrThrow(supabase.from('course_enrollments').select('*').eq('student_id', userId)),
  ]);

  const subjectMap = buildSubjectMap(subjects);
  const testMap = new Map(tests.map((test) => [test.id, test]));
  const bySubject = new Map<string, { scores: number[]; tests: number }>();

  attempts.forEach((attempt) => {
    const test = testMap.get(attempt.test_id);
    if (!test?.subject_id || attempt.score === null) return;

    const name = subjectLabel(subjectMap[test.subject_id], locale);
    const current = bySubject.get(name) || { scores: [], tests: 0 };
    current.scores.push(attempt.score);
    current.tests += 1;
    bySubject.set(name, current);
  });

  const subjectPerformance = [...bySubject.entries()].map(([name, value]) => ({
    name,
    score: Math.round(
      value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length
    ),
    tests: value.tests,
    trend: value.scores.at(-1)! >= value.scores[0]! ? 'up' : 'down',
  }));

  const weakTopics = [...subjectPerformance]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => ({
      subject: item.name,
      topic: analyticsDerivedTopicLabel(locale),
      score: item.score,
    }));

  const recentActivity = attempts.slice(0, 5).map((attempt) => {
    const test = testMap.get(attempt.test_id);

    return {
      action: recentTestActionLabel(locale),
      detail: test?.title || '—',
      date: attempt.completed_at || attempt.started_at,
      score: attempt.score !== null ? `${attempt.score}%` : null,
    };
  });

  return {
    subjectPerformance,
    weakTopics,
    recentActivity,
    stats: {
      avgScore: subjectPerformance.length
        ? Math.round(
            subjectPerformance.reduce((sum, item) => sum + item.score, 0) /
              subjectPerformance.length
          )
        : 0,
      testsTaken: attempts.length,
      lessonsCompleted: progress.filter((item) => item.is_completed).length,
      courses: enrollments.length,
      streak: Math.min(30, progress.filter((item) => item.is_completed).length),
    },
  };
}

export async function getAchievements(studentId: string, locale: 'kk' | 'ru' = 'kk') {
  const [allAchievements, earned, games, points] = await Promise.all([
    queryOrThrow(
      supabase.from('achievements').select('*').order('created_at', { ascending: true })
    ),
    queryOrThrow(
      supabase.from('student_achievements').select('*').eq('student_id', studentId)
    ),
    queryOrThrow(
      supabase
        .from('games')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
    ),
    queryOrThrow(supabase.from('student_points').select('points').eq('student_id', studentId)),
  ]);

  const earnedSet = new Set(earned.map((item) => item.achievement_id));

  return {
    totalPoints: points.reduce((sum, row) => sum + row.points, 0),
    achievements: allAchievements.map((achievement) => ({
      ...achievement,
      earned: earnedSet.has(achievement.id),
      displayName:
        locale === 'ru' ? (achievement.name_ru || achievement.name_kk) : achievement.name_kk,
      displayDescription:
        locale === 'ru'
          ? (achievement.description_ru || achievement.description_kk || '')
          : achievement.description_kk || '',
    })),
    games: games.map((game) => ({
      ...game,
      displayName: locale === 'ru' ? (game.name_ru || game.name_kk) : game.name_kk,
      displayDescription:
        locale === 'ru'
          ? (game.description_ru || game.description_kk || '')
          : game.description_kk || '',
    })),
  };
}

export async function getLeaderboard(locale: Locale = 'kk') {
  const [entries, profiles] = await Promise.all([
    queryOrThrow(
      supabase
        .from('leaderboard_entries')
        .select('*')
        .order('rank', { ascending: true })
        .order('total_points', { ascending: false })
    ),
    queryOrThrow(supabase.from('profiles').select('user_id, full_name, avatar_url')),
  ]);

  const profileMap = Object.fromEntries(
    profiles.map((profile) => [profile.user_id, profile])
  );

  return entries.map((entry) => ({
    id: entry.id,
    studentId: entry.student_id,
    name: profileMap[entry.student_id]?.full_name || unknownStudentLabel(locale),
    avatarUrl: profileMap[entry.student_id]?.avatar_url || null,
    points: entry.total_points,
    rank: entry.rank,
    avgScore: entry.avg_test_score,
    lessonsCompleted: entry.lessons_completed,
    coursesCompleted: entry.courses_completed,
  })) satisfies LeaderboardView[];
}

/* ================= PARENT LINK REQUESTS ================= */

type ParentLinkRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled';

export type ParentLinkRequestView = {
  id: string;
  childEmail: string;
  childName: string | null;
  studentId: string | null;
  status: ParentLinkRequestStatus;
  requestedAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
};

const PARENT_LINK_REQUESTS_TABLE = 'parent_child_link_requests';

type ParentLinkRequestRow = Record<string, unknown> & {
  id?: string | null;
  parent_id?: string | null;
  student_id?: string | null;
  child_email?: string | null;
  status?: string | null;
  requested_at?: string | null;
  responded_at?: string | null;
  expires_at?: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMissingRpcError(message: string) {
  return /could not find the function|function .* does not exist|schema cache/i.test(message);
}

async function getCurrentSessionUserOrThrow(locale: Locale) {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  const user = data.user;

  if (!user?.id) {
    throw new Error(
      localizedText(
        locale,
        'Пайдаланушы сессиясы табылмады. Қайта кіріп көріңіз.',
        'Сессия пользователя не найдена. Попробуйте войти снова.'
      )
    );
  }

  return user;
}

async function getParentLinkRequestRowsSafe(
  parentId: string,
): Promise<ParentLinkRequestRow[]> {
  const db = supabase as unknown as DynamicSupabaseClient;
  const { data, error } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .select('*')
    .eq('parent_id', parentId)
    .order('requested_at', { ascending: false });

  if (error) {
    if (isSoftSchemaError(error.message || '')) {
      return [] as ParentLinkRequestRow[];
    }

    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as ParentLinkRequestRow[]) : [];
}

export async function getParentDashboard(parentId: string, locale: Locale = 'kk') {
  const links = await queryOrThrow(
    supabase.from('parent_student_links').select('*').eq('parent_id', parentId)
  );

  const studentIds = [
    ...new Set(
      links
        .filter((link) => {
          const status = String((link as { status?: string }).status || 'active').toLowerCase();
          return status === 'active';
        })
        .map((link) => link.student_id)
        .filter(Boolean)
    ),
  ];

  if (studentIds.length === 0) {
    return [];
  }

  const profiles = await getProfilesMap(studentIds);

  const children = await Promise.all(
    studentIds.map(async (studentId) => ({
      studentId,
      name: profiles[studentId]?.full_name || unknownStudentLabel(locale),
      avatarUrl: profiles[studentId]?.avatar_url || null,
      summary: await getStudentDashboard(studentId, locale),
    }))
  );

  return children;
}

export async function getParentLinkRequests(
  parentId: string,
  _locale: Locale = 'kk'
): Promise<ParentLinkRequestView[]> {
  const rows = await getParentLinkRequestRowsSafe(parentId);
  const studentIds = [...new Set(
    rows
      .map((row) => String(row.student_id || ''))
      .filter(Boolean)
  )];
  const profiles = await getProfilesMap(studentIds);

  return rows.map((row) => {
    const studentId = row.student_id ? String(row.student_id) : null;
    const profile = studentId ? profiles[studentId] : undefined;
    const rawStatus = String(row.status || 'pending').toLowerCase();
    const status: ParentLinkRequestStatus =
      rawStatus === 'accepted' ||
      rawStatus === 'declined' ||
      rawStatus === 'expired' ||
      rawStatus === 'cancelled'
        ? rawStatus
        : 'pending';

    return {
      id: String(row.id || ''),
      childEmail: String(row.child_email || ''),
      childName: profile?.full_name || null,
      studentId,
      status,
      requestedAt: row.requested_at ? String(row.requested_at) : null,
      respondedAt: row.responded_at ? String(row.responded_at) : null,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    } satisfies ParentLinkRequestView;
  });
}

export async function requestParentLink(childEmail: string, locale: Locale = 'kk') {
  const normalizedEmail = normalizeEmail(childEmail);

  if (!normalizedEmail) {
    throw new Error(
      localizedText(
        locale,
        'Баланың email адресін енгізіңіз.',
        'Введите email адрес ребенка.'
      )
    );
  }

  if (!isValidEmail(normalizedEmail)) {
    throw new Error(
      localizedText(locale, 'Email форматы дұрыс емес.', 'Неверный формат email.')
    );
  }

  const user = await getCurrentSessionUserOrThrow(locale);

  if (normalizeEmail(user.email || '') === normalizedEmail) {
    throw new Error(
      localizedText(
        locale,
        'Өз email адресіңізді бала ретінде көрсете алмайсыз.',
        'Нельзя указать собственный email как email ребенка.'
      )
    );
  }

  const db = supabase as unknown as DynamicSupabaseClient;

  const { data: rpcData, error: rpcError } = await db.rpc('request_parent_link', {
    p_child_email: normalizedEmail,
  });

  if (!rpcError) {
    return rpcData;
  }

  if (!isMissingRpcError(rpcError.message || '')) {
    throw new Error(rpcError.message);
  }

  const existingRows = await getParentLinkRequestRowsSafe(user.id);
  const duplicate = existingRows.find((row) => {
    const status = String(row.status || 'pending').toLowerCase();
    const email = normalizeEmail(String(row.child_email || ''));
    return email === normalizedEmail && status === 'pending';
  });

  if (duplicate) {
    throw new Error(
      localizedText(
        locale,
        'Осы email бойынша белсенді сұраныс бұрын жіберілген.',
        'По этому email уже отправлен активный запрос.'
      )
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .insert({
      parent_id: user.id,
      child_email: normalizedEmail,
      status: 'pending',
      requested_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error) {
    if (isSoftSchemaError(error.message || '')) {
      throw new Error(
        localizedText(
          locale,
          'parent_child_link_requests кестесі немесе request_parent_link RPC әлі қосылмаған.',
          'Таблица parent_child_link_requests или RPC request_parent_link еще не добавлены.'
        )
      );
    }

    throw new Error(error.message);
  }

  return data;
}

export async function cancelParentLinkRequest(requestId: string, locale: Locale = 'kk') {
  if (!requestId) {
    throw new Error(
      localizedText(
        locale,
        'Жойылатын сұраныс идентификаторы берілмеген.',
        'Не передан идентификатор запроса для отмены.'
      )
    );
  }

  const user = await getCurrentSessionUserOrThrow(locale);
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data: rpcData, error: rpcError } = await db.rpc('cancel_parent_link_request', {
    p_request_id: requestId,
  });

  if (!rpcError) {
    return rpcData;
  }

  if (!isMissingRpcError(rpcError.message || '')) {
    throw new Error(rpcError.message);
  }

  const { data, error } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .update({
      status: 'cancelled',
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('parent_id', user.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) {
    if (isSoftSchemaError(error.message || '')) {
      throw new Error(
        localizedText(
          locale,
          'parent_child_link_requests кестесі немесе cancel_parent_link_request RPC әлі қосылмаған.',
          'Таблица parent_child_link_requests или RPC cancel_parent_link_request еще не добавлены.'
        )
      );
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      localizedText(
        locale,
        'Сұраныс табылмады немесе ол бұрын өңделіп кеткен.',
        'Запрос не найден или уже был обработан.'
      )
    );
  }

  return data;
}

export type IncomingParentLinkRequestView = {
  id: string;
  parentId: string;
  parentName: string | null;
  status: ParentLinkRequestStatus;
  requestedAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
};

export async function getIncomingParentLinkRequests(
  studentId: string,
  locale: Locale = 'kk'
): Promise<IncomingParentLinkRequestView[]> {
  const user = await getCurrentSessionUserOrThrow(locale);
  const studentEmail = normalizeEmail(user.email || '');
  const db = supabase as unknown as DynamicSupabaseClient;

  const [byStudentId, byEmailFallback] = await Promise.all([
    db
      .from(PARENT_LINK_REQUESTS_TABLE)
      .select('*')
      .eq('student_id', studentId)
      .order('requested_at', { ascending: false }),
    studentEmail
      ? db
          .from(PARENT_LINK_REQUESTS_TABLE)
          .select('*')
          .is('student_id', null)
          .eq('child_email', studentEmail)
          .order('requested_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (byStudentId.error && !isSoftSchemaError(byStudentId.error.message || '')) {
    throw new Error(byStudentId.error.message);
  }

  if (byEmailFallback.error && !isSoftSchemaError(byEmailFallback.error.message || '')) {
    throw new Error(byEmailFallback.error.message);
  }

  const mergedRows: ParentLinkRequestRow[] = [
    ...((byStudentId.data as ParentLinkRequestRow[] | null) || []),
    ...((byEmailFallback.data as ParentLinkRequestRow[] | null) || []),
  ];

  const uniqueRows = Array.from(
    new Map<string, ParentLinkRequestRow>(
      mergedRows.map((row) => [String(row.id || ''), row]),
    ).values(),
  );

  const parentIds = [...new Set(
    uniqueRows
      .map((row) => String(row.parent_id || ''))
      .filter(Boolean)
  )];

  const profiles = await getProfilesMap(parentIds);

  return uniqueRows.map((row) => {
    const parentId = String(row.parent_id || '');
    const rawStatus = String(row.status || 'pending').toLowerCase();
    const status: ParentLinkRequestStatus =
      rawStatus === 'accepted' ||
      rawStatus === 'declined' ||
      rawStatus === 'expired' ||
      rawStatus === 'cancelled'
        ? rawStatus
        : 'pending';

    return {
      id: String(row.id || ''),
      parentId,
      parentName: profiles[parentId]?.full_name || null,
      status,
      requestedAt: row.requested_at ? String(row.requested_at) : null,
      respondedAt: row.responded_at ? String(row.responded_at) : null,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    } satisfies IncomingParentLinkRequestView;
  });
}

export async function acceptParentLinkRequest(requestId: string, locale: Locale = 'kk') {
  if (!requestId) {
    throw new Error(
      localizedText(
        locale,
        'Расталатын сұраныс идентификаторы берілмеген.',
        'Не передан идентификатор подтверждаемого запроса.'
      )
    );
  }

  const user = await getCurrentSessionUserOrThrow(locale);
  const studentEmail = normalizeEmail(user.email || '');
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data: rpcData, error: rpcError } = await db.rpc('accept_parent_link_request', {
    p_request_id: requestId,
  });

  if (!rpcError) {
    return rpcData;
  }

  if (!isMissingRpcError(rpcError.message || '')) {
    throw new Error(rpcError.message);
  }

  const { data: requestRowRaw, error: requestError } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  const requestRow = requestRowRaw as ParentLinkRequestRow | null;

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (!requestRow) {
    throw new Error(
      localizedText(
        locale,
        'Сұраныс табылмады немесе оның мерзімі өтіп кеткен.',
        'Запрос не найден или срок его действия истек.'
      )
    );
  }

  const allowed =
    String(requestRow.student_id || '') === user.id ||
    (!requestRow.student_id &&
      normalizeEmail(String(requestRow.child_email || '')) === studentEmail);

  if (!allowed) {
    throw new Error(
      localizedText(
        locale,
        'Бұл сұранысты растауға рұқсат жоқ.',
        'Нет доступа для подтверждения этого запроса.'
      )
    );
  }

  const { error: linkError } = await db
    .from('parent_student_links')
    .upsert(
      {
        parent_id: requestRow.parent_id,
        student_id: user.id,
      },
      {
        onConflict: 'parent_id,student_id',
        ignoreDuplicates: true,
      }
    );

  if (linkError) {
    throw new Error(linkError.message);
  }

  const { data, error } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .update({
      status: 'accepted',
      student_id: user.id,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function declineParentLinkRequest(requestId: string, locale: Locale = 'kk') {
  if (!requestId) {
    throw new Error(
      localizedText(
        locale,
        'Қабылданбайтын сұраныс идентификаторы берілмеген.',
        'Не передан идентификатор отклоняемого запроса.'
      )
    );
  }

  const user = await getCurrentSessionUserOrThrow(locale);
  const studentEmail = normalizeEmail(user.email || '');
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data: rpcData, error: rpcError } = await db.rpc('decline_parent_link_request', {
    p_request_id: requestId,
  });

  if (!rpcError) {
    return rpcData;
  }

  if (!isMissingRpcError(rpcError.message || '')) {
    throw new Error(rpcError.message);
  }

  const { data: requestRowRaw, error: requestError } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  const requestRow = requestRowRaw as ParentLinkRequestRow | null;

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (!requestRow) {
    throw new Error(
      localizedText(
        locale,
        'Сұраныс табылмады немесе оның мерзімі өтіп кеткен.',
        'Запрос не найден или срок его действия истек.'
      )
    );
  }

  const allowed =
    String(requestRow.student_id || '') === user.id ||
    (!requestRow.student_id &&
      normalizeEmail(String(requestRow.child_email || '')) === studentEmail);

  if (!allowed) {
    throw new Error(
      localizedText(
        locale,
        'Бұл сұранысты қабылдамауға рұқсат жоқ.',
        'Нет доступа для отклонения этого запроса.'
      )
    );
  }

  const { data, error } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .update({
      status: 'declined',
      student_id: user.id,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}