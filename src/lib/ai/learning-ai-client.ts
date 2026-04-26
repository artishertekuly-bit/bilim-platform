import type {
  LearningAiClientResult,
  LearningAiRequest,
  LearningAiResponse,
} from './learning-ai-types';

const DEFAULT_AI_ENDPOINT_PATH = '/api/learning-analysis';

function getAiApiBaseUrl() {
  return import.meta.env.VITE_AI_API_URL?.replace(/\/$/, '') || '';
}

function getLearningAiEndpoint() {
  const baseUrl = getAiApiBaseUrl();

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}${DEFAULT_AI_ENDPOINT_PATH}`;
}

export function isLearningAiConfigured() {
  return Boolean(getLearningAiEndpoint());
}

function validateLearningAiRequest(request: LearningAiRequest) {
  if (!request.prompt.trim()) {
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

export async function requestLearningAiAnalysis(
  request: LearningAiRequest,
  options?: {
    accessToken?: string | null;
    signal?: AbortSignal;
  }
): Promise<LearningAiClientResult> {
  const validationError = validateLearningAiRequest(request);

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
        'AI backend әлі қосылмаған. VITE_AI_API_URL көрсетілгеннен кейін бұл сұраныс FastAPI endpoint-ке жіберіледі.',
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: options?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : {}),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);

      return {
        ok: false,
        error:
          errorPayload?.detail ||
          errorPayload?.message ||
          `AI backend қатесі: ${response.status}`,
      };
    }

    const data = (await response.json()) as LearningAiResponse;

    if (!data?.answer) {
      return {
        ok: false,
        error: 'AI backend жауап қайтарды, бірақ answer өрісі бос.',
      };
    }

    return {
      ok: true,
      data,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        error: 'AI сұранысы тоқтатылды.',
      };
    }

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'AI сұранысын орындау кезінде белгісіз қате болды.',
    };
  }
}