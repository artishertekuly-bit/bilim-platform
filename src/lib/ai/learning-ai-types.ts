export const LEARNING_AI_MODES = [
  'student_tracker',
  'student_course_advisor',
  'teacher_course_assistant',
  'teacher_student_assistant',
  'teacher_course_creator_advisor',
] as const;

export type LearningAiMode = (typeof LEARNING_AI_MODES)[number];

export const STUDENT_LEARNING_AI_MODES = [
  'student_tracker',
  'student_course_advisor',
] as const satisfies readonly LearningAiMode[];

export const TEACHER_LEARNING_AI_MODES = [
  'teacher_course_assistant',
  'teacher_student_assistant',
  'teacher_course_creator_advisor',
] as const satisfies readonly LearningAiMode[];

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
  scope?: LearningAiScope | null;
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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function isOptionalStringOrNull(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
  return STUDENT_LEARNING_AI_MODES.includes(
    mode as (typeof STUDENT_LEARNING_AI_MODES)[number],
  );
}

export function isTeacherLearningAiMode(mode: LearningAiMode): boolean {
  return TEACHER_LEARNING_AI_MODES.includes(
    mode as (typeof TEACHER_LEARNING_AI_MODES)[number],
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
}): boolean {
  return getRequiredLearningAiRole(input.mode) === input.role;
}

export function requiresLearningAiCourseId(mode: LearningAiMode): boolean {
  return mode === 'teacher_course_assistant' || mode === 'teacher_student_assistant';
}

export function requiresLearningAiStudentId(mode: LearningAiMode): boolean {
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

export function isLearningAiScope(value: unknown): value is LearningAiScope {
  if (value === undefined || value === null) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    isOptionalStringOrNull(value.courseId) &&
    isOptionalStringOrNull(value.studentId) &&
    isOptionalStringOrNull(value.subjectId) &&
    isOptionalStringOrNull(value.subjectName) &&
    isOptionalStringOrNull(value.gradeLevel) &&
    isOptionalStringOrNull(value.targetAudience)
  );
}

export function isLearningAiConversationMessage(
  value: unknown,
): value is LearningAiConversationMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isLearningAiConversationRole(value.role) &&
    typeof value.content === 'string' &&
    value.content.trim().length > 0
  );
}

export function isLearningAiConversationHistory(
  value: unknown,
): value is LearningAiConversationMessage[] {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every(isLearningAiConversationMessage))
  );
}

export function isLearningAiUsedContext(
  value: unknown,
): value is LearningAiUsedContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isLearningAiContextSource(value.source) &&
    isOptionalStringOrNull(value.courseId) &&
    isOptionalStringOrNull(value.studentId) &&
    isOptionalStringOrNull(value.courseTitle) &&
    isOptionalStringOrNull(value.studentName) &&
    isOptionalStringOrNull(value.subjectName) &&
    isOptionalStringOrNull(value.snapshotGeneratedAt)
  );
}

export function isLearningAiRequest(value: unknown): value is LearningAiRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isLearningAiMode(value.mode) &&
    isLearningAiRole(value.role) &&
    typeof value.prompt === 'string' &&
    value.prompt.trim().length > 0 &&
    isOptionalStringOrNull(value.selectedSuggestionId) &&
    isLearningAiScope(value.scope) &&
    isLearningAiConversationHistory(value.conversationHistory)
  );
}

export function isLearningAiResponse(value: unknown): value is LearningAiResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.answer === 'string' &&
    value.answer.trim().length > 0 &&
    typeof value.generatedAt === 'string' &&
    value.generatedAt.trim().length > 0 &&
    isLearningAiMode(value.mode) &&
    isLearningAiUsedContext(value.usedContext) &&
    isOptionalStringOrNull(value.contextSummary) &&
    (value.confidence === undefined ||
      value.confidence === null ||
      isLearningAiConfidence(value.confidence)) &&
    (value.warnings === undefined || isStringArray(value.warnings)) &&
    (value.followUpPrompts === undefined || isStringArray(value.followUpPrompts))
  );
}

export function isLearningAiClientSuccess(
  value: LearningAiClientResult,
): value is LearningAiClientSuccess {
  return value.ok === true;
}

export function isLearningAiClientFailure(
  value: LearningAiClientResult,
): value is LearningAiClientFailure {
  return value.ok === false;
}

export function getLearningAiRequestValidationError(
  request: LearningAiRequest,
): string | null {
  if (!request.prompt.trim()) {
    return 'Сұрақ бос болмауы керек.';
  }

  if (!isLearningAiModeRoleValid(request)) {
    return request.role === 'student'
      ? 'Бұл режим мұғалім аккаунтына арналған.'
      : 'Бұл режим оқушы аккаунтына арналған.';
  }

  if (requiresLearningAiCourseId(request.mode) && !request.scope?.courseId) {
    return 'Курс таңдалуы керек.';
  }

  if (requiresLearningAiStudentId(request.mode) && !request.scope?.studentId) {
    return 'Оқушы таңдалуы керек.';
  }

  return null;
}

export function getLearningAiDefaultUsedContext(
  mode: LearningAiMode,
): LearningAiUsedContext {
  return {
    source: getLearningAiContextSourceForMode(mode),
    courseId: null,
    studentId: null,
    courseTitle: null,
    studentName: null,
    subjectName: null,
    snapshotGeneratedAt: null,
  };
}