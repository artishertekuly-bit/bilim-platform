// Examiner API клиенті: /api/examiner/v1 (architect/v2/api-kelisimderi.md §3).
// Типтер backend/app/examiner/session/dto.py-дағы Pydantic модельдерімен бірдей.

import { useMemo } from 'react';

import { getAiApiBaseUrl } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';

export type ScopeType = 'topic' | 'chapter' | 'subject';
export type Tier = 'X1' | 'X2' | 'X3';
export type SessionStatus = 'active' | 'completed' | 'blocked' | 'abandoned';
export type CodeFormat = 'mcq' | 'matching' | 'sequence' | 'error_step' | 'formula_builder' | 'slider';

export interface Scope { type: ScopeType; id: string; title: string }
export interface Book { book: string; title: string; grade: number; has_chapters: boolean }
export interface SubjectCatalogItem { subject_id: string; title: string; books: Book[] }
export interface Chapter { id: string; no: string; title: string }
export interface Topic { id: string; no: string; title: string; chapter_id: string | null }
export interface ScopeCatalog {
  book: Book;
  subject_id: string;
  subject_title: string;
  chapters: Chapter[];
  topics: Topic[];
}

export interface IdText { id: string; text: string }
export interface McqContent { stem: string; options: IdText[] }
export interface MatchingContent { stem: string; left: IdText[]; right: IdText[] }
export interface StepsContent { stem: string; steps: IdText[] }
export interface FormulaContent {
  stem: string;
  result: string;
  slots: { id: string; position: 'numerator' | 'denominator' }[];
  tokens: { id: string; label: string }[];
}
export interface SliderContent {
  stem: string;
  input: { name: string; unit: string; min: number; max: number; step: number };
  output: { name: string; unit: string; formula: string };
}

export interface SessionItem {
  item_id: string;
  position: number;
  tier: Tier;
  block: 'A' | 'D' | null;
  format: CodeFormat | string;
  content: Record<string, unknown>;
  served_at: string | null;
  deadline_at: string | null;
  state: 'open' | 'answered' | 'grading' | 'graded';
}

export interface ExamSession {
  session_id: string;
  status: SessionStatus;
  level: number;
  scope: Scope;
  progress: { answered: number; total: number };
  current: SessionItem | null;
  upcoming: SessionItem[];
  strike_count: number;
  started_at: string;
}

export interface AnswerResult {
  item_id: string;
  check: 'correct' | 'incorrect' | 'pending';
  late: boolean;
  explanation: 'pending' | 'none';
  moderation: { strike_count: number; message: string; retry_allowed: boolean } | null;
  session: ExamSession;
}

export interface LevelResult {
  level: number;
  p: number | null;
  mastered: boolean;
  is_final: boolean;
  taken_at: string | null;
}

export interface SubjectProfile {
  subject: { id: string; title: string; grade: number; book: string; book_title: string };
  levels: LevelResult[];
  f: number | null;
}

export interface StudentProfile { subjects: SubjectProfile[] }

export interface SessionResult {
  session_id: string;
  level: number;
  scope: Scope;
  p: number;
  threshold: number;
  mastered: boolean;
  is_final: boolean;
  breakdown: { format: string; block: 'A' | 'D' | null; tasks: number; score: number; max: number }[];
  total: { score: number; max: number };
  x3: { status: 'not_eligible' | 'passed' | 'failed'; reason?: string | null };
  subject_profile: SubjectProfile;
}

export interface LevelCard {
  level: number;
  title: string;
  formats: string[];
  tasks: number;
  minutes: number;
  available: boolean;
  /** ready — бос қор жетеді; low_stock — басталады, бірақ сұрақтар сыныптастармен ортақ болуы мүмкін;
   *  unavailable — банк әлі толмаған, сессия басталмайды (D65). */
  availability: 'ready' | 'low_stock' | 'unavailable';
  note: string | null;
  last: LevelResult;
}

export interface LevelsResponse { scope: Scope; levels: LevelCard[] }

export const FORMAT_TITLES: Record<string, string> = {
  mcq: 'Тест',
  matching: 'Сәйкестендіру',
  short_answer: 'Қысқа жауап',
  sequence: 'Реттілік',
  true_false_fix: 'Дұрыс/Бұрыс',
  error_step: 'Қате қадам',
  formula_builder: 'Конструктор',
  slider: 'Слайдер',
};

export const LEVEL_TITLES: Record<number, string> = {
  1: 'Білу',
  2: 'Қолдану',
  3: 'Пайымдау',
  4: 'Қолдану + Пайымдау',
};

export class ExaminerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ExaminerApiError';
  }
}

const PREFIX = '/api/examiner/v1';

async function request<T>(accessToken: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) {
    throw new ExaminerApiError('Емтихан тапсыру үшін жүйеге кіріңіз.', 401, 'UNAUTHENTICATED');
  }
  let response: Response;
  try {
    response = await fetch(`${getAiApiBaseUrl()}${PREFIX}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ExaminerApiError('Серверге қосылу мүмкін болмады. Интернетті тексеріңіз.', 0, 'NETWORK');
  }
  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)
      ?.error;
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ExaminerApiError(
      error?.message ?? (typeof detail === 'string' ? detail : 'Сұраныс орындалмады.'),
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.details ?? {},
    );
  }
  return body as T;
}

function post<T>(token: string | undefined, path: string, payload: unknown): Promise<T> {
  return request<T>(token, path, { method: 'POST', body: JSON.stringify(payload) });
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function createExaminerApi(token: string | undefined) {
  return {
    subjects: () => request<SubjectCatalogItem[]>(token, '/subjects'),
    scopes: (book: string) => request<ScopeCatalog>(token, `/scopes?book=${encodeURIComponent(book)}`),
    levels: (scopeType: ScopeType, scopeId: string) =>
      request<LevelsResponse>(
        token,
        `/levels?scope_type=${scopeType}&scope_id=${encodeURIComponent(scopeId)}`,
      ),
    start: (scopeType: ScopeType, scopeId: string, level: number, clientRequestId = newRequestId()) =>
      post<ExamSession>(token, '/sessions', {
        client_request_id: clientRequestId,
        scope_type: scopeType,
        scope_id: scopeId,
        level,
      }),
    active: () => request<ExamSession | null>(token, '/sessions/active'),
    session: (sessionId: string) => request<ExamSession>(token, `/sessions/${sessionId}`),
    answer: (sessionId: string, itemId: string, answer: Record<string, unknown>, clientRequestId = newRequestId()) =>
      post<AnswerResult>(token, `/sessions/${sessionId}/items/${itemId}/answer`, {
        client_request_id: clientRequestId,
        answer,
      }),
    abandon: (sessionId: string, clientRequestId = newRequestId()) =>
      post<ExamSession>(token, `/sessions/${sessionId}/abandon`, { client_request_id: clientRequestId }),
    result: (sessionId: string) => request<SessionResult>(token, `/sessions/${sessionId}/result`),
    profile: () => request<StudentProfile>(token, '/me/profile'),
  };
}

export type ExaminerApi = ReturnType<typeof createExaminerApi>;

export function useExaminerApi(): ExaminerApi {
  const { session } = useAuth();
  const token = session?.access_token;
  return useMemo(() => createExaminerApi(token), [token]);
}
