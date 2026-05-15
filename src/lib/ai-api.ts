export class AiApiError extends Error {
  status?: number;
  payload?: unknown;

  constructor(message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
    this.payload = payload;
  }
}

type AiAuthOptions = {
  accessToken?: string;
  userId?: string;
};

type RequestOptions = AiAuthOptions & {
  signal?: AbortSignal;
  requireAuth?: boolean;
  timeoutMs?: number;
};

type JsonRecord = Record<string, unknown>;

export type AiQuestionKind = 'multiple_choice' | 'short_answer' | 'mixed';

export interface GenerateQuestionsRequest {
  sourceText?: string;
  topic?: string;
  subject?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  questionCount?: number;
  kind?: AiQuestionKind;
  examMode?: 'unt';
}

export interface GeneratedQuestionOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface GeneratedQuestion {
  id: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  options?: GeneratedQuestionOption[];
  correctAnswer?: string;
  explanation?: string;
  difficulty?: string;
  topic?: string;
}

export interface GenerateQuestionsMeta {
  mode?: string;
  subject?: string;
  topic?: string | null;
  passage?: string;
  requestedCount?: number;
  returnedCount?: number;
  requestedKind?: AiQuestionKind;
  examMode?: string | null;
}

export interface GenerateQuestionsResponse {
  questions: GeneratedQuestion[];
  meta?: GenerateQuestionsMeta;
  raw?: unknown;
}

export interface EvaluateAnswerRequest {
  questionId?: string;
  question: string;
  expectedAnswer?: string;
  referenceAnswer?: string;
  studentAnswer: string;
  rubric?: string;
  context?: string | Record<string, unknown> | unknown[];
  options?: string[];
  answerFormat?: 'mcq' | 'text';
}

export interface EvaluateAnswerResponse {
  score: number;
  maxScore?: number;
  isCorrect?: boolean;
  feedback: string;
  explanation?: string;
  suggestion?: string;
  strengths?: string[];
  weaknesses?: string[];
  raw?: unknown;
}

export interface CreateTutorSessionRequest {
  lessonId?: string;
  topic?: string;
  subject?: string;
  initialContext?: string;
}

export interface TutorSession {
  id: string;
  title?: string;
  lessonId?: string | null;
  subject?: string | null;
  topic?: string | null;
  createdAt?: string;
}

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

export interface CreateTutorSessionResponse {
  session: TutorSession;
  messages?: TutorMessage[];
  raw?: unknown;
}

export interface SendTutorMessageRequest {
  sessionId: string;
  message: string;
  lessonId?: string;
  topic?: string;
  subject?: string;
  context?: string | Record<string, unknown>;
}

export interface SendTutorMessageResponse {
  sessionId: string;
  reply: TutorMessage;
  messages?: TutorMessage[];
  raw?: unknown;
}

export interface AiExamQuestion {
  id: string;
  type: 'multiple_choice' | 'short_answer';
  question: string;
  options?: GeneratedQuestionOption[];
  points?: number;
  correctAnswer?: string;
  explanation?: string;
  difficulty?: string;
  topic?: string;
}

export interface CreateAiExamRequest {
  title: string;
  sourceText?: string;
  topic?: string;
  subject?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  kind?: AiQuestionKind;
  questionCount?: number;
  durationMinutes?: number;
  examMode?: 'unt';
}

export interface AiExamSummary {
  id: string;
  title: string;
  subject?: string | null;
  topic?: string | null;
  status?: 'draft' | 'published' | 'archived';
  durationMinutes?: number | null;
  questionCount?: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}

export interface SubmitAiExamBreakdownItem {
  questionId: string;
  score: number;
  maxScore?: number;
  isCorrect?: boolean;
  feedback?: string;
}

export interface SubmitAiExamResponse {
  attemptId?: string;
  score: number;
  maxScore?: number;
  percentage?: number;
  feedback?: string;
  breakdown?: SubmitAiExamBreakdownItem[];
  raw?: unknown;
}

export interface CreateAiExamResponse {
  exam: AiExamSummary;
  questions?: AiExamQuestion[];
  meta?: GenerateQuestionsMeta;
  testImportPayload?: unknown;
  raw?: unknown;
}

export interface AiExamAttemptAnswer {
  questionId: string;
  answer: string;
}

export interface AiExamAttempt {
  id: string;
  examId?: string;
  userId?: string;
  answers: AiExamAttemptAnswer[];
  result?: SubmitAiExamResponse | null;
  createdAt?: string;
  updatedAt?: string;
  submittedAt?: string;
  raw?: unknown;
}

export interface AiExamSession {
  exam: AiExamSummary;
  questions: AiExamQuestion[];
  startedAt?: string | null;
  attemptId?: string;
  latestResult?: SubmitAiExamResponse | null;
  latestAnswers?: AiExamAttemptAnswer[];
  latestSubmittedAt?: string | null;
  raw?: unknown;
}

export interface SubmitAiExamRequest {
  answers: Array<{
    questionId: string;
    answer: string | string[];
  }>;
}

export interface ListAiExamsResponse {
  exams: AiExamSummary[];
  raw?: unknown;
}

export interface ListAiExamAttemptsResponse {
  attempts: AiExamAttempt[];
  count: number;
  raw?: unknown;
}

export type LearningAiMode =
  | 'student_tracker'
  | 'student_course_advisor'
  | 'teacher_course_assistant'
  | 'teacher_student_assistant'
  | 'teacher_course_creator_advisor';

export type LearningAiRole = 'student' | 'teacher';

export interface LearningAiConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LearningAiScope {
  courseId?: string | null;
  studentId?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
  gradeLevel?: string | null;
  targetAudience?: string | null;
}

export interface LearningAiRequest {
  mode: LearningAiMode;
  role: LearningAiRole;
  prompt: string;
  selectedSuggestionId?: string | null;
  scope?: LearningAiScope | null;
  conversationHistory?: LearningAiConversationMessage[];
}

export interface LearningAiUsedContext {
  source:
    | 'student_learning_snapshot'
    | 'student_course_advisor_context'
    | 'course_learning_snapshot'
    | 'teacher_student_learning_snapshot'
    | 'teacher_course_creator_context';
  courseId?: string | null;
  studentId?: string | null;
  courseTitle?: string | null;
  studentName?: string | null;
  subjectName?: string | null;
  snapshotGeneratedAt?: string | null;
}

export interface LearningAiResponse {
  answer: string;
  generatedAt: string;
  mode: LearningAiMode;
  usedContext: LearningAiUsedContext;
  contextSummary?: string | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  warnings: string[];
  followUpPrompts: string[];
  raw?: unknown;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_ERROR_MESSAGE_LENGTH = 1_000;
const MAX_TEXT_FIELD_CHARS = 12_000;
const MAX_GENERATED_QUESTIONS = 100;
const MAX_AI_EXAM_QUESTIONS = 100;

function getEnv(): Record<string, unknown> {
  return (import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {};
}

function getAiApiBaseUrl(): string {
  const env = getEnv();
  const rawBaseUrl = env.VITE_AI_API_BASE_URL;
  const baseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.trim() : '';

  if (!baseUrl) {
    throw new AiApiError(
      'AI серверінің URL көрсетілмеген. .env файлына VITE_AI_API_BASE_URL мәнін қосыңыз.',
    );
  }

  return baseUrl.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, limit = MAX_TEXT_FIELD_CHARS) {
  return String(value ?? '')
    .replace(/\x00/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
    .trim();
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = cleanText(value);

  return normalized || undefined;
}

function toNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;

  return toNonEmptyString(value);
}

function toNumber(value: unknown, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toOptionalQuestionKind(value: unknown): AiQuestionKind | undefined {
  return value === 'multiple_choice' || value === 'short_answer' || value === 'mixed'
    ? value
    : undefined;
}

function toExamStatus(value: unknown): 'draft' | 'published' | 'archived' | undefined {
  return value === 'draft' || value === 'published' || value === 'archived'
    ? value
    : undefined;
}

function toLearningAiMode(value: unknown): LearningAiMode | undefined {
  return value === 'student_tracker' ||
    value === 'student_course_advisor' ||
    value === 'teacher_course_assistant' ||
    value === 'teacher_student_assistant' ||
    value === 'teacher_course_creator_advisor'
    ? value
    : undefined;
}

function toLearningContextSource(value: unknown): LearningAiUsedContext['source'] {
  if (
    value === 'student_learning_snapshot' ||
    value === 'student_course_advisor_context' ||
    value === 'course_learning_snapshot' ||
    value === 'teacher_student_learning_snapshot' ||
    value === 'teacher_course_creator_context'
  ) {
    return value;
  }

  return 'student_learning_snapshot';
}

function isDevMode(): boolean {
  const env = getEnv();

  return String(env.DEV ?? '').toLowerCase() === 'true';
}

function shouldSendDebugUserIdHeader(): boolean {
  const env = getEnv();
  const raw = env.VITE_AI_API_SEND_DEBUG_USER_ID;

  return isDevMode() && String(raw ?? '').trim().toLowerCase() === 'true';
}

function buildHeaders(auth?: AiAuthOptions, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders);

  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');

  const accessToken = auth?.accessToken?.trim();

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (shouldSendDebugUserIdHeader() && auth?.userId?.trim()) {
    headers.set('X-User-Id', auth.userId.trim());
  }

  return headers;
}

function ensureRequiredAuth(options?: RequestOptions): void {
  if (options?.requireAuth === false) return;

  if (!options?.accessToken?.trim()) {
    throw new AiApiError(
      'AI сервисін қолдану үшін аккаунт сессиясы қажет. Қайта кіріп көріңіз.',
    );
  }
}

function buildJsonBody(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function truncateErrorMessage(value: string): string {
  return value.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${value.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : value;
}

function extractFastApiValidationMessage(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) return undefined;

  const messages = detail
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!isRecord(item)) return '';

      const msg = toNonEmptyString(item.msg) ?? toNonEmptyString(item.message);
      const loc = Array.isArray(item.loc)
        ? item.loc.map((part) => String(part)).join('.')
        : undefined;

      return msg ? (loc ? `${loc}: ${msg}` : msg) : '';
    })
    .filter(Boolean);

  return messages.length ? messages.slice(0, 4).join('; ') : undefined;
}

function extractErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return truncateErrorMessage(body.detail.trim());
    }

    const validationMessage = extractFastApiValidationMessage(body.detail);

    if (validationMessage) {
      return truncateErrorMessage(validationMessage);
    }

    if (typeof body.message === 'string' && body.message.trim()) {
      return truncateErrorMessage(body.message.trim());
    }

    if (typeof body.error === 'string' && body.error.trim()) {
      return truncateErrorMessage(body.error.trim());
    }
  }

  if (typeof body === 'string' && body.trim()) {
    return truncateErrorMessage(body.trim());
  }

  if (status === 401) {
    return 'AI сервисі авторизацияны қабылдамады. Аккаунт сессиясын жаңартыңыз.';
  }

  if (status === 403) {
    return 'Бұл AI әрекетіне рұқсат жоқ. Рөл немесе курсқа қолжетімділікті тексеріңіз.';
  }

  if (status === 404) {
    return 'AI маршруты табылмады. Сервер URL және backend route баптауларын тексеріңіз.';
  }

  if (status === 422) {
    return 'AI сұранысының форматы дұрыс емес. Жіберілген деректерді тексеріңіз.';
  }

  if (status >= 500) {
    return `AI серверінде ішкі қате пайда болды (${status}). Сервер логтарын тексеріңіз.`;
  }

  return `AI сервисі қате қайтарды (${status}).`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();

    return text || null;
  } catch {
    return null;
  }
}

function createAbortControllerWithTimeout(
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const normalizedTimeout = clampNumber(
    Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS,
    1_000,
    MAX_TIMEOUT_MS,
  );

  const timeoutId = globalThis.setTimeout(() => controller.abort(), normalizedTimeout);

  const abortFromExternal = () => controller.abort();

  const cleanup = () => {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, {
        once: true,
      });
    }
  }

  return {
    signal: controller.signal,
    cleanup,
  };
}

function encodePathSegment(value: string): string {
  const cleaned = value.trim();

  if (!cleaned) {
    throw new AiApiError('AI сұранысы үшін бос id берілді.');
  }

  return encodeURIComponent(cleaned);
}

async function aiFetch<T>(
  path: string,
  init: RequestInit = {},
  options?: RequestOptions,
): Promise<T> {
  ensureRequiredAuth(options);

  const url = `${getAiApiBaseUrl()}${path}`;
  const { signal, cleanup } = createAbortControllerWithTimeout(
    options?.signal,
    options?.timeoutMs,
  );

  try {
    const response = await fetch(url, {
      ...init,
      headers: buildHeaders(options, init.headers),
      signal,
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
      throw new AiApiError(extractErrorMessage(body, response.status), response.status, body);
    }

    return body as T;
  } catch (error) {
    if (error instanceof AiApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AiApiError('AI сұранысы уақытынан асып кетті немесе тоқтатылды.');
    }

    const message =
      error instanceof Error
        ? `AI серверіне қосылу сәтсіз аяқталды: ${error.message}`
        : 'AI серверіне қосылу сәтсіз аяқталды.';

    throw new AiApiError(message);
  } finally {
    cleanup();
  }
}

/* ================= QUESTION NORMALIZATION ================= */

function normalizeGeneratedQuestionOption(
  option: unknown,
  optionIndex: number,
): GeneratedQuestionOption {
  if (typeof option === 'string' || typeof option === 'number') {
    return {
      id: `option-${optionIndex + 1}`,
      text: cleanText(option, 800),
    };
  }

  const row = isRecord(option) ? option : {};
  const text =
    toNonEmptyString(row.text) ??
    toNonEmptyString(row.label) ??
    toNonEmptyString(row.value) ??
    toNonEmptyString(row.answer) ??
    toNonEmptyString(row.content) ??
    '';

  return {
    id: String(row.id ?? `option-${optionIndex + 1}`),
    text: cleanText(text, 800),
    isCorrect:
      typeof row.isCorrect === 'boolean'
        ? row.isCorrect
        : typeof row.is_correct === 'boolean'
          ? row.is_correct
          : undefined,
  };
}

function normalizeCorrectAnswer(
  value: unknown,
  options?: GeneratedQuestionOption[],
): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return cleanText(value, 1_000);
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    const zeroBasedOption = options?.[value];
    const oneBasedOption = value > 0 ? options?.[value - 1] : undefined;

    return zeroBasedOption?.text || oneBasedOption?.text || String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeCorrectAnswer(item, options))
      .filter((item): item is string => Boolean(item));

    return parts.length ? parts.join(', ') : undefined;
  }

  if (isRecord(value)) {
    return (
      toNonEmptyString(value.text) ??
      toNonEmptyString(value.label) ??
      toNonEmptyString(value.value) ??
      toNonEmptyString(value.answer)
    );
  }

  return undefined;
}

function normalizeGeneratedQuestion(item: unknown, index: number): GeneratedQuestion {
  const row = isRecord(item) ? item : {};

  const options = Array.isArray(row.options)
    ? row.options
        .map((option, optionIndex) =>
          normalizeGeneratedQuestionOption(option, optionIndex),
        )
        .filter((option) => Boolean(option.text))
    : undefined;

  const answerFormat = toNonEmptyString(row.answer_format ?? row.answerFormat);
  const type =
    row.type === 'short_answer' || row.type === 'multiple_choice'
      ? row.type
      : answerFormat === 'mcq'
        ? 'multiple_choice'
        : options?.length
          ? 'multiple_choice'
          : 'short_answer';

  const correctAnswer = normalizeCorrectAnswer(
    row.correctAnswer ?? row.correct_answer,
    options,
  );

  return {
    id: String(row.id ?? row.question_id ?? row.questionId ?? `generated-${index + 1}`),
    type,
    question: cleanText(row.question ?? row.text ?? row.questionText, 3_000),
    options: options?.length ? options : undefined,
    correctAnswer,
    explanation:
      typeof row.explanation === 'string'
        ? cleanText(row.explanation, 3_000)
        : typeof row.reference_answer === 'string'
          ? cleanText(row.reference_answer, 3_000)
          : typeof row.referenceAnswer === 'string'
            ? cleanText(row.referenceAnswer, 3_000)
            : undefined,
    difficulty: typeof row.difficulty === 'string' ? cleanText(row.difficulty, 120) : undefined,
    topic: typeof row.topic === 'string' ? cleanText(row.topic, 240) : undefined,
  };
}

function normalizeGenerationMeta(payload: unknown): GenerateQuestionsMeta | undefined {
  if (!isRecord(payload) || !isRecord(payload.meta)) {
    return undefined;
  }

  const meta = payload.meta;

  return {
    mode: toNonEmptyString(meta.mode),
    subject: toNonEmptyString(meta.subject),
    topic: toNullableString(meta.topic) ?? null,
    passage: toNonEmptyString(meta.passage),
    requestedCount: toNumber(meta.requestedCount ?? meta.requested_count),
    returnedCount: toNumber(meta.returnedCount ?? meta.returned_count),
    requestedKind: toOptionalQuestionKind(meta.requestedKind ?? meta.requested_kind),
    examMode: toNullableString(meta.examMode ?? meta.exam_mode) ?? null,
  };
}

function normalizeGeneratedQuestions(payload: unknown): GenerateQuestionsResponse {
  const questions =
    isRecord(payload) && Array.isArray(payload.questions)
      ? payload.questions
      : Array.isArray(payload)
        ? payload
        : [];

  return {
    questions: questions
      .slice(0, MAX_GENERATED_QUESTIONS)
      .map((item, index) => normalizeGeneratedQuestion(item, index))
      .filter((item) => Boolean(item.question)),
    meta: normalizeGenerationMeta(payload),
    raw: payload,
  };
}

/* ================= TUTOR NORMALIZATION ================= */

function normalizeTutorMessage(message: unknown, fallbackId: string): TutorMessage {
  const row = isRecord(message) ? message : {};
  const role = row.role === 'user' ? 'user' : 'assistant';

  return {
    id: String(row.id ?? fallbackId),
    role,
    content: cleanText(row.content, 8_000),
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : undefined,
  };
}

/* ================= AI EXAM NORMALIZATION ================= */

function normalizeAiExamSummary(
  item: unknown,
  fallback: {
    id?: string;
    title?: string;
    status?: 'draft' | 'published' | 'archived';
  } = {},
): AiExamSummary {
  const row = isRecord(item) ? item : {};

  return {
    id: String(row.id ?? fallback.id ?? ''),
    title: cleanText(row.title ?? fallback.title ?? 'AI емтихан', 240),
    subject: row.subject === null ? null : toNonEmptyString(row.subject) ?? null,
    topic: row.topic === null ? null : toNonEmptyString(row.topic) ?? null,
    status: toExamStatus(row.status) ?? fallback.status,
    durationMinutes:
      row.duration_minutes !== undefined
        ? toNumber(row.duration_minutes) ?? null
        : row.durationMinutes !== undefined
          ? toNumber(row.durationMinutes) ?? null
          : null,
    questionCount:
      row.question_count !== undefined
        ? toNumber(row.question_count, 0)
        : row.questionCount !== undefined
          ? toNumber(row.questionCount, 0)
          : 0,
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : undefined,
    updatedAt:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : typeof row.updatedAt === 'string'
          ? row.updatedAt
          : undefined,
    publishedAt:
      row.published_at === null
        ? null
        : typeof row.published_at === 'string'
          ? row.published_at
          : row.publishedAt === null
            ? null
            : typeof row.publishedAt === 'string'
              ? row.publishedAt
              : null,
  };
}

function normalizeAiExamQuestion(item: unknown, index: number): AiExamQuestion {
  const row = isRecord(item) ? item : {};

  const options = Array.isArray(row.options)
    ? row.options
        .map((option, optionIndex) =>
          normalizeGeneratedQuestionOption(option, optionIndex),
        )
        .filter((option) => Boolean(option.text))
    : undefined;

  const answerFormat = toNonEmptyString(row.answer_format ?? row.answerFormat);
  const type =
    row.type === 'short_answer' || row.type === 'multiple_choice'
      ? row.type
      : row.questionType === 'single_choice' || row.questionType === 'multiple_choice'
        ? 'multiple_choice'
        : answerFormat === 'mcq'
          ? 'multiple_choice'
          : options?.length
            ? 'multiple_choice'
            : 'short_answer';

  return {
    id: String(row.id ?? row.question_id ?? row.questionId ?? `exam-question-${index + 1}`),
    type,
    question: cleanText(row.question ?? row.questionText ?? row.text, 3_000),
    options: options?.length ? options : undefined,
    points: toNumber(row.points),
    correctAnswer: normalizeCorrectAnswer(row.correctAnswer ?? row.correct_answer, options),
    explanation:
      typeof row.explanation === 'string'
        ? cleanText(row.explanation, 3_000)
        : typeof row.reference_answer === 'string'
          ? cleanText(row.reference_answer, 3_000)
          : typeof row.referenceAnswer === 'string'
            ? cleanText(row.referenceAnswer, 3_000)
            : undefined,
    difficulty: typeof row.difficulty === 'string' ? cleanText(row.difficulty, 120) : undefined,
    topic: typeof row.topic === 'string' ? cleanText(row.topic, 240) : undefined,
  };
}

function normalizeAiExamQuestions(items: unknown): AiExamQuestion[] {
  return Array.isArray(items)
    ? items
        .slice(0, MAX_AI_EXAM_QUESTIONS)
        .map((item, index) => normalizeAiExamQuestion(item, index))
        .filter((item) => Boolean(item.question))
    : [];
}

function normalizeSubmitAiExamResponse(payload: unknown): SubmitAiExamResponse {
  const row = isRecord(payload) ? payload : {};

  return {
    attemptId:
      typeof row.attempt_id === 'string'
        ? row.attempt_id
        : typeof row.attemptId === 'string'
          ? row.attemptId
          : undefined,
    score: toNumber(row.score, 0) ?? 0,
    maxScore:
      row.max_score !== undefined
        ? toNumber(row.max_score)
        : row.maxScore !== undefined
          ? toNumber(row.maxScore)
          : undefined,
    percentage: row.percentage !== undefined ? toNumber(row.percentage) : undefined,
    feedback: typeof row.feedback === 'string' ? cleanText(row.feedback, 4_000) : undefined,
    breakdown: Array.isArray(row.breakdown)
      ? row.breakdown
          .map((item) => {
            const part = isRecord(item) ? item : {};

            return {
              questionId: String(part.question_id ?? part.questionId ?? '').trim(),
              score: toNumber(part.score, 0) ?? 0,
              maxScore:
                part.max_score !== undefined
                  ? toNumber(part.max_score)
                  : part.maxScore !== undefined
                    ? toNumber(part.maxScore)
                    : undefined,
              isCorrect:
                typeof part.is_correct === 'boolean'
                  ? part.is_correct
                  : typeof part.isCorrect === 'boolean'
                    ? part.isCorrect
                    : undefined,
              feedback:
                typeof part.feedback === 'string'
                  ? cleanText(part.feedback, 1_000)
                  : undefined,
            };
          })
          .filter((item) => Boolean(item.questionId))
      : undefined,
    raw: payload,
  };
}

function normalizeAnswerValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanText(item, 1_000))
      .filter(Boolean)
      .join(', ');
  }

  return cleanText(value, 2_000);
}

function normalizeAiExamAttemptAnswer(item: unknown): AiExamAttemptAnswer {
  const row = isRecord(item) ? item : {};

  return {
    questionId: String(row.question_id ?? row.questionId ?? '').trim(),
    answer: normalizeAnswerValue(row.answer),
  };
}

function normalizeAiExamAttempt(item: unknown): AiExamAttempt {
  const row = isRecord(item) ? item : {};

  return {
    id: String(row.id ?? ''),
    examId: toNonEmptyString(row.exam_id ?? row.examId),
    userId: toNonEmptyString(row.user_id ?? row.userId),
    answers: Array.isArray(row.answers)
      ? row.answers
          .map((answerRow) => normalizeAiExamAttemptAnswer(answerRow))
          .filter((answer) => Boolean(answer.questionId))
      : [],
    result: isRecord(row.result) ? normalizeSubmitAiExamResponse(row.result) : null,
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : undefined,
    updatedAt:
      typeof row.updated_at === 'string'
        ? row.updated_at
        : typeof row.updatedAt === 'string'
          ? row.updatedAt
          : undefined,
    submittedAt:
      typeof row.submitted_at === 'string'
        ? row.submitted_at
        : typeof row.submittedAt === 'string'
          ? row.submittedAt
          : undefined,
    raw: item,
  };
}

/* ================= LEARNING ANALYSIS NORMALIZATION ================= */

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => cleanText(item, 1_000))
            .filter(Boolean),
        ),
      )
    : [];
}

function normalizeLearningUsedContext(value: unknown): LearningAiUsedContext {
  const row = isRecord(value) ? value : {};

  return {
    source: toLearningContextSource(row.source),
    courseId:
      row.course_id === null
        ? null
        : toNonEmptyString(row.course_id ?? row.courseId) ?? null,
    studentId:
      row.student_id === null
        ? null
        : toNonEmptyString(row.student_id ?? row.studentId) ?? null,
    courseTitle:
      row.course_title === null
        ? null
        : toNonEmptyString(row.course_title ?? row.courseTitle) ?? null,
    studentName:
      row.student_name === null
        ? null
        : toNonEmptyString(row.student_name ?? row.studentName) ?? null,
    subjectName:
      row.subject_name === null
        ? null
        : toNonEmptyString(row.subject_name ?? row.subjectName) ?? null,
    snapshotGeneratedAt:
      row.snapshot_generated_at === null
        ? null
        : toNonEmptyString(row.snapshot_generated_at ?? row.snapshotGeneratedAt) ?? null,
  };
}

function normalizeLearningAnalysisResponse(
  payload: unknown,
  fallbackMode: LearningAiMode,
): LearningAiResponse {
  const row = isRecord(payload) ? payload : {};

  return {
    answer: cleanText(row.answer, 12_000),
    generatedAt:
      toNonEmptyString(row.generated_at ?? row.generatedAt) ?? new Date().toISOString(),
    mode: toLearningAiMode(row.mode) ?? fallbackMode,
    usedContext: normalizeLearningUsedContext(row.used_context ?? row.usedContext),
    contextSummary:
      row.context_summary === null
        ? null
        : toNonEmptyString(row.context_summary ?? row.contextSummary) ?? null,
    confidence:
      row.confidence === 'low' || row.confidence === 'medium' || row.confidence === 'high'
        ? row.confidence
        : null,
    warnings: normalizeStringArray(row.warnings),
    followUpPrompts: normalizeStringArray(row.follow_up_prompts ?? row.followUpPrompts),
    raw: payload,
  };
}

/* ================= PUBLIC API ================= */

export async function listAiExams(
  options?: RequestOptions,
): Promise<ListAiExamsResponse> {
  const payload = await aiFetch<unknown>('/api/ai/exams', {}, options);

  const exams =
    isRecord(payload) && Array.isArray(payload.exams)
      ? payload.exams
      : Array.isArray(payload)
        ? payload
        : [];

  return {
    exams: exams.map((item) => normalizeAiExamSummary(item)),
    raw: payload,
  };
}

export async function generateQuestions(
  input: GenerateQuestionsRequest,
  options?: RequestOptions,
): Promise<GenerateQuestionsResponse> {
  const requestedCount = clampNumber(input.count ?? input.questionCount ?? 5, 1, 50);

  const payload = await aiFetch<unknown>(
    '/api/ai/generate-questions',
    {
      method: 'POST',
      body: buildJsonBody({
        source_text: input.sourceText,
        topic: input.topic,
        subject: input.subject,
        difficulty: input.difficulty,
        count: requestedCount,
        question_count: requestedCount,
        kind: input.kind ?? 'mixed',
        exam_mode: input.examMode,
      }),
    },
    options,
  );

  return normalizeGeneratedQuestions(payload);
}

export async function evaluateAnswer(
  input: EvaluateAnswerRequest,
  options?: RequestOptions,
): Promise<EvaluateAnswerResponse> {
  const payload = await aiFetch<unknown>(
    '/api/ai/evaluate-answer',
    {
      method: 'POST',
      body: buildJsonBody({
        question_id: input.questionId,
        question: input.question,
        expected_answer: input.expectedAnswer,
        reference_answer: input.referenceAnswer,
        student_answer: input.studentAnswer,
        rubric: input.rubric,
        context: input.context,
        options: input.options ?? [],
        answer_format: input.answerFormat,
      }),
    },
    options,
  );

  const row = isRecord(payload) ? payload : {};

  return {
    score: toNumber(row.score, 0) ?? 0,
    maxScore:
      row.max_score !== undefined
        ? toNumber(row.max_score)
        : row.maxScore !== undefined
          ? toNumber(row.maxScore)
          : undefined,
    isCorrect:
      typeof row.is_correct === 'boolean'
        ? row.is_correct
        : typeof row.isCorrect === 'boolean'
          ? row.isCorrect
          : undefined,
    feedback: cleanText(row.feedback ?? row.comment, 4_000),
    explanation:
      typeof row.explanation === 'string'
        ? cleanText(row.explanation, 4_000)
        : undefined,
    suggestion:
      typeof row.suggestion === 'string'
        ? cleanText(row.suggestion, 2_000)
        : undefined,
    strengths: normalizeStringArray(row.strengths),
    weaknesses: normalizeStringArray(row.weaknesses),
    raw: payload,
  };
}

export async function createTutorSession(
  input: CreateTutorSessionRequest,
  options?: RequestOptions,
): Promise<CreateTutorSessionResponse> {
  const payload = await aiFetch<unknown>(
    '/api/ai/tutor/session',
    {
      method: 'POST',
      body: buildJsonBody({
        lesson_id: input.lessonId,
        topic: input.topic,
        subject: input.subject,
        initial_context: input.initialContext,
      }),
    },
    options,
  );

  const row = isRecord(payload) ? payload : {};
  const session = isRecord(row.session) ? row.session : row;

  return {
    session: {
      id: String(session.id ?? row.id ?? ''),
      title: toNonEmptyString(session.title ?? row.title),
      lessonId:
        session.lesson_id === null
          ? null
          : toNonEmptyString(session.lesson_id ?? session.lessonId ?? row.lesson_id ?? row.lessonId) ?? null,
      subject:
        session.subject === null
          ? null
          : toNonEmptyString(session.subject ?? row.subject) ?? null,
      topic:
        session.topic === null
          ? null
          : toNonEmptyString(session.topic ?? row.topic) ?? null,
      createdAt:
        typeof session.created_at === 'string'
          ? session.created_at
          : typeof session.createdAt === 'string'
            ? session.createdAt
            : typeof row.created_at === 'string'
              ? row.created_at
              : undefined,
    },
    messages: Array.isArray(row.messages)
      ? row.messages
          .map((message, index) =>
            normalizeTutorMessage(message, `message-${index + 1}`),
          )
          .filter((message) => Boolean(message.content))
      : undefined,
    raw: payload,
  };
}

export async function sendTutorMessage(
  input: SendTutorMessageRequest,
  options?: RequestOptions,
): Promise<SendTutorMessageResponse> {
  const normalizedContext =
    typeof input.context === 'string'
      ? input.context.trim()
        ? { passage: input.context.trim() }
        : undefined
      : input.context;

  const payload = await aiFetch<unknown>(
    '/api/ai/tutor/chat',
    {
      method: 'POST',
      body: buildJsonBody({
        session_id: input.sessionId,
        message: input.message,
        lesson_id: input.lessonId,
        topic: input.topic,
        subject: input.subject,
        context: normalizedContext,
      }),
    },
    options,
  );

  const row = isRecord(payload) ? payload : {};

  return {
    sessionId: String(row.session_id ?? row.sessionId ?? input.sessionId),
    reply: normalizeTutorMessage(row.reply ?? { content: '' }, 'assistant-reply'),
    messages: Array.isArray(row.messages)
      ? row.messages
          .map((message, index) =>
            normalizeTutorMessage(message, `message-${index + 1}`),
          )
          .filter((message) => Boolean(message.content))
      : undefined,
    raw: payload,
  };
}

export async function createAiExam(
  input: CreateAiExamRequest,
  options?: RequestOptions,
): Promise<CreateAiExamResponse> {
  const payload = await aiFetch<unknown>(
    '/api/ai/exams',
    {
      method: 'POST',
      body: buildJsonBody({
        title: input.title,
        source_text: input.sourceText,
        topic: input.topic,
        subject: input.subject,
        difficulty: input.difficulty,
        kind: input.kind,
        exam_mode: input.examMode,
        question_count: clampNumber(input.questionCount ?? 10, 1, 50),
        duration_minutes: input.durationMinutes,
      }),
    },
    options,
  );

  const row = isRecord(payload) ? payload : {};

  return {
    exam: normalizeAiExamSummary(row.exam ?? row, {
      title: input.title,
    }),
    questions: normalizeAiExamQuestions(row.questions),
    meta: normalizeGenerationMeta(payload),
    testImportPayload: row.test_import_payload ?? row.testImportPayload,
    raw: payload,
  };
}

export async function getAiExamSession(
  examId: string,
  options?: RequestOptions,
): Promise<AiExamSession> {
  const payload = await aiFetch<unknown>(
    `/api/ai/exams/${encodePathSegment(examId)}`,
    {},
    options,
  );

  const row = isRecord(payload) ? payload : {};
  const latestAnswersRaw = row.latest_answers ?? row.latestAnswers;
  const latestResultRaw = row.latest_result ?? row.latestResult;

  return {
    exam: normalizeAiExamSummary(row.exam ?? row, {
      id: examId,
      title: 'AI емтихан',
    }),
    questions: normalizeAiExamQuestions(row.questions),
    startedAt:
      row.started_at === null
        ? null
        : typeof row.started_at === 'string'
          ? row.started_at
          : typeof row.startedAt === 'string'
            ? row.startedAt
            : null,
    attemptId:
      typeof row.attempt_id === 'string'
        ? row.attempt_id
        : typeof row.attemptId === 'string'
          ? row.attemptId
          : undefined,
    latestResult: isRecord(latestResultRaw)
      ? normalizeSubmitAiExamResponse(latestResultRaw)
      : null,
    latestAnswers: Array.isArray(latestAnswersRaw)
      ? latestAnswersRaw
          .map((answerRow) => normalizeAiExamAttemptAnswer(answerRow))
          .filter((answer) => Boolean(answer.questionId))
      : [],
    latestSubmittedAt:
      row.latest_submitted_at === null
        ? null
        : typeof row.latest_submitted_at === 'string'
          ? row.latest_submitted_at
          : typeof row.latestSubmittedAt === 'string'
            ? row.latestSubmittedAt
            : null,
    raw: payload,
  };
}

export async function listPublishedAiExams(
  options?: RequestOptions,
): Promise<ListAiExamsResponse> {
  const payload = await aiFetch<unknown>('/api/ai/exams/published', {}, options);

  const exams =
    isRecord(payload) && Array.isArray(payload.exams)
      ? payload.exams
      : Array.isArray(payload)
        ? payload
        : [];

  return {
    exams: exams.map((item) => normalizeAiExamSummary(item)),
    raw: payload,
  };
}

export async function listAiExamAttempts(
  examId: string,
  options?: RequestOptions,
): Promise<ListAiExamAttemptsResponse> {
  const payload = await aiFetch<unknown>(
    `/api/ai/exams/${encodePathSegment(examId)}/attempts`,
    {},
    options,
  );

  const row = isRecord(payload) ? payload : {};

  const attempts = Array.isArray(row.attempts)
    ? row.attempts
    : Array.isArray(payload)
      ? payload
      : [];

  return {
    attempts: attempts.map((item) => normalizeAiExamAttempt(item)),
    count: row.count !== undefined ? Number(row.count) : attempts.length,
    raw: payload,
  };
}

export async function updateAiExamStatus(
  examId: string,
  status: 'draft' | 'published' | 'archived',
  options?: RequestOptions,
): Promise<CreateAiExamResponse> {
  const payload = await aiFetch<unknown>(
    `/api/ai/exams/${encodePathSegment(examId)}/status`,
    {
      method: 'PATCH',
      body: buildJsonBody({
        status,
      }),
    },
    options,
  );

  const row = isRecord(payload) ? payload : {};

  return {
    exam: normalizeAiExamSummary(row.exam ?? row, {
      id: examId,
      title: 'AI емтихан',
      status,
    }),
    questions: normalizeAiExamQuestions(row.questions),
    meta: normalizeGenerationMeta(payload),
    testImportPayload: row.test_import_payload ?? row.testImportPayload,
    raw: payload,
  };
}

export async function submitAiExam(
  examId: string,
  input: SubmitAiExamRequest,
  options?: RequestOptions,
): Promise<SubmitAiExamResponse> {
  const payload = await aiFetch<unknown>(
    `/api/ai/exams/${encodePathSegment(examId)}/submit`,
    {
      method: 'POST',
      body: buildJsonBody({
        answers: input.answers.map((item) => ({
          question_id: item.questionId,
          answer: item.answer,
        })),
      }),
    },
    options,
  );

  return normalizeSubmitAiExamResponse(payload);
}

export async function createLearningAnalysis(
  input: LearningAiRequest,
  options?: RequestOptions,
): Promise<LearningAiResponse> {
  const payload = await aiFetch<unknown>(
    '/api/learning-analysis',
    {
      method: 'POST',
      body: buildJsonBody({
        mode: input.mode,
        role: input.role,
        prompt: input.prompt,
        selectedSuggestionId: input.selectedSuggestionId,
        scope: input.scope,
        conversationHistory: input.conversationHistory ?? [],
      }),
    },
    options,
  );

  return normalizeLearningAnalysisResponse(payload, input.mode);
}