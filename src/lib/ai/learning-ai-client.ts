import type {
  LearningAiClientResult,
  LearningAiRequest,
  LearningAiResponse,
} from './learning-ai-types';

const DEFAULT_AI_ENDPOINT_PATH = '/api/learning-analysis';

function trimTrailingSlash(value: string | undefined) {
  return value?.trim().replace(/\/+$/, '') || '';
}

function trimLeadingSlash(value: string) {
  return value.replace(/^\/+/, '');
}

function getAiApiBaseUrl() {
  return (
    trimTrailingSlash(import.meta.env.VITE_AI_API_BASE_URL) ||
    trimTrailingSlash(import.meta.env.VITE_AI_API_URL)
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

  return `${baseUrl}/${trimLeadingSlash(DEFAULT_AI_ENDPOINT_PATH)}`;
}

export function isLearningAiConfigured() {
  return Boolean(getLearningAiEndpoint());
}

function validateLearningAiRequest(request: LearningAiRequest) {
  if (!request.prompt?.trim()) {
    return 'Сұрақ бос болмауы керек.';
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

  return null;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getStringField(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getBackendErrorMessage(status: number, payload: unknown) {
  const detail = getStringField(payload, 'detail');
  const message = getStringField(payload, 'message');
  const error = getStringField(payload, 'error');

  if (detail || message || error) {
    return detail || message || error;
  }

  if (status === 401) {
    return 'AI backend авторизацияны қабылдамады. Аккаунт session-ы немесе access token тексерілуі керек.';
  }

  if (status === 403) {
    return 'AI backend бұл scope үшін рұқсат бермеді. Course/student access немесе user role тексерілуі керек.';
  }

  if (status === 404) {
    return 'AI endpoint табылмады. Backend URL және /api/learning-analysis route дұрыс қосылғанын тексеріңіз.';
  }

  if (status >= 500) {
    return `AI backend ішкі қатесі: ${status}. Render backend logs ішінен learning-analysis service қатесін тексеріңіз.`;
  }

  return `AI backend қатесі: ${status}`;
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException ||
    error instanceof Error
  ) && error.name === 'AbortError';
}

function getNetworkErrorMessage(error: unknown) {
  if (isAbortError(error)) {
    return 'AI сұранысы тоқтатылды.';
  }

  const rawMessage = error instanceof Error ? error.message : '';

  if (
    rawMessage.toLowerCase().includes('failed to fetch') ||
    rawMessage.toLowerCase().includes('networkerror')
  ) {
    return 'AI backend-ке қосылу мүмкін болмады. VITE_AI_API_BASE_URL, Render backend status және CORS allowed origins баптауларын тексеріңіз.';
  }

  return rawMessage || 'AI сұранысын орындау кезінде белгісіз қате болды.';
}

function normalizeRequest(request: LearningAiRequest): LearningAiRequest {
  return {
    ...request,
    prompt: request.prompt.trim(),
  };
}

export async function requestLearningAiAnalysis(
  request: LearningAiRequest,
  options?: {
    accessToken?: string | null;
    signal?: AbortSignal;
  }
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

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: options?.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options?.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : {}),
      },
      body: JSON.stringify(normalizedRequest),
    });

    const payload = await readJsonSafely(response);

    if (!response.ok) {
      return {
        ok: false,
        error: getBackendErrorMessage(response.status, payload),
      };
    }

    const data = payload as LearningAiResponse | null;

    if (!data || typeof data !== 'object') {
      return {
        ok: false,
        error: 'AI backend жауап қайтарды, бірақ JSON форматы дұрыс емес.',
      };
    }

    if (!data.answer || typeof data.answer !== 'string' || !data.answer.trim()) {
      return {
        ok: false,
        error: 'AI backend жауап қайтарды, бірақ answer өрісі бос.',
      };
    }

    return {
      ok: true,
      data: {
        ...data,
        answer: data.answer.trim(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: getNetworkErrorMessage(error),
    };
  }
}