import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getLocale, type Locale } from '@/lib/i18n';
import {
  cancelParentLinkRequest,
  getAchievements,
  getAdminDashboard,
  getAnalytics,
  getCourseCatalog,
  getLeaderboard,
  acceptParentLinkRequest,
  declineParentLinkRequest,
  getIncomingParentLinkRequests,
  getLessonDetail,
  getLessonsForStudent,
  getModerationQueue,
  getParentDashboard,
  getParentLinkRequests,
  getStudentDashboard,
  getSubjects,
  getTeacherCourseWorkspace,
  getTeacherDashboard,
  getTeacherTestsWorkspace,
  getTestsCatalog,
  getUsersWithRoles,
  requestParentLink,
} from '@/lib/app-data';

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

  lessonsBase: ['lessons'] as const,
  lessons: (userId?: string, locale?: Locale) =>
    ['lessons', resolveLocale(locale), userId ?? 'all'] as const,

  lessonDetailBase: ['lesson-detail'] as const,
  lessonDetail: (lessonId: string, userId?: string, locale?: Locale) =>
    ['lesson-detail', resolveLocale(locale), lessonId, userId ?? 'anon'] as const,

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

      if (userId) {
        await queryClient.invalidateQueries({
          queryKey: platformKeys.incomingParentLinkRequests(userId, resolvedLocale),
        });
      } else {
        await queryClient.invalidateQueries({
          queryKey: platformKeys.incomingParentLinkRequestsBase,
        });
      }
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

      if (userId) {
        await queryClient.invalidateQueries({
          queryKey: platformKeys.incomingParentLinkRequests(userId, resolvedLocale),
        });
      } else {
        await queryClient.invalidateQueries({
          queryKey: platformKeys.incomingParentLinkRequestsBase,
        });
      }
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
      ]);
    },
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