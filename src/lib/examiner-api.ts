// Examiner API клиенті: /api/examiner/v1 (architect/v2/api-kelisimderi.md §3).
// Типтер backend/app/examiner/session/dto.py-дағы Pydantic модельдерімен бірдей.

import { useMemo } from 'react';

import { getAiApiBaseUrl } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';

export type ScopeType = 'topic' | 'chapter' | 'subject';
export type Tier = 'X1' | 'X2' | 'X3';
/** preparing (D93): the bank was short, questions for this session are being generated. */
export type SessionStatus = 'preparing' | 'active' | 'completed' | 'blocked' | 'abandoned';
export type CodeFormat = 'mcq' | 'matching' | 'sequence' | 'error_step' | 'formula_builder' | 'slider';

export interface Scope { type: ScopeType; id: string; title: string }
export interface Book { book: string; title: string; grade: number; has_chapters: boolean }
export interface SubjectCatalogItem { subject_id: string; title: string; books: Book[] }
export interface Chapter { id: string; no: string; title: string }
export interface Topic { id: string; no: string; title: string; chapter_id: string | null }
/** A textbook § found for the topic the learner wrote (D93). `id` is a `topic` scope id. */
export interface TopicMatch { id: string; no: string; title: string; book: string; book_title: string; grade: number }
export interface TopicSearchResponse { subject_id: string; query: string; topics: TopicMatch[] }
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
export interface ShortAnswerContent { stem: string }
export interface TrueFalseFixContent { stem: string; statement: string }
export interface PriorityContent { stem: string; scenario: string; options: IdText[] }
export interface CaseStudyContent {
  stem: string;
  case_text: string;
  data_table: { title: string; headers: string[]; rows: string[][] };
  task_prompt: string;
}
export interface FeynmanContent {
  stem: string;
  concept: string;
  audience_prompt: string;
  min_words: number;
}
export interface SocraticContent { stem: string; situation: string; opening_question: string }
export interface TeachAiContent { stem: string; situation: string; opening_message: string }

export interface DialogTurn {
  turn_no: number;
  student_text: string;
  examiner_text: string | null;
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
  turns?: DialogTurn[] | null;
}

export interface ExplanationResponse {
  status: 'pending' | 'ready' | 'failed';
  text: string | null;
}

export interface AppealResponse {
  item_id: string;
  grade_id: string;
  status: 'appealed';
}

export interface ResultItemSummary {
  item_id: string;
  position: number;
  format: string;
  score: number;
  max_score: number;
  grade_status: 'pending' | 'provisional' | 'final';
  appealable: boolean;
  appealed: boolean;
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
  /** Why a preparing session was closed (D93). */
  notice?: string | null;
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
  f_is_final?: boolean;
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
  part_d?: number | null;
  part_a?: number | null;
  x3_rating_valid?: boolean;
  breakdown: { format: string; block: 'A' | 'D' | null; tasks: number; score: number; max: number }[];
  total: { score: number; max: number };
  x3: { status: 'not_eligible' | 'passed' | 'failed'; reason?: string | null };
  items?: ResultItemSummary[];
  subject_profile: SubjectProfile;
}

export interface ReviewQueueItem {
  grade_id: string;
  session_id: string;
  student_id: string;
  level: number;
  format: string;
  x_tier: Tier;
  review_reason: string | null;
  original_score: number | null;
  effective_score: number | null;
  grade_source: string | null;
  appealed: boolean;
  created_at: string;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
}

export interface ClassBook {
  book: string;
  title: string;
  grade: number;
}

export interface ClassProfilesResponse {
  class_id: string;
  subject_id: string;
  subject_title: string;
  books: ClassBook[];
  students: { student_id: string; profiles: SubjectProfile[] }[];
}

export interface ClassRatingResponse {
  class_id: string;
  book: string | null;
  total: number;
  full_count: number;
  entries: { rank: number; student_id: string; f: number; f_is_final: boolean; x3_passed: number }[];
}

export interface GradeOverrideItem {
  override_id: string;
  teacher_id: string;
  new_score: number;
  reason: string;
  kind: 'review' | 'false_positive';
  created_at: string;
}

export interface TeacherGradeDetail {
  grade_id: string;
  session_id: string;
  item_id: string;
  student_id: string;
  level: number;
  format: string;
  x_tier: Tier;
  question_content: Record<string, unknown>;
  rubric_0_4: Record<string, unknown>[] | null;
  reference_text: string | null;
  answer: Record<string, unknown>;
  answer_text: string | null;
  dialog_turns: DialogTurn[];
  original_score: number | null;
  effective_score: number | null;
  grade_source: string | null;
  grade_status: 'pending' | 'provisional' | 'final';
  review_reason: string | null;
  evidence_quotes: { text: string; start: number; end: number }[];
  grade_reason: string | null;
  appeal_text: string | null;
  grader_model: string | null;
  prompt_version: string | null;
  overrides: GradeOverrideItem[];
}

export interface TeacherGradeActionResponse {
  grade_id: string;
  effective_score: number | null;
  grade_status: 'final';
  session_p: number | null;
  session_is_final: boolean | null;
  x3_rating_valid: boolean | null;
}

export interface FalsePositiveResponse {
  event_id: string;
  session_id: string;
  strike_count: number;
  grade_id: string | null;
  effective_score: number | null;
  session_p: number | null;
  session_is_final: boolean | null;
  x3_rating_valid: boolean | null;
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
  any_code: 'Ұшқырлық блогы',
  socratic: 'Сократтық диалог',
  feynman: 'Фейнман',
  teach_ai: '«ЖИ-ді оқыт»',
  priority: 'Басымдық',
  case_study: 'Кейс',
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

export interface TurnStreamDone {
  turn_no?: number;
  total_turns?: number;
  dialog_complete: boolean;
  moderation?: { strike_count: number; message: string; retry_allowed: boolean } | null;
  session: ExamSession;
}

async function streamTurnRequest(
  token: string | undefined,
  sessionId: string,
  itemId: string,
  text: string,
  callbacks: {
    onToken: (chunk: string) => void;
    onDone: (payload: TurnStreamDone) => void;
    onError?: (err: ExaminerApiError) => void;
  },
  clientRequestId = newRequestId(),
  signal?: AbortSignal,
): Promise<void> {
  if (!token) {
    throw new ExaminerApiError('Емтихан тапсыру үшін жүйеге кіріңіз.', 401, 'UNAUTHENTICATED');
  }
  let response: Response;
  try {
    response = await fetch(`${getAiApiBaseUrl()}${PREFIX}/sessions/${sessionId}/items/${itemId}/turns`, {
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
    throw new ExaminerApiError('Серверге қосылу мүмкін болмады. Интернетті тексеріңіз.', 0, 'NETWORK');
  }
  if (!response.ok || !response.body) {
    const raw = await response.text();
    const parsed = raw ? (JSON.parse(raw) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }) : null;
    throw new ExaminerApiError(
      parsed?.error?.message ?? 'Сұраныс орындалмады.',
      response.status,
      parsed?.error?.code ?? 'HTTP_ERROR',
      parsed?.error?.details ?? {},
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (!dataLines.length) return;
    const rawData = dataLines.join('\n');
    dataLines = [];
    const currentEvent = eventName;
    eventName = 'message';
    try {
      const payload = JSON.parse(rawData) as Record<string, unknown>;
      if (currentEvent === 'token' && typeof payload.text === 'string') {
        callbacks.onToken(payload.text);
      } else if (currentEvent === 'done') {
        callbacks.onDone(payload as unknown as TurnStreamDone);
      } else if (currentEvent === 'error') {
        const apiErr = new ExaminerApiError(
          typeof payload.message === 'string' ? payload.message : 'Диалог қатесі.',
          503,
          typeof payload.code === 'string' ? payload.code : 'STREAM_ERROR',
        );
        if (callbacks.onError) callbacks.onError(apiErr);
        else throw apiErr;
      }
    } catch (err) {
      if (err instanceof ExaminerApiError) throw err;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line === '') {
        flushEvent();
      } else if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }
  flushEvent();
}

export function createExaminerApi(token: string | undefined) {
  return {
    subjects: () => request<SubjectCatalogItem[]>(token, '/subjects'),
    scopes: (book: string) => request<ScopeCatalog>(token, `/scopes?book=${encodeURIComponent(book)}`),
    searchTopics: (subjectId: string, query: string) =>
      request<TopicSearchResponse>(
        token,
        `/topics/search?subject_id=${encodeURIComponent(subjectId)}&q=${encodeURIComponent(query)}`,
      ),
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
    explanation: (sessionId: string, itemId: string) =>
      request<ExplanationResponse>(token, `/sessions/${sessionId}/items/${itemId}/explanation`),
    streamTurn: (
      sessionId: string,
      itemId: string,
      text: string,
      callbacks: {
        onToken: (chunk: string) => void;
        onDone: (payload: TurnStreamDone) => void;
        onError?: (err: ExaminerApiError) => void;
      },
      clientRequestId = newRequestId(),
      signal?: AbortSignal,
    ) => streamTurnRequest(token, sessionId, itemId, text, callbacks, clientRequestId, signal),
    appeal: (sessionId: string, itemId: string, reason: string, clientRequestId = newRequestId()) =>
      post<AppealResponse>(token, `/sessions/${sessionId}/items/${itemId}/appeal`, {
        client_request_id: clientRequestId,
        reason,
      }),
    abandon: (sessionId: string, clientRequestId = newRequestId()) =>
      post<ExamSession>(token, `/sessions/${sessionId}/abandon`, { client_request_id: clientRequestId }),
    result: (sessionId: string) => request<SessionResult>(token, `/sessions/${sessionId}/result`),
    profile: () => request<StudentProfile>(token, '/me/profile'),
    parentChildProfile: (studentId: string) =>
      request<StudentProfile>(token, `/parent/children/${studentId}/profile`),
    teacherClassProfiles: (classId: string) =>
      request<ClassProfilesResponse>(token, `/teacher/classes/${classId}/profiles`),
    teacherClassRating: (classId: string, book?: string) =>
      request<ClassRatingResponse>(
        token,
        `/teacher/classes/${classId}/rating${book ? `?book=${encodeURIComponent(book)}` : ''}`,
      ),
    teacherReviewQueue: (classId?: string, limit = 50, offset = 0) =>
      request<ReviewQueueResponse>(
        token,
        `/teacher/review-queue?limit=${limit}&offset=${offset}${classId ? `&class_id=${encodeURIComponent(classId)}` : ''}`,
      ),
    teacherGradeDetail: (gradeId: string) =>
      request<TeacherGradeDetail>(token, `/teacher/grades/${gradeId}`),
    teacherConfirmGrade: (gradeId: string, clientRequestId = newRequestId()) =>
      post<TeacherGradeActionResponse>(token, `/teacher/grades/${gradeId}/confirm`, {
        client_request_id: clientRequestId,
      }),
    teacherOverrideGrade: (
      gradeId: string,
      newScore: number,
      reason: string,
      clientRequestId = newRequestId(),
    ) =>
      post<TeacherGradeActionResponse>(token, `/teacher/grades/${gradeId}/override`, {
        client_request_id: clientRequestId,
        new_score: newScore,
        reason,
      }),
    teacherFalsePositive: (
      alertId: string,
      reason: string,
      newScore?: number,
      clientRequestId = newRequestId(),
    ) =>
      post<FalsePositiveResponse>(token, `/teacher/alerts/${alertId}/false-positive`, {
        client_request_id: clientRequestId,
        reason,
        ...(newScore === undefined ? {} : { new_score: newScore }),
      }),
  };
}

export type ExaminerApi = ReturnType<typeof createExaminerApi>;

export function useExaminerApi(): ExaminerApi {
  const { session } = useAuth();
  const token = session?.access_token;
  return useMemo(() => createExaminerApi(token), [token]);
}
