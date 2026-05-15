import type {
  LearningAiClientResult,
  LearningAiConversationMessage,
  LearningAiRequest,
  LearningAiResponse,
} from './learning-ai-types';

const DEFAULT_AI_ENDPOINT_PATH = '/api/learning-analysis';
const DEFAULT_TIMEOUT_MS = 120_000;

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

function trimTrailingSlash(value: string | undefined) {
  return value?.trim().replace(/\/+$/, '') || '';
}

function trimLeadingSlash(value: string) {
  return value.replace(/^\/+/, '');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, limit?: number): string {
  const text = String(value ?? '')
    .replace(/\x00/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return typeof limit === 'number' ? text.slice(0, limit).trim() : text;
}

function getEnvValue(name: string): string {
  const env = import.meta.env as Record<string, unknown>;
  const value = env[name];

  return typeof value === 'string' ? value.trim() : '';
}

function getAiApiBaseUrl() {
  return (
    trimTrailingSlash(getEnvValue('VITE_AI_API_BASE_URL')) ||
    trimTrailingSlash(getEnvValue('VITE_AI_API_URL'))
  );
}

function getLearningAiEndpoint() {
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

export function isLearningAiConfigured() {
  return Boolean(getLearningAiEndpoint());
}

function isValidUuidOrEmpty(value: string | null | undefined) {
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

  const conversationHistory = normalizeConversationHistory(
    request.conversationHistory,
  );

  return {
    ...request,
    prompt: cleanText(request.prompt, MAX_PROMPT_CHARS),
    selectedSuggestionId,
    scope: normalizeScope(request.scope),
    conversationHistory,
  };
}

function validateLearningAiRequest(request: LearningAiRequest) {
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
    return 'Бұл AI режимі оқушы аккаунтына арналған.';
  }

  if (
    (request.mode === 'teacher_course_assistant' ||
      request.mode === 'teacher_student_assistant' ||
      request.mode === 'teacher_course_creator_advisor') &&
    request.role !== 'teacher'
  ) {
    return 'Бұл AI режимі мұғалім аккаунтына арналған.';
  }

  if (request.mode === 'teacher_course_assistant' && !request.scope?.courseId) {
    return 'Курс бойынша AI көмекші үшін курс таңдалуы керек.';
  }

  if (
    request.mode === 'teacher_student_assistant' &&
    (!request.scope?.courseId || !request.scope?.studentId)
  ) {
    return 'Оқушы бойынша AI көмекші үшін курс пен оқушы таңдалуы керек.';
  }

  if (!isValidUuidOrEmpty(request.scope?.courseId)) {
    return 'Курс идентификаторы UUID форматында болуы керек.';
  }

  if (!isValidUuidOrEmpty(request.scope?.studentId)) {
    return 'Оқушы идентификаторы UUID форматында болуы керек.';
  }

  if (!isValidUuidOrEmpty(request.scope?.subjectId)) {
    return 'Пән идентификаторы UUID форматында болуы керек.';
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

function getStringField(payload: unknown, key: string) {
  if (!isRecord(payload)) {
    return null;
  }

  const value = payload[key];

  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
        ? item.loc.map((part) => String(part)).filter(Boolean).join('.')
        : '';

      if (!msg) return '';

      return loc ? `${loc}: ${msg}` : msg;
    })
    .filter(Boolean);

  return messages.length ? messages.slice(0, 3).join('; ') : null;
}

function getBackendErrorMessage(status: number, payload: unknown) {
  const detail = isRecord(payload) ? payload.detail : null;

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
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
    return payload.trim();
  }

  if (status === 401) {
    return 'AI сервері авторизацияны қабылдамады. Аккаунт сессиясын жаңартып көріңіз.';
  }

  if (status === 403) {
    return 'Бұл дерекке AI арқылы кіруге рұқсат жоқ. Рөл немесе курсқа қолжетімділікті тексеріңіз.';
  }

  if (status === 404) {
    return 'AI серверінің талдау маршруты табылмады. Backend URL және /api/learning-analysis маршрутын тексеріңіз.';
  }

  if (status === 422) {
    return 'AI сұранысының форматы дұрыс емес. Режим, рөл, курс/оқушы дерегі және сұрақ мәндерін тексеріңіз.';
  }

  if (status >= 500) {
    return `AI серверінің ішкі қатесі: ${status}. Backend логтарын тексеріңіз.`;
  }

  return `AI сервер қатесі: ${status}`;
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  );
}

function getNetworkErrorMessage(error: unknown) {
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
    return 'AI серверіне қосылу мүмкін болмады. VITE_AI_API_BASE_URL, Render backend status және CORS allowed origins баптауларын тексеріңіз.';
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'AI жауабы кешікті. Қайта жіберіп көріңіз.';
  }

  return rawMessage || 'AI сұранысын орындау кезінде белгісіз қате болды.';
}

function createTimeoutSignal(
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

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

function normalizeStringList(values: unknown, limit: number, itemLimit: number) {
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
      error:
        'AI серверінің URL көрсетілмеген. Frontend env ішінде VITE_AI_API_BASE_URL=https://сіздің-backend.onrender.com болуы керек.',
    };
  }

  const accessToken = options?.accessToken?.trim();

  if (!accessToken) {
    return {
      ok: false,
      error: 'AI сұранысы үшін аккаунт сессиясы қажет. Қайта кіріп көріңіз.',
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
        error: 'AI сервері жауап қайтарды, бірақ жауап форматы дұрыс емес.',
      };
    }

    const data = payload as LearningAiResponse;

    if (!data.answer || typeof data.answer !== 'string' || !data.answer.trim()) {
      return {
        ok: false,
        error: 'AI сервері жауап қайтарды, бірақ жауап мәтіні бос.',
      };
    }

    if (!data.usedContext || !isRecord(data.usedContext)) {
      return {
        ok: false,
        error: 'AI сервері жауап қайтарды, бірақ қолданылған дерек форматы дұрыс емес.',
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