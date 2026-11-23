// Сыныптар (api §5.2, D25, D33, D38, D83): барлық әрекет security definer RPC арқылы өтеді.
import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';

export interface TeacherClass {
  class_id: string;
  title: string;
  subject_id: string;
  subject: string;
  join_code: string;
  created_at: string;
  member_count: number;
}

export interface RosterStudent {
  class_id: string;
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  joined_at: string;
}

export interface ClassPreview {
  class_id: string;
  title: string;
  subject_id: string;
  subject: string;
  teacher_name: string;
}

export interface StudentClass {
  class_id: string;
  title: string;
  subject_id: string;
  subject: string;
  teacher_id: string;
  teacher_name: string;
  joined_at: string;
}

export interface SubjectOption {
  id: string;
  name_kk: string;
}

const MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Бұл әрекет сіздің рөліңізге қолжетімді емес.',
  CLASS_NOT_FOUND: 'Сынып табылмады.',
  RATE_LIMITED: 'Тым көп әрекет жасалды. Бір сағаттан кейін қайталаңыз.',
  INVALID_TITLE: 'Сынып атауы 1–120 таңба болуы керек.',
  SUBJECT_NOT_FOUND: 'Пән табылмады.',
  JOIN_CODE_EXHAUSTED: 'Код жасалмады. Қайта байқап көріңіз.',
  CHAT_NOT_ALLOWED: 'Бұл адаммен чат ашуға болмайды: чат тек мұғалім мен сынып оқушысы не оның ата-анасы арасында.',
  CHAT_READ_ONLY: 'Бұл чат енді тек оқу үшін ашық.',
  CHAT_NOT_FOUND: 'Чат табылмады.',
  INVALID_EMAIL: 'Email форматы дұрыс емес.',
  OWN_EMAIL: 'Өз email-іңізді бала ретінде көрсете алмайсыз.',
  DUPLICATE_REQUEST: 'Осы email-ге сұраныс бұрын жіберілген.',
  REQUEST_NOT_FOUND: 'Сұраныс табылмады немесе мерзімі өтіп кеткен.',
  ALERT_NOT_FOUND: 'Дабыл табылмады.',
  INVALID_RESOLUTION: 'Шешім түрі қате.',
  LESSON_HIDDEN: 'Сабақты әкімші жасырған: оны тек әкімші қайта аша алады.',
  LESSON_NOT_FOUND: 'Сабақ табылмады.',
  INVALID_STATUS: 'Күй қате.',
  lessons_publish_check: 'Жариялау үшін атауы кемінде 5, мәтіні кемінде 20 таңба болсын.',
};

export class ClassesApiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ClassesApiError';
  }
}

/** PostgREST қатесін қазақша хабарламаға айналдырады (RPC `raise exception 'CODE'` пен check атауы бойынша). */
export function fail(error: PostgrestError): never {
  const constraint = Object.keys(MESSAGES).find((key) => key.includes('_check') && error.message.includes(key));
  const code = constraint ?? (error.message in MESSAGES ? error.message : error.code || 'ERROR');
  throw new ClassesApiError(MESSAGES[code] ?? 'Сұраныс орындалмады. Қайта байқап көріңіз.', code);
}

// Қазақша пернетақтада кириллица әрпі латынға ұқсас басылады: А, В, Е, К, М, Н, Р, С, Т, Х, У.
const CYRILLIC_LOOKALIKES: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y',
};

/** Клиент енгізген кодты бас әріпке айналдырады, бос орынды алып тастайды (api §5.2). */
export function normalizeJoinCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[АВЕКМНРСТХУ]/g, (letter) => CYRILLIC_LOOKALIKES[letter] ?? letter)
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 6);
}

export const JOIN_CODE_PATTERN = /^[2-9A-HJKMNP-Z]{6}$/;

export async function listSubjects(): Promise<SubjectOption[]> {
  const { data, error } = await supabase.from('subjects').select('id, name_kk').order('sort_order');
  if (error) fail(error);
  return data ?? [];
}

export async function teacherClasses(): Promise<TeacherClass[]> {
  const { data, error } = await supabase.rpc('teacher_classes');
  if (error) fail(error);
  return data ?? [];
}

export async function createClass(title: string, subjectId: string): Promise<{ class_id: string; join_code: string }> {
  const { data, error } = await supabase.rpc('create_class', { p_title: title, p_subject_id: subjectId });
  if (error) fail(error);
  const created = data?.[0];
  if (!created) throw new ClassesApiError('Сынып жасалмады.', 'EMPTY');
  return created;
}

export async function rotateJoinCode(classId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_join_code', { p_class_id: classId });
  if (error) fail(error);
  return data;
}

export async function classRoster(classId?: string): Promise<RosterStudent[]> {
  const { data, error } = await supabase.rpc('class_roster', { p_class_id: classId ?? null });
  if (error) fail(error);
  return data ?? [];
}

export async function removeClassMember(classId: string, studentId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_class_member', { p_class_id: classId, p_student_id: studentId });
  if (error) fail(error);
}

/** Код табылмаса null қайтарады. */
export async function previewClass(code: string): Promise<ClassPreview | null> {
  const { data, error } = await supabase.rpc('preview_class', { p_code: normalizeJoinCode(code) });
  if (error) fail(error);
  return data?.[0] ?? null;
}

/** Код табылмаса null қайтарады; қайта қосылу қате емес. */
export async function joinClass(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('join_class', { p_code: normalizeJoinCode(code) });
  if (error) fail(error);
  return data ?? null;
}

export async function myClasses(): Promise<StudentClass[]> {
  const { data, error } = await supabase.rpc('my_classes');
  if (error) fail(error);
  return data ?? [];
}

export async function setUserRole(userId: string, role: 'student' | 'teacher' | 'parent'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw new ClassesApiError(error.message, error.code || 'ERROR');
}

export const classKeys = {
  teacherClasses: ['classes', 'teacher'] as const,
  roster: (classId?: string) => ['classes', 'roster', classId ?? 'all'] as const,
  mine: ['classes', 'mine'] as const,
  subjects: ['classes', 'subjects'] as const,
};
