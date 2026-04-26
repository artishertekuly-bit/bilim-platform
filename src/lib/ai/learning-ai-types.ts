export type LearningAiMode =
  | 'student_tracker'
  | 'teacher_course_assistant'
  | 'teacher_student_assistant';

export type LearningAiRole = 'student' | 'teacher';

export type LearningAiContextSource =
  | 'student_learning_snapshot'
  | 'course_learning_snapshot'
  | 'teacher_student_learning_snapshot';

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

export type LearningAiUsedContext = {
  source: LearningAiContextSource;
  courseId?: string | null;
  studentId?: string | null;

  /**
   * Optional frontend-friendly metadata.
   * Backend may return these later without breaking current UI.
   */
  courseTitle?: string | null;
  studentName?: string | null;
  snapshotGeneratedAt?: string | null;
};

export type LearningAiResponse = {
  answer: string;
  generatedAt: string;
  mode: LearningAiMode;
  usedContext: LearningAiUsedContext;

  /**
   * Optional fields for chat-first UI.
   * Current backend does not have to return them.
   */
  contextSummary?: string | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  warnings?: string[];
  followUpPrompts?: string[];
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