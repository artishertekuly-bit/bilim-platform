export type LearningAiMode =
  | 'student_tracker'
  | 'student_course_advisor'
  | 'teacher_course_assistant'
  | 'teacher_student_assistant'
  | 'teacher_course_creator_advisor';

export type LearningAiRole = 'student' | 'teacher';

export type LearningAiContextSource =
  | 'student_learning_snapshot'
  | 'student_course_advisor_context'
  | 'course_learning_snapshot'
  | 'teacher_student_learning_snapshot'
  | 'teacher_course_creator_context';

export type LearningAiScope = {
  /**
   * Analysis modes:
   * - teacher_course_assistant requires courseId
   * - teacher_student_assistant requires courseId + studentId
   *
   * Advisor modes:
   * - student_course_advisor does not require courseId
   * - teacher_course_creator_advisor does not require courseId
   */
  courseId?: string | null;
  studentId?: string | null;

  /**
   * Optional advisor hints.
   * These are not required, but can be used later if the UI adds filters.
   */
  subjectId?: string | null;
  subjectName?: string | null;
  gradeLevel?: string | null;
  targetAudience?: string | null;
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
  subjectName?: string | null;
  snapshotGeneratedAt?: string | null;
};

export type LearningAiConfidence = 'low' | 'medium' | 'high';

export type LearningAiResponse = {
  answer: string;
  generatedAt: string;
  mode: LearningAiMode;
  usedContext: LearningAiUsedContext;

  /**
   * Optional fields for chat-first UI.
   * Do not show contextSummary directly if it contains numeric analytics.
   */
  contextSummary?: string | null;
  confidence?: LearningAiConfidence | null;
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