import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { getLocale, type Locale } from '@/lib/i18n';
import {
  acceptParentLinkRequest,
  cancelParentLinkRequest,
  createCourseAnnouncement,
  createCourseExternalAsset,
  createCourseInvite,
  createLessonExternalAttachment,
  createLessonMiniQuizQuestion,
  deactivateCourseInvite,
  declineParentLinkRequest,
  deleteCourseAnnouncement,
  deleteCourseAsset,
  deleteLessonAttachment,
  deleteLessonNote,
  deleteLessonMiniQuiz,
  deleteLessonMiniQuizQuestion,
  getAchievements,
  getAdminDashboard,
  getAnalytics,
  getCourseAnnouncements,
  getCourseAssets,
  getCourseCatalog,
  getCourseInvites,
  getIncomingParentLinkRequests,
  getLeaderboard,
  getLessonAttachments,
  getLessonDetail,
  getLessonLearningState,
  getLessonMiniQuiz,
  getLessonsForStudent,
  getModerationQueue,
  getMyOrders,
  getParentDashboard,
  getParentLinkRequests,
  getPendingOrdersForAdmin,
  getReviewLaterItems,
  getSavedLessons,
  getStudentDashboard,
  getSubjects,
  getTeacherCourseWorkspace,
  getCourseProgressTimeline,
  getTeacherDashboard,
  getTeacherTestsWorkspace,
  getTestsCatalog,
  getUsersWithRoles,
  manualApproveOrder,
  manualGrantCourseAccess,
  reorderLessonMiniQuizQuestions,
  redeemCourseInvite,
  removeSavedLesson,
  requestPaidCourseAccess,
  requestParentLink,
  submitLessonMiniQuiz,
  setCourseInviteActive,
  toggleLessonBookmark,
  toggleReviewLater,
  updateCourseAnnouncement,
  updateCourseAccessSettings,
  updateLessonMiniQuizQuestion,
  upsertLessonMiniQuiz,
  upsertLessonNote,
  getCourseAnalyticsStudents,
  getCourseLearningSnapshot,
  getStudentLearningSnapshot,
  getTeacherStudentLearningSnapshot,
} from '@/lib/app-data';
import type {
  CourseAccessSettingsPayload,
  CreateCourseAnnouncementPayload,
  CreateCourseExternalAssetPayload,
  CreateCourseInvitePayload,
  CreateLessonExternalAttachmentPayload,
  CreateLessonMiniQuizQuestionPayload,
  DeleteCourseAnnouncementPayload,
  DeleteCourseAssetPayload,
  DeleteLessonAttachmentPayload,
  DeleteLessonNotePayload,
  DeleteLessonMiniQuizPayload,
  DeleteLessonMiniQuizQuestionPayload,
  ManualGrantCourseAccessPayload,
  RedeemCourseInvitePayload,
  RemoveSavedLessonPayload,
  ReorderLessonMiniQuizQuestionsPayload,
  RequestPaidCourseAccessPayload,
  ToggleLessonBookmarkPayload,
  ToggleReviewLaterPayload,
  SubmitLessonMiniQuizPayload,
  UpdateCourseAnnouncementPayload,
  UpdateLessonMiniQuizQuestionPayload,
  UpsertLessonMiniQuizPayload,
  UpsertLessonNotePayload,
} from '@/lib/app-data-types';

type QueryKeyInput = readonly unknown[];

function resolveLocale(locale?: Locale): Locale {
  return locale ?? getLocale();
}

function courseKey(userId?: string, teacherId?: string, locale?: Locale) {
  return ['courses', resolveLocale(locale), userId ?? 'anon', teacherId ?? 'all'] as const;
}

function testsKey(userId?: string, locale?: Locale) {
  return ['tests', resolveLocale(locale), userId ?? 'all'] as const;
}

async function invalidateMany(queryClient: QueryClient, keys: QueryKeyInput[]) {
  await Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
      }),
    ),
  );
}

export const platformKeys = {
  studentLearningSnapshotBase: ['student-learning-snapshot'] as const,
  studentLearningSnapshot: (studentId: string) =>
    ['student-learning-snapshot', studentId] as const,

  teacherStudentLearningSnapshotBase: ['teacher-student-learning-snapshot'] as const,
  teacherStudentLearningSnapshot: (
    teacherId: string,
    studentId: string,
    courseId?: string | null,
  ) =>
    [
      'teacher-student-learning-snapshot',
      teacherId,
      studentId,
      courseId || 'all',
    ] as const,

  courseLearningSnapshotBase: ['course-learning-snapshot'] as const,
  courseLearningSnapshot: (courseId: string) =>
    ['course-learning-snapshot', courseId] as const,

  courseAnalyticsStudentsBase: ['course-analytics-students'] as const,
  courseAnalyticsStudents: (courseId: string) =>
    ['course-analytics-students', courseId] as const,

  subjects: ['subjects'] as const,

  incomingParentLinkRequestsBase: ['incoming-parent-link-requests'] as const,
  incomingParentLinkRequests: (userId: string, locale?: Locale) =>
    ['incoming-parent-link-requests', resolveLocale(locale), userId] as const,

  studentDashboardBase: ['student-dashboard'] as const,
  studentDashboard: (userId: string, locale?: Locale) =>
    ['student-dashboard', resolveLocale(locale), userId] as const,

  coursesBase: ['courses'] as const,
  courses: courseKey,
  courseCatalogStudent: (userId: string, locale?: Locale) =>
    courseKey(userId, undefined, locale),
  courseCatalogTeacher: (teacherId: string, locale?: Locale) =>
    courseKey(undefined, teacherId, locale),
  courseCatalogAdmin: (locale?: Locale) =>
    courseKey(undefined, undefined, locale),

  courseInvitesBase: ['course-invites'] as const,
  courseInvites: (courseId: string) =>
    ['course-invites', courseId] as const,

  courseAnnouncementsBase: ['course-announcements'] as const,
  courseAnnouncements: (courseId: string, includeExpired = false) =>
    [
      'course-announcements',
      courseId,
      includeExpired ? 'with-expired' : 'active',
    ] as const,

  courseProgressBase: ['course-progress'] as const,
  courseProgress: (studentId: string, courseId: string, locale?: Locale) =>
    ['course-progress', resolveLocale(locale), studentId, courseId] as const,

  lessonsBase: ['lessons'] as const,
  lessons: (userId?: string, locale?: Locale) =>
    ['lessons', resolveLocale(locale), userId ?? 'all'] as const,

  lessonDetailBase: ['lesson-detail'] as const,
  lessonDetail: (lessonId: string, userId?: string, locale?: Locale) =>
    ['lesson-detail', resolveLocale(locale), lessonId, userId ?? 'anon'] as const,

  lessonLearningStateBase: ['lesson-learning-state'] as const,
  lessonLearningState: (studentId: string, lessonId: string) =>
    ['lesson-learning-state', studentId, lessonId] as const,

  lessonMiniQuizBase: ['lesson-mini-quiz'] as const,
  lessonMiniQuiz: (
    lessonId: string,
    userId?: string,
    includeUnpublished = false,
  ) =>
    [
      'lesson-mini-quiz',
      lessonId,
      userId ?? 'anon',
      includeUnpublished ? 'with-unpublished' : 'published',
    ] as const,

  lessonAttachmentsBase: ['lesson-attachments'] as const,
  lessonAttachments: (lessonId: string) =>
    ['lesson-attachments', lessonId] as const,

  courseAssetsBase: ['course-assets'] as const,
  courseAssets: (courseId: string) =>
    ['course-assets', courseId] as const,

  reviewLaterItemsBase: ['review-later-items'] as const,
  reviewLaterItems: (studentId: string) =>
    ['review-later-items', studentId] as const,

  savedLessonsBase: ['saved-lessons'] as const,
  savedLessons: (studentId: string) =>
    ['saved-lessons', studentId] as const,

  testsBase: ['tests'] as const,
  tests: testsKey,
  testsStudent: (userId: string, locale?: Locale) => testsKey(userId, locale),
  testsAdmin: (locale?: Locale) => testsKey(undefined, locale),

  analyticsBase: ['analytics'] as const,
  analytics: (userId: string, locale?: Locale) =>
    ['analytics', resolveLocale(locale), userId] as const,

  leaderboard: ['leaderboard'] as const,
  leaderboardByLocale: (locale?: Locale) =>
    ['leaderboard', resolveLocale(locale)] as const,

  achievementsBase: ['achievements'] as const,
  achievements: (userId: string, locale?: Locale) =>
    ['achievements', resolveLocale(locale), userId] as const,

  teacherDashboardBase: ['teacher-dashboard'] as const,
  teacherDashboard: (userId: string, locale?: Locale) =>
    ['teacher-dashboard', resolveLocale(locale), userId] as const,

  teacherCourseWorkspaceBase: ['teacher-course-workspace'] as const,
  teacherCourseWorkspace: (userId: string, locale?: Locale) =>
    ['teacher-course-workspace', resolveLocale(locale), userId] as const,

  teacherTestsWorkspaceBase: ['teacher-tests-workspace'] as const,
  teacherTestsWorkspace: (userId: string, locale?: Locale) =>
    ['teacher-tests-workspace', resolveLocale(locale), userId] as const,

  parentDashboardBase: ['parent-dashboard'] as const,
  parentDashboard: (userId: string, locale?: Locale) =>
    ['parent-dashboard', resolveLocale(locale), userId] as const,

  parentLinkRequestsBase: ['parent-link-requests'] as const,
  parentLinkRequests: (userId: string, locale?: Locale) =>
    ['parent-link-requests', resolveLocale(locale), userId] as const,

  myOrdersBase: ['my-orders'] as const,
  myOrders: (userId?: string) =>
    ['my-orders', userId ?? 'me'] as const,

  pendingOrdersBase: ['pending-orders'] as const,
  pendingOrders: ['pending-orders'] as const,

  adminDashboard: ['admin-dashboard'] as const,
  adminDashboardByLocale: (locale?: Locale) =>
    ['admin-dashboard', resolveLocale(locale)] as const,

  moderationQueue: ['moderation-queue'] as const,
  moderationQueueByLocale: (locale?: Locale) =>
    ['moderation-queue', resolveLocale(locale)] as const,

  users: ['users'] as const,
  usersByLocale: (locale?: Locale) =>
    ['users', resolveLocale(locale)] as const,
};

async function invalidateLearningAnalyticsCaches(
  queryClient: QueryClient,
  input?: {
    studentId?: string;
    teacherId?: string;
    courseId?: string;
  },
) {
  const keys: QueryKeyInput[] = [
    platformKeys.studentLearningSnapshotBase,
    platformKeys.teacherStudentLearningSnapshotBase,
    platformKeys.courseLearningSnapshotBase,
    platformKeys.courseAnalyticsStudentsBase,
  ];

  if (input?.studentId) {
    keys.push(platformKeys.studentLearningSnapshot(input.studentId));
  }

  if (input?.courseId) {
    keys.push(
      platformKeys.courseLearningSnapshot(input.courseId),
      platformKeys.courseAnalyticsStudents(input.courseId),
    );
  }

  if (input?.teacherId && input?.studentId) {
    keys.push(
      platformKeys.teacherStudentLearningSnapshot(
        input.teacherId,
        input.studentId,
        input.courseId,
      ),
    );
  }

  await invalidateMany(queryClient, keys);
}

async function invalidateCourseAccessCaches(
  queryClient: QueryClient,
  input?: {
    userId?: string;
    teacherId?: string;
    courseId?: string;
    locale?: Locale;
  },
) {
  const activeLocale = resolveLocale(input?.locale);

  const keys: QueryKeyInput[] = [
    platformKeys.coursesBase,
    platformKeys.courseProgressBase,
    platformKeys.teacherCourseWorkspaceBase,
    platformKeys.studentDashboardBase,
    platformKeys.lessonsBase,
    platformKeys.lessonDetailBase,
    platformKeys.lessonLearningStateBase,
    platformKeys.lessonAttachmentsBase,
    platformKeys.courseAssetsBase,
    platformKeys.reviewLaterItemsBase,
    platformKeys.savedLessonsBase,
    platformKeys.myOrdersBase,
    platformKeys.pendingOrdersBase,
    platformKeys.adminDashboard,
    platformKeys.moderationQueue,
  ];

  if (input?.userId) {
    keys.push(
      platformKeys.studentDashboard(input.userId, activeLocale),
      platformKeys.myOrders(input.userId),
      platformKeys.reviewLaterItems(input.userId),
      platformKeys.savedLessons(input.userId),
    );
  }

  if (input?.teacherId) {
    keys.push(
      platformKeys.teacherCourseWorkspace(input.teacherId, activeLocale),
      platformKeys.teacherDashboard(input.teacherId, activeLocale),
      platformKeys.courseCatalogTeacher(input.teacherId, activeLocale),
    );
  }

  if (input?.courseId) {
    keys.push(
      platformKeys.courseInvites(input.courseId),
      platformKeys.courseAssets(input.courseId),
      platformKeys.courseLearningSnapshot(input.courseId),
      platformKeys.courseAnalyticsStudents(input.courseId),
    );
  }

  await Promise.all([
    invalidateMany(queryClient, keys),
    invalidateLearningAnalyticsCaches(queryClient, {
      studentId: input?.userId,
      teacherId: input?.teacherId,
      courseId: input?.courseId,
    }),
  ]);
}

async function invalidateCourseAnnouncementCaches(
  queryClient: QueryClient,
  input?: {
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  },
) {
  const activeLocale = resolveLocale(input?.locale);

  const keys: QueryKeyInput[] = [
    platformKeys.courseAnnouncementsBase,
    platformKeys.coursesBase,
    platformKeys.teacherCourseWorkspaceBase,
    platformKeys.studentDashboardBase,
  ];

  if (input?.courseId) {
    keys.push(
      platformKeys.courseAnnouncements(input.courseId, false),
      platformKeys.courseAnnouncements(input.courseId, true),
    );
  }

  if (input?.teacherId) {
    keys.push(
      platformKeys.teacherCourseWorkspace(input.teacherId, activeLocale),
      platformKeys.teacherDashboard(input.teacherId, activeLocale),
    );
  }

  await invalidateMany(queryClient, keys);
}

async function invalidateLearningSpaceCaches(
  queryClient: QueryClient,
  input?: {
    studentId?: string;
    teacherId?: string;
    lessonId?: string;
    courseId?: string;
    locale?: Locale;
  },
) {
  const activeLocale = resolveLocale(input?.locale);

  const keys: QueryKeyInput[] = [
    platformKeys.lessonLearningStateBase,
    platformKeys.lessonDetailBase,
    platformKeys.courseProgressBase,
    platformKeys.lessonsBase,
    platformKeys.lessonAttachmentsBase,
    platformKeys.courseAssetsBase,
    platformKeys.reviewLaterItemsBase,
    platformKeys.savedLessonsBase,
    platformKeys.studentDashboardBase,
    platformKeys.teacherCourseWorkspaceBase,
  ];

  if (input?.studentId) {
    keys.push(
      platformKeys.studentDashboard(input.studentId, activeLocale),
      platformKeys.reviewLaterItems(input.studentId),
      platformKeys.savedLessons(input.studentId),
      platformKeys.studentLearningSnapshot(input.studentId),
    );
  }

  if (input?.studentId && input?.lessonId) {
    keys.push(
      platformKeys.lessonLearningState(input.studentId, input.lessonId),
      platformKeys.lessonDetail(input.lessonId, input.studentId, activeLocale),
    );
  }

  if (input?.studentId && input?.courseId) {
    keys.push(platformKeys.courseProgress(input.studentId, input.courseId, activeLocale));
  }

  if (input?.lessonId) {
    keys.push(platformKeys.lessonAttachments(input.lessonId));
  }

  if (input?.courseId) {
    keys.push(
      platformKeys.courseAssets(input.courseId),
      platformKeys.coursesBase,
      platformKeys.courseLearningSnapshot(input.courseId),
      platformKeys.courseAnalyticsStudents(input.courseId),
    );
  }

  if (input?.teacherId) {
    keys.push(
      platformKeys.teacherCourseWorkspace(input.teacherId, activeLocale),
      platformKeys.teacherDashboard(input.teacherId, activeLocale),
    );
  }

  await Promise.all([
    invalidateMany(queryClient, keys),
    invalidateLearningAnalyticsCaches(queryClient, {
      studentId: input?.studentId,
      teacherId: input?.teacherId,
      courseId: input?.courseId,
    }),
  ]);
}

async function invalidateLessonMiniQuizCaches(
  queryClient: QueryClient,
  input?: {
    lessonId?: string;
    courseId?: string;
    studentId?: string;
    teacherId?: string;
    locale?: Locale;
  },
) {
  const activeLocale = resolveLocale(input?.locale);

  const keys: QueryKeyInput[] = [
    platformKeys.lessonMiniQuizBase,
    platformKeys.lessonDetailBase,
    platformKeys.lessonLearningStateBase,
    platformKeys.courseProgressBase,
    platformKeys.lessonsBase,
    platformKeys.teacherCourseWorkspaceBase,
    platformKeys.studentDashboardBase,
    platformKeys.analyticsBase,
    platformKeys.achievementsBase,
    platformKeys.leaderboard,
  ];

  if (input?.lessonId) {
    keys.push(
      platformKeys.lessonMiniQuiz(input.lessonId, input.studentId, false),
      platformKeys.lessonMiniQuiz(input.lessonId, input.teacherId, true),
      platformKeys.lessonMiniQuiz(input.lessonId, undefined, true),
      platformKeys.lessonAttachments(input.lessonId),
    );
  }

  if (input?.studentId && input?.lessonId) {
    keys.push(
      platformKeys.lessonDetail(input.lessonId, input.studentId, activeLocale),
      platformKeys.lessonLearningState(input.studentId, input.lessonId),
    );
  }

  if (input?.studentId && input?.courseId) {
    keys.push(
      platformKeys.courseProgress(input.studentId, input.courseId, activeLocale),
      platformKeys.studentDashboard(input.studentId, activeLocale),
      platformKeys.studentLearningSnapshot(input.studentId),
    );
  }

  if (input?.courseId) {
    keys.push(
      platformKeys.courseLearningSnapshot(input.courseId),
      platformKeys.courseAnalyticsStudents(input.courseId),
    );
  }

  if (input?.teacherId) {
    keys.push(
      platformKeys.teacherCourseWorkspace(input.teacherId, activeLocale),
      platformKeys.teacherDashboard(input.teacherId, activeLocale),
    );
  }

  await Promise.all([
    invalidateMany(queryClient, keys),
    invalidateLearningAnalyticsCaches(queryClient, {
      studentId: input?.studentId,
      teacherId: input?.teacherId,
      courseId: input?.courseId,
    }),
  ]);
}

/* ================= READ QUERIES ================= */

export function useSubjects(enabled = true) {
  return useQuery({
    queryKey: platformKeys.subjects,
    queryFn: getSubjects,
    enabled,
  });
}

export function useStudentDashboard(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.studentDashboard(userId, activeLocale),
    queryFn: () => getStudentDashboard(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useCourseCatalog(
  userId?: string,
  teacherId?: string,
  enabled = true,
  locale?: Locale,
) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.courses(userId, teacherId, activeLocale),
    queryFn: () => getCourseCatalog(userId, teacherId, activeLocale),
    enabled,
  });
}

export function useCourseInvites(courseId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.courseInvites(courseId),
    queryFn: () => getCourseInvites(courseId),
    enabled: enabled && !!courseId,
  });
}

export function useCourseAnnouncements(
  courseId: string,
  enabled = true,
  includeExpired = false,
) {
  return useQuery({
    queryKey: platformKeys.courseAnnouncements(courseId, includeExpired),
    queryFn: () =>
      getCourseAnnouncements({
        courseId,
        includeExpired,
      }),
    enabled: enabled && !!courseId,
  });
}

export function useCourseProgressTimeline(
  studentId: string,
  courseId: string,
  enabled = true,
  locale?: Locale,
) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.courseProgress(studentId, courseId, activeLocale),
    queryFn: () => getCourseProgressTimeline(studentId, courseId, activeLocale),
    enabled: enabled && !!studentId && !!courseId,
  });
}

export function useStudentLearningSnapshot(studentId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.studentLearningSnapshot(studentId),
    queryFn: () => getStudentLearningSnapshot(studentId),
    enabled: enabled && !!studentId,
  });
}

export function useTeacherStudentLearningSnapshot(
  input: {
    teacherId: string;
    studentId: string;
    courseId?: string | null;
  },
  enabled = true,
) {
  return useQuery({
    queryKey: platformKeys.teacherStudentLearningSnapshot(
      input.teacherId,
      input.studentId,
      input.courseId,
    ),
    queryFn: () =>
      getTeacherStudentLearningSnapshot({
        teacherId: input.teacherId,
        studentId: input.studentId,
        courseId: input.courseId || null,
      }),
    enabled: enabled && !!input.teacherId && !!input.studentId,
  });
}

export function useCourseLearningSnapshot(courseId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.courseLearningSnapshot(courseId),
    queryFn: () => getCourseLearningSnapshot(courseId),
    enabled: enabled && !!courseId,
  });
}

export function useCourseAnalyticsStudents(courseId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.courseAnalyticsStudents(courseId),
    queryFn: () => getCourseAnalyticsStudents(courseId),
    enabled: enabled && !!courseId,
  });
}

export function useLessons(userId?: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.lessons(userId, activeLocale),
    queryFn: () => getLessonsForStudent(userId, activeLocale),
    enabled,
  });
}

export function useLessonDetail(
  lessonId: string,
  userId?: string,
  enabled = true,
  locale?: Locale,
) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.lessonDetail(lessonId, userId, activeLocale),
    queryFn: () => getLessonDetail(lessonId, userId, activeLocale),
    enabled: enabled && !!lessonId,
  });
}

export function useLessonLearningState(
  studentId: string,
  lessonId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: platformKeys.lessonLearningState(studentId, lessonId),
    queryFn: () => getLessonLearningState({ studentId, lessonId }),
    enabled: enabled && !!studentId && !!lessonId,
  });
}

export function useLessonMiniQuiz(
  lessonId: string,
  userId?: string,
  enabled = true,
  includeUnpublished = false,
) {
  const studentIdForAttempt = includeUnpublished ? undefined : userId;

  return useQuery({
    queryKey: platformKeys.lessonMiniQuiz(lessonId, userId, includeUnpublished),
    queryFn: () =>
      getLessonMiniQuiz({
        lessonId,
        studentId: studentIdForAttempt,
        includeUnpublished,
      }),
    enabled: enabled && !!lessonId,
  });
}

export function useLessonAttachments(lessonId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.lessonAttachments(lessonId),
    queryFn: () => getLessonAttachments(lessonId),
    enabled: enabled && !!lessonId,
  });
}

export function useCourseAssets(courseId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.courseAssets(courseId),
    queryFn: () => getCourseAssets(courseId),
    enabled: enabled && !!courseId,
  });
}

export function useReviewLaterItems(studentId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.reviewLaterItems(studentId),
    queryFn: () => getReviewLaterItems(studentId),
    enabled: enabled && !!studentId,
  });
}

export function useSavedLessons(studentId: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.savedLessons(studentId),
    queryFn: () => getSavedLessons(studentId),
    enabled: enabled && !!studentId,
  });
}

export function useTests(userId?: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.tests(userId, activeLocale),
    queryFn: () => getTestsCatalog(userId, activeLocale),
    enabled,
  });
}

export function useAnalytics(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.analytics(userId, activeLocale),
    queryFn: () => getAnalytics(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useLeaderboard(enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.leaderboardByLocale(activeLocale),
    queryFn: () => getLeaderboard(activeLocale),
    enabled,
  });
}

export function useAchievements(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.achievements(userId, activeLocale),
    queryFn: () => getAchievements(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useTeacherDashboard(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.teacherDashboard(userId, activeLocale),
    queryFn: () => getTeacherDashboard(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useTeacherCourseWorkspace(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.teacherCourseWorkspace(userId, activeLocale),
    queryFn: () => getTeacherCourseWorkspace(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useTeacherTestsWorkspace(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.teacherTestsWorkspace(userId, activeLocale),
    queryFn: () => getTeacherTestsWorkspace(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useParentDashboard(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.parentDashboard(userId, activeLocale),
    queryFn: () => getParentDashboard(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useParentLinkRequests(userId: string, enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.parentLinkRequests(userId, activeLocale),
    queryFn: () => getParentLinkRequests(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useIncomingParentLinkRequests(
  userId: string,
  enabled = true,
  locale?: Locale,
) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.incomingParentLinkRequests(userId, activeLocale),
    queryFn: () => getIncomingParentLinkRequests(userId, activeLocale),
    enabled: enabled && !!userId,
  });
}

export function useMyOrders(userId?: string, enabled = true) {
  return useQuery({
    queryKey: platformKeys.myOrders(userId),
    queryFn: getMyOrders,
    enabled,
  });
}

export function usePendingOrdersForAdmin(enabled = true) {
  return useQuery({
    queryKey: platformKeys.pendingOrders,
    queryFn: getPendingOrdersForAdmin,
    enabled,
  });
}

export function useAdminDashboard(enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.adminDashboardByLocale(activeLocale),
    queryFn: () => getAdminDashboard(activeLocale),
    enabled,
  });
}

export function useModerationQueue(enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.moderationQueueByLocale(activeLocale),
    queryFn: () => getModerationQueue(activeLocale),
    enabled,
  });
}

export function useUsers(enabled = true, locale?: Locale) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.usersByLocale(activeLocale),
    queryFn: () => getUsersWithRoles(activeLocale),
    enabled,
  });
}

/* ================= COURSE ANNOUNCEMENT MUTATIONS ================= */

type CreateCourseAnnouncementMutationInput =
  CreateCourseAnnouncementPayload & {
    teacherId?: string;
    locale?: Locale;
  };

export function useCreateCourseAnnouncementMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: CreateCourseAnnouncementMutationInput) => createCourseAnnouncement(payload),
    onSuccess: async (announcement, variables) => {
      await invalidateCourseAnnouncementCaches(queryClient, {
        courseId: announcement.course_id || variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type UpdateCourseAnnouncementMutationInput =
  UpdateCourseAnnouncementPayload & {
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useUpdateCourseAnnouncementMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      courseId: _courseId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: UpdateCourseAnnouncementMutationInput) => updateCourseAnnouncement(payload),
    onSuccess: async (announcement, variables) => {
      await invalidateCourseAnnouncementCaches(queryClient, {
        courseId: announcement.course_id || variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type DeleteCourseAnnouncementMutationInput =
  DeleteCourseAnnouncementPayload & {
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useDeleteCourseAnnouncementMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      courseId: _courseId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: DeleteCourseAnnouncementMutationInput) => deleteCourseAnnouncement(payload),
    onSuccess: async (_, variables) => {
      await invalidateCourseAnnouncementCaches(queryClient, {
        courseId: variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

/* ================= COURSE ACCESS MUTATIONS ================= */

type UpdateCourseAccessSettingsMutationInput =
  CourseAccessSettingsPayload & {
    courseId: string;
    userId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useUpdateCourseAccessSettingsMutation(
  userId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      userId: _userId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: UpdateCourseAccessSettingsMutationInput) => updateCourseAccessSettings(payload),
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateCourseAccessCaches(queryClient, {
        userId: variables.userId ?? userId,
        teacherId: variables.teacherId ?? userId,
        courseId: variables.courseId,
        locale: resolvedLocale,
      });
    },
  });
}

type CreateCourseInviteMutationInput =
  CreateCourseInvitePayload & {
    userId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useCreateCourseInviteMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      userId: _userId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: CreateCourseInviteMutationInput) => createCourseInvite(payload),
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateCourseAccessCaches(queryClient, {
        userId: variables.userId ?? userId,
        teacherId: variables.teacherId ?? userId,
        courseId: variables.courseId,
        locale: resolvedLocale,
      });
    },
  });
}

export function useSetCourseInviteActiveMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: setCourseInviteActive,
    onSuccess: async (invite) => {
      await invalidateCourseAccessCaches(queryClient, {
        userId,
        teacherId: userId,
        courseId: invite.course_id,
        locale: activeLocale,
      });
    },
  });
}

export function useDeactivateCourseInviteMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: deactivateCourseInvite,
    onSuccess: async (invite) => {
      await invalidateCourseAccessCaches(queryClient, {
        userId,
        teacherId: userId,
        courseId: invite.course_id,
        locale: activeLocale,
      });
    },
  });
}

type RedeemCourseInviteMutationInput =
  RedeemCourseInvitePayload & {
    userId?: string;
    locale?: Locale;
  };

export function useRedeemCourseInviteMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      userId: _userId,
      locale: _locale,
      ...payload
    }: RedeemCourseInviteMutationInput) => redeemCourseInvite(payload),
    onSuccess: async (result, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateCourseAccessCaches(queryClient, {
        userId: variables.userId ?? userId,
        courseId: result.course_id,
        locale: resolvedLocale,
      });
    },
  });
}

type RequestPaidCourseAccessMutationInput =
  RequestPaidCourseAccessPayload & {
    userId?: string;
    locale?: Locale;
  };

export function useRequestPaidCourseAccessMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      userId: _userId,
      locale: _locale,
      ...payload
    }: RequestPaidCourseAccessMutationInput) => requestPaidCourseAccess(payload),
    onSuccess: async (order, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateCourseAccessCaches(queryClient, {
        userId: variables.userId ?? userId,
        courseId: order.product_type === 'course' ? order.product_id : undefined,
        locale: resolvedLocale,
      });
    },
  });
}

type ManualGrantCourseAccessMutationInput =
  ManualGrantCourseAccessPayload & {
    adminId?: string;
    locale?: Locale;
  };

export function useManualGrantCourseAccessMutation(adminId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      adminId: _adminId,
      locale: _locale,
      ...payload
    }: ManualGrantCourseAccessMutationInput) => manualGrantCourseAccess(payload),
    onSuccess: async (entitlement, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateCourseAccessCaches(queryClient, {
        userId: entitlement.user_id,
        teacherId: adminId,
        courseId:
          entitlement.resource_type === 'course'
            ? entitlement.resource_id
            : undefined,
        locale: resolvedLocale,
      });

      await invalidateMany(queryClient, [
        platformKeys.usersByLocale(resolvedLocale),
        platformKeys.adminDashboardByLocale(resolvedLocale),
      ]);
    },
  });
}

export function useManualApproveOrderMutation(adminId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: manualApproveOrder,
    onSuccess: async () => {
      await invalidateCourseAccessCaches(queryClient, {
        teacherId: adminId,
        locale: activeLocale,
      });

      await invalidateMany(queryClient, [
        platformKeys.pendingOrders,
        platformKeys.adminDashboardByLocale(activeLocale),
        platformKeys.usersByLocale(activeLocale),
      ]);
    },
  });
}

/* ================= LESSON MINI QUIZ MUTATIONS ================= */

type UpsertLessonMiniQuizMutationInput =
  UpsertLessonMiniQuizPayload & {
    teacherId?: string;
    locale?: Locale;
  };

export function useUpsertLessonMiniQuizMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: UpsertLessonMiniQuizMutationInput) => upsertLessonMiniQuiz(payload),
    onSuccess: async (quiz, variables) => {
      await invalidateLessonMiniQuizCaches(queryClient, {
        lessonId: quiz.lesson_id || variables.lessonId,
        courseId: quiz.course_id || variables.courseId,
        teacherId: variables.teacherId ?? teacherId ?? variables.createdBy,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type DeleteLessonMiniQuizMutationInput =
  DeleteLessonMiniQuizPayload & {
    lessonId?: string;
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useDeleteLessonMiniQuizMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      lessonId: _lessonId,
      courseId: _courseId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: DeleteLessonMiniQuizMutationInput) => deleteLessonMiniQuiz(payload),
    onSuccess: async (_, variables) => {
      await invalidateLessonMiniQuizCaches(queryClient, {
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type CreateLessonMiniQuizQuestionMutationInput =
  CreateLessonMiniQuizQuestionPayload & {
    lessonId?: string;
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useCreateLessonMiniQuizQuestionMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      lessonId: _lessonId,
      courseId: _courseId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: CreateLessonMiniQuizQuestionMutationInput) =>
      createLessonMiniQuizQuestion(payload),
    onSuccess: async (_, variables) => {
      await invalidateLessonMiniQuizCaches(queryClient, {
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type UpdateLessonMiniQuizQuestionMutationInput =
  UpdateLessonMiniQuizQuestionPayload & {
    lessonId?: string;
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useUpdateLessonMiniQuizQuestionMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      lessonId: _lessonId,
      courseId: _courseId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: UpdateLessonMiniQuizQuestionMutationInput) =>
      updateLessonMiniQuizQuestion(payload),
    onSuccess: async (_, variables) => {
      await invalidateLessonMiniQuizCaches(queryClient, {
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type DeleteLessonMiniQuizQuestionMutationInput =
  DeleteLessonMiniQuizQuestionPayload & {
    lessonId?: string;
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useDeleteLessonMiniQuizQuestionMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      lessonId: _lessonId,
      courseId: _courseId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: DeleteLessonMiniQuizQuestionMutationInput) =>
      deleteLessonMiniQuizQuestion(payload),
    onSuccess: async (_, variables) => {
      await invalidateLessonMiniQuizCaches(queryClient, {
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type ReorderLessonMiniQuizQuestionsMutationInput =
  ReorderLessonMiniQuizQuestionsPayload & {
    lessonId?: string;
    courseId?: string;
    teacherId?: string;
    locale?: Locale;
  };

export function useReorderLessonMiniQuizQuestionsMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      lessonId: _lessonId,
      courseId: _courseId,
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: ReorderLessonMiniQuizQuestionsMutationInput) =>
      reorderLessonMiniQuizQuestions(payload),
    onSuccess: async (_, variables) => {
      await invalidateLessonMiniQuizCaches(queryClient, {
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        teacherId: variables.teacherId ?? teacherId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type SubmitLessonMiniQuizMutationInput =
  SubmitLessonMiniQuizPayload & {
    locale?: Locale;
  };

export function useSubmitLessonMiniQuizMutation(locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      locale: _locale,
      ...payload
    }: SubmitLessonMiniQuizMutationInput) => submitLessonMiniQuiz(payload),
    onSuccess: async (result, variables) => {
      await invalidateLessonMiniQuizCaches(queryClient, {
        lessonId: result.attempt.lessonId || variables.lessonId,
        courseId: result.attempt.courseId || variables.courseId,
        studentId: result.attempt.studentId || variables.studentId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

/* ================= LEARNING SPACE MUTATIONS ================= */

type UpsertLessonNoteMutationInput =
  UpsertLessonNotePayload & {
    locale?: Locale;
  };

export function useUpsertLessonNoteMutation(locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      locale: _locale,
      ...payload
    }: UpsertLessonNoteMutationInput) => upsertLessonNote(payload),
    onSuccess: async (note, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        studentId: note.student_id,
        lessonId: note.lesson_id,
        courseId: note.course_id,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type DeleteLessonNoteMutationInput =
  DeleteLessonNotePayload & {
    courseId?: string;
    locale?: Locale;
  };

export function useDeleteLessonNoteMutation(locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      courseId: _courseId,
      locale: _locale,
      ...payload
    }: DeleteLessonNoteMutationInput) => deleteLessonNote(payload),
    onSuccess: async (_, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        studentId: variables.studentId,
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type ToggleLessonBookmarkMutationInput =
  ToggleLessonBookmarkPayload & {
    locale?: Locale;
  };

export function useToggleLessonBookmarkMutation(locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      locale: _locale,
      ...payload
    }: ToggleLessonBookmarkMutationInput) => toggleLessonBookmark(payload),
    onSuccess: async (_result, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        studentId: variables.studentId,
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type RemoveSavedLessonMutationInput =
  RemoveSavedLessonPayload & {
    courseId?: string;
    locale?: Locale;
  };

export function useRemoveSavedLessonMutation(locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      courseId: _courseId,
      locale: _locale,
      ...payload
    }: RemoveSavedLessonMutationInput) => removeSavedLesson(payload),
    onSuccess: async (_, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        studentId: variables.studentId,
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type ToggleReviewLaterMutationInput =
  ToggleReviewLaterPayload & {
    locale?: Locale;
  };

export function useToggleReviewLaterMutation(locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      locale: _locale,
      ...payload
    }: ToggleReviewLaterMutationInput) => toggleReviewLater(payload),
    onSuccess: async (_result, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        studentId: variables.studentId,
        lessonId: variables.lessonId || undefined,
        courseId: variables.courseId || undefined,
        locale: variables.locale ?? activeLocale,
      });

      await queryClient.invalidateQueries({
        queryKey: platformKeys.testsBase,
      });
    },
  });
}

type CreateLessonExternalAttachmentMutationInput =
  CreateLessonExternalAttachmentPayload & {
    teacherId?: string;
    locale?: Locale;
  };

export function useCreateLessonExternalAttachmentMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: CreateLessonExternalAttachmentMutationInput) =>
      createLessonExternalAttachment(payload),
    onSuccess: async (attachment, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        teacherId: variables.teacherId ?? teacherId ?? variables.ownerId,
        lessonId: attachment.lessonId,
        courseId: attachment.courseId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type DeleteLessonAttachmentMutationInput =
  DeleteLessonAttachmentPayload & {
    teacherId?: string;
    lessonId?: string;
    courseId?: string;
    locale?: Locale;
  };

export function useDeleteLessonAttachmentMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      teacherId: _teacherId,
      lessonId: _lessonId,
      courseId: _courseId,
      locale: _locale,
      ...payload
    }: DeleteLessonAttachmentMutationInput) => deleteLessonAttachment(payload),
    onSuccess: async (_, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        teacherId: variables.teacherId ?? teacherId,
        lessonId: variables.lessonId,
        courseId: variables.courseId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type CreateCourseExternalAssetMutationInput =
  CreateCourseExternalAssetPayload & {
    teacherId?: string;
    locale?: Locale;
  };

export function useCreateCourseExternalAssetMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      teacherId: _teacherId,
      locale: _locale,
      ...payload
    }: CreateCourseExternalAssetMutationInput) => createCourseExternalAsset(payload),
    onSuccess: async (asset, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        teacherId: variables.teacherId ?? teacherId ?? variables.ownerId,
        courseId: asset.courseId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

type DeleteCourseAssetMutationInput =
  DeleteCourseAssetPayload & {
    teacherId?: string;
    courseId?: string;
    locale?: Locale;
  };

export function useDeleteCourseAssetMutation(
  teacherId?: string,
  locale?: Locale,
) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      teacherId: _teacherId,
      courseId: _courseId,
      locale: _locale,
      ...payload
    }: DeleteCourseAssetMutationInput) => deleteCourseAsset(payload),
    onSuccess: async (_, variables) => {
      await invalidateLearningSpaceCaches(queryClient, {
        teacherId: variables.teacherId ?? teacherId,
        courseId: variables.courseId,
        locale: variables.locale ?? activeLocale,
      });
    },
  });
}

/* ================= PARENT LINK MUTATIONS ================= */

type StudentParentLinkRequestActionInput = {
  requestId: string;
  locale?: Locale;
};

export function useAcceptParentLinkRequestMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      requestId,
      locale: mutationLocale,
    }: StudentParentLinkRequestActionInput) =>
      acceptParentLinkRequest(requestId, resolveLocale(mutationLocale ?? activeLocale)),
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateMany(queryClient, [
        userId
          ? platformKeys.incomingParentLinkRequests(userId, resolvedLocale)
          : platformKeys.incomingParentLinkRequestsBase,
        platformKeys.parentDashboardBase,
        platformKeys.parentLinkRequestsBase,
      ]);
    },
  });
}

export function useDeclineParentLinkRequestMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      requestId,
      locale: mutationLocale,
    }: StudentParentLinkRequestActionInput) =>
      declineParentLinkRequest(requestId, resolveLocale(mutationLocale ?? activeLocale)),
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateMany(queryClient, [
        userId
          ? platformKeys.incomingParentLinkRequests(userId, resolvedLocale)
          : platformKeys.incomingParentLinkRequestsBase,
        platformKeys.parentLinkRequestsBase,
      ]);
    },
  });
}

type RequestParentLinkInput = {
  childEmail: string;
  locale?: Locale;
};

export function useRequestParentLinkMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({ childEmail, locale: mutationLocale }: RequestParentLinkInput) =>
      requestParentLink(childEmail, resolveLocale(mutationLocale ?? activeLocale)),
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateMany(queryClient, [
        userId
          ? platformKeys.parentLinkRequests(userId, resolvedLocale)
          : platformKeys.parentLinkRequestsBase,
        userId
          ? platformKeys.parentDashboard(userId, resolvedLocale)
          : platformKeys.parentDashboardBase,
        platformKeys.incomingParentLinkRequestsBase,
      ]);
    },
  });
}

type CancelParentLinkRequestInput = {
  requestId: string;
  locale?: Locale;
};

export function useCancelParentLinkRequestMutation(userId?: string, locale?: Locale) {
  const queryClient = useQueryClient();
  const activeLocale = resolveLocale(locale);

  return useMutation({
    mutationFn: async ({
      requestId,
      locale: mutationLocale,
    }: CancelParentLinkRequestInput) =>
      cancelParentLinkRequest(requestId, resolveLocale(mutationLocale ?? activeLocale)),
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await invalidateMany(queryClient, [
        userId
          ? platformKeys.parentLinkRequests(userId, resolvedLocale)
          : platformKeys.parentLinkRequestsBase,
        userId
          ? platformKeys.parentDashboard(userId, resolvedLocale)
          : platformKeys.parentDashboardBase,
        platformKeys.incomingParentLinkRequestsBase,
      ]);
    },
  });
}