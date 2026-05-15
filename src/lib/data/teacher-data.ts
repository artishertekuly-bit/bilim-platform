import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

import { queryOrThrow } from './common';
import {
  getCourseCatalog,
  getProfilesMap,
  getSubjects,
  subjectLabel,
} from './student-data';

import type {
  ContentStatus,
  CourseAccessType,
  CourseVisibility,
  CurrencyCode,
  SubjectMap,
  TeacherCourseWorkspace,
  TeacherDashboardData,
  TeacherStudentCourseRow,
  TeacherTestWorkspace,
} from '@/lib/app-data-types';

type CourseRow = Tables<'courses'>;
type ModuleRow = Tables<'modules'>;
type LessonRow = Tables<'lessons'>;
type EnrollmentRow = Tables<'course_enrollments'>;
type LessonProgressRow = Tables<'lesson_progress'>;
type TestRow = Tables<'tests'>;
type TestQuestionRow = Tables<'test_questions'>;
type TestAttemptScoreRow = Pick<Tables<'test_attempts'>, 'test_id' | 'score'>;
type LessonMiniQuizRow = Pick<Tables<'lesson_mini_quizzes'>, 'id' | 'lesson_id'>;
type LessonMiniQuizQuestionRow = Pick<Tables<'lesson_mini_quiz_questions'>, 'id' | 'quiz_id'>;

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function groupByCourseId<T extends { course_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();

  rows.forEach((row) => {
    const current = map.get(row.course_id) || [];
    current.push(row);
    map.set(row.course_id, current);
  });

  return map;
}

function groupLessonsByModuleId(rows: LessonRow[]) {
  const map = new Map<string, LessonRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.module_id) || [];
    current.push(row);
    map.set(row.module_id, current);
  });

  return map;
}

function groupProgressByStudentId(rows: LessonProgressRow[]) {
  const map = new Map<string, LessonProgressRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.student_id) || [];
    current.push(row);
    map.set(row.student_id, current);
  });

  return map;
}

function groupQuestionsByTestId(rows: TestQuestionRow[]) {
  const map = new Map<string, TestQuestionRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.test_id) || [];
    current.push(row);
    map.set(row.test_id, current);
  });

  return map;
}

function groupAttemptsByTestId(rows: TestAttemptScoreRow[]) {
  const map = new Map<string, TestAttemptScoreRow[]>();

  rows.forEach((row) => {
    const current = map.get(row.test_id) || [];
    current.push(row);
    map.set(row.test_id, current);
  });

  return map;
}

function getCourseAccessType(course: CourseRow): CourseAccessType {
  return course.access_type || 'public_free';
}

function getCourseVisibility(course: CourseRow): CourseVisibility {
  return course.visibility || 'public';
}

function getCoursePrice(course: CourseRow): number {
  return Number(course.price ?? 0);
}

function getCourseCurrency(course: CourseRow): CurrencyCode {
  return course.currency || 'KZT';
}

function getCourseEnrollmentOpen(course: CourseRow): boolean {
  return course.enrollment_open ?? true;
}

function getCourseMaxStudents(course: CourseRow): number | null {
  return course.max_students ?? null;
}

function normalizeContentStatus(status: ContentStatus | 'unknown'): ContentStatus {
  return status === 'unknown' ? 'draft' : status;
}

function sortBySortOrder<T extends { sort_order: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

function sortTestsByCreatedAtDesc(rows: TestRow[]) {
  return [...rows].sort((a, b) => {
    const left = new Date(a.created_at || 0).getTime();
    const right = new Date(b.created_at || 0).getTime();

    return right - left;
  });
}

function dedupeTests(rows: TestRow[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function getBestScore(attempts: TestAttemptScoreRow[]) {
  return attempts
    .filter((row) => row.score !== null)
    .reduce<number | null>((best, row) => {
      const score = Number(row.score);

      return best === null ? score : Math.max(best, score);
    }, null);
}

function getAverage(values: number[]) {
  if (values.length === 0) return 0;

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function getTeacherCourses(teacherId: string) {
  if (!teacherId) return [] as CourseRow[];

  return queryOrThrow(
    supabase
      .from('courses')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false }),
  ) as Promise<CourseRow[]>;
}

async function getTestsForTeacherCourses(input: {
  teacherId: string;
  courseIds: string[];
}) {
  const [ownTests, courseTests] = await Promise.all([
    queryOrThrow(
      supabase
        .from('tests')
        .select('*')
        .eq('created_by', input.teacherId)
        .order('created_at', { ascending: false }),
    ) as Promise<TestRow[]>,

    input.courseIds.length
      ? (queryOrThrow(
          supabase
            .from('tests')
            .select('*')
            .in('course_id', input.courseIds)
            .order('created_at', { ascending: false }),
        ) as Promise<TestRow[]>)
      : Promise.resolve([] as TestRow[]),
  ]);

  return sortTestsByCreatedAtDesc(dedupeTests([...ownTests, ...courseTests]));
}

async function getModulesForCourses(courseIds: string[]) {
  if (courseIds.length === 0) return [] as ModuleRow[];

  return queryOrThrow(
    supabase
      .from('modules')
      .select('*')
      .in('course_id', courseIds)
      .order('sort_order', { ascending: true }),
  ) as Promise<ModuleRow[]>;
}

async function getLessonsForModules(moduleIds: string[]) {
  if (moduleIds.length === 0) return [] as LessonRow[];

  return queryOrThrow(
    supabase
      .from('lessons')
      .select('*')
      .in('module_id', moduleIds)
      .order('sort_order', { ascending: true }),
  ) as Promise<LessonRow[]>;
}

async function getMiniQuizMetaForLessons(lessonIds: string[]) {
  if (lessonIds.length === 0) {
    return {
      quizByLessonId: new Map<string, LessonMiniQuizRow>(),
      questionCountByQuizId: new Map<string, number>(),
    };
  }

  const quizzes = (await queryOrThrow(
    supabase
      .from('lesson_mini_quizzes')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds),
  )) as LessonMiniQuizRow[];

  const quizIds = quizzes.map((quiz) => quiz.id);

  const questions = quizIds.length
    ? ((await queryOrThrow(
        supabase
          .from('lesson_mini_quiz_questions')
          .select('id, quiz_id')
          .in('quiz_id', quizIds),
      )) as LessonMiniQuizQuestionRow[])
    : [];

  const quizByLessonId = new Map(quizzes.map((quiz) => [quiz.lesson_id, quiz]));
  const questionCountByQuizId = new Map<string, number>();

  questions.forEach((question) => {
    questionCountByQuizId.set(
      question.quiz_id,
      (questionCountByQuizId.get(question.quiz_id) || 0) + 1,
    );
  });

  return {
    quizByLessonId,
    questionCountByQuizId,
  };
}

export async function getTeacherDashboard(
  teacherId: string,
  locale: 'kk' | 'ru' = 'kk',
): Promise<TeacherDashboardData> {
  const courses = await getCourseCatalog(undefined, teacherId, locale);
  const courseIds = courses.map((course) => course.id);

  const [tests, enrollments, modules] = await Promise.all([
    getTestsForTeacherCourses({
      teacherId,
      courseIds,
    }),

    courseIds.length
      ? (queryOrThrow(
          supabase
            .from('course_enrollments')
            .select('*')
            .in('course_id', courseIds),
        ) as Promise<EnrollmentRow[]>)
      : Promise.resolve([] as EnrollmentRow[]),

    getModulesForCourses(courseIds),
  ]);

  const lessons = await getLessonsForModules(modules.map((module) => module.id));
  const publishedLessonRows = lessons.filter((lesson) => lesson.is_published);

  const studentIds = unique(enrollments.map((row) => row.student_id));
  const testIds = tests.map((test) => test.id);

  const [profiles, progressRows, attemptRows] = await Promise.all([
    getProfilesMap(studentIds),

    studentIds.length
      ? (queryOrThrow(
          supabase
            .from('lesson_progress')
            .select('*')
            .in('student_id', studentIds),
        ) as Promise<LessonProgressRow[]>)
      : Promise.resolve([] as LessonProgressRow[]),

    testIds.length
      ? (queryOrThrow(
          supabase
            .from('test_attempts')
            .select('test_id, score')
            .in('test_id', testIds),
        ) as Promise<TestAttemptScoreRow[]>)
      : Promise.resolve([] as TestAttemptScoreRow[]),
  ]);

  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const moduleIdsByCourse = new Map<string, Set<string>>();

  modules.forEach((module) => {
    const current = moduleIdsByCourse.get(module.course_id) || new Set<string>();
    current.add(module.id);
    moduleIdsByCourse.set(module.course_id, current);
  });

  const lessonIdsByCourse = new Map<string, string[]>();

  courses.forEach((course) => {
    const moduleIds = moduleIdsByCourse.get(course.id) || new Set<string>();

    lessonIdsByCourse.set(
      course.id,
      publishedLessonRows
        .filter((lesson) => moduleIds.has(lesson.module_id))
        .map((lesson) => lesson.id),
    );
  });

  const progressByStudent = groupProgressByStudentId(progressRows);

  const students: TeacherStudentCourseRow[] = enrollments.map((enrollment) => {
    const course = courseMap.get(enrollment.course_id);
    const lessonIds = lessonIdsByCourse.get(enrollment.course_id) || [];

    const studentProgress = (progressByStudent.get(enrollment.student_id) || []).filter(
      (row) => row.is_completed && lessonIds.includes(row.lesson_id),
    );

    const lastCompletedAt =
      [...studentProgress].sort((a, b) =>
        (b.completed_at || '').localeCompare(a.completed_at || ''),
      )[0]?.completed_at || null;

    return {
      studentId: enrollment.student_id,
      studentName: profiles[enrollment.student_id]?.full_name || '—',
      avatarUrl: profiles[enrollment.student_id]?.avatar_url || null,
      courseId: enrollment.course_id,
      courseTitle: course?.title || '—',
      progressPct: Number(enrollment.progress_pct || 0),
      completedLessons: studentProgress.length,
      totalLessons: lessonIds.length,
      enrolledAt: enrollment.enrolled_at,
      lastCompletedAt,
    };
  });

  const courseProgress = courses.map((course) => {
    const rows = students.filter((row) => row.courseId === course.id);

    const avgProgress = rows.length
      ? getAverage(rows.map((row) => row.progressPct))
      : 0;

    const completionPct = rows.length
      ? Math.round(
          (rows.filter(
            (row) => row.totalLessons > 0 && row.completedLessons === row.totalLessons,
          ).length /
            rows.length) *
            100,
        )
      : 0;

    return {
      courseId: course.id,
      courseTitle: course.title,
      subjectName: course.subjectName,
      students: rows.length,
      lessons: course.lessons,
      avgProgress,
      completionPct,
      status: normalizeContentStatus(course.status),
    };
  });

  const scoredAttempts = attemptRows.filter((row) => row.score !== null);
  const avgScore = scoredAttempts.length
    ? getAverage(scoredAttempts.map((row) => Number(row.score || 0)))
    : 0;

  const avgCourseProgress = students.length
    ? getAverage(students.map((row) => row.progressPct))
    : 0;

  const completedLessons = students.reduce((sum, row) => sum + row.completedLessons, 0);

  return {
    courses,
    students,
    courseProgress,
    stats: {
      totalCourses: courses.length,
      totalStudents: new Set(enrollments.map((row) => row.student_id)).size,
      totalTests: tests.length,
      avgScore,
      avgCourseProgress,
      completedLessons,
    },
  };
}

export async function getTeacherCourseWorkspace(
  teacherId: string,
  locale: 'kk' | 'ru' = 'kk',
): Promise<TeacherCourseWorkspace> {
  const [subjects, courses] = await Promise.all([
    getSubjects(),
    getTeacherCourses(teacherId),
  ]);

  const courseIds = courses.map((course) => course.id);
  const modules = await getModulesForCourses(courseIds);
  const lessons = await getLessonsForModules(modules.map((module) => module.id));

  const [allEnrollments, profiles, miniQuizMeta] = await Promise.all([
    courseIds.length
      ? (queryOrThrow(
          supabase
            .from('course_enrollments')
            .select('course_id, progress_pct')
            .in('course_id', courseIds),
        ) as Promise<Array<Pick<EnrollmentRow, 'course_id' | 'progress_pct'>>>)
      : Promise.resolve([] as Array<Pick<EnrollmentRow, 'course_id' | 'progress_pct'>>),

    getProfilesMap(unique(courses.map((course) => course.teacher_id))),

    getMiniQuizMetaForLessons(lessons.map((lesson) => lesson.id)),
  ]);

  const subjectMap = Object.fromEntries(subjects.map((subject) => [subject.id, subject])) as SubjectMap;
  const lessonsByModuleId = groupLessonsByModuleId(lessons);
  const enrollmentsByCourseId = groupByCourseId(
    allEnrollments.map((row) => ({
      course_id: row.course_id,
      progress_pct: Number(row.progress_pct || 0),
    })),
  );

  const courseItems = courses.map((course) => {
    const courseModules = sortBySortOrder(
      modules.filter((module) => module.course_id === course.id),
    ).map((module) => ({
      id: module.id,
      courseId: module.course_id,
      title: module.title,
      sortOrder: module.sort_order,
      lessons: sortBySortOrder(lessonsByModuleId.get(module.id) || []).map((lesson) => {
        const quiz = miniQuizMeta.quizByLessonId.get(lesson.id);
        const miniQuizQuestionsCount = quiz
          ? miniQuizMeta.questionCountByQuizId.get(quiz.id) || 0
          : 0;

        return {
          id: lesson.id,
          moduleId: lesson.module_id,
          title: lesson.title,
          contentBody: lesson.content_body,
          practiceContent: lesson.practice_content,
          mediaUrl: lesson.media_url,
          sortOrder: lesson.sort_order,
          isPublished: lesson.is_published,
          subjectId: lesson.subject_id,

          hasMiniQuiz: Boolean(quiz),
          miniQuizQuestionsCount,
        };
      }),
    }));

    const enrollments = enrollmentsByCourseId.get(course.id) || [];
    const avgProgress = enrollments.length
      ? getAverage(enrollments.map((row) => Number(row.progress_pct || 0)))
      : 0;

    const accessType = getCourseAccessType(course);
    const visibility = getCourseVisibility(course);
    const price = getCoursePrice(course);
    const currency = getCourseCurrency(course);
    const enrollmentOpen = getCourseEnrollmentOpen(course);
    const maxStudents = getCourseMaxStudents(course);

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      subjectName: subjectLabel(
        course.subject_id ? subjectMap[course.subject_id] : null,
        locale,
      ),
      teacherId: course.teacher_id,
      teacherName: profiles[course.teacher_id]?.full_name || '—',
      teacherAvatarUrl: profiles[course.teacher_id]?.avatar_url || null,
      teacherBio: profiles[course.teacher_id]?.bio || null,
      teacherCoursesCount: courses.length,
      students: enrollments.length,
      lessons: courseModules.reduce((sum, module) => sum + module.lessons.length, 0),
      enrolled: false,
      progress: avgProgress,
      status: course.status,
      bookmarked: false,

      accessType,
      visibility,
      price,
      currency,
      publishedAt: course.published_at ?? null,
      enrollmentOpen,
      maxStudents,

      subjectId: course.subject_id,
      thumbnailUrl: course.thumbnail_url,
      modules: courseModules,
    };
  });

  return { courses: courseItems };
}

export async function getTeacherTestsWorkspace(
  teacherId: string,
  locale: 'kk' | 'ru' = 'kk',
): Promise<TeacherTestWorkspace> {
  const [subjects, teacherCourses] = await Promise.all([
    getSubjects(),
    getTeacherCourses(teacherId),
  ]);

  const tests = await getTestsForTeacherCourses({
    teacherId,
    courseIds: teacherCourses.map((course) => course.id),
  });

  const testIds = tests.map((test) => test.id);

  const [questions, attempts] = await Promise.all([
    testIds.length
      ? (queryOrThrow(
          supabase
            .from('test_questions')
            .select('*')
            .in('test_id', testIds)
            .order('sort_order', { ascending: true }),
        ) as Promise<TestQuestionRow[]>)
      : Promise.resolve([] as TestQuestionRow[]),

    testIds.length
      ? (queryOrThrow(
          supabase
            .from('test_attempts')
            .select('test_id, score')
            .in('test_id', testIds),
        ) as Promise<TestAttemptScoreRow[]>)
      : Promise.resolve([] as TestAttemptScoreRow[]),
  ]);

  const subjectMap = Object.fromEntries(subjects.map((subject) => [subject.id, subject])) as SubjectMap;
  const questionsByTestId = groupQuestionsByTestId(questions);
  const attemptsByTestId = groupAttemptsByTestId(attempts);

  return {
    tests: tests.map((test) => {
      const testQuestions = questionsByTestId.get(test.id) || [];
      const testAttempts = (attemptsByTestId.get(test.id) || []).filter(
        (row) => row.score !== null,
      );

      return {
        id: test.id,
        title: test.title,
        topic: test.topic,
        subjectName: subjectLabel(
          test.subject_id ? subjectMap[test.subject_id] : null,
          locale,
        ),
        questionCount: testQuestions.length,
        durationMinutes: test.duration_minutes,
        attempts: testAttempts.length,
        bestScore: getBestScore(testAttempts),
        createdBy: test.created_by,
        status: test.status,
        subjectId: test.subject_id,
        courseId: test.course_id,
        questions: testQuestions,
      };
    }),
  };
}