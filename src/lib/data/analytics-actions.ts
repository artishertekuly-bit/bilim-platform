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

type AnyRow = Record<string, any>;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function avg(values: number[]) {
  const normalized = values.filter((value) => Number.isFinite(value));

  if (normalized.length === 0) return null;

  return Math.round(
    normalized.reduce((sum, value) => sum + value, 0) / normalized.length
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

function getCompletedProgressRows(rows: AnyRow[]) {
  return rows.filter((item) => Boolean(item.completed_at));
}

function getUniqueCompletedLessonCount(rows: AnyRow[]) {
  return countUnique(getCompletedProgressRows(rows).map((item) => item.lesson_id));
}

function getUniqueCompletionRecordCount(rows: AnyRow[]) {
  return unique(
    getCompletedProgressRows(rows)
      .map((item) => {
        if (!item.student_id || !item.lesson_id) return null;
        return `${item.student_id}:${item.lesson_id}`;
      })
      .filter(Boolean) as string[]
  ).length;
}

function resolveCourseIdFromLesson(
  row: AnyRow,
  lessonsById: Map<string, AnyRow>
) {
  if (row.course_id) return row.course_id as string;

  const lessonId = row.lesson_id || row.item_id;
  if (!lessonId) return null;

  return lessonsById.get(lessonId)?.course_id || null;
}

function attachCourseIdFromLesson(
  rows: AnyRow[],
  lessonsById: Map<string, AnyRow>
) {
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

  if (normalizedCourseIds.length === 0) return new Map<string, AnyRow>();

  const courses = (await queryOrThrow(
    supabase
      .from('courses')
      .select('id, title, subject_id')
      .in('id', normalizedCourseIds)
  )) as AnyRow[];

  const subjectIds = unique(
    courses.map((course) => course.subject_id).filter(Boolean)
  );

  const subjects = subjectIds.length
    ? ((await queryOrThrow(
        supabase
          .from('subjects')
          .select('id, name_kk, name_ru')
          .in('id', subjectIds)
      )) as AnyRow[])
    : [];

  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));

  return new Map(
    courses.map((course) => {
      const subject = subjectsById.get(course.subject_id);

      return [
        course.id,
        {
          ...course,
          subjectName: subject?.name_kk || subject?.name_ru || null,
        },
      ];
    })
  );
}

async function getCourseLessons(courseIds: string[]) {
  const normalizedCourseIds = unique(courseIds.filter(Boolean));

  if (normalizedCourseIds.length === 0) return [];

  const modules = (await queryOrThrow(
    supabase
      .from('modules')
      .select('id, course_id, title, sort_order')
      .in('course_id', normalizedCourseIds)
  )) as AnyRow[];

  const moduleIds = modules.map((module) => module.id);

  if (moduleIds.length === 0) return [];

  const lessons = (await queryOrThrow(
    supabase
      .from('lessons')
      .select('id, module_id, title, sort_order, is_published')
      .in('module_id', moduleIds)
  )) as AnyRow[];

  const moduleById = new Map(modules.map((module) => [module.id, module]));

  return lessons
    .map((lesson) => {
      const module = moduleById.get(lesson.module_id);

      return {
        ...lesson,
        course_id: module?.course_id || null,
        module_title: module?.title || null,
      };
    })
    .filter((lesson) => Boolean(lesson.course_id));
}

async function getTestCourseMap(testIds: string[]) {
  const normalizedTestIds = unique(testIds.filter(Boolean));

  if (normalizedTestIds.length === 0) return new Map<string, string>();

  const { data, error } = await supabase
    .from('tests')
    .select('id, course_id')
    .in('id', normalizedTestIds);

  if (error || !data) {
    /**
     * Кей schema-ларда tests.course_id болмауы мүмкін.
     * Мұндай жағдайда test analytics-ті course-level snapshot-қа араластырмаймыз.
     * Барлық platform test attempt-терін бір course-қа қосып жіберу — қате аналитика.
     */
    return new Map<string, string>();
  }

  return new Map(
    (data as AnyRow[])
      .filter((test) => Boolean(test.id && test.course_id))
      .map((test) => [test.id, test.course_id])
  );
}

async function getTestAttemptsForCourse(courseId: string) {
  const { data: tests, error: testsError } = await supabase
    .from('tests')
    .select('id, course_id')
    .eq('course_id', courseId);

  if (testsError || !tests) {
    /**
     * course_id жоқ schema үшін қауіпсіз fallback.
     * Wrong global test analytics көрсеткеннен гөрі бос test analytics дұрыс.
     */
    return [];
  }

  const testIds = (tests as AnyRow[]).map((test) => test.id).filter(Boolean);

  if (testIds.length === 0) return [];

  return (await queryOrThrow(
    supabase
      .from('test_attempts')
      .select('*')
      .in('test_id', testIds)
  )) as AnyRow[];
}

export async function getStudentLearningSnapshot(
  studentId: string
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
        .eq('student_id', studentId)
    ) as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('lesson_progress')
        .select('*')
        .eq('student_id', studentId)
    ) as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('lesson_mini_quiz_attempts' as never)
        .select('*')
        .eq('student_id', studentId)
    ) as unknown as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('test_attempts')
        .select('*')
        .eq('student_id', studentId)
    ) as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('student_lesson_bookmarks' as never)
        .select('*')
        .eq('student_id', studentId)
    ) as unknown as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('review_later_items' as never)
        .select('*')
        .eq('student_id', studentId)
    ) as unknown as Promise<AnyRow[]>,
  ]);

  const directCourseIds = unique([
    ...enrollments.map((item) => item.course_id).filter(Boolean),
    ...rawLessonProgress.map((item) => item.course_id).filter(Boolean),
    ...rawMiniQuizAttempts.map((item) => item.course_id).filter(Boolean),
    ...rawBookmarks.map((item) => item.course_id).filter(Boolean),
    ...rawReviewLaterItems.map((item) => item.course_id).filter(Boolean),
  ]);

  const initialLessons = await getCourseLessons(directCourseIds);
  const initialLessonsById = new Map(initialLessons.map((lesson) => [lesson.id, lesson]));

  const lessonProgress = attachCourseIdFromLesson(rawLessonProgress, initialLessonsById);
  const miniQuizAttempts = attachCourseIdFromLesson(rawMiniQuizAttempts, initialLessonsById);
  const bookmarks = attachCourseIdFromLesson(rawBookmarks, initialLessonsById);
  const reviewLaterItems = attachCourseIdFromLesson(rawReviewLaterItems, initialLessonsById);

  const testCourseMap = await getTestCourseMap(
    rawTestAttempts.map((attempt) => attempt.test_id).filter(Boolean)
  );

  const testAttempts = rawTestAttempts.map((attempt) => ({
    ...attempt,
    course_id: attempt.course_id || testCourseMap.get(attempt.test_id) || null,
  }));

  const courseIds = unique([
    ...directCourseIds,
    ...lessonProgress.map((item) => item.course_id).filter(Boolean),
    ...miniQuizAttempts.map((item) => item.course_id).filter(Boolean),
    ...bookmarks.map((item) => item.course_id).filter(Boolean),
    ...reviewLaterItems.map((item) => item.course_id).filter(Boolean),
    ...testAttempts.map((item) => item.course_id).filter(Boolean),
  ]);

  const [courseMeta, lessons] = await Promise.all([
    getCourseMeta(courseIds),
    getCourseLessons(courseIds),
  ]);

  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const normalizedLessonProgress = attachCourseIdFromLesson(lessonProgress, lessonsById);
  const normalizedMiniQuizAttempts = attachCourseIdFromLesson(miniQuizAttempts, lessonsById);
  const normalizedBookmarks = attachCourseIdFromLesson(bookmarks, lessonsById);
  const normalizedReviewLaterItems = attachCourseIdFromLesson(reviewLaterItems, lessonsById);

  const lessonsByCourse = groupBy(lessons, (lesson) => lesson.course_id || 'unknown');
  const progressByCourse = groupBy(
    getCompletedProgressRows(normalizedLessonProgress),
    (item) => item.course_id || 'unknown'
  );
  const miniQuizByCourse = groupBy(
    normalizedMiniQuizAttempts,
    (item) => item.course_id || 'unknown'
  );
  const testsByCourse = groupBy(testAttempts, (item) => item.course_id || 'unknown');
  const bookmarksByCourse = groupBy(
    normalizedBookmarks,
    (item) => item.course_id || 'unknown'
  );
  const reviewLaterByCourse = groupBy(
    normalizedReviewLaterItems,
    (item) => item.course_id || 'unknown'
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
    (attempt) => attempt.lesson_id || 'unknown'
  );

  const reviewLaterLessonIds = new Set(
    normalizedReviewLaterItems.map((item) => item.lesson_id).filter(Boolean)
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
    0
  );

  const totals = {
    enrolledCourses: enrollments.length,
    totalLessons,
    completedLessons,
    progressPct: pct(completedLessons, totalLessons),

    miniQuizAttempts: normalizedMiniQuizAttempts.length,
    miniQuizAvgScore: avg(
      normalizedMiniQuizAttempts.map((item) => toNumber(item.score))
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
  courseId: string
): Promise<CourseAnalyticsStudentOptionView[]> {
  if (!courseId) return [];

  const generatedCourseMeta = await getCourseMeta([courseId]);
  const courseMeta = generatedCourseMeta.get(courseId);

  const [
    enrollments,
    lessons,
    progress,
    miniQuizAttempts,
    testAttempts,
    bookmarks,
    reviewLaterItems,
  ] = await Promise.all([
    queryOrThrow(
      supabase
        .from('course_enrollments')
        .select('*')
        .eq('course_id', courseId)
    ) as Promise<AnyRow[]>,

    getCourseLessons([courseId]),

    queryOrThrow(
      supabase
        .from('lesson_progress')
        .select('*')
        .eq('course_id', courseId)
    ) as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('lesson_mini_quiz_attempts' as never)
        .select('*')
        .eq('course_id', courseId)
    ) as unknown as Promise<AnyRow[]>,

    getTestAttemptsForCourse(courseId),

    queryOrThrow(
      supabase
        .from('student_lesson_bookmarks' as never)
        .select('*')
        .eq('course_id', courseId)
    ) as unknown as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('review_later_items' as never)
        .select('*')
        .eq('course_id', courseId)
    ) as unknown as Promise<AnyRow[]>,
  ]);

  const studentIds = unique([
    ...enrollments.map((item) => item.student_id).filter(Boolean),
    ...progress.map((item) => item.student_id).filter(Boolean),
    ...miniQuizAttempts.map((item) => item.student_id).filter(Boolean),
    ...testAttempts.map((item) => item.student_id).filter(Boolean),
    ...bookmarks.map((item) => item.student_id).filter(Boolean),
    ...reviewLaterItems.map((item) => item.student_id).filter(Boolean),
  ]);

  if (studentIds.length === 0) {
    return [];
  }

  const profiles = (await queryOrThrow(
    supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', studentIds)
  )) as AnyRow[];

  const profilesByUserId = new Map(
    profiles.map((profile) => [profile.user_id, profile])
  );

  const completedProgress = getCompletedProgressRows(progress);
  const progressByStudent = groupBy(
    completedProgress.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id
  );

  const miniQuizByStudent = groupBy(
    miniQuizAttempts.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id
  );

  const testsByStudent = groupBy(
    testAttempts.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id
  );

  const bookmarksByStudent = groupBy(
    bookmarks.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id
  );

  const reviewLaterByStudent = groupBy(
    reviewLaterItems.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id
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
        studentCompletedProgress.map((item) => item.lesson_id)
      );

      const progressPct = pct(completedLessons, lessons.length);

      const miniScores = studentMiniQuizAttempts.map((item) =>
        toNumber(item.score)
      );

      const testScores = studentTestAttempts.map((item) =>
        toNumber(item.score)
      );

      const miniQuizAvgScore = avg(miniScores);
      const miniQuizPassed = studentMiniQuizAttempts.filter(
        (item) => item.passed
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
  courseId: string
): Promise<CourseLearningSnapshot> {
  const generatedAt = new Date().toISOString();

  const [
    courseRows,
    enrollments,
    lessons,
    progress,
    miniQuizAttempts,
    testAttempts,
    bookmarks,
    reviewLaterItems,
  ] = await Promise.all([
    queryOrThrow(
      supabase
        .from('courses')
        .select('id, title, subject_id')
        .eq('id', courseId)
    ) as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('course_enrollments')
        .select('*')
        .eq('course_id', courseId)
    ) as Promise<AnyRow[]>,

    getCourseLessons([courseId]),

    queryOrThrow(
      supabase
        .from('lesson_progress')
        .select('*')
        .eq('course_id', courseId)
    ) as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('lesson_mini_quiz_attempts' as never)
        .select('*')
        .eq('course_id', courseId)
    ) as unknown as Promise<AnyRow[]>,

    getTestAttemptsForCourse(courseId),

    queryOrThrow(
      supabase
        .from('student_lesson_bookmarks' as never)
        .select('*')
        .eq('course_id', courseId)
    ) as unknown as Promise<AnyRow[]>,

    queryOrThrow(
      supabase
        .from('review_later_items' as never)
        .select('*')
        .eq('course_id', courseId)
    ) as unknown as Promise<AnyRow[]>,
  ]);

  const course = courseRows[0] || null;

  const subjectRows = course?.subject_id
    ? ((await queryOrThrow(
        supabase
          .from('subjects')
          .select('id, name_kk, name_ru')
          .eq('id', course.subject_id)
      )) as AnyRow[])
    : [];

  const subject = subjectRows[0] || null;

  const quizzes = (await queryOrThrow(
    supabase
      .from('lesson_mini_quizzes' as never)
      .select('*')
      .eq('course_id', courseId)
  )) as unknown as AnyRow[];

  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  const attemptsByQuiz = groupBy(
    miniQuizAttempts,
    (attempt) => attempt.quiz_id || 'unknown'
  );

  const miniQuizzes: CourseMiniQuizAnalyticsView[] = quizzes.map((quiz) => {
    const attempts = attemptsByQuiz[quiz.id] || [];
    const passed = attempts.filter((attempt) => attempt.passed).length;
    const failed = attempts.length - passed;
    const lesson = lessonById.get(quiz.lesson_id);

    return {
      quizId: quiz.id,
      lessonId: quiz.lesson_id,
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
    enrollments.map((enrollment) => enrollment.student_id).filter(Boolean)
  );

  const fallbackProgressStudentIds = unique(
    completedProgress.map((item) => item.student_id).filter(Boolean)
  );

  const analyticsStudentIds =
    enrolledStudentIds.length > 0 ? enrolledStudentIds : fallbackProgressStudentIds;

  const progressByStudent = groupBy(
    completedProgress.filter((item) => Boolean(item.student_id)),
    (item) => item.student_id
  );

  const avgProgressPct = analyticsStudentIds.length
    ? Math.round(
        analyticsStudentIds.reduce((sum, studentId) => {
          const studentCompletedLessons = countUnique(
            (progressByStudent[studentId] || []).map((item) => item.lesson_id)
          );

          return sum + pct(studentCompletedLessons, lessons.length);
        }, 0) / analyticsStudentIds.length
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
