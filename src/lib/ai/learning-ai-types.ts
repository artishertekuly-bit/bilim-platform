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

export const LEARNING_AI_CONVERSATION_ROLES = [
  'user',
  'assistant',
] as const;

export type LearningAiConversationRole =
  (typeof LEARNING_AI_CONVERSATION_ROLES)[number];

export type LearningAiScope = {
  courseId?: string | null;
  studentId?: string | null;

  subjectId?: string | null;
  subjectName?: string | null;
  gradeLevel?: string | null;
  targetAudience?: string | null;
};

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
  conversationHistory?: LearningAiConversationMessage[];
};

export type LearningAiUsedContext = {
  source: LearningAiContextSource;
  courseId?: string | null;
  studentId?: string | null;

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

function isOneOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

export function isLearningAiMode(value: unknown): value is LearningAiMode {
  return isOneOf(LEARNING_AI_MODES, value);
}

export function isLearningAiRole(value: unknown): value is LearningAiRole {
  return isOneOf(LEARNING_AI_ROLES, value);
}

export function isLearningAiContextSource(
  value: unknown,
): value is LearningAiContextSource {
  return isOneOf(LEARNING_AI_CONTEXT_SOURCES, value);
}

export function isLearningAiConfidence(
  value: unknown,
): value is LearningAiConfidence {
  return isOneOf(LEARNING_AI_CONFIDENCE_VALUES, value);
}

export function isLearningAiConversationRole(
  value: unknown,
): value is LearningAiConversationRole {
  return isOneOf(LEARNING_AI_CONVERSATION_ROLES, value);
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
  mode: LearningAiMode,
): LearningAiRole {
  return isStudentLearningAiMode(mode) ? 'student' : 'teacher';
}

export function isLearningAiModeRoleValid(input: {
  mode: LearningAiMode;
  role: LearningAiRole;
}) {
  return getRequiredLearningAiRole(input.mode) === input.role;
}

export function requiresLearningAiCourseId(mode: LearningAiMode) {
  return mode === 'teacher_course_assistant' || mode === 'teacher_student_assistant';
}

export function requiresLearningAiStudentId(mode: LearningAiMode) {
  return mode === 'teacher_student_assistant';
}

export function getLearningAiContextSourceForMode(
  mode: LearningAiMode,
): LearningAiContextSource {
  if (mode === 'student_tracker') {
    return 'student_learning_snapshot';
  }

  if (mode === 'student_course_advisor') {
    return 'student_course_advisor_context';
  }

  if (mode === 'teacher_course_assistant') {
    return 'course_learning_snapshot';
  }

  if (mode === 'teacher_student_assistant') {
    return 'teacher_student_learning_snapshot';
  }

  return 'teacher_course_creator_context';
}