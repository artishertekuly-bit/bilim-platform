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
  SubjectMap,
  TeacherCourseWorkspace,
  TeacherDashboardData,
  TeacherStudentCourseRow,
  TeacherTestWorkspace,
} from '@/lib/app-data-types';

function groupByCourseId<T extends { course_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>();

  rows.forEach((row) => {
    const current = map.get(row.course_id) || [];
    current.push(row);
    map.set(row.course_id, current);
  });

  return map;
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

function groupProgressByStudentId(rows: Tables<'lesson_progress'>[]) {
  const map = new Map<string, Tables<'lesson_progress'>[]>();

  rows.forEach((row) => {
    const current = map.get(row.student_id) || [];
    current.push(row);
    map.set(row.student_id, current);
  });

  return map;
}

function groupAttemptsByTestId(rows: Array<{ test_id: string; score: number | null }>) {
  const map = new Map<string, Array<{ test_id: string; score: number | null }>>();

  rows.forEach((row) => {
    const current = map.get(row.test_id) || [];
    current.push(row);
    map.set(row.test_id, current);
  });

  return map;
}

export async function getTeacherDashboard(
  teacherId: string,
  locale: 'kk' | 'ru' = 'kk'
): Promise<TeacherDashboardData> {
  const courses = await getCourseCatalog(undefined, teacherId, locale);
  const tests = await queryOrThrow(
    supabase.from('tests').select('*').eq('created_by', teacherId)
  );

  const courseIds = courses.map((course) => course.id);

  const [enrollments, modules, lessons] = await Promise.all([
    courseIds.length
      ? queryOrThrow(
          supabase.from('course_enrollments').select('*').in('course_id', courseIds)
        )
      : Promise.resolve([] as Tables<'course_enrollments'>[]),
    courseIds.length
      ? queryOrThrow(supabase.from('modules').select('*').in('course_id', courseIds))
      : Promise.resolve([] as Tables<'modules'>[]),
    queryOrThrow(supabase.from('lessons').select('*').eq('is_published', true)),
  ]);

  const enrollmentRows = enrollments as Tables<'course_enrollments'>[];
  const moduleRows = modules as Tables<'modules'>[];
  const lessonRows = lessons as Tables<'lessons'>[];

  const studentIds = [...new Set(enrollmentRows.map((row) => row.student_id))];

  const [profiles, progress, attempts] = await Promise.all([
    getProfilesMap(studentIds),
    studentIds.length
      ? queryOrThrow(
          supabase.from('lesson_progress').select('*').in('student_id', studentIds)
        )
      : Promise.resolve([] as Tables<'lesson_progress'>[]),
    tests.length
      ? queryOrThrow(
          supabase
            .from('test_attempts')
            .select('*')
            .in('test_id', tests.map((test) => test.id))
        )
      : Promise.resolve([] as Tables<'test_attempts'>[]),
  ]);

  const progressRows = progress as Tables<'lesson_progress'>[];
  const attemptRows = attempts as Tables<'test_attempts'>[];

  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const moduleIdsByCourse = new Map<string, Set<string>>();

  moduleRows.forEach((module) => {
    const current = moduleIdsByCourse.get(module.course_id) || new Set<string>();
    current.add(module.id);
    moduleIdsByCourse.set(module.course_id, current);
  });

  const lessonIdsByCourse = new Map<string, string[]>();
  courses.forEach((course) => {
    const moduleIds = moduleIdsByCourse.get(course.id) || new Set<string>();
    const lessonIds = lessonRows
      .filter((lesson) => moduleIds.has(lesson.module_id))
      .map((lesson) => lesson.id);

    lessonIdsByCourse.set(course.id, lessonIds);
  });

  const progressByStudent = groupProgressByStudentId(progressRows);

  const students: TeacherStudentCourseRow[] = enrollmentRows.map((enrollment) => {
    const course = courseMap.get(enrollment.course_id);
    const lessonIds = lessonIdsByCourse.get(enrollment.course_id) || [];

    const studentProgress = (progressByStudent.get(enrollment.student_id) || []).filter(
      (row) => row.is_completed && lessonIds.includes(row.lesson_id)
    );

    const lastCompletedAt =
      [...studentProgress].sort((a, b) =>
        (b.completed_at || '').localeCompare(a.completed_at || '')
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
      ? Math.round(rows.reduce((sum, row) => sum + row.progressPct, 0) / rows.length)
      : 0;

    const completionPct = rows.length
      ? Math.round(
          (rows.filter(
            (row) => row.totalLessons > 0 && row.completedLessons === row.totalLessons
          ).length /
            rows.length) *
            100
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
      status: course.status,
    };
  });

  const scoredAttempts = attemptRows.filter((row) => row.score !== null);

  const avgScore = scoredAttempts.length
    ? Math.round(
        scoredAttempts.reduce((sum, row) => sum + Number(row.score || 0), 0) /
          scoredAttempts.length
      )
    : 0;

  const avgCourseProgress = students.length
    ? Math.round(students.reduce((sum, row) => sum + row.progressPct, 0) / students.length)
    : 0;

  const completedLessons = students.reduce((sum, row) => sum + row.completedLessons, 0);

  return {
    courses,
    students,
    courseProgress,
    stats: {
      totalCourses: courses.length,
      totalStudents: new Set(enrollmentRows.map((row) => row.student_id)).size,
      totalTests: tests.length,
      avgScore,
      avgCourseProgress,
      completedLessons,
    },
  };
}

export async function getTeacherCourseWorkspace(
  teacherId: string,
  locale: 'kk' | 'ru' = 'kk'
): Promise<TeacherCourseWorkspace> {
  const [subjects, courses, modules, lessons] = await Promise.all([
    getSubjects(),
    queryOrThrow(
      supabase
        .from('courses')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })
    ),
    queryOrThrow(
      supabase.from('modules').select('*').order('sort_order', { ascending: true })
    ),
    queryOrThrow(
      supabase.from('lessons').select('*').order('sort_order', { ascending: true })
    ),
  ]);

  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s])) as SubjectMap;
  const profiles = await getProfilesMap([teacherId]);

  const allEnrollments = courses.length
    ? await queryOrThrow(
        supabase
          .from('course_enrollments')
          .select('course_id, progress_pct')
          .in('course_id', courses.map((course) => course.id))
      )
    : [];

  const lessonRows = lessons as Tables<'lessons'>[];
  const moduleRows = modules as Tables<'modules'>[];
  const lessonsByModuleId = groupLessonsByModuleId(lessonRows);
  const enrollmentsByCourseId = groupByCourseId(
    allEnrollments as Array<{ course_id: string; progress_pct: number }>
  );

  const courseItems = courses.map((course) => {
    const courseModules = moduleRows
      .filter((module) => module.course_id === course.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((module) => ({
        id: module.id,
        courseId: module.course_id,
        title: module.title,
        sortOrder: module.sort_order,
        lessons: (lessonsByModuleId.get(module.id) || [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((lesson) => ({
            id: lesson.id,
            moduleId: lesson.module_id,
            title: lesson.title,
            contentBody: lesson.content_body,
            practiceContent: lesson.practice_content,
            mediaUrl: lesson.media_url,
            sortOrder: lesson.sort_order,
            isPublished: lesson.is_published,
            subjectId: lesson.subject_id,
          })),
      }));

    const enrollments = enrollmentsByCourseId.get(course.id) || [];
    const avgProgress = enrollments.length
      ? Math.round(
          enrollments.reduce((sum, row) => sum + Number(row.progress_pct || 0), 0) /
            enrollments.length
        )
      : 0;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      subjectName: subjectLabel(
        course.subject_id ? subjectMap[course.subject_id] : null,
        locale
      ),
      teacherId: course.teacher_id,
      teacherName: profiles[teacherId]?.full_name || '—',
      teacherAvatarUrl: profiles[teacherId]?.avatar_url || null,
      teacherBio: profiles[course.teacher_id]?.bio || null,
      teacherCoursesCount: courses.length,
      students: enrollments.length,
      lessons: courseModules.reduce((sum, module) => sum + module.lessons.length, 0),
      enrolled: false,
      progress: avgProgress,
      status: course.status,
      bookmarked: false,
      subjectId: course.subject_id,
      thumbnailUrl: course.thumbnail_url,
      modules: courseModules,
    };
  });

  return { courses: courseItems };
}

export async function getTeacherTestsWorkspace(
  teacherId: string,
  locale: 'kk' | 'ru' = 'kk'
): Promise<TeacherTestWorkspace> {
  const [subjects, tests] = await Promise.all([
    getSubjects(),
    queryOrThrow(
      supabase
        .from('tests')
        .select('*')
        .eq('created_by', teacherId)
        .order('created_at', { ascending: false })
    ),
  ]);

  const testIds = tests.map((test) => test.id);

  const [questions, attempts] = await Promise.all([
    testIds.length
      ? queryOrThrow(
          supabase
            .from('test_questions')
            .select('*')
            .in('test_id', testIds)
            .order('sort_order', { ascending: true })
        )
      : Promise.resolve([] as Tables<'test_questions'>[]),
    testIds.length
      ? queryOrThrow(
          supabase.from('test_attempts').select('test_id, score').in('test_id', testIds)
        )
      : Promise.resolve([] as Array<{ test_id: string; score: number | null }>),
  ]);

  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s])) as SubjectMap;
  const questionsByTestId = groupByCourseId(
    (questions as Tables<'test_questions'>[]).map((row) => ({
      ...row,
      course_id: row.test_id,
    }))
  );
  const attemptsByTestId = groupAttemptsByTestId(
    attempts as Array<{ test_id: string; score: number | null }>
  );

  return {
    tests: tests.map((test) => {
      const testQuestions = (questionsByTestId.get(test.id) || []).map(({ course_id: _courseId, ...row }) => row);
      const testAttempts = (attemptsByTestId.get(test.id) || []).filter(
        (row) => row.score !== null
      );

      const bestScore = testAttempts.reduce<number | null>(
        (best, row) =>
          best === null ? Number(row.score) : Math.max(best, Number(row.score)),
        null
      );

      return {
        id: test.id,
        title: test.title,
        topic: test.topic,
        subjectName: subjectLabel(
          test.subject_id ? subjectMap[test.subject_id] : null,
          locale
        ),
        questionCount: testQuestions.length,
        durationMinutes: test.duration_minutes,
        attempts: testAttempts.length,
        bestScore,
        createdBy: test.created_by,
        status: test.status,
        subjectId: test.subject_id,
        questions: testQuestions,
      };
    }),
  };
}