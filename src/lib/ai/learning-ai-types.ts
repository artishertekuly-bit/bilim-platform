export const LEARNING_AI_MODES = [
  'student_tracker',
  'student_course_advisor',
  'teacher_course_assistant',
  'teacher_student_assistant',
  'teacher_course_creator_advisor',
] as const;

export type LearningAiMode = (typeof LEARNING_AI_MODES)[number];

export const LEARNING_AI_ROLES = ['student', 'teacher'] as const;

export type LearningAiRole = (typeof LEARNING_AI_ROLES)[number];

export const LEARNING_AI_CONTEXT_SOURCES = [
  'student_learning_snapshot',
  'student_course_advisor_context',
  'course_learning_snapshot',
  'teacher_student_learning_snapshot',
  'teacher_course_creator_context',
] as const;

export type LearningAiContextSource =
  (typeof LEARNING_AI_CONTEXT_SOURCES)[number];

export const LEARNING_AI_CONFIDENCE_VALUES = [
  'low',
  'medium',
  'high',
] as const;

export type LearningAiConfidence =
  (typeof LEARNING_AI_CONFIDENCE_VALUES)[number];

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
   * These are not required, but can be used by UI filters later.
   */
  subjectId?: string | null;
  subjectName?: string | null;
  gradeLevel?: string | null;
  targetAudience?: string | null;
};

export const LEARNING_AI_CONVERSATION_ROLES = [
  'user',
  'assistant',
] as const;

export type LearningAiConversationRole =
  (typeof LEARNING_AI_CONVERSATION_ROLES)[number];

export type LearningAiConversationMessage = {
  role: LearningAiConversationRole;
  content: string;
};

export type LearningAiRequest = {
  mode: LearningAiMode;
  role: LearningAiRole;
  prompt: string;
  selectedSuggestionId?: string | null;
  scope?: LearningAiScope;

  /**
   * Short chat memory for continuation / clarification logic.
   *
   * Frontend should send only the latest few messages, not the full infinite chat.
   */
  conversationHistory?: LearningAiConversationMessage[];
};

export type LearningAiUsedContext = {
  source: LearningAiContextSource;
  courseId?: string | null;
  studentId?: string | null;

  /**
   * Frontend-friendly metadata returned by backend when available.
   */
  courseTitle?: string | null;
  studentName?: string | null;
  subjectName?: string | null;
  snapshotGeneratedAt?: string | null;
};

export type LearningAiResponse = {
  answer: string;
  generatedAt: string;
  mode: LearningAiMode;
  usedContext: LearningAiUsedContext;

  /**
   * Optional chat UI metadata.
   * Do not render contextSummary as a raw analytics report.
   */
  contextSummary?: string | null;
  confidence?: LearningAiConfidence | null;
  warnings?: string[];
  followUpPrompts?: string[];
};

export type LearningAiClientSuccess = {
  ok: true;
  data: LearningAiResponse;
};

export type LearningAiClientFailure = {
  ok: false;
  error: string;
  status?: number;
  payload?: unknown;
};

export type LearningAiClientResult =
  | LearningAiClientSuccess
  | LearningAiClientFailure;

export function isLearningAiMode(value: unknown): value is LearningAiMode {
  return (
    typeof value === 'string' &&
    (LEARNING_AI_MODES as readonly string[]).includes(value)
  );
}

export function isLearningAiRole(value: unknown): value is LearningAiRole {
  return (
    typeof value === 'string' &&
    (LEARNING_AI_ROLES as readonly string[]).includes(value)
  );
}

export function isLearningAiContextSource(
  value: unknown
): value is LearningAiContextSource {
  return (
    typeof value === 'string' &&
    (LEARNING_AI_CONTEXT_SOURCES as readonly string[]).includes(value)
  );
}

export function isLearningAiConfidence(
  value: unknown
): value is LearningAiConfidence {
  return (
    typeof value === 'string' &&
    (LEARNING_AI_CONFIDENCE_VALUES as readonly string[]).includes(value)
  );
}

export function isStudentLearningAiMode(mode: LearningAiMode): boolean {
  return mode === 'student_tracker' || mode === 'student_course_advisor';
}

export function isTeacherLearningAiMode(mode: LearningAiMode): boolean {
  return (
    mode === 'teacher_course_assistant' ||
    mode === 'teacher_student_assistant' ||
    mode === 'teacher_course_creator_advisor'
  );
}

export function getRequiredLearningAiRole(
  mode: LearningAiMode
): LearningAiRole {
  return isStudentLearningAiMode(mode) ? 'student' : 'teacher';
}
