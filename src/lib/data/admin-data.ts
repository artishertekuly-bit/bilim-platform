import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

import {
  localizedText,
  noDescriptionLabel,
  noTopicLabel,
  queryOrThrow,
  type Locale,
  unknownLabel,
  unknownTeacherLabel,
} from './common';

import type { ModerationItem, SubjectMap } from '@/lib/app-data-types';
import { getSubjects, subjectLabel } from './student-data';

/* ================= TYPES ================= */

type UserRoleRow = Pick<Tables<'user_roles'>, 'user_id' | 'role' | 'created_at'>;
type ProfileRow = Pick<Tables<'profiles'>, 'user_id' | 'full_name' | 'avatar_url'>;

type CourseRow = Tables<'courses'>;
type LessonRow = Tables<'lessons'>;
type TestRow = Tables<'tests'>;
type TestAttemptRow = Tables<'test_attempts'>;
type ContentReviewRow = Tables<'content_reviews'>;

type TestQuestionCountRow = Pick<Tables<'test_questions'>, 'id' | 'test_id'>;

type CurrentAdminContext = {
  userId: string;
  isAdmin: boolean;
};

/* ================= AUTH ================= */

async function getCurrentAdminContext(): Promise<CurrentAdminContext> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user?.id) {
    throw new Error('Авторизация қажет.');
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  });

  if (roleError) {
    throw new Error(roleError.message);
  }

  return {
    userId: user.id,
    isAdmin: Boolean(isAdmin),
  };
}

async function assertAdmin() {
  const context = await getCurrentAdminContext();

  if (!context.isAdmin) {
    throw new Error('Бұл әрекетке admin рөлі қажет.');
  }

  return context;
}

/* ================= HELPERS ================= */

function truncateText(value: string | null | undefined, limit = 70) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function getAverageScore(rows: Array<{ score: number | null }>) {
  const scores = rows
    .map((row) => Number(row.score))
    .filter((score) => Number.isFinite(score));

  if (scores.length === 0) return 0;

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function groupTestsBySubjectId(rows: TestRow[]) {
  const map = new Map<string, TestRow[]>();

  rows.forEach((test) => {
    if (!test.subject_id) return;

    const current = map.get(test.subject_id) || [];
    current.push(test);
    map.set(test.subject_id, current);
  });

  return map;
}

function groupAttemptsByTestId(rows: TestAttemptRow[]) {
  const map = new Map<string, TestAttemptRow[]>();

  rows.forEach((attempt) => {
    if (!attempt.test_id) return;

    const current = map.get(attempt.test_id) || [];
    current.push(attempt);
    map.set(attempt.test_id, current);
  });

  return map;
}

function getQuestionCountMap(rows: TestQuestionCountRow[]) {
  const map = new Map<string, number>();

  rows.forEach((question) => {
    if (!question.test_id) return;

    map.set(question.test_id, (map.get(question.test_id) || 0) + 1);
  });

  return map;
}

function getProfileNameMap(rows: Array<Pick<ProfileRow, 'user_id' | 'full_name'>>) {
  return new Map(rows.map((profile) => [profile.user_id, profile.full_name]));
}

function compareCreatedAtDesc(a: { createdAt: string | null }, b: { createdAt: string | null }) {
  const left = a.createdAt || '';
  const right = b.createdAt || '';

  return right.localeCompare(left);
}

function getCourseStatusCounts(courses: CourseRow[]) {
  return {
    published: courses.filter((row) => row.status === 'published').length,
    underReview: courses.filter((row) => row.status === 'under_review').length,
    draft: courses.filter((row) => row.status === 'draft').length,
    archived: courses.filter((row) => row.status === 'archived').length,
  };
}

function getTestStatusCounts(tests: TestRow[]) {
  return {
    published: tests.filter((row) => row.status === 'published').length,
    underReview: tests.filter((row) => row.status === 'under_review').length,
    draft: tests.filter((row) => row.status === 'draft').length,
    archived: tests.filter((row) => row.status === 'archived').length,
  };
}

function getModerationStatus(row: Pick<CourseRow | TestRow, 'status'>) {
  return row.status || 'draft';
}

/* ================= ADMIN DASHBOARD ================= */

export async function getAdminDashboard(locale: Locale = 'kk') {
  await assertAdmin();

  const [roles, courses, lessons, tests, reviews, subjects, attempts] =
    await Promise.all([
      queryOrThrow(
        supabase
          .from('user_roles')
          .select('user_id, role, created_at'),
      ) as Promise<UserRoleRow[]>,

      queryOrThrow(
        supabase
          .from('courses')
          .select('*'),
      ) as Promise<CourseRow[]>,

      queryOrThrow(
        supabase
          .from('lessons')
          .select('*'),
      ) as Promise<LessonRow[]>,

      queryOrThrow(
        supabase
          .from('tests')
          .select('*'),
      ) as Promise<TestRow[]>,

      queryOrThrow(
        supabase
          .from('content_reviews')
          .select('*')
          .order('reviewed_at', { ascending: false }),
      ) as Promise<ContentReviewRow[]>,

      getSubjects(),

      queryOrThrow(
        supabase
          .from('test_attempts')
          .select('*'),
      ) as Promise<TestAttemptRow[]>,
    ]);

  const testsBySubjectId = groupTestsBySubjectId(tests);
  const attemptsByTestId = groupAttemptsByTestId(attempts);

  const subjectStats = subjects.map((subject) => {
    const subjectCourses = courses.filter(
      (course) => course.subject_id === subject.id,
    );

    const subjectLessons = lessons.filter(
      (lesson) => lesson.subject_id === subject.id,
    );

    const subjectTests = testsBySubjectId.get(subject.id) || [];

    const subjectAttempts = subjectTests.flatMap((test) =>
      (attemptsByTestId.get(test.id) || []).filter(
        (attempt) => attempt.score !== null,
      ),
    );

    return {
      name: subjectLabel(subject, locale),
      courses: subjectCourses.length,
      lessons: subjectLessons.length,
      avgScore: getAverageScore(subjectAttempts),
    };
  });

  const roleCounts = {
    students: roles.filter((row) => row.role === 'student').length,
    teachers: roles.filter((row) => row.role === 'teacher').length,
    parents: roles.filter((row) => row.role === 'parent').length,
    admins: roles.filter((row) => row.role === 'admin').length,
  };

  const courseStatusCounts = getCourseStatusCounts(courses);
  const testStatusCounts = getTestStatusCounts(tests);

  return {
    stats: {
      totalStudents: roleCounts.students,
      totalCourses: courses.length,
      totalLessons: lessons.length,
      totalTests: tests.length,
    },
    roleCounts,
    contentStatus: {
      published: courseStatusCounts.published + testStatusCounts.published,
      underReview: courseStatusCounts.underReview + testStatusCounts.underReview,
      draft: courseStatusCounts.draft + testStatusCounts.draft,
      archived: courseStatusCounts.archived + testStatusCounts.archived,
    },
    pendingReviews: reviews.filter((review) => review.status === 'under_review'),
    subjectStats,
  };
}

/* ================= MODERATION ================= */

export async function getModerationQueue(
  locale: Locale = 'kk',
): Promise<ModerationItem[]> {
  await assertAdmin();

  const [subjects, courses, tests, profiles, questions] = await Promise.all([
    getSubjects(),

    queryOrThrow(
      supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false }),
    ) as Promise<CourseRow[]>,

    queryOrThrow(
      supabase
        .from('tests')
        .select('*')
        .order('created_at', { ascending: false }),
    ) as Promise<TestRow[]>,

    queryOrThrow(
      supabase
        .from('profiles')
        .select('user_id, full_name'),
    ) as Promise<Array<Pick<ProfileRow, 'user_id' | 'full_name'>>>,

    queryOrThrow(
      supabase
        .from('test_questions')
        .select('id, test_id'),
    ) as Promise<TestQuestionCountRow[]>,
  ]);

  const subjectMap = Object.fromEntries(
    subjects.map((subject) => [subject.id, subject]),
  ) as SubjectMap;

  const profileNameByUserId = getProfileNameMap(profiles);
  const questionCountByTestId = getQuestionCountMap(questions);

  const items: ModerationItem[] = [
    ...courses.map((course) => ({
      id: course.id,
      type: 'course' as const,
      title: course.title,
      subjectName: subjectLabel(
        course.subject_id ? subjectMap[course.subject_id] : null,
        locale,
      ),
      authorName:
        profileNameByUserId.get(course.teacher_id) || unknownTeacherLabel(locale),
      status: getModerationStatus(course),
      createdAt: course.created_at,
      extra: truncateText(course.description, 70) || noDescriptionLabel(locale),
    })),

    ...tests.map((test) => ({
      id: test.id,
      type: 'test' as const,
      title: test.title,
      subjectName: subjectLabel(
        test.subject_id ? subjectMap[test.subject_id] : null,
        locale,
      ),
      authorName:
        profileNameByUserId.get(test.created_by) || unknownTeacherLabel(locale),
      status: getModerationStatus(test),
      createdAt: test.created_at,
      extra: `${questionCountByTestId.get(test.id) || 0} ${localizedText(
        locale,
        'сұрақ',
        'вопросов',
      )} · ${test.topic || noTopicLabel(locale)}`,
    })),
  ];

  return items.sort(compareCreatedAtDesc);
}

/* ================= USERS ================= */

export async function getUsersWithRoles(locale: Locale = 'kk') {
  await assertAdmin();

  const [roles, profiles] = await Promise.all([
    queryOrThrow(
      supabase
        .from('user_roles')
        .select('user_id, role, created_at')
        .order('created_at', { ascending: false }),
    ) as Promise<UserRoleRow[]>,

    queryOrThrow(
      supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url'),
    ) as Promise<ProfileRow[]>,
  ]);

  const profileMap = new Map(profiles.map((item) => [item.user_id, item]));

  return roles.map((role) => {
    const profile = profileMap.get(role.user_id);

    return {
      userId: role.user_id,
      role: role.role,
      createdAt: role.created_at,
      fullName: profile?.full_name || unknownLabel(locale),
      avatarUrl: profile?.avatar_url || null,
    };
  });
}
