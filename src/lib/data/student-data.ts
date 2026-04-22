import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

import { isSoftSchemaError, queryOrThrow } from './common';
import type { Locale } from './common';

import type {
  CourseView,
  DashboardStudentData,
  LessonDetailView,
  LeaderboardView,
  ProfileMap,
  RpcMutationResponse,
  SubjectMap,
  SubjectRow,
  TestAttemptBreakdownItem,
  TestCatalogItem,
  LessonView,
} from '@/lib/app-data-types';

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
    courses,
    modules,
    lessons,
    tests,
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
  ]);

  const subjectMap = buildSubjectMap(subjects);
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const moduleMap = new Map(modules.map((module) => [module.id, module]));
  const testMap = new Map(tests.map((test) => [test.id, test]));
  const teacherIds = courses.map((course) => course.teacher_id);
  const profiles = await getProfilesMap(teacherIds);

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
      const siblings = (lessonsByModuleId.get(lesson.module_id) || [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
      const previous = siblings.find((item) => item.sort_order === lesson.sort_order - 1);
      const isLocked = Boolean(previous && !lessonProgressMap.get(previous.id)?.is_completed);

      return {
        id: lesson.id,
        title: lesson.title,
        subjectName: subjectLabel(
          lesson.subject_id ? subjectMap[lesson.subject_id] : null,
          locale
        ),
        moduleTitle: module?.title || '—',
        courseTitle: module ? courseMap.get(module.course_id)?.title || '—' : '—',
        sortOrder: lesson.sort_order,
        isCompleted: completed,
        isLocked,
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

export async function getCourseCatalog(
  userId?: string,
  teacherId?: string,
  locale: Locale = 'kk'
) {
  const [subjects, rawCourses, enrollments, modules, lessons, bookmarks] = await Promise.all([
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
  ]);

  const courses =
    userId && !teacherId
      ? rawCourses.filter((course) => course.status === 'published')
      : rawCourses;

  const subjectMap = buildSubjectMap(subjects);
  const profiles = await getProfilesMap(courses.map((course) => course.teacher_id));
  const moduleMap = new Map(modules.map((module) => [module.id, module.course_id]));

  const progressMap = new Map(
    (enrollments as Tables<'course_enrollments'>[]).map((row) => [row.course_id, row.progress_pct])
  );
  const enrolledIds = new Set(
    (enrollments as Tables<'course_enrollments'>[]).map((row) => row.course_id)
  );
  const bookmarkedIds = new Set(
    (bookmarks as Tables<'course_bookmarks'>[]).map((row) => row.course_id)
  );

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

  return courses.map((course) => ({
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
  })) satisfies CourseView[];
}

export async function enrollInCourse(studentId: string, courseId: string) {
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
        .select('id, module_id, sort_order')
        .eq('is_published', true)
    ),
    studentId
      ? queryOrThrow(supabase.from('lesson_progress').select('*').eq('student_id', studentId))
      : Promise.resolve([] as Tables<'lesson_progress'>[]),
  ]);

  const module = modules.find((row) => row.id === lesson.module_id) ?? null;

  const course: { id: string; title: string } | null = module
    ? await queryOrThrow(
        supabase
          .from('courses')
          .select('id, title')
          .eq('id', module.course_id)
          .single()
      )
    : null;

  const subjectMap = buildSubjectMap(subjects);
  const progressSet = new Set(
    (progress as Tables<'lesson_progress'>[])
      .filter((row) => row.is_completed)
      .map((row) => row.lesson_id)
  );

  const siblings = lessons
    .filter((row) => row.module_id === lesson.module_id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const previous = siblings.find((row) => row.sort_order === lesson.sort_order - 1);

  return {
    id: lesson.id,
    title: lesson.title,
    subjectName: subjectLabel(
      lesson.subject_id ? subjectMap[lesson.subject_id] : null,
      locale
    ),
    moduleTitle: module?.title || '—',
    courseTitle: course?.title || '—',
    contentBody: lesson.content_body,
    practiceContent: lesson.practice_content,
    mediaUrl: lesson.media_url,
    sortOrder: lesson.sort_order,
    isCompleted: progressSet.has(lesson.id),
    isLocked: Boolean(previous && !progressSet.has(previous.id)),
  };
}

export async function getLessonsForStudent(
  studentId?: string,
  locale: 'kk' | 'ru' = 'kk'
) {
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
          .select('id, title')
          .in('id', enrollments.map((row) => row.course_id))
      )
    : await queryOrThrow(supabase.from('courses').select('id, title'));

  const subjectMap = buildSubjectMap(subjects);
  const progressSet = new Set(
    (progress as Tables<'lesson_progress'>[])
      .filter((row) => row.is_completed)
      .map((row) => row.lesson_id)
  );
  const courseMap = new Map(courses.map((course) => [course.id, course.title]));
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
      const siblings = (lessonsByModuleId.get(lesson.module_id) || [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
      const previous = siblings.find((row) => row.sort_order === lesson.sort_order - 1);

      return {
        id: lesson.id,
        title: lesson.title,
        subjectName: subjectLabel(
          lesson.subject_id ? subjectMap[lesson.subject_id] : null,
          locale
        ),
        moduleTitle: module?.title || '—',
        courseTitle: module ? courseMap.get(module.course_id) || '—' : '—',
        sortOrder: lesson.sort_order,
        isCompleted: progressSet.has(lesson.id),
        isLocked: Boolean(previous && !progressSet.has(previous.id)),
      };
    }) as LessonView[];
}

export async function markLessonComplete(_studentId: string, lessonId: string) {
  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId });
  if (error) throw new Error(error.message);
  return (data || null) as RpcMutationResponse | null;
}

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

async function getParentLinkRequestRowsSafe(parentId: string) {
  const db = supabase as any;
  const { data, error } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .select('*')
    .eq('parent_id', parentId)
    .order('requested_at', { ascending: false });

  if (error) {
    if (isSoftSchemaError(error.message || '')) {
      return [] as Record<string, unknown>[];
    }

    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
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
  locale: Locale = 'kk'
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

  const db = supabase as any;

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
  const db = supabase as any;

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
  const db = supabase as any;

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

  const mergedRows = [
    ...((byStudentId.data as Record<string, unknown>[] | null) || []),
    ...((byEmailFallback.data as Record<string, unknown>[] | null) || []),
  ];

  const uniqueRows = Array.from(
    new Map(mergedRows.map((row) => [String(row.id || ''), row])).values()
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
  const db = supabase as any;

  const { data: rpcData, error: rpcError } = await db.rpc('accept_parent_link_request', {
    p_request_id: requestId,
  });

  if (!rpcError) {
    return rpcData;
  }

  if (!isMissingRpcError(rpcError.message || '')) {
    throw new Error(rpcError.message);
  }

  const { data: requestRow, error: requestError } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

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
  const db = supabase as any;

  const { data: rpcData, error: rpcError } = await db.rpc('decline_parent_link_request', {
    p_request_id: requestId,
  });

  if (!rpcError) {
    return rpcData;
  }

  if (!isMissingRpcError(rpcError.message || '')) {
    throw new Error(rpcError.message);
  }

  const { data: requestRow, error: requestError } = await db
    .from(PARENT_LINK_REQUESTS_TABLE)
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

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