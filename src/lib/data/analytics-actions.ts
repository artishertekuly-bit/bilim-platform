import { supabase } from '@/integrations/supabase/client';
import type {
  CourseAnalyticsStudentOptionView,
  CourseLearningSnapshot,
  CourseMiniQuizAnalyticsView,
  LearningRecommendationView,
  LearningRiskLevel,
  StudentCourseAnalyticsView,
  StudentLearningSnapshot,
  StudentWeakLessonView,
  TeacherStudentLearningSnapshot,
} from '@/lib/app-data-types';
import { queryOrThrow } from './common';

type CourseMetaRow = {
  id: string;
  title: string;
  subject_id: string | null;
  subjectName: string | null;
};

type SubjectRow = {
  id: string;
  name_kk: string | null;
  name_ru: string | null;
};

type EnrollmentRow = {
  student_id: string | null;
  course_id: string | null;
};

type ModuleAnalyticsRow = {
  id: string;
  course_id: string | null;
  title: string | null;
  sort_order: number | null;
};

type LessonAnalyticsRow = {
  id: string;
  module_id: string | null;
  title: string | null;
  sort_order: number | null;
  is_published: boolean | null;
  course_id: string;
  module_title: string | null;
};

type LessonProgressAnalyticsRow = {
  id?: string | null;
  student_id: string | null;
  lesson_id: string | null;
  completed_at: string | null;
  created_at?: string | null;
  is_completed?: boolean | null;
  course_id?: string | null;
};

type MiniQuizAttemptAnalyticsRow = {
  id?: string | null;
  quiz_id: string | null;
  lesson_id: string | null;
  course_id?: string | null;
  student_id: string | null;
  score: number | null;
  passed: boolean | null;
  completed_at?: string | null;
  created_at?: string | null;
};

type TestAttemptAnalyticsRow = {
  id?: string | null;
  test_id: string | null;
  student_id: string | null;
  score: number | null;
  completed_at?: string | null;
  course_id?: string | null;
};

type BookmarkAnalyticsRow = {
  id?: string | null;
  student_id: string | null;
  lesson_id?: string | null;
  item_id?: string | null;
  course_id?: string | null;
  created_at?: string | null;
};

type ReviewLaterAnalyticsRow = {
  id?: string | null;
  student_id: string | null;
  lesson_id?: string | null;
  item_id?: string | null;
  course_id?: string | null;
  created_at?: string | null;
};

type ProfileAnalyticsRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type LessonMiniQuizAnalyticsRow = {
  id: string;
  lesson_id: string | null;
  course_id?: string | null;
  title: string | null;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function avg(values: number[]) {
  const normalized = values.filter((value) => Number.isFinite(value));

  if (normalized.length === 0) return null;

  return Math.round(
    normalized.reduce((sum, value) => sum + value, 0) / normalized.length,
  );
}

function pct(part: number, total: number) {
  if (!total) return 0;

  return Math.round((part / total) * 100);
}

function nullablePct(part: number, total: number) {
  if (!total) return null;

  return Math.round((part / total) * 100);
}

function getRiskLevel(input: {
  progressPct: number;
  miniQuizAvgScore: number | null;
  miniQuizFailed: number;
  reviewLaterItems: number;
}): LearningRiskLevel {
  if (
    input.progressPct < 30 ||
    (input.miniQuizAvgScore !== null && input.miniQuizAvgScore < 50) ||
    input.miniQuizFailed >= 3
  ) {
    return 'high';
  }

  if (
    input.progressPct < 60 ||
    (input.miniQuizAvgScore !== null && input.miniQuizAvgScore < 70) ||
    input.reviewLaterItems >= 3
  ) {
    return 'medium';
  }

  return 'low';
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);

    if (!acc[key]) acc[key] = [];
    acc[key].push(item);

    return acc;
  }, {});
}

function countUnique(items: Array<string | null | undefined>) {
  return unique(items.filter(Boolean) as string[]).length;
}

function getCompletedProgressRows(rows: LessonProgressAnalyticsRow[]) {
  return rows.filter((item) => Boolean(item.completed_at || item.is_completed));
}

function getUniqueCompletedLessonCount(rows: LessonProgressAnalyticsRow[]) {
  return countUnique(getCompletedProgressRows(rows).map((item) => item.lesson_id));
}

function getUniqueCompletionRecordCount(rows: LessonProgressAnalyticsRow[]) {
  return unique(
    getCompletedProgressRows(rows)
      .map((item) => {
        if (!item.student_id || !item.lesson_id) return null;

        return `${item.student_id}:${item.lesson_id}`;
      })
      .filter(Boolean) as string[],
  ).length;
}

type LessonReferenceRow = {
  lesson_id?: string | null;
  item_id?: string | null;
  course_id?: string | null;
};

function getLessonIdFromRow(row: LessonReferenceRow) {
  return row.lesson_id || row.item_id || null;
}

function resolveCourseIdFromLesson(
  row: LessonReferenceRow,
  lessonsById: Map<string, LessonAnalyticsRow>,
) {
  if (row.course_id) return row.course_id;

  const lessonId = getLessonIdFromRow(row);
  if (!lessonId) return null;

  return lessonsById.get(lessonId)?.course_id || null;
}

function attachCourseIdFromLesson<T extends LessonReferenceRow>(
  rows: T[],
  lessonsById: Map<string, LessonAnalyticsRow>,
): T[] {
  return rows.map((row) => ({
    ...row,
    course_id: resolveCourseIdFromLesson(row, lessonsById),
  }));
}

function buildRecommendations(input: {
  courses: StudentCourseAnalyticsView[];
  weakLessons: StudentWeakLessonView[];
}): LearningRecommendationView[] {
  const recommendations: LearningRecommendationView[] = [];

  input.weakLessons.slice(0, 5).forEach((lesson) => {
    recommendations.push({
      id: `review-${lesson.lessonId}`,
      type: lesson.failedAttempts > 0 ? 'retake_quiz' : 'review_lesson',
      title: `${lesson.lessonTitle} тақырыбын қайталау`,
      description: lesson.reason,
      courseId: lesson.courseId,
      lessonId: lesson.lessonId,
      priority: lesson.failedAttempts >= 2 ? 'high' : 'medium',
    });
  });

  input.courses
    .filter((course) => course.progressPct < 50)
    .slice(0, 3)
    .forEach((course) => {
      recommendations.push({
        id: `continue-${course.courseId}`,
        type: 'continue_course',
        title: `${course.courseTitle} курсын жалғастыру`,
        description: `Курс прогресі ${course.progressPct}%. Келесі сабақтарды ретімен аяқтау ұсынылады.`,
        courseId: course.courseId,
        lessonId: null,
        priority: course.progressPct < 25 ? 'high' : 'medium',
      });
    });

  if (recommendations.length === 0 && input.courses.length > 0) {
    recommendations.push({
      id: 'continue-learning',
      type: 'continue_course',
      title: 'Оқуды жалғастыру',
      description:
        'Қазіргі нәтижелерде жоғары қауіп байқалмайды. Келесі сабақтарды жоспар бойынша жалғастыруға болады.',
      courseId: input.courses[0]?.courseId || null,
      lessonId: null,
      priority: 'low',
    });
  }

  return recommendations;
}

async function getCourseMeta(courseIds: string[]) {
  const normalizedCourseIds = unique(courseIds.filter(Boolean));

  if (normalizedCourseIds.length === 0) return new Map<string, CourseMetaRow>();

  const courses = (await queryOrThrow(
    supabase
      .from('courses')
      .select('id, title, subject_id')
      .in('id', normalizedCourseIds),
  )) as Array<{
    id: string;
    title: string;
    subject_id: string | null;
  }>;

  const subjectIds = unique(
    courses.map((course) => course.subject_id).filter(Boolean) as string[],
  );

  const subjects = subjectIds.length
    ? ((await queryOrThrow(
        supabase
          .from('subjects')
          .select('id, name_kk, name_ru')
          .in('id', subjectIds),
      )) as SubjectRow[])
    : [];

  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));

  return new Map(
    courses.map((course) => {
      const subject = course.subject_id
        ? subjectsById.get(course.subject_id)
        : null;

      return [
        course.id,
        {
          ...course,
          subjectName: subject?.name_kk || subject?.name_ru || null,
        },
      ];
    }),
  );
}

async function getCourseLessons(courseIds: string[]) {
  const normalizedCourseIds = unique(courseIds.filter(Boolean));

  if (normalizedCourseIds.length === 0) return [];

  const modules = (await queryOrThrow(
    supabase
      .from('modules')
      .select('id, course_id, title, sort_order')
      .in('course_id', normalizedCourseIds),
  )) as ModuleAnalyticsRow[];

  const moduleIds = modules.map((module) => module.id).filter(Boolean);

  if (moduleIds.length === 0) return [];

  const lessons = (await queryOrThrow(
    supabase
      .from('lessons')
      .select('id, module_id, title, sort_order, is_published')
      .in('module_id', moduleIds),
  )) as Array<{
    id: string;
    module_id: string | null;
    title: string | null;
    sort_order: number | null;
    is_published: boolean | null;
  }>;

  const moduleById = new Map(modules.map((module) => [module.id, module]));

  return lessons
    .map((lesson) => {
      const module = lesson.module_id ? moduleById.get(lesson.module_id) : null;
      const courseId = module?.course_id || null;

      if (!courseId) return null;

      return {
        ...lesson,
        course_id: courseId,
        module_title: module?.title || null,
      };
    })
    .filter(Boolean) as LessonAnalyticsRow[];
}

async function getLessonsByIds(lessonIds: string[]) {
  const normalizedLessonIds = unique(lessonIds.filter(Boolean));

  if (normalizedLessonIds.length === 0) return [];

  const lessons = (await queryOrThrow(
    supabase
      .from('lessons')
      .select('id, module_id, title, sort_order, is_published')
      .in('id', normalizedLessonIds),
  )) as Array<{
    id: string;
    module_id: string | null;
    title: string | null;
    sort_order: number | null;
    is_published: boolean | null;
  }>;

  const moduleIds = unique(
    lessons.map((lesson) => lesson.module_id).filter(Boolean) as string[],
  );

  if (moduleIds.length === 0) return [];

  const modules = (await queryOrThrow(
    supabase
      .from('modules')
      .select('id, course_id, title, sort_order')
      .in('id', moduleIds),
  )) as ModuleAnalyticsRow[];

  const moduleById = new Map(modules.map((module) => [module.id, module]));

  return lessons
    .map((lesson) => {
      const module = lesson.module_id ? moduleById.get(lesson.module_id) : null;
      const courseId = module?.course_id || null;

      if (!courseId) return null;

      return {
        ...lesson,
        course_id: courseId,
        module_title: module?.title || null,
      };
    })
    .filter(Boolean) as LessonAnalyticsRow[];
}

async function getLessonProgressByLessonIds(input: {
  lessonIds: string[];
  studentId?: string;
}) {
  const lessonIds = unique(input.lessonIds.filter(Boolean));

  if (lessonIds.length === 0) return [];

  let query = supabase
    .from('lesson_progress')
    .select('*')
    .in('lesson_id', lessonIds);

  if (input.studentId) {
    query = query.eq('student_id', input.studentId);
  }

  return (await queryOrThrow(query)) as LessonProgressAnalyticsRow[];
}

async function getMiniQuizAttemptsByLessonIds(input: {
  lessonIds: string[];
  studentId?: string;
}) {
  const lessonIds = unique(input.lessonIds.filter(Boolean));

  if (lessonIds.length === 0) return [];

  let query = supabase
    .from('lesson_mini_quiz_attempts' as never)
    .select('*')
    .in('lesson_id', lessonIds);

  if (input.studentId) {
    query = query.eq('student_id', input.studentId);
  }

  return (await queryOrThrow(query)) as unknown as MiniQuizAttemptAnalyticsRow[];
}

async function getBookmarksByLessonIds(input: {
  lessonIds: string[];
  studentId?: string;
}) {
  const lessonIds = unique(input.lessonIds.filter(Boolean));

  if (lessonIds.length === 0) return [];

  let query = supabase
    .from('student_lesson_bookmarks' as never)
    .select('*')
    .in('lesson_id', lessonIds);

  if (input.studentId) {
    query = query.eq('student_id', input.studentId);
  }

  return (await queryOrThrow(query)) as unknown as BookmarkAnalyticsRow[];
}

async function getReviewLaterItemsByLessonIds(input: {
  lessonIds: string[];
  studentId?: string;
}) {
  const lessonIds = unique(input.lessonIds.filter(Boolean));

  if (lessonIds.length === 0) return [];

  let query = supabase
    .from('review_later_items' as never)
    .select('*')
    .in('lesson_id', lessonIds);

  if (input.studentId) {
    query = query.eq('student_id', input.studentId);
  }

  return (await queryOrThrow(query)) as unknown as ReviewLaterAnalyticsRow[];
}

async function getTestCourseMap(testIds: string[]) {
  const normalizedTestIds = unique(testIds.filter(Boolean));

  if (normalizedTestIds.length === 0) return new Map<string, string>();

  const { data, error } = await supabase
    .from('tests' as never)
    .select('id, course_id')
    .in('id', normalizedTestIds);

  if (error || !data) {
    return new Map<string, string>();
  }

  return new Map(
    (data as unknown as Array<{ id?: string | null; course_id?: string | null }>)
      .filter((test) => Boolean(test.id && test.course_id))
      .map((test) => [test.id as string, test.course_id as string]),
  );
}

async function getTestAttemptsForCourse(courseId: string) {
  const { data: tests, error: testsError } = await supabase
    .from('tests' as never)
    .select('id, course_id')
    .eq('course_id', courseId);

  if (testsError || !tests) {
    return [];
  }

  const testIds = (tests as unknown as Array<{ id?: string | null }>)
    .map((test) => test.id)
    .filter(Boolean) as string[];

  if (testIds.length === 0) return [];

  return (await queryOrThrow(
    supabase
      .from('test_attempts')
      .select('*')
      .in('test_id', testIds),
  )) as TestAttemptAnalyticsRow[];
}

export async function getStudentLearningSnapshot(
  studentId: string,
): Promise<StudentLearningSnapshot> {
  const generatedAt = new Date().toISOString();

  if (!studentId) {
    return {
      studentId,
      generatedAt,
      totals: {
        enrolledCourses: 0,
        totalLessons: 0,
        completedLessons: 0,
        progressPct: 0,
        miniQuizAttempts: 0,
        miniQuizAvgScore: null,
        miniQuizPassed: 0,
        miniQuizFailed: 0,
        testAttempts: 0,
        testAvgScore: null,
        savedLessons: 0,
        reviewLaterItems: 0,
      },
      courses: [],
      weakLessons: [],
      recommendations: [],
    };
  }

  const [
    enrollments,
    rawLessonProgress,
    rawMiniQuizAttempts,
    rawTestAttempts,
    rawBookmarks,
    rawReviewLaterItems,
  ] = await Promise.all([
    queryOrThrow(
      supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', studentId),
    ) as Promise<EnrollmentRow[]>,

    queryOrThrow(
      supabase
        .from('lesson_progress')
        .select('*')
        .eq('student_id', studentId),
    ) as Promise<LessonProgressAnalyticsRow[]>,

    queryOrThrow(
      supabase
        .from('lesson_mini_quiz_attempts' as never)
        .select('*')
        .eq('student_id', studentId),
    ) as unknown as Promise<MiniQuizAttemptAnalyticsRow[]>,

    queryOrThrow(
      supabase
        .from('test_attempts')
        .select('*')
        .eq('student_id', studentId),
    ) as Promise<TestAttemptAnalyticsRow[]>,

    queryOrThrow(
      supabase
        .from('student_lesson_bookmarks' as never)
        .select('*')
        .eq('student_id', studentId),
    ) as unknown as Promise<BookmarkAnalyticsRow[]>,

    queryOrThrow(
      supabase
        .from('review_later_items' as never)
        .select('*')
        .eq('student_id', studentId),
    ) as unknown as Promise<ReviewLaterAnalyticsRow[]>,
  ]);

  const discoveredLessonIds = unique([
    ...rawLessonProgress.map((item) => item.lesson_id).filter(Boolean),
    ...rawMiniQuizAttempts.map((item) => item.lesson_id).filter(Boolean),
    ...rawBookmarks.map((item) => item.lesson_id || item.item_id).filter(Boolean),
    ...rawReviewLaterItems.map((item) => item.lesson_id || item.item_id).filter(Boolean),
  ] as string[]);

  const discoveredLessons = await getLessonsByIds(discoveredLessonIds);
  const discoveredLessonsById = new Map(
    discoveredLessons.map((lesson) => [lesson.id, lesson]),
  );

  const lessonProgress = attachCourseIdFromLesson(
    rawLessonProgress,
    discoveredLessonsById,
  );
  const miniQuizAttempts = attachCourseIdFromLesson(
    rawMiniQuizAttempts,
    discoveredLessonsById,
  );
  const bookmarks = attachCourseIdFromLesson(rawBookmarks, discoveredLessonsById);
  const reviewLaterItems = attachCourseIdFromLesson(
    rawReviewLaterItems,
    discoveredLessonsById,
  );

  const testCourseMap = await getTestCourseMap(
    rawTestAttempts.map((attempt) => attempt.test_id).filter(Boolean) as string[],
  );

  const testAttempts = rawTestAttempts.map((attempt) => ({
    ...attempt,
    course_id: attempt.course_id || testCourseMap.get(attempt.test_id || '') || null,
  }));

  const courseIds = unique([
    ...enrollments.map((item) => item.course_id).filter(Boolean),
    ...discoveredLessons.map((item) => item.course_id).filter(Boolean),
    ...lessonProgress.map((item) => item.course_id).filter(Boolean),
    ...miniQuizAttempts.map((item) => item.course_id).filter(Boolean),
    ...bookmarks.map((item) => item.course_id).filter(Boolean),
    ...reviewLaterItems.map((item) => item.course_id).filter(Boolean),
    ...testAttempts.map((item) => item.course_id).filter(Boolean),
  ] as string[]);

  const [courseMeta, lessons] = await Promise.all([
    getCourseMeta(courseIds),
    getCourseLessons(courseIds),
  ]);

  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const normalizedLessonProgress = attachCourseIdFromLesson(
    lessonProgress,
    lessonsById,
  );
  const normalizedMiniQuizAttempts = attachCourseIdFromLesson(
    miniQuizAttempts,
    lessonsById,
  );
  const normalizedBookmarks = attachCourseIdFromLesson(bookmarks, lessonsById);
  const normalizedReviewLaterItems = attachCourseIdFromLesson(
    reviewLaterItems,
    lessonsById,
  );

  const lessonsByCourse = groupBy(lessons, (lesson) => lesson.course_id || 'unknown');
  const progressByCourse = groupBy(
    getCompletedProgressRows(normalizedLessonProgress),
    (item) => item.course_id || 'unknown',
  );
  const miniQuizByCourse = groupBy(
    normalizedMiniQuizAttempts,
    (item) => item.course_id || 'unknown',
  );
  const testsByCourse = groupBy(testAttempts, (item) => item.course_id || 'unknown');
  const bookmarksByCourse = groupBy(
    normalizedBookmarks,
    (item) => item.course_id || 'unknown',
  );
  const reviewLaterByCourse = groupBy(
    normalizedReviewLaterItems,
    (item) => item.course_id || 'unknown',
  );

  const courses: StudentCourseAnalyticsView[] = courseIds.map((courseId) => {
    const meta = courseMeta.get(courseId);
    const courseLessons = lessonsByCourse[courseId] || [];
    const completed = progressByCourse[courseId] || [];
    const courseMiniQuizAttempts = miniQuizByCourse[courseId] || [];
    const courseTestAttempts = testsByCourse[courseId] || [];
    const courseBookmarks = bookmarksByCourse[courseId] || [];
    const courseReviewLater = reviewLaterByCourse[courseId] || [];

    const miniScores = courseMiniQuizAttempts.map((item) => toNumber(item.score));
    const testScores = courseTestAttempts.map((item) => toNumber(item.score));
    const miniPassed = courseMiniQuizAttempts.filter((item) => item.passed).length;
    const miniFailed = courseMiniQuizAttempts.length - miniPassed;

    const completedLessons = countUnique(completed.map((item) => item.lesson_id));
    const progressPct = pct(completedLessons, courseLessons.length);
    const miniQuizAvgScore = avg(miniScores);

    return {
      courseId,
      courseTitle: meta?.title || 'Курс',
      subjectName: meta?.subjectName || null,

      totalLessons: courseLessons.length,
      completedLessons,
      progressPct,

      miniQuizAttempts: courseMiniQuizAttempts.length,
      miniQuizAvgScore,
      miniQuizPassed: miniPassed,
      miniQuizFailed: miniFailed,

      testAttempts: courseTestAttempts.length,
      testAvgScore: avg(testScores),

      savedLessons: courseBookmarks.length,
      reviewLaterItems: courseReviewLater.length,

      riskLevel: getRiskLevel({
        progressPct,
        miniQuizAvgScore,
        miniQuizFailed: miniFailed,
        reviewLaterItems: courseReviewLater.length,
      }),
    };
  });

  const miniQuizAttemptsByLesson = groupBy(
    normalizedMiniQuizAttempts,
    (attempt) => attempt.lesson_id || 'unknown',
  );

  const reviewLaterLessonIds = new Set(
    normalizedReviewLaterItems.map((item) => item.lesson_id).filter(Boolean),
  );

  const weakLessons: StudentWeakLessonView[] = Object.entries(miniQuizAttemptsByLesson)
    .map(([lessonId, attempts]) => {
      const lesson = lessonsById.get(lessonId);
      if (!lesson) return null;

      const scores = attempts.map((attempt) => toNumber(attempt.score));
      const failedAttempts = attempts.filter((attempt) => !attempt.passed).length;
      const avgScore = avg(scores);
      const reviewLater = reviewLaterLessonIds.has(lessonId);

      if (!reviewLater && failedAttempts === 0 && (avgScore === null || avgScore >= 70)) {
        return null;
      }

      const meta = courseMeta.get(lesson.course_id);

      return {
        lessonId,
        courseId: lesson.course_id,
        lessonTitle: lesson.title || 'Сабақ',
        courseTitle: meta?.title || 'Курс',
        subjectName: meta?.subjectName || null,
        reason:
          failedAttempts > 0
            ? `Mini quiz бойынша ${failedAttempts} сәтсіз attempt бар.`
            : 'Оқушы бұл сабақты кейін қайталауға белгілеген.',
        miniQuizAvgScore: avgScore,
        failedAttempts,
        reviewLater,
      };
    })
    .filter(Boolean) as StudentWeakLessonView[];

  const totalLessons = courses.reduce((sum, course) => sum + course.totalLessons, 0);
  const completedLessons = courses.reduce(
    (sum, course) => sum + course.completedLessons,
    0,
  );

  const totals = {
    enrolledCourses: enrollments.length,
    totalLessons,
    completedLessons,
    progressPct: pct(completedLessons, totalLessons),

    miniQuizAttempts: normalizedMiniQuizAttempts.length,
    miniQuizAvgScore: avg(
      normalizedMiniQuizAttempts.map((item) => toNumber(item.score)),
    ),
    miniQuizPassed: normalizedMiniQuizAttempts.filter((item) => item.passed).length,
    miniQuizFailed: normalizedMiniQuizAttempts.filter((item) => !item.passed).length,

    testAttempts: testAttempts.length,
    testAvgScore: avg(testAttempts.map((item) => toNumber(item.score))),

    savedLessons: normalizedBookmarks.length,
    reviewLaterItems: normalizedReviewLaterItems.length,
  };

  return {
    studentId,
    generatedAt,
    totals,
    courses,
    weakLessons,
    recommendations: buildRecommendations({
      courses,
      weakLessons,
    }),
  };
}

export async function getTeacherStudentLearningSnapshot(input: {
  teacherId: string;
  studentId: string;
  courseId?: string | null;
}): Promise<TeacherStudentLearningSnapshot> {
  const snapshot = await getStudentLearningSnapshot(input.studentId);

  const filteredCourses = input.courseId
    ? snapshot.courses.filter((course) => course.courseId === input.courseId)
    : snapshot.courses;

  const filteredWeakLessons = input.courseId
    ? snapshot.weakLessons.filter((lesson) => lesson.courseId === input.courseId)
    : snapshot.weakLessons;

  const filteredRecommendations = input.courseId
    ? snapshot.recommendations.filter((item) => item.courseId === input.courseId)
    : snapshot.recommendations;

  return {
    ...snapshot,
    teacherId: input.teacherId,
    courseId: input.courseId || null,
    courses: filteredCourses,
    weakLessons: filteredWeakLessons,
    recommendations: filteredRecommendations,
    teacherScopeNote:
      'Бұл snapshot тек оқу нәтижелері мен progress деректеріне негізделеді. Бұл автоматты баға немесе педагогикалық үкім емес.',
  };
}

export async function getCourseAnalyticsStudents(
  courseId: string,
): Promise<CourseAnalyticsStudentOptionView[]> {
  if (!courseId) return [];

  const generatedCourseMeta = await getCourseMeta([courseId]);
  const courseMeta = generatedCourseMeta.get(courseId);

  const [enrollments, lessons, testAttempts] = await Promise.all([
    queryOrThrow(
      supabase
        .from('course_enrollments')
        .select('*')
        .eq('course_id', courseId),
    ) as Promise<EnrollmentRow[]>,

    getCourseLessons([courseId]),

    getTestAttemptsForCourse(courseId),
  ]);

  const lessonIds = lessons.map((lesson) => lesson.id);

  const [progress, miniQuizAttempts, bookmarks, reviewLaterItems] = await Promise.all([
    getLessonProgressByLessonIds({ lessonIds }),
    getMiniQuizAttemptsByLessonIds({ lessonIds }),
    getBookmarksByLessonIds({ lessonIds }),
    getReviewLaterItemsByLessonIds({ lessonIds }),
  ]);

  const studentIds = unique([
    ...enrollments.map((item) => item.student_id).filter(Boolean),
    ...progress.map((item) => item.student_id).filter(Boolean),
    ...miniQuizAttempts.map((item) => item.student_id).filter(Boolean),
    ...testAttempts.map((item) => item.student_id).filter(Boolean),
    ...bookmarks.map((item) => item.student_id).filter(Boolean),
    ...reviewLaterItems.map((item) => item.student_id).filter(Boolean),
  ] as string[]);

  if (studentIds.length === 0) {
    return [];
  }

  const profiles = (await queryOrThrow(
    supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', studentIds),
  )) as ProfileAnalyticsRow[];

  const profilesByUserId = new Map(
    profiles.map((profile) => [profile.user_id, profile]),
  );

  const completedProgress = getCompletedProgressRows(progress);
  const progressByStudent = groupBy(
    completedProgress.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id || 'unknown',
  );

  const miniQuizByStudent = groupBy(
    miniQuizAttempts.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id || 'unknown',
  );

  const testsByStudent = groupBy(
    testAttempts.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id || 'unknown',
  );

  const bookmarksByStudent = groupBy(
    bookmarks.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id || 'unknown',
  );

  const reviewLaterByStudent = groupBy(
    reviewLaterItems.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id || 'unknown',
  );

  return studentIds
    .map((studentId) => {
      const profile = profilesByUserId.get(studentId) || null;

      const studentCompletedProgress = progressByStudent[studentId] || [];
      const studentMiniQuizAttempts = miniQuizByStudent[studentId] || [];
      const studentTestAttempts = testsByStudent[studentId] || [];
      const studentBookmarks = bookmarksByStudent[studentId] || [];
      const studentReviewLater = reviewLaterByStudent[studentId] || [];

      const completedLessons = countUnique(
        studentCompletedProgress.map((item) => item.lesson_id),
      );

      const progressPct = pct(completedLessons, lessons.length);

      const miniScores = studentMiniQuizAttempts.map((item) =>
        toNumber(item.score),
      );

      const testScores = studentTestAttempts.map((item) =>
        toNumber(item.score),
      );

      const miniQuizAvgScore = avg(miniScores);
      const miniQuizPassed = studentMiniQuizAttempts.filter(
        (item) => item.passed,
      ).length;
      const miniQuizFailed = studentMiniQuizAttempts.length - miniQuizPassed;

      return {
        studentId,

        fullName: profile?.full_name || null,
        avatarUrl: profile?.avatar_url || null,

        courseId,
        courseTitle: courseMeta?.title || 'Курс',

        totalLessons: lessons.length,
        completedLessons,
        progressPct,

        miniQuizAttempts: studentMiniQuizAttempts.length,
        miniQuizAvgScore,
        miniQuizPassed,
        miniQuizFailed,

        testAttempts: studentTestAttempts.length,
        testAvgScore: avg(testScores),

        savedLessons: studentBookmarks.length,
        reviewLaterItems: studentReviewLater.length,

        riskLevel: getRiskLevel({
          progressPct,
          miniQuizAvgScore,
          miniQuizFailed,
          reviewLaterItems: studentReviewLater.length,
        }),
      };
    })
    .sort((a, b) => {
      const riskOrder: Record<LearningRiskLevel, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };

      const byRisk = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      if (byRisk !== 0) return byRisk;

      return a.progressPct - b.progressPct;
    });
}

export async function getCourseLearningSnapshot(
  courseId: string,
): Promise<CourseLearningSnapshot> {
  const generatedAt = new Date().toISOString();

  const [courseRows, enrollments, lessons, testAttempts] = await Promise.all([
    queryOrThrow(
      supabase
        .from('courses')
        .select('id, title, subject_id')
        .eq('id', courseId),
    ) as Promise<
      Array<{
        id: string;
        title: string;
        subject_id: string | null;
      }>
    >,

    queryOrThrow(
      supabase
        .from('course_enrollments')
        .select('*')
        .eq('course_id', courseId),
    ) as Promise<EnrollmentRow[]>,

    getCourseLessons([courseId]),

    getTestAttemptsForCourse(courseId),
  ]);

  const lessonIds = lessons.map((lesson) => lesson.id);

  const [progress, miniQuizAttempts, bookmarks, reviewLaterItems, quizzes] =
    await Promise.all([
      getLessonProgressByLessonIds({ lessonIds }),
      getMiniQuizAttemptsByLessonIds({ lessonIds }),
      getBookmarksByLessonIds({ lessonIds }),
      getReviewLaterItemsByLessonIds({ lessonIds }),
      lessonIds.length
        ? ((queryOrThrow(
            supabase
              .from('lesson_mini_quizzes' as never)
              .select('*')
              .in('lesson_id', lessonIds),
          ) as unknown) as Promise<LessonMiniQuizAnalyticsRow[]>)
        : Promise.resolve([]),
    ]);

  const course = courseRows[0] || null;

  const subjectRows = course?.subject_id
    ? ((await queryOrThrow(
        supabase
          .from('subjects')
          .select('id, name_kk, name_ru')
          .eq('id', course.subject_id),
      )) as SubjectRow[])
    : [];

  const subject = subjectRows[0] || null;

  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  const attemptsByQuiz = groupBy(
    miniQuizAttempts,
    (attempt) => attempt.quiz_id || 'unknown',
  );

  const miniQuizzes: CourseMiniQuizAnalyticsView[] = quizzes.map((quiz) => {
    const attempts = attemptsByQuiz[quiz.id] || [];
    const passed = attempts.filter((attempt) => attempt.passed).length;
    const failed = attempts.length - passed;
    const lesson = quiz.lesson_id ? lessonById.get(quiz.lesson_id) : null;

    return {
      quizId: quiz.id,
      lessonId: quiz.lesson_id || '',
      lessonTitle: lesson?.title || quiz.title || 'Сабақ',
      attempts: attempts.length,
      avgScore: avg(attempts.map((attempt) => toNumber(attempt.score))),
      passed,
      failed,
      passRatePct: nullablePct(passed, attempts.length),
    };
  });

  const completedLessonRecords = getUniqueCompletionRecordCount(progress);
  const completedProgress = getCompletedProgressRows(progress);

  const enrolledStudentIds = unique(
    enrollments.map((enrollment) => enrollment.student_id).filter(Boolean) as string[],
  );

  const fallbackProgressStudentIds = unique(
    completedProgress.map((item) => item.student_id).filter(Boolean) as string[],
  );

  const analyticsStudentIds =
    enrolledStudentIds.length > 0 ? enrolledStudentIds : fallbackProgressStudentIds;

  const progressByStudent = groupBy(
    completedProgress.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id || 'unknown',
  );

  const avgProgressPct = analyticsStudentIds.length
    ? Math.round(
        analyticsStudentIds.reduce((sum, studentId) => {
          const studentCompletedLessons = countUnique(
            (progressByStudent[studentId] || []).map((item) => item.lesson_id),
          );

          return sum + pct(studentCompletedLessons, lessons.length);
        }, 0) / analyticsStudentIds.length,
      )
    : 0;

  const miniPassed = miniQuizAttempts.filter((attempt) => attempt.passed).length;

  const difficultLessons: StudentWeakLessonView[] = miniQuizzes
    .filter((quiz) => quiz.attempts > 0 && (quiz.passRatePct ?? 100) < 70)
    .map((quiz) => ({
      lessonId: quiz.lessonId,
      courseId,
      lessonTitle: quiz.lessonTitle,
      courseTitle: course?.title || 'Курс',
      subjectName: subject?.name_kk || subject?.name_ru || null,
      reason: `Mini quiz pass rate ${quiz.passRatePct ?? 0}%. Мұғалім бұл сабақты қайта қарап, түсіндіруді күшейте алады.`,
      miniQuizAvgScore: quiz.avgScore,
      failedAttempts: quiz.failed,
      reviewLater: false,
    }));

  return {
    courseId,
    courseTitle: course?.title || 'Курс',
    subjectName: subject?.name_kk || subject?.name_ru || null,
    generatedAt,

    totals: {
      students: enrollments.length,
      lessons: lessons.length,
      completedLessons: completedLessonRecords,
      avgProgressPct,

      miniQuizAttempts: miniQuizAttempts.length,
      miniQuizAvgScore: avg(miniQuizAttempts.map((attempt) => toNumber(attempt.score))),
      miniQuizPassRatePct: nullablePct(miniPassed, miniQuizAttempts.length),

      testAttempts: testAttempts.length,
      testAvgScore: avg(testAttempts.map((attempt) => toNumber(attempt.score))),

      savedLessons: bookmarks.length,
      reviewLaterItems: reviewLaterItems.length,
    },

    miniQuizzes,
    difficultLessons,
  };
}