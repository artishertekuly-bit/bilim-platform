// Tutor API клиенті: /api/tutor/v1 (architect/v2/api-kelisimderi.md §4).
// Типтер backend/app/tutor/dto.py-дағы Pydantic модельдерімен бірдей. Клиентке тек мәтін келеді:
// тегтер, күй, сценарий және M мәндері серверде қалады (api §4.2).

import { useMemo } from 'react';

import { getAiApiBaseUrl } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';

export const MAX_TUTOR_MESSAGE_CHARS = 2000;

export type BlockedReason = 'cooldown' | 'teacher';

export interface TutorSubject { id: string; title: string; grade: number }
export interface TutorMessage { message_id: string; role: 'student' | 'tutor'; text: string; created_at: string }
export interface Conversation {
  conversation_id: string;
  subject: TutorSubject;
  messages: TutorMessage[];
  blocked_until: string | null;
  blocked_reason: BlockedReason | null;
}
export interface MessagesPage { messages: TutorMessage[]; has_more: boolean }
export interface BlockState { student_id: string; blocked_until: string | null; blocked_reason: BlockedReason | null }
export interface StreamDone { message_id: string; suggestions: string[] }
export interface StreamBlocked { blocked_until: string | null; blocked_reason: BlockedReason; message: string }

export class TutorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'TutorApiError';
  }
}

const PREFIX = '/api/tutor/v1';

type ErrorBody = { error?: { code?: string; message?: string; details?: Record<string, unknown> }; detail?: unknown };

function parseError(status: number, raw: string): TutorApiError {
  let body: ErrorBody | null = null;
  try {
    body = raw ? (JSON.parse(raw) as ErrorBody) : null;
  } catch {
    body = null;
  }
  const detail = typeof body?.detail === 'string' ? body.detail : undefined;
  return new TutorApiError(
    body?.error?.message ?? detail ?? 'Сұраныс орындалмады.',
    status,
    body?.error?.code ?? 'HTTP_ERROR',
    body?.error?.details ?? {},
  );
}

async function request<T>(token: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new TutorApiError('Тьюторға кіру үшін жүйеге кіріңіз.', 401, 'UNAUTHENTICATED');
  let response: Response;
  try {
    response = await fetch(`${getAiApiBaseUrl()}${PREFIX}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new TutorApiError('Серверге қосылу мүмкін болмады. Интернетті тексеріңіз.', 0, 'NETWORK');
  }
  const text = await response.text();
  if (!response.ok) throw parseError(response.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export interface StreamCallbacks {
  onToken: (chunk: string) => void;
  onDone: (payload: StreamDone) => void;
  onBlocked: (payload: StreamBlocked) => void;
  onError: (error: TutorApiError) => void;
}

// POST ағыны: EventSource емес, fetch оқылады (api §2.5). Үзілсе, сол clientRequestId-мен қайта жіберуге болады.
async function streamMessage(
  token: string | undefined,
  conversationId: string,
  text: string,
  callbacks: StreamCallbacks,
  clientRequestId: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!token) throw new TutorApiError('Тьюторға кіру үшін жүйеге кіріңіз.', 401, 'UNAUTHENTICATED');
  let response: Response;
  try {
    response = await fetch(`${getAiApiBaseUrl()}${PREFIX}/conversations/${conversationId}/messages`, {
      method: 'POST',
      signal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ client_request_id: clientRequestId, text }),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    throw new TutorApiError('Серверге қосылу мүмкін болмады. Интернетті тексеріңіз.', 0, 'NETWORK');
  }
  if (!response.ok || !response.body) throw parseError(response.status, await response.text());

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  const flush = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join('\n');
    const name = eventName;
    dataLines = [];
    eventName = 'message';
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (name === 'token' && typeof payload.text === 'string') callbacks.onToken(payload.text);
    else if (name === 'done') callbacks.onDone(payload as unknown as StreamDone);
    else if (name === 'blocked') callbacks.onBlocked(payload as unknown as StreamBlocked);
    else if (name === 'error') {
      callbacks.onError(
        new TutorApiError(
          typeof payload.message === 'string' ? payload.message : 'Тьютор жауабында қате шықты.',
          503,
          typeof payload.code === 'string' ? payload.code : 'STREAM_ERROR',
        ),
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line === '') flush();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
  }
  flush();
}

export function createTutorApi(token: string | undefined) {
  return {
    subjects: () => request<TutorSubject[]>(token, '/subjects'),
    currentConversation: (subjectId: string) =>
      request<Conversation>(token, `/conversations/current?subject_id=${encodeURIComponent(subjectId)}`),
    messages: (conversationId: string, before?: string, limit = 30) =>
      request<MessagesPage>(
        token,
        `/conversations/${conversationId}/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      ),
    send: (
      conversationId: string,
      text: string,
      callbacks: StreamCallbacks,
      clientRequestId = newRequestId(),
      signal?: AbortSignal,
    ) => streamMessage(token, conversationId, text, callbacks, clientRequestId, signal),
    teacherBlockState: (studentId: string) => request<BlockState>(token, `/teacher/students/${studentId}/block`),
    teacherUnblock: (studentId: string, clientRequestId = newRequestId()) =>
      request<BlockState>(token, `/teacher/students/${studentId}/unblock`, {
        method: 'POST',
        body: JSON.stringify({ client_request_id: clientRequestId }),
      }),
    teacherLock: (studentId: string, clientRequestId = newRequestId()) =>
      request<BlockState>(token, `/teacher/students/${studentId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ client_request_id: clientRequestId }),
      }),
  };
}

export type TutorApi = ReturnType<typeof createTutorApi>;

export function useTutorApi(): TutorApi {
  const { session } = useAuth();
  const token = session?.access_token;
  return useMemo(() => createTutorApi(token), [token]);
}

export const tutorKeys = {
  subjects: ['tutor', 'subjects'] as const,
  conversation: (subjectId: string) => ['tutor', 'conversation', subjectId] as const,
  block: (studentId: string) => ['tutor', 'block', studentId] as const,
};

export function formatBlockedUntil(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('kk-KZ', { hour: '2-digit', minute: '2-digit' });
}
