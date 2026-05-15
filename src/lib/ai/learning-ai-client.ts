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

  return limit ? text.slice(0, limit) : text;
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
    courseId: cleanText(scope.courseId, 120) || undefined,
    studentId: cleanText(scope.studentId, 120) || undefined,
    subjectId: cleanText(scope.subjectId, 120) || undefined,
    subjectName: cleanText(scope.subjectName, 180) || undefined,
    gradeLevel: cleanText(scope.gradeLevel, 120) || undefined,
    targetAudience: cleanText(scope.targetAudience, 180) || undefined,
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
    cleanText(request.selectedSuggestionId, 160) || undefined;
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
    return 'Бұл AI режимі тек оқушы рөлі үшін қолжетімді.';
  }

  if (
    (request.mode === 'teacher_course_assistant' ||
      request.mode === 'teacher_student_assistant' ||
      request.mode === 'teacher_course_creator_advisor') &&
    request.role !== 'teacher'
  ) {
    return 'Бұл AI режимі тек мұғалім рөлі үшін қолжетімді.';
  }

  if (request.mode === 'teacher_course_assistant' && !request.scope?.courseId) {
    return 'Курс бойынша AI көмекші үшін courseId қажет.';
  }

  if (
    request.mode === 'teacher_student_assistant' &&
    (!request.scope?.courseId || !request.scope?.studentId)
  ) {
    return 'Оқушы бойынша AI көмекші үшін courseId және studentId қажет.';
  }

  if (!isValidUuidOrEmpty(request.scope?.courseId)) {
    return 'courseId UUID форматында болуы керек.';
  }

  if (!isValidUuidOrEmpty(request.scope?.studentId)) {
    return 'studentId UUID форматында болуы керек.';
  }

  if (!isValidUuidOrEmpty(request.scope?.subjectId)) {
    return 'subjectId UUID форматында болуы керек.';
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
    return message || error || `AI backend қатесі: ${status}`;
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (status === 401) {
    return 'AI backend авторизацияны қабылдамады. Supabase session немесе access token тексерілуі керек.';
  }

  if (status === 403) {
    return 'AI backend бұл scope үшін рұқсат бермеді. Course/student access немесе user role тексерілуі керек.';
  }

  if (status === 404) {
    return 'AI endpoint табылмады. Backend URL және /api/learning-analysis route дұрыс қосылғанын тексеріңіз.';
  }

  if (status === 422) {
    return 'AI сұранысының форматы дұрыс емес. Mode, role, scope және prompt мәндерін тексеріңіз.';
  }

  if (status >= 500) {
    return `AI backend ішкі қатесі: ${status}. Render backend logs ішінен learning-analysis service қатесін тексеріңіз.`;
  }

  return `AI backend қатесі: ${status}`;
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
    return 'AI backend-ке қосылу мүмкін болмады. VITE_AI_API_BASE_URL, Render backend status және CORS allowed origins баптауларын тексеріңіз.';
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

  return { signal: controller.signal, cleanup };
}

function normalizeLearningAiResponse(data: LearningAiResponse): LearningAiResponse {
  return {
    ...data,
    answer: cleanText(data.answer),
    contextSummary: data.contextSummary
      ? cleanText(data.contextSummary, 2_000)
      : undefined,
    warnings: Array.isArray(data.warnings)
      ? data.warnings.map((item) => cleanText(item, 400)).filter(Boolean)
      : [],
    followUpPrompts: Array.isArray(data.followUpPrompts)
      ? data.followUpPrompts.map((item) => cleanText(item, 240)).filter(Boolean)
      : [],
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
        'AI backend URL көрсетілмеген. Frontend env ішінде VITE_AI_API_BASE_URL=https://сіздің-backend.onrender.com болуы керек. VITE_AI_API_URL уақытша fallback ретінде ғана оқылады.',
    };
  }

  const accessToken = options?.accessToken?.trim();

  if (!accessToken) {
    return {
      ok: false,
      error: 'AI backend үшін Supabase access token қажет. Аккаунт session-ы жаңартылуы керек.',
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
        error: 'AI backend жауап қайтарды, бірақ JSON object форматы дұрыс емес.',
      };
    }

    const data = payload as LearningAiResponse;

    if (!data.answer || typeof data.answer !== 'string' || !data.answer.trim()) {
      return {
        ok: false,
        error: 'AI backend жауап қайтарды, бірақ answer өрісі бос.',
      };
    }

    if (!data.usedContext || !isRecord(data.usedContext)) {
      return {
        ok: false,
        error: 'AI backend жауап қайтарды, бірақ usedContext өрісі жоқ немесе дұрыс емес.',
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