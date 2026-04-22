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
  role: 'user' | 'assistant' | 'system';
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

const DEFAULT_TIMEOUT_MS = 360_000;

function getEnv(): Record<string, unknown> {
  return ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env ?? {});
}

function getAiApiBaseUrl(): string {
  const env = getEnv();
  const rawBaseUrl = env.VITE_AI_API_BASE_URL;
  const baseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.trim() : '';

  if (!baseUrl) {
    throw new AiApiError(
      'VITE_AI_API_BASE_URL орнатылмаған. .env файлына AI backend URL қосыңыз.'
    );
  }

  return baseUrl.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
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

function toOptionalQuestionKind(value: unknown): AiQuestionKind | undefined {
  return value === 'multiple_choice' || value === 'short_answer' || value === 'mixed'
    ? value
    : undefined;
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
  if (options?.requireAuth === false) {
    return;
  }

  if (!options?.accessToken?.trim()) {
    throw new AiApiError(
      'AI API үшін accessToken қажет. Supabase session.access_token мәнін options.accessToken арқылы жіберіңіз.'
    );
  }
}

function buildJsonBody(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function extractErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail.trim();
    }

    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message.trim();
    }

    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error.trim();
    }
  }

  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }

  return `AI API қате қайтарды (${status})`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text || null;
}

function createTimeoutSignal(
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): AbortSignal {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  const abortFromExternal = () => {
    controller.abort();
  };

  const cleanup = () => {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  };

  controller.signal.addEventListener('abort', cleanup, { once: true });

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  return controller.signal;
}

async function aiFetch<T>(
  path: string,
  init: RequestInit = {},
  options?: RequestOptions
): Promise<T> {
  ensureRequiredAuth(options);

  const url = `${getAiApiBaseUrl()}${path}`;
  const signal = createTimeoutSignal(options?.signal, options?.timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: buildHeaders(options, init.headers),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AiApiError('AI API сұранысы уақытынан асып кетті немесе тоқтатылды.');
    }

    const message =
      error instanceof Error
        ? `AI API-ге қосылу сәтсіз аяқталды: ${error.message}`
        : 'AI API-ге қосылу сәтсіз аяқталды.';

    throw new AiApiError(message);
  }

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new AiApiError(
      extractErrorMessage(body, response.status),
      response.status,
      body
    );
  }

  return body as T;
}

function normalizeGeneratedQuestionOption(
  option: unknown,
  optionIndex: number
): GeneratedQuestionOption {
  if (typeof option === 'string') {
    return {
      id: `option-${optionIndex + 1}`,
      text: option.trim(),
    };
  }

  const row = isRecord(option) ? option : {};

  return {
    id: String(row.id ?? `option-${optionIndex + 1}`),
    text: String(row.text ?? row.label ?? '').trim(),
    isCorrect:
      typeof row.isCorrect === 'boolean'
        ? row.isCorrect
        : typeof row.is_correct === 'boolean'
          ? row.is_correct
          : undefined,
  };
}

function normalizeGeneratedQuestion(
  item: unknown,
  index: number
): GeneratedQuestion {
  const row = isRecord(item) ? item : {};

  const options = Array.isArray(row.options)
    ? row.options
        .map((option, optionIndex) =>
          normalizeGeneratedQuestionOption(option, optionIndex)
        )
        .filter((option) => Boolean(option.text))
    : undefined;

  return {
    id: String(row.id ?? row.question_id ?? `generated-${index + 1}`),
    type:
      row.type === 'short_answer' || row.type === 'multiple_choice'
        ? row.type
        : options?.length
          ? 'multiple_choice'
          : 'short_answer',
    question: String(row.question ?? row.text ?? '').trim(),
    options: options?.length ? options : undefined,
    correctAnswer:
      typeof row.correctAnswer === 'string'
        ? row.correctAnswer.trim()
        : typeof row.correct_answer === 'string'
          ? row.correct_answer.trim()
          : undefined,
    explanation:
      typeof row.explanation === 'string'
        ? row.explanation.trim()
        : typeof row.reference_answer === 'string'
          ? row.reference_answer.trim()
          : undefined,
    difficulty: typeof row.difficulty === 'string' ? row.difficulty : undefined,
    topic: typeof row.topic === 'string' ? row.topic : undefined,
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
      .map((item, index) => normalizeGeneratedQuestion(item, index))
      .filter((item) => Boolean(item.question)),
    meta: normalizeGenerationMeta(payload),
    raw: payload,
  };
}

function normalizeTutorMessage(message: unknown, fallbackId: string): TutorMessage {
  const row = isRecord(message) ? message : {};

  const role =
    row.role === 'user' || row.role === 'assistant' || row.role === 'system'
      ? row.role
      : 'assistant';

  return {
    id: String(row.id ?? fallbackId),
    role,
    content: String(row.content ?? '').trim(),
    createdAt:
      typeof row.created_at === 'string'
        ? row.created_at
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : undefined,
  };
}

function normalizeAiExamSummary(
  item: unknown,
  fallback: {
    id?: string;
    title?: string;
    status?: 'draft' | 'published' | 'archived';
  } = {}
): AiExamSummary {
  const row = isRecord(item) ? item : {};

  return {
    id: String(row.id ?? fallback.id ?? ''),
    title: String(row.title ?? fallback.title ?? 'AI Exam').trim(),
    subject: row.subject === null ? null : toNonEmptyString(row.subject) ?? null,
    topic: row.topic === null ? null : toNonEmptyString(row.topic) ?? null,
    status:
      row.status === 'draft' || row.status === 'published' || row.status === 'archived'
        ? row.status
        : fallback.status,
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
          normalizeGeneratedQuestionOption(option, optionIndex)
        )
        .filter((option) => Boolean(option.text))
    : undefined;

  const type =
    row.type === 'short_answer' || row.type === 'multiple_choice'
      ? row.type
      : row.questionType === 'single_choice' || row.questionType === 'multiple_choice'
        ? 'multiple_choice'
        : options?.length
          ? 'multiple_choice'
          : 'short_answer';

  return {
    id: String(row.id ?? `exam-question-${index + 1}`),
    type,
    question: String(row.question ?? row.questionText ?? '').trim(),
    options: options?.length ? options : undefined,
    points: toNumber(row.points),
    correctAnswer:
      typeof row.correctAnswer === 'string'
        ? row.correctAnswer.trim()
        : typeof row.correct_answer === 'string'
          ? row.correct_answer.trim()
          : undefined,
    explanation: typeof row.explanation === 'string' ? row.explanation.trim() : undefined,
    difficulty: typeof row.difficulty === 'string' ? row.difficulty : undefined,
    topic: typeof row.topic === 'string' ? row.topic : undefined,
  };
}

function normalizeAiExamQuestions(items: unknown): AiExamQuestion[] {
  return Array.isArray(items)
    ? items
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
    score: Number(row.score ?? 0),
    maxScore:
      row.max_score !== undefined
        ? toNumber(row.max_score)
        : row.maxScore !== undefined
          ? toNumber(row.maxScore)
          : undefined,
    percentage: row.percentage !== undefined ? toNumber(row.percentage) : undefined,
    feedback: typeof row.feedback === 'string' ? row.feedback.trim() : undefined,
    breakdown: Array.isArray(row.breakdown)
      ? row.breakdown.map((item) => {
          const part = isRecord(item) ? item : {};
          return {
            questionId: String(part.question_id ?? part.questionId ?? ''),
            score: Number(part.score ?? 0),
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
            feedback: typeof part.feedback === 'string' ? part.feedback.trim() : undefined,
          };
        })
      : undefined,
    raw: payload,
  };
}

function normalizeAnswerValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join(', ');
  }

  return String(value ?? '').trim();
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
      ? row.answers.map((answerRow) => normalizeAiExamAttemptAnswer(answerRow))
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

export async function listAiExams(
  options?: RequestOptions
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
  options?: RequestOptions
): Promise<GenerateQuestionsResponse> {
  const requestedCount = input.count ?? input.questionCount ?? 5;

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
    options
  );

  return normalizeGeneratedQuestions(payload);
}

export async function evaluateAnswer(
  input: EvaluateAnswerRequest,
  options?: RequestOptions
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
    options
  );

  const row = isRecord(payload) ? payload : {};

  return {
    score: Number(row.score ?? 0),
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
    feedback: String(row.feedback ?? row.comment ?? '').trim(),
    explanation: typeof row.explanation === 'string' ? row.explanation.trim() : undefined,
    suggestion: typeof row.suggestion === 'string' ? row.suggestion.trim() : undefined,
    strengths: Array.isArray(row.strengths)
      ? row.strengths.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      : undefined,
    weaknesses: Array.isArray(row.weaknesses)
      ? row.weaknesses.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      : undefined,
    raw: payload,
  };
}

export async function createTutorSession(
  input: CreateTutorSessionRequest,
  options?: RequestOptions
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
    options
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
          : toNonEmptyString(session.lesson_id ?? row.lesson_id) ?? null,
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
          : typeof row.created_at === 'string'
            ? row.created_at
            : undefined,
    },
    messages: Array.isArray(row.messages)
      ? row.messages
          .map((message, index) => normalizeTutorMessage(message, `message-${index + 1}`))
          .filter((message) => Boolean(message.content))
      : undefined,
    raw: payload,
  };
}

export async function sendTutorMessage(
  input: SendTutorMessageRequest,
  options?: RequestOptions
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
    options
  );

  const row = isRecord(payload) ? payload : {};

  return {
    sessionId: String(row.session_id ?? input.sessionId),
    reply: normalizeTutorMessage(row.reply ?? { content: '' }, 'assistant-reply'),
    messages: Array.isArray(row.messages)
      ? row.messages
          .map((message, index) => normalizeTutorMessage(message, `message-${index + 1}`))
          .filter((message) => Boolean(message.content))
      : undefined,
    raw: payload,
  };
}

export async function createAiExam(
  input: CreateAiExamRequest,
  options?: RequestOptions
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
        question_count: input.questionCount ?? 10,
        duration_minutes: input.durationMinutes,
      }),
    },
    options
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
  options?: RequestOptions
): Promise<AiExamSession> {
  const payload = await aiFetch<unknown>(`/api/ai/exams/${examId}`, {}, options);
  const row = isRecord(payload) ? payload : {};

  const latestAnswersRaw = row.latest_answers ?? row.latestAnswers;
  const latestResultRaw = row.latest_result ?? row.latestResult;

  return {
    exam: normalizeAiExamSummary(row.exam ?? row, {
      id: examId,
      title: 'AI Exam',
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
      ? latestAnswersRaw.map((answerRow) => normalizeAiExamAttemptAnswer(answerRow))
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
  options?: RequestOptions
): Promise<ListAiExamsResponse> {
  const payload = await aiFetch<unknown>(
    '/api/ai/exams/published',
    {},
    {
      ...options,
      requireAuth: options?.requireAuth ?? false,
    }
  );

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
  options?: RequestOptions
): Promise<ListAiExamAttemptsResponse> {
  const payload = await aiFetch<unknown>(`/api/ai/exams/${examId}/attempts`, {}, options);
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
  options?: RequestOptions
): Promise<CreateAiExamResponse> {
  const payload = await aiFetch<unknown>(
    `/api/ai/exams/${examId}/status`,
    {
      method: 'PATCH',
      body: buildJsonBody({ status }),
    },
    options
  );

  const row = isRecord(payload) ? payload : {};

  return {
    exam: normalizeAiExamSummary(row.exam ?? row, {
      id: examId,
      title: 'AI Exam',
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
  options?: RequestOptions
): Promise<SubmitAiExamResponse> {
  const payload = await aiFetch<unknown>(
    `/api/ai/exams/${examId}/submit`,
    {
      method: 'POST',
      body: buildJsonBody({
        answers: input.answers.map((item) => ({
          question_id: item.questionId,
          answer: item.answer,
        })),
      }),
    },
    options
  );

  return normalizeSubmitAiExamResponse(payload);
}