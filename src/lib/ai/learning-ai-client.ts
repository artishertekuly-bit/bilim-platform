import { limitText, normalizeTextInput } from '../utils';
import type {
  LearningAiClientResult,
  LearningAiConversationMessage,
  LearningAiRequest,
  LearningAiResponse,
} from './learning-ai-types';

const DEFAULT_AI_ENDPOINT_PATH = '/api/learning-analysis';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

const MAX_PROMPT_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_CHARS = 6_000;

const MAX_SCOPE_ID_CHARS = 120;
const MAX_SCOPE_TEXT_CHARS = 180;
const MAX_SELECTED_SUGGESTION_ID_CHARS = 160;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RequestLearningAiOptions = {
  accessToken?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type JsonRecord = Record<string, unknown>;
type LearningAiConversationRole = LearningAiConversationMessage['role'];

function trimTrailingSlash(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, '') || '';
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, '');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, limit?: number): string {
  const normalized = normalizeTextInput(value);

  if (typeof limit !== 'number') {
    return normalized;
  }

  return limitText(normalized, limit);
}

function getEnvValue(name: string): string {
  const env = import.meta.env as Record<string, unknown>;
  const value = env[name];

  return typeof value === 'string' ? value.trim() : '';
}

function getAiApiBaseUrl(): string {
  return (
    trimTrailingSlash(getEnvValue('VITE_AI_API_BASE_URL')) ||
    trimTrailingSlash(getEnvValue('VITE_AI_API_URL'))
  );
}

function getLearningAiEndpoint(): string | null {
  const baseUrl = getAiApiBaseUrl();

  if (!baseUrl) {
    return null;
  }

  if (baseUrl.endsWith(DEFAULT_AI_ENDPOINT_PATH)) {
    return baseUrl;
  }

  if (baseUrl.endsWith('/api')) {
    return `${baseUrl}/learning-analysis`;
  }

  return `${baseUrl}/${trimLeadingSlash(DEFAULT_AI_ENDPOINT_PATH)}`;
}

export function isLearningAiConfigured(): boolean {
  return Boolean(getLearningAiEndpoint());
}

function isValidUuidOrEmpty(value: string | null | undefined): boolean {
  return !value || UUID_RE.test(value);
}

function normalizeScope(
  scope: LearningAiRequest['scope'],
): LearningAiRequest['scope'] | undefined {
  if (!scope) {
    return undefined;
  }

  const normalized: NonNullable<LearningAiRequest['scope']> = {
    courseId: cleanText(scope.courseId, MAX_SCOPE_ID_CHARS) || undefined,
    studentId: cleanText(scope.studentId, MAX_SCOPE_ID_CHARS) || undefined,
    subjectId: cleanText(scope.subjectId, MAX_SCOPE_ID_CHARS) || undefined,
    subjectName: cleanText(scope.subjectName, MAX_SCOPE_TEXT_CHARS) || undefined,
    gradeLevel: cleanText(scope.gradeLevel, MAX_SCOPE_ID_CHARS) || undefined,
    targetAudience: cleanText(scope.targetAudience, MAX_SCOPE_TEXT_CHARS) || undefined,
  };

  const hasAnyValue = Object.values(normalized).some(Boolean);

  return hasAnyValue ? normalized : undefined;
}

function normalizeConversationRole(role: unknown): LearningAiConversationRole {
  return role === 'assistant' ? 'assistant' : 'user';
}

function normalizeConversationHistory(
  history: LearningAiRequest['conversationHistory'],
): LearningAiConversationMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message): LearningAiConversationMessage => ({
      role: normalizeConversationRole(message.role),
      content: cleanText(message.content, MAX_HISTORY_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.length > 0);
}

function normalizeRequest(request: LearningAiRequest): LearningAiRequest {
  const selectedSuggestionId =
    cleanText(request.selectedSuggestionId, MAX_SELECTED_SUGGESTION_ID_CHARS) ||
    undefined;

  return {
    ...request,
    prompt: cleanText(request.prompt, MAX_PROMPT_CHARS),
    selectedSuggestionId,
    scope: normalizeScope(request.scope),
    conversationHistory: normalizeConversationHistory(request.conversationHistory),
  };
}

function validateLearningAiRequest(request: LearningAiRequest): string | null {
  if (!request.prompt?.trim()) {
    return 'Сұрақ бос болмауы керек.';
  }

  if (request.prompt.length > MAX_PROMPT_CHARS) {
    return `Сұрақ тым ұзын. Максимум ${MAX_PROMPT_CHARS} таңба.`;
  }

  if (
    (request.mode === 'student_tracker' ||
      request.mode === 'student_course_advisor') &&
    request.role !== 'student'
  ) {
    return 'Бұл режим оқушы аккаунтына арналған.';
  }

  if (
    (request.mode === 'teacher_course_assistant' ||
      request.mode === 'teacher_student_assistant' ||
      request.mode === 'teacher_course_creator_advisor') &&
    request.role !== 'teacher'
  ) {
    return 'Бұл режим мұғалім аккаунтына арналған.';
  }

  if (request.mode === 'teacher_course_assistant' && !request.scope?.courseId) {
    return 'Курс таңдалуы керек.';
  }

  if (
    request.mode === 'teacher_student_assistant' &&
    (!request.scope?.courseId || !request.scope?.studentId)
  ) {
    return 'Курс пен оқушы таңдалуы керек.';
  }

  if (!isValidUuidOrEmpty(request.scope?.courseId)) {
    return 'Курс идентификаторы дұрыс емес.';
  }

  if (!isValidUuidOrEmpty(request.scope?.studentId)) {
    return 'Оқушы идентификаторы дұрыс емес.';
  }

  if (!isValidUuidOrEmpty(request.scope?.subjectId)) {
    return 'Пән идентификаторы дұрыс емес.';
  }

  return null;
}

async function readResponseBody(response: Response): Promise<unknown> {
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

function getStringField(payload: unknown, key: string): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const value = payload[key];
  const text = cleanText(value);

  return text || null;
}

function getPydanticErrorMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) {
    return null;
  }

  const messages = detail
    .map((item) => {
      if (!isRecord(item)) return '';

      const msg = cleanText(item.msg);
      const loc = Array.isArray(item.loc)
        ? item.loc.map((part) => cleanText(part)).filter(Boolean).join('.')
        : '';

      if (!msg) return '';

      return loc ? `${loc}: ${msg}` : msg;
    })
    .filter(Boolean);

  return messages.length ? messages.slice(0, 3).join('; ') : null;
}

function getBackendErrorMessage(status: number, payload: unknown): string {
  const detail = isRecord(payload) ? payload.detail : null;

  if (typeof detail === 'string' && detail.trim()) {
    return cleanText(detail);
  }

  const pydanticMessage = getPydanticErrorMessage(detail);

  if (pydanticMessage) {
    return pydanticMessage;
  }

  const message = getStringField(payload, 'message');
  const error = getStringField(payload, 'error');

  if (message || error) {
    return message || error || `AI сервер қатесі: ${status}`;
  }

  if (typeof payload === 'string' && payload.trim()) {
    return cleanText(payload);
  }

  if (status === 401) {
    return 'Сессия аяқталған. Қайта кіріңіз.';
  }

  if (status === 403) {
    return 'Бұл әрекетке рұқсат жоқ.';
  }

  if (status === 404) {
    return 'AI қызметі табылмады.';
  }

  if (status === 422) {
    return 'Сұраныс деректері дұрыс емес.';
  }

  if (status >= 500) {
    return 'AI серверінде қате пайда болды.';
  }

  return `AI сервер қатесі: ${status}`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  );
}

function getNetworkErrorMessage(error: unknown): string {
  if (isAbortError(error)) {
    return 'AI сұранысы тоқтатылды.';
  }

  const rawMessage = error instanceof Error ? error.message : '';
  const lowerMessage = rawMessage.toLowerCase();

  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('networkerror') ||
    lowerMessage.includes('load failed')
  ) {
    return 'AI серверіне қосылу мүмкін болмады.';
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'AI жауабы кешікті. Қайталап көріңіз.';
  }

  return cleanText(rawMessage) || 'AI сұранысын орындау кезінде қате пайда болды.';
}

function normalizeTimeoutMs(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(1_000, Math.min(MAX_TIMEOUT_MS, value));
}

function createTimeoutSignal(
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs);
  const timeoutId = globalThis.setTimeout(() => controller.abort(), normalizedTimeoutMs);

  const abortFromExternal = () => controller.abort();

  const cleanup = () => {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup,
  };
}

function normalizeStringList(values: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const output: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = cleanText(value, itemLimit);
    const key = text.toLowerCase();

    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(text);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function normalizeLearningAiResponse(data: LearningAiResponse): LearningAiResponse {
  return {
    ...data,
    answer: cleanText(data.answer),
    contextSummary: data.contextSummary
      ? cleanText(data.contextSummary, 2_000)
      : undefined,
    warnings: normalizeStringList(data.warnings, 6, 400),
    followUpPrompts: normalizeStringList(data.followUpPrompts, 6, 240),
  };
}

export async function requestLearningAiAnalysis(
  request: LearningAiRequest,
  options?: RequestLearningAiOptions,
): Promise<LearningAiClientResult> {
  const normalizedRequest = normalizeRequest(request);
  const validationError = validateLearningAiRequest(normalizedRequest);

  if (validationError) {
    return {
      ok: false,
      error: validationError,
    };
  }

  const endpoint = getLearningAiEndpoint();

  if (!endpoint) {
    return {
      ok: false,
      error: 'AI серверінің мекенжайы көрсетілмеген.',
    };
  }

  const accessToken = options?.accessToken?.trim();

  if (!accessToken) {
    return {
      ok: false,
      error: 'AI сұранысы үшін аккаунт сессиясы қажет. Қайта кіріңіз.',
    };
  }

  const timeout = createTimeoutSignal(options?.signal, options?.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: timeout.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(normalizedRequest),
    });

    const payload = await readResponseBody(response);

    if (!response.ok) {
      return {
        ok: false,
        error: getBackendErrorMessage(response.status, payload),
      };
    }

    if (!isRecord(payload)) {
      return {
        ok: false,
        error: 'AI серверінің жауабы дұрыс емес.',
      };
    }

    const data = payload as LearningAiResponse;

    if (!data.answer || typeof data.answer !== 'string' || !data.answer.trim()) {
      return {
        ok: false,
        error: 'AI жауабы бос келді.',
      };
    }

    if (!data.usedContext || !isRecord(data.usedContext)) {
      return {
        ok: false,
        error: 'AI жауабындағы дерек форматы дұрыс емес.',
      };
    }

    return {
      ok: true,
      data: normalizeLearningAiResponse(data),
    };
  } catch (error) {
    return {
      ok: false,
      error: getNetworkErrorMessage(error),
    };
  } finally {
    timeout.cleanup();
  }
}