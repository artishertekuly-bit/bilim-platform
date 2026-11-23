// 6-қадамның платформа бөлігі (D85): дабылдар, ата-ана байланысы, дербес сабақтар.
// Барлық рұқсатты дерекқор (RLS және security definer RPC) тексереді; клиент тек шақырады.
import { supabase } from '@/integrations/supabase/client';
import { ClassesApiError, fail } from '@/lib/classes-api';

// ------------------------------------------------------------------ дабылдар (ortaq §5, api §5.4)

export interface AttentionRow {
  student_id: string;
  open_count: number;
  last_category: string | null;
  last_alert_at: string | null;
}

export interface AlertRow {
  alert_id: string;
  source_system: 'examiner' | 'tutor' | 'games';
  student_id: string;
  severity: 'soft' | 'hard';
  category: string;
  evidence_text: string;
  status: 'open' | 'resolved' | 'false_positive';
  created_at: string;
  resolved_at: string | null;
}

export const ALERT_CATEGORY_TITLES: Record<string, string> = {
  TOXIC: 'Улы сөз',
  TROLLING: 'Әдейі мазақ',
  PROMPT_INJECTION: 'Бағалауға бұйрық',
  PROFANITY: 'Балағат',
  AGGRESSION: 'Агрессия',
};

export const ALERT_SOURCE_TITLES: Record<string, string> = {
  examiner: 'Емтихан',
  tutor: 'Тьютор',
  games: 'Ойын',
};

export async function attentionList(): Promise<AttentionRow[]> {
  const { data, error } = await supabase
    .from('teacher_attention_list')
    .select('student_id, open_count, last_category, last_alert_at')
    .order('last_alert_at', { ascending: false });
  if (error) fail(error);
  return data ?? [];
}

export async function studentAlerts(studentId: string): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from('security_alerts')
    .select('alert_id, source_system, student_id, severity, category, evidence_text, status, created_at, resolved_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []) as AlertRow[];
}

export async function resolveAlert(alertId: string, resolution: 'resolved' | 'false_positive'): Promise<void> {
  const { error } = await supabase.rpc('resolve_alert', { p_alert_id: alertId, p_resolution: resolution });
  if (error) fail(error);
}

// ------------------------------------------------------------------ ата-ана (D26, D27)

export interface ChildRow {
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  linked_at: string;
}

export interface OutgoingRequest {
  id: string;
  child_email: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  requested_at: string;
  expires_at: string;
}

export interface IncomingRequest {
  id: string;
  parent_id: string;
  parent_name: string;
  status: string;
  requested_at: string;
  expires_at: string;
}

export async function myChildren(): Promise<ChildRow[]> {
  const { data, error } = await supabase.rpc('my_children');
  if (error) fail(error);
  return data ?? [];
}

export async function outgoingParentRequests(): Promise<OutgoingRequest[]> {
  const { data, error } = await supabase
    .from('parent_child_link_requests')
    .select('id, child_email, status, requested_at, expires_at')
    .order('requested_at', { ascending: false })
    .limit(30);
  if (error) fail(error);
  return (data ?? []) as OutgoingRequest[];
}

export async function requestParentLink(childEmail: string): Promise<void> {
  const { error } = await supabase.rpc('request_parent_link', { p_child_email: childEmail.trim().toLowerCase() });
  if (error) fail(error);
}

export async function cancelParentLink(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_parent_link_request', { p_request_id: requestId });
  if (error) fail(error);
}

export async function incomingParentRequests(): Promise<IncomingRequest[]> {
  const { data, error } = await supabase.rpc('my_parent_link_requests');
  if (error) fail(error);
  return data ?? [];
}

export async function respondParentLink(requestId: string, accept: boolean): Promise<void> {
  const { error } = accept
    ? await supabase.rpc('accept_parent_link_request', { p_request_id: requestId })
    : await supabase.rpc('decline_parent_link_request', { p_request_id: requestId });
  if (error) fail(error);
}

// ------------------------------------------------------------------ сабақтар (D19–D21, D29; api §5.1)

export type LessonStatus = 'draft' | 'published' | 'hidden';

export interface LessonCard {
  lesson_id: string;
  title: string;
  author_name: string;
  published_at: string | null;
  excerpt: string;
  media_url: string | null;
}

export interface LessonFull {
  id: string;
  title: string;
  body_md: string | null;
  media_url: string | null;
  status: LessonStatus;
  published_at: string | null;
  updated_at: string;
  author_id: string | null;
  author_name: string;
}

export interface OwnLesson {
  id: string;
  title: string;
  status: LessonStatus;
  published_at: string | null;
  updated_at: string;
  author_id?: string | null;
  author_name?: string;
}

export const LESSON_STATUS_TITLES: Record<LessonStatus, string> = {
  draft: 'Жоба',
  published: 'Жарияланған',
  hidden: 'Жасырылған',
};

async function authorNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data } = await supabase.from('profiles').select('user_id, full_name').in('user_id', unique);
  data?.forEach((row) => names.set(row.user_id, row.full_name?.trim() || 'Мұғалім'));
  return names;
}

export async function searchLessons(query: string, limit = 20, offset = 0): Promise<{ items: LessonCard[]; total: number }> {
  const { data, error } = await supabase.rpc('search_lessons', {
    p_query: query.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) fail(error);
  const rows = data ?? [];
  return { items: rows, total: rows[0]?.total ?? 0 };
}

export async function getLesson(lessonId: string): Promise<LessonFull | null> {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, body_md, media_url, status, published_at, updated_at, author_id')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const names = await authorNames([data.author_id]);
  return { ...data, author_name: (data.author_id && names.get(data.author_id)) || 'Мұғалім' };
}

export async function savedLessons(): Promise<LessonCard[]> {
  const { data: marks, error } = await supabase
    .from('student_lesson_bookmarks')
    .select('lesson_id, created_at')
    .order('created_at', { ascending: false });
  if (error) fail(error);
  const ids = (marks ?? []).map((mark) => mark.lesson_id);
  if (!ids.length) return [];
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, title, body_md, media_url, published_at, author_id, status')
    .in('id', ids)
    .eq('status', 'published');
  if (lessonsError) fail(lessonsError);
  const names = await authorNames((lessons ?? []).map((lesson) => lesson.author_id));
  const byId = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  return ids.flatMap((id) => {
    const lesson = byId.get(id);
    if (!lesson) return [];
    return [{
      lesson_id: lesson.id,
      title: lesson.title,
      author_name: (lesson.author_id && names.get(lesson.author_id)) || 'Мұғалім',
      published_at: lesson.published_at,
      excerpt: (lesson.body_md ?? '').replace(/[#*_>`[\]()-]+/g, '').slice(0, 180),
      media_url: lesson.media_url,
    }];
  });
}

export async function isBookmarked(lessonId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('student_lesson_bookmarks')
    .select('id')
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) fail(error);
  return Boolean(data);
}

export async function setBookmark(studentId: string, lessonId: string, on: boolean): Promise<void> {
  const { error } = on
    ? await supabase.from('student_lesson_bookmarks').upsert(
        { student_id: studentId, lesson_id: lessonId },
        { onConflict: 'student_id,lesson_id', ignoreDuplicates: true },
      )
    : await supabase.from('student_lesson_bookmarks').delete().eq('lesson_id', lessonId).eq('student_id', studentId);
  if (error) fail(error);
}

export async function getNote(lessonId: string): Promise<{ content: string; updated_at: string } | null> {
  const { data, error } = await supabase
    .from('student_lesson_notes')
    .select('content, updated_at')
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) fail(error);
  return data;
}

export async function saveNote(studentId: string, lessonId: string, content: string): Promise<void> {
  if (content.length > 10_000) throw new ClassesApiError('Жазба 10 000 таңбадан аспасын.', 'TOO_LONG');
  const { error } = await supabase
    .from('student_lesson_notes')
    .upsert({ student_id: studentId, lesson_id: lessonId, content }, { onConflict: 'student_id,lesson_id' });
  if (error) fail(error);
}

export async function teacherLessons(authorId: string): Promise<OwnLesson[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, status, published_at, updated_at')
    .eq('author_id', authorId)
    .order('updated_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as OwnLesson[];
}

export interface LessonDraft {
  title: string;
  body_md: string;
  media_url: string | null;
  status: 'draft' | 'published';
}

export async function createLesson(authorId: string, draft: LessonDraft): Promise<string> {
  const { data, error } = await supabase
    .from('lessons')
    .insert({ author_id: authorId, ...draft })
    .select('id')
    .single();
  if (error) fail(error);
  return data.id;
}

export async function updateLesson(lessonId: string, draft: Partial<LessonDraft>): Promise<void> {
  const { error } = await supabase.from('lessons').update(draft).eq('id', lessonId);
  if (error) fail(error);
}

export async function deleteLesson(lessonId: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) fail(error);
}

export async function adminLessons(): Promise<OwnLesson[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, status, published_at, updated_at, author_id')
    .neq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) fail(error);
  const names = await authorNames((data ?? []).map((row) => row.author_id));
  return (data ?? []).map((row) => ({
    ...(row as OwnLesson),
    author_name: (row.author_id && names.get(row.author_id)) || 'Мұғалім',
  }));
}

export async function adminSetLessonStatus(lessonId: string, status: 'published' | 'hidden', feedback?: string) {
  const { error } = await supabase.rpc('admin_set_lesson_status', {
    p_lesson_id: lessonId,
    p_status: status,
    p_feedback: feedback ?? null,
  });
  if (error) fail(error);
}

export const platformKeys = {
  attention: ['platform', 'attention'] as const,
  alerts: (studentId: string) => ['platform', 'alerts', studentId] as const,
  children: ['platform', 'children'] as const,
  outgoing: ['platform', 'parent-requests', 'out'] as const,
  incoming: ['platform', 'parent-requests', 'in'] as const,
  lessons: (query: string) => ['platform', 'lessons', 'search', query] as const,
  saved: ['platform', 'lessons', 'saved'] as const,
  lesson: (id: string) => ['platform', 'lesson', id] as const,
  bookmark: (id: string) => ['platform', 'lesson', id, 'bookmark'] as const,
  note: (id: string) => ['platform', 'lesson', id, 'note'] as const,
  teacherLessons: ['platform', 'teacher-lessons'] as const,
  adminLessons: ['platform', 'admin-lessons'] as const,
};
