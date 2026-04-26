import { supabase } from '@/integrations/supabase/client';
import type {
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
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
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
      description: 'Қазіргі нәтижелерде жоғары қауіп байқалмайды. Келесі сабақтарды жоспар бойынша жалғастыруға болады.',
      courseId: input.courses[0]?.courseId || null,
      lessonId: null,
      priority: 'low',
    });
  }

  return recommendations;
}

async function getCourseMeta(courseIds: string[]) {
  if (courseIds.length === 0) return new Map<string, AnyRow>();

  const courses = await queryOrThrow(
    supabase
      .from('courses')
      .select('id, title, subject_id')
      .in('id', courseIds)
  ) as AnyRow[];

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
  if (courseIds.length === 0) return [];

  const modules = await queryOrThrow(
    supabase
      .from('modules')
      .select('id, course_id, title, sort_order')
      .in('course_id', courseIds)
  ) as AnyRow[];

  const moduleIds = modules.map((module) => module.id);

  if (moduleIds.length === 0) return [];

  const lessons = await queryOrThrow(
    supabase
      .from('lessons')
      .select('id, module_id, title, sort_order, is_published')
      .in('module_id', moduleIds)
  ) as AnyRow[];

  const moduleById = new Map(modules.map((module) => [module.id, module]));

  return lessons.map((lesson) => {
    const module = moduleById.get(lesson.module_id);

    return {
      ...lesson,
      course_id: module?.course_id || null,
      module_title: module?.title || null,
    };
  });
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
    lessonProgress,
    miniQuizAttempts,
    testAttempts,
    bookmarks,
    reviewLaterItems,
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

  const courseIds = unique([
    ...enrollments.map((item) => item.course_id).filter(Boolean),
    ...lessonProgress.map((item) => item.course_id).filter(Boolean),
    ...miniQuizAttempts.map((item) => item.course_id).filter(Boolean),
    ...bookmarks.map((item) => item.course_id).filter(Boolean),
    ...reviewLaterItems.map((item) => item.course_id).filter(Boolean),
  ]);

  const [courseMeta, lessons] = await Promise.all([
    getCourseMeta(courseIds),
    getCourseLessons(courseIds),
  ]);

  const lessonsByCourse = groupBy(lessons, (lesson) => lesson.course_id || 'unknown');
  const progressByCourse = groupBy(
    lessonProgress.filter((item) => Boolean(item.completed_at)),
    (item) => item.course_id || 'unknown'
  );
  const miniQuizByCourse = groupBy(miniQuizAttempts, (item) => item.course_id || 'unknown');
  const testsByCourse = groupBy(testAttempts, (item) => item.course_id || 'unknown');
  const bookmarksByCourse = groupBy(bookmarks, (item) => item.course_id || 'unknown');
  const reviewLaterByCourse = groupBy(reviewLaterItems, (item) => item.course_id || 'unknown');

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

    const progressPct = pct(completed.length, courseLessons.length);

    return {
      courseId,
      courseTitle: meta?.title || 'Курс',
      subjectName: meta?.subjectName || null,

      totalLessons: courseLessons.length,
      completedLessons: completed.length,
      progressPct,

      miniQuizAttempts: courseMiniQuizAttempts.length,
      miniQuizAvgScore: avg(miniScores),
      miniQuizPassed: miniPassed,
      miniQuizFailed: miniFailed,

      testAttempts: courseTestAttempts.length,
      testAvgScore: avg(testScores),

      savedLessons: courseBookmarks.length,
      reviewLaterItems: courseReviewLater.length,

      riskLevel: getRiskLevel({
        progressPct,
        miniQuizAvgScore: avg(miniScores),
        miniQuizFailed: miniFailed,
        reviewLaterItems: courseReviewLater.length,
      }),
    };
  });

  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  const miniQuizAttemptsByLesson = groupBy(
    miniQuizAttempts,
    (attempt) => attempt.lesson_id || 'unknown'
  );

  const reviewLaterLessonIds = new Set(
    reviewLaterItems.map((item) => item.lesson_id).filter(Boolean)
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

  const totals = {
    enrolledCourses: enrollments.length,
    totalLessons: courses.reduce((sum, course) => sum + course.totalLessons, 0),
    completedLessons: courses.reduce((sum, course) => sum + course.completedLessons, 0),
    progressPct: pct(
      courses.reduce((sum, course) => sum + course.completedLessons, 0),
      courses.reduce((sum, course) => sum + course.totalLessons, 0)
    ),

    miniQuizAttempts: miniQuizAttempts.length,
    miniQuizAvgScore: avg(miniQuizAttempts.map((item) => toNumber(item.score))),
    miniQuizPassed: miniQuizAttempts.filter((item) => item.passed).length,
    miniQuizFailed: miniQuizAttempts.filter((item) => !item.passed).length,

    testAttempts: testAttempts.length,
    testAvgScore: avg(testAttempts.map((item) => toNumber(item.score))),

    savedLessons: bookmarks.length,
    reviewLaterItems: reviewLaterItems.length,
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

export async function getCourseLearningSnapshot(
  courseId: string
): Promise<CourseLearningSnapshot> {
  const generatedAt = new Date().toISOString();

  const [courseRows, enrollments, lessons, progress, miniQuizAttempts, testAttempts, bookmarks, reviewLaterItems] =
    await Promise.all([
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

      queryOrThrow(
        supabase
          .from('test_attempts')
          .select('*')
      ) as Promise<AnyRow[]>,

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

  const quizzes = await queryOrThrow(
    supabase
      .from('lesson_mini_quizzes' as never)
      .select('*')
      .eq('course_id', courseId)
  ) as unknown as AnyRow[];

  const quizById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
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

  const completedLessons = progress.filter((item) => Boolean(item.completed_at)).length;

  const avgProgressPct = enrollments.length
    ? Math.round(
        enrollments.reduce((sum) => {
          const studentCompleted = progress.filter((item) => Boolean(item.completed_at)).length;
          return sum + pct(studentCompleted, lessons.length);
        }, 0) / enrollments.length
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
      completedLessons,
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