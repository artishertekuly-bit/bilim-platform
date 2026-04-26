export type LearningAiMode =
  | 'student_tracker'
  | 'teacher_course_assistant'
  | 'teacher_student_assistant';

export type LearningAiRole = 'student' | 'teacher';

export type LearningAiScope = {
  courseId?: string | null;
  studentId?: string | null;
};

export type LearningAiRequest = {
  mode: LearningAiMode;
  role: LearningAiRole;
  prompt: string;
  selectedSuggestionId?: string | null;
  scope?: LearningAiScope;
};

export type LearningAiResponse = {
  answer: string;
  generatedAt: string;
  mode: LearningAiMode;
  usedContext: {
    source: 'student_learning_snapshot' | 'course_learning_snapshot' | 'teacher_student_learning_snapshot';
    courseId?: string | null;
    studentId?: string | null;
  };
};

export type LearningAiClientResult =
  | {
      ok: true;
      data: LearningAiResponse;
    }
  | {
      ok: false;
      error: string;
    };