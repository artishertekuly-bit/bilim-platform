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
  createCourseExternalAsset,
  createCourseInvite,
  createLessonExternalAttachment,
  deactivateCourseInvite,
  declineParentLinkRequest,
  deleteCourseAsset,
  deleteLessonAttachment,
  deleteLessonNote,
  getAchievements,
  getAdminDashboard,
  getAnalytics,
  getCourseAssets,
  getCourseCatalog,
  getCourseInvites,
  getIncomingParentLinkRequests,
  getLeaderboard,
  getLessonAttachments,
  getLessonDetail,
  getLessonLearningState,
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
  redeemCourseInvite,
  removeSavedLesson,
  requestPaidCourseAccess,
  requestParentLink,
  setCourseInviteActive,
  toggleLessonBookmark,
  toggleReviewLater,
  updateCourseAccessSettings,
  upsertLessonNote,
} from '@/lib/app-data';
import type {
  CourseAccessSettingsPayload,
  CreateCourseExternalAssetPayload,
  CreateCourseInvitePayload,
  CreateLessonExternalAttachmentPayload,
  DeleteCourseAssetPayload,
  DeleteLessonAttachmentPayload,
  DeleteLessonNotePayload,
  ManualGrantCourseAccessPayload,
  RedeemCourseInvitePayload,
  RemoveSavedLessonPayload,
  RequestPaidCourseAccessPayload,
  ToggleLessonBookmarkPayload,
  ToggleReviewLaterPayload,
  UpsertLessonNotePayload,
} from '@/lib/app-data-types';

function resolveLocale(locale?: Locale): Locale {
  return locale ?? getLocale();
}

const courseKey = (userId?: string, teacherId?: string, locale?: Locale) =>
  ['courses', resolveLocale(locale), userId ?? 'anon', teacherId ?? 'all'] as const;

const testsKey = (userId?: string, locale?: Locale) =>
  ['tests', resolveLocale(locale), userId ?? 'all'] as const;

export const platformKeys = {
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

async function invalidateCourseAccessCaches(
  queryClient: QueryClient,
  input?: {
    userId?: string;
    teacherId?: string;
    courseId?: string;
    locale?: Locale;
  }
) {
  const activeLocale = resolveLocale(input?.locale);

  const tasks: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({
      queryKey: platformKeys.coursesBase,
    }),
    queryClient.invalidateQueries({
    queryKey: platformKeys.courseProgressBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.teacherCourseWorkspaceBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.studentDashboardBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonDetailBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonLearningStateBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonAttachmentsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.courseAssetsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.reviewLaterItemsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.savedLessonsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.myOrdersBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.pendingOrdersBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.adminDashboard,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.moderationQueue,
    }),
  ];

  if (input?.userId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.studentDashboard(input.userId, activeLocale),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.myOrders(input.userId),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.reviewLaterItems(input.userId),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.savedLessons(input.userId),
      })
    );
  }

  if (input?.teacherId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherCourseWorkspace(input.teacherId, activeLocale),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherDashboard(input.teacherId, activeLocale),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.courseCatalogTeacher(input.teacherId, activeLocale),
      })
    );
  }

  if (input?.courseId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.courseInvites(input.courseId),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.courseAssets(input.courseId),
      })
    );
  }

  await Promise.all(tasks);
}

async function invalidateLearningSpaceCaches(
  queryClient: QueryClient,
  input?: {
    studentId?: string;
    teacherId?: string;
    lessonId?: string;
    courseId?: string;
    locale?: Locale;
  }
) {
  const activeLocale = resolveLocale(input?.locale);

  const tasks: Array<Promise<unknown>> = [
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonLearningStateBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonDetailBase,
    }),
    queryClient.invalidateQueries({
    queryKey: platformKeys.courseProgressBase,
      }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.lessonAttachmentsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.courseAssetsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.reviewLaterItemsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.savedLessonsBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.studentDashboardBase,
    }),
    queryClient.invalidateQueries({
      queryKey: platformKeys.teacherCourseWorkspaceBase,
    }),
  ];

  if (input?.studentId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.studentDashboard(input.studentId, activeLocale),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.reviewLaterItems(input.studentId),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.savedLessons(input.studentId),
      })
    );
  }

  if (input?.studentId && input?.lessonId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.lessonLearningState(input.studentId, input.lessonId),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.lessonDetail(input.lessonId, input.studentId, activeLocale),
      })
    );
  }

  if (input?.studentId && input?.courseId) {
  tasks.push(
    queryClient.invalidateQueries({
      queryKey: platformKeys.courseProgress(
        input.studentId,
        input.courseId,
        activeLocale
      ),
    })
  );
}

  if (input?.lessonId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.lessonAttachments(input.lessonId),
      })
    );
  }

  if (input?.courseId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.courseAssets(input.courseId),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.coursesBase,
      })
    );
  }

  if (input?.teacherId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherCourseWorkspace(input.teacherId, activeLocale),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherDashboard(input.teacherId, activeLocale),
      })
    );
  }

  await Promise.all(tasks);
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
  locale?: Locale
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

export function useCourseProgressTimeline(
  studentId: string,
  courseId: string,
  enabled = true,
  locale?: Locale
) {
  const activeLocale = resolveLocale(locale);

  return useQuery({
    queryKey: platformKeys.courseProgress(studentId, courseId, activeLocale),
    queryFn: () => getCourseProgressTimeline(studentId, courseId, activeLocale),
    enabled: enabled && !!studentId && !!courseId,
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
  locale?: Locale
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
  enabled = true
) {
  return useQuery({
    queryKey: platformKeys.lessonLearningState(studentId, lessonId),
    queryFn: () => getLessonLearningState({ studentId, lessonId }),
    enabled: enabled && !!studentId && !!lessonId,
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
  locale?: Locale
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
  locale?: Locale
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
        courseId: entitlement.resource_type === 'course'
          ? entitlement.resource_id
          : undefined,
        locale: resolvedLocale,
      });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: platformKeys.usersByLocale(resolvedLocale),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.adminDashboardByLocale(resolvedLocale),
        }),
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

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: platformKeys.pendingOrders,
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.adminDashboardByLocale(activeLocale),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.usersByLocale(activeLocale),
        }),
      ]);
    },
  });
}

/* ================= MVP 2 LEARNING SPACE MUTATIONS ================= */

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

      queryClient.invalidateQueries({
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
  locale?: Locale
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
  locale?: Locale
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
  locale?: Locale
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
  locale?: Locale
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
    }: StudentParentLinkRequestActionInput) => {
      const resolvedLocale = resolveLocale(mutationLocale ?? activeLocale);
      return acceptParentLinkRequest(requestId, resolvedLocale);
    },
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await Promise.all([
        userId
          ? queryClient.invalidateQueries({
              queryKey: platformKeys.incomingParentLinkRequests(userId, resolvedLocale),
            })
          : queryClient.invalidateQueries({
              queryKey: platformKeys.incomingParentLinkRequestsBase,
            }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.parentDashboardBase,
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.parentLinkRequestsBase,
        }),
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
    }: StudentParentLinkRequestActionInput) => {
      const resolvedLocale = resolveLocale(mutationLocale ?? activeLocale);
      return declineParentLinkRequest(requestId, resolvedLocale);
    },
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      await Promise.all([
        userId
          ? queryClient.invalidateQueries({
              queryKey: platformKeys.incomingParentLinkRequests(userId, resolvedLocale),
            })
          : queryClient.invalidateQueries({
              queryKey: platformKeys.incomingParentLinkRequestsBase,
            }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.parentLinkRequestsBase,
        }),
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
    mutationFn: async ({ childEmail, locale: mutationLocale }: RequestParentLinkInput) => {
      const resolvedLocale = resolveLocale(mutationLocale ?? activeLocale);
      return requestParentLink(childEmail, resolvedLocale);
    },
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      if (userId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: platformKeys.parentLinkRequests(userId, resolvedLocale),
          }),
          queryClient.invalidateQueries({
            queryKey: platformKeys.parentDashboard(userId, resolvedLocale),
          }),
          queryClient.invalidateQueries({
            queryKey: platformKeys.incomingParentLinkRequestsBase,
          }),
        ]);

        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: platformKeys.parentLinkRequestsBase,
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.parentDashboardBase,
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.incomingParentLinkRequestsBase,
        }),
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
    }: CancelParentLinkRequestInput) => {
      const resolvedLocale = resolveLocale(mutationLocale ?? activeLocale);
      return cancelParentLinkRequest(requestId, resolvedLocale);
    },
    onSuccess: async (_, variables) => {
      const resolvedLocale = resolveLocale(variables.locale ?? activeLocale);

      if (userId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: platformKeys.parentLinkRequests(userId, resolvedLocale),
          }),
          queryClient.invalidateQueries({
            queryKey: platformKeys.parentDashboard(userId, resolvedLocale),
          }),
          queryClient.invalidateQueries({
            queryKey: platformKeys.incomingParentLinkRequestsBase,
          }),
        ]);

        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: platformKeys.parentLinkRequestsBase,
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.parentDashboardBase,
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.incomingParentLinkRequestsBase,
        }),
      ]);
    },
  });
}