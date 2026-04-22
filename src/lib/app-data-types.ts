import type {
  ContentStatus,
  QuestionType,
  Tables,
} from '@/integrations/supabase/types';

export type SubjectRow = Tables<'subjects'>;
export type CourseBookmarkRow = Tables<'course_bookmarks'>;
export type CourseRow = Tables<'courses'>;
export type LessonRow = Tables<'lessons'>;
export type TestRow = Tables<'tests'>;
export type AchievementRow = Tables<'achievements'>;
export type TestQuestionRow = Tables<'test_questions'>;

export type CourseViewStatus = ContentStatus | 'unknown';

export type SubjectMap = Record<string, SubjectRow>;

export type ProfileMap = Record<
  string,
  {
    full_name: string;
    avatar_url: string | null;
    bio?: string | null;
  }
>;

export interface CourseView {
  id: string;
  title: string;
  description: string | null;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  teacherAvatarUrl: string | null;
  teacherBio: string | null;
  teacherCoursesCount: number;
  students: number;
  lessons: number;
  enrolled: boolean;
  progress: number;
  status: CourseViewStatus;
  bookmarked: boolean;
}

export interface LessonView {
  id: string;
  title: string;
  subjectName: string;
  moduleTitle: string;
  courseTitle: string;
  sortOrder: number;
  isCompleted: boolean;
  isLocked: boolean;
}

export interface TestCatalogItem {
  id: string;
  subjectName: string;
  title: string;
  topic: string | null;
  questionCount: number;
  durationMinutes: number | null;
  attempts: number;
  bestScore: number | null;
}

export interface TestAttemptBreakdownItem {
  attemptId: string;
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  selectedAnswer: number[];
  correctAnswer: number[];
  explanation: string | null;
  isCorrect: boolean;
  questionOrder: number;
}

export interface LeaderboardView {
  id: string;
  studentId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  rank: number | null;
  avgScore: number | null;
  lessonsCompleted: number;
  coursesCompleted: number;
}

export interface DashboardStudentData {
  enrolledCourses: CourseView[];
  recentAttempts: Array<{
    id: string;
    title: string;
    subjectName: string;
    score: number | null;
    completedAt: string | null;
  }>;
  nextLessons: LessonView[];
  stats: {
    enrolledCourses: number;
    avgScore: number;
    completedLessons: number;
    points: number;
    streakDays: number;
    rank: number | null;
    bestSubject: string | null;
    weakSubject: string | null;
    totalTests: number;
  };
}

export interface LessonDetailView {
  id: string;
  title: string;
  subjectName: string;
  moduleTitle: string;
  courseTitle: string;
  contentBody: string | null;
  practiceContent: string | null;
  mediaUrl: string | null;
  sortOrder: number;
  isCompleted: boolean;
  isLocked: boolean;
}

export interface TeacherStudentCourseRow {
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  courseId: string;
  courseTitle: string;
  progressPct: number;
  completedLessons: number;
  totalLessons: number;
  enrolledAt: string;
  lastCompletedAt: string | null;
}

export interface TeacherDashboardData {
  courses: CourseView[];
  students: TeacherStudentCourseRow[];
  courseProgress: Array<{
    courseId: string;
    courseTitle: string;
    subjectName: string;
    students: number;
    lessons: number;
    avgProgress: number;
    completionPct: number;
    status: ContentStatus;
  }>;
  stats: {
    totalCourses: number;
    totalStudents: number;
    totalTests: number;
    avgScore: number;
    avgCourseProgress: number;
    completedLessons: number;
  };
}

export interface CourseBuilderLessonView {
  id: string;
  moduleId: string;
  title: string;
  contentBody: string | null;
  practiceContent: string | null;
  mediaUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
  subjectId: string | null;
}

export interface CourseBuilderModuleView {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  lessons: CourseBuilderLessonView[];
}

export interface TeacherCourseWorkspace {
  courses: Array<
    CourseView & {
      subjectId: string | null;
      teacherId: string;
      thumbnailUrl: string | null;
      modules: CourseBuilderModuleView[];
    }
  >;
}

export interface TeacherTestWorkspace {
  tests: Array<
    TestCatalogItem & {
      createdBy: string;
      status: ContentStatus;
      subjectId: string | null;
      questions: TestQuestionRow[];
    }
  >;
}

export interface ModerationItem {
  id: string;
  type: 'course' | 'test';
  title: string;
  subjectName: string;
  authorName: string;
  status: ContentStatus;
  createdAt: string;
  extra: string;
}

export type RpcMutationResponse = {
  lesson_id?: string;
  course_id?: string;
  attempt_id?: string;
  score?: number;
  correct_count?: number;
  total_questions?: number;
};