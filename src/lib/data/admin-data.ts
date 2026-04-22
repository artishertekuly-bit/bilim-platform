import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

import { queryOrThrow, type Locale } from './common';

import type { ModerationItem, SubjectMap } from '@/lib/app-data-types';
import { getSubjects, subjectLabel } from './student-data';

function unknownLabel(locale: Locale) {
  return locale === 'ru' ? 'Не указано' : 'Белгісіз';
}

function unknownTeacherLabel(locale: Locale) {
  return locale === 'ru' ? 'Преподаватель не указан' : 'Мұғалім көрсетілмеген';
}

function noDescriptionLabel(locale: Locale) {
  return locale === 'ru' ? 'Описание отсутствует' : 'Сипаттама жоқ';
}

function noTopicLabel(locale: Locale) {
  return locale === 'ru' ? 'Тема не указана' : 'Тақырып көрсетілмеген';
}

function localizedText(locale: Locale, kk: string, ru: string) {
  return locale === 'ru' ? ru : kk;
}

function truncateText(value: string | null | undefined, limit = 70) {
  const text = (value || '').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export async function getAdminDashboard(locale: Locale = 'kk') {
  const [roles, courses, lessons, tests, reviews, subjects, attempts] =
    await Promise.all([
      queryOrThrow(supabase.from('user_roles').select('role')),
      queryOrThrow(supabase.from('courses').select('*')),
      queryOrThrow(supabase.from('lessons').select('*')),
      queryOrThrow(supabase.from('tests').select('*')),
      queryOrThrow(
        supabase
          .from('content_reviews')
          .select('*')
          .order('reviewed_at', { ascending: false })
      ),
      getSubjects(),
      queryOrThrow(supabase.from('test_attempts').select('*')),
    ]);

  const courseRows = courses as Tables<'courses'>[];
  const lessonRows = lessons as Tables<'lessons'>[];
  const testRows = tests as Tables<'tests'>[];
  const attemptRows = attempts as Tables<'test_attempts'>[];

  const testsBySubjectId = new Map<string, Tables<'tests'>[]>();
  testRows.forEach((test) => {
    if (!test.subject_id) return;
    const current = testsBySubjectId.get(test.subject_id) || [];
    current.push(test);
    testsBySubjectId.set(test.subject_id, current);
  });

  const attemptsByTestId = new Map<string, Tables<'test_attempts'>[]>();
  attemptRows.forEach((attempt) => {
    const current = attemptsByTestId.get(attempt.test_id) || [];
    current.push(attempt);
    attemptsByTestId.set(attempt.test_id, current);
  });

  const subjectStats = subjects.map((subject) => {
    const subjectCourses = courseRows.filter((course) => course.subject_id === subject.id);
    const subjectTests = testsBySubjectId.get(subject.id) || [];

    const subjectAttempts = subjectTests.flatMap((test) =>
      (attemptsByTestId.get(test.id) || []).filter((attempt) => attempt.score !== null)
    );

    return {
      name: subjectLabel(subject, locale),
      courses: subjectCourses.length,
      lessons: lessonRows.filter((lesson) => lesson.subject_id === subject.id).length,
      avgScore: subjectAttempts.length
        ? Math.round(
            subjectAttempts.reduce(
              (sum, item) => sum + Number(item.score || 0),
              0
            ) / subjectAttempts.length
          )
        : 0,
    };
  });

  const roleCounts = {
    students: roles.filter((row) => row.role === 'student').length,
    teachers: roles.filter((row) => row.role === 'teacher').length,
    parents: roles.filter((row) => row.role === 'parent').length,
    admins: roles.filter((row) => row.role === 'admin').length,
  };

  return {
    stats: {
      totalStudents: roleCounts.students,
      totalCourses: courseRows.length,
      totalLessons: lessonRows.length,
      totalTests: testRows.length,
    },
    roleCounts,
    contentStatus: {
      published: courseRows.filter((row) => row.status === 'published').length,
      underReview: courseRows.filter((row) => row.status === 'under_review').length,
      draft: courseRows.filter((row) => row.status === 'draft').length,
      archived: courseRows.filter((row) => row.status === 'archived').length,
    },
    pendingReviews: reviews.filter((review) => review.status === 'under_review'),
    subjectStats,
  };
}

export async function getModerationQueue(
  locale: Locale = 'kk'
): Promise<ModerationItem[]> {
  const [subjects, courses, tests, profiles, questions] = await Promise.all([
    getSubjects(),
    queryOrThrow(
      supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })
    ),
    queryOrThrow(
      supabase
        .from('tests')
        .select('*')
        .order('created_at', { ascending: false })
    ),
    queryOrThrow(
      supabase.from('profiles').select('user_id, full_name')
    ),
    queryOrThrow(
      supabase.from('test_questions').select('id, test_id')
    ),
  ]);

  const subjectMap = Object.fromEntries(
    subjects.map((subject) => [subject.id, subject])
  ) as SubjectMap;

  const profileMap = Object.fromEntries(
    profiles.map((profile) => [profile.user_id, profile.full_name])
  );

  const questionCountMap = new Map<string, number>();
  questions.forEach((question) => {
    questionCountMap.set(
      question.test_id,
      (questionCountMap.get(question.test_id) || 0) + 1
    );
  });

  const items: ModerationItem[] = [
    ...courses.map((course) => ({
      id: course.id,
      type: 'course' as const,
      title: course.title,
      subjectName: subjectLabel(
        course.subject_id ? subjectMap[course.subject_id] : null,
        locale
      ),
      authorName: profileMap[course.teacher_id] || unknownTeacherLabel(locale),
      status: course.status,
      createdAt: course.created_at,
      extra: truncateText(course.description, 70) || noDescriptionLabel(locale),
    })),

    ...tests.map((test) => ({
      id: test.id,
      type: 'test' as const,
      title: test.title,
      subjectName: subjectLabel(
        test.subject_id ? subjectMap[test.subject_id] : null,
        locale
      ),
      authorName: profileMap[test.created_by] || unknownTeacherLabel(locale),
      status: test.status,
      createdAt: test.created_at,
      extra: `${
        questionCountMap.get(test.id) || 0
      } ${localizedText(locale, 'сұрақ', 'вопросов')} · ${
        test.topic || noTopicLabel(locale)
      }`,
    })),
  ];

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getUsersWithRoles(locale: Locale = 'kk') {
  const [roles, profiles] = await Promise.all([
    queryOrThrow(
      supabase
        .from('user_roles')
        .select('user_id, role, created_at')
        .order('created_at', { ascending: false })
    ),
    queryOrThrow(
      supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
    ),
  ]);

  const profileMap = Object.fromEntries(
    profiles.map((item) => [item.user_id, item])
  );

  return roles.map((role) => ({
    userId: role.user_id,
    role: role.role,
    createdAt: role.created_at,
    fullName: profileMap[role.user_id]?.full_name || unknownLabel(locale),
    avatarUrl: profileMap[role.user_id]?.avatar_url || null,
  }));
}