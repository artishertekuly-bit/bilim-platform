// Білім басқармасы (D90): платформа иесі басқарма ашып, әкімшісін (басшысын) тағайындайды; басшы тек өз
// мұғалімдері мен солардың оқушыларын көреді; мұғалім басқарма кодымен өтінім береді. Бәрі security definer RPC.
// Бұл RPC-лар Supabase типтерінде әлі жоқ, сондықтан шақыру типсіз көмекші арқылы өтеді.
import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { fail, normalizeJoinCode } from '@/lib/classes-api';

type RpcResult = { data: unknown; error: PostgrestError | null };
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

export interface OwnerDepartment {
  department_id: string;
  name: string;
  region: string | null;
  join_code: string;
  created_at: string;
  heads: string | null;
  teacher_count: number;
  pending_count: number;
  student_count: number;
}

export interface DepartmentMember {
  user_id: string;
  full_name: string;
  email: string;
  member_role: 'head' | 'teacher';
  status: 'pending' | 'active';
  requested_at: string;
}

export interface OwnerUser {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  created_at: string;
  department: string | null;
  total: number;
}

export interface HeadOverview {
  department_id: string;
  name: string;
  region: string | null;
  join_code: string;
  teacher_count: number;
  pending_count: number;
  class_count: number;
  student_count: number;
  sessions_7d: number;
  avg_p_7d: number | null;
}

export interface HeadTeacher {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  status: 'pending' | 'active';
  requested_at: string;
  approved_at: string | null;
  class_count: number;
  student_count: number;
}

export interface HeadStudent {
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  classes: string;
  teachers: string;
  joined_at: string;
  sessions_done: number;
  avg_p: number | null;
  last_activity_at: string | null;
}

export interface MyDepartment {
  department_id: string;
  name: string;
  region: string | null;
  member_role: 'head' | 'teacher';
  status: 'pending' | 'active';
  join_code: string | null;
  requested_at: string;
}

export interface ModerationLesson {
  id: string;
  title: string;
  status: 'published' | 'hidden';
  updated_at: string;
  published_at: string | null;
  author_id: string;
  author_name: string;
  feedback: string | null;
}

// ---------------------------------------------------------------- платформа иесі
export const ownerDepartments = () => call<OwnerDepartment[]>('owner_departments').then((d) => d ?? []);

export const ownerDepartmentMembers = (departmentId: string) =>
  call<DepartmentMember[]>('owner_department_members', { p_department_id: departmentId }).then((d) => d ?? []);

export async function ownerCreateDepartment(name: string, region: string): Promise<{ department_id: string; join_code: string }> {
  const rows = await call<{ department_id: string; join_code: string }[]>('owner_create_department', {
    p_name: name.trim(),
    p_region: region.trim() || null,
  });
  if (!rows?.[0]) throw new Error('Басқарма ашылмады.');
  return rows[0];
}

export const ownerRotateDepartmentCode = (departmentId: string) =>
  call<string>('owner_rotate_department_code', { p_department_id: departmentId });

export async function ownerAppointHead(departmentId: string, email: string): Promise<{ user_id: string; full_name: string }> {
  const rows = await call<{ user_id: string; full_name: string }[]>('owner_appoint_head', {
    p_department_id: departmentId,
    p_email: email.trim().toLowerCase(),
  });
  if (!rows?.[0]) throw new Error('Басшы тағайындалмады.');
  return rows[0];
}

export const ownerRemoveHead = (departmentId: string, userId: string) =>
  call<void>('owner_remove_head', { p_department_id: departmentId, p_user_id: userId });

export const ownerUsers = (query?: string, role?: string) =>
  call<OwnerUser[]>('owner_users', { p_query: query?.trim() || null, p_role: role && role !== 'all' ? role : null }).then(
    (d) => d ?? [],
  );

// ---------------------------------------------------------------- басқарма әкімшісі
export async function headOverview(): Promise<HeadOverview | null> {
  const rows = await call<HeadOverview[]>('head_overview');
  return rows?.[0] ?? null;
}

export const headTeachers = () => call<HeadTeacher[]>('head_teachers').then((d) => d ?? []);
export const headStudents = (query?: string) =>
  call<HeadStudent[]>('head_students', { p_query: query?.trim() || null }).then((d) => d ?? []);
export const headApproveTeacher = (userId: string) => call<void>('head_approve_teacher', { p_user_id: userId });
export const headDeclineTeacher = (userId: string) => call<void>('head_decline_teacher', { p_user_id: userId });
export const headRemoveTeacher = (userId: string) => call<void>('head_remove_teacher', { p_user_id: userId });
export const headRotateCode = () => call<string>('head_rotate_code');

// ---------------------------------------------------------------- мұғалімнің өтінімі
export async function myDepartment(): Promise<MyDepartment | null> {
  const rows = await call<MyDepartment[]>('my_department');
  return rows?.[0] ?? null;
}

/** Код табылмаса null қайтарады. */
export async function requestDepartmentJoin(code: string): Promise<{ department_id: string; name: string; status: string } | null> {
  const rows = await call<{ department_id: string; name: string; status: string }[]>('request_department_join', {
    p_code: normalizeJoinCode(code),
  });
  return rows?.[0] ?? null;
}

export const cancelDepartmentRequest = () => call<void>('cancel_department_request');
export const leaveDepartment = () => call<void>('leave_department');

// ---------------------------------------------------------------- модерация, сабақ себебі, аккаунт
export const moderationLessons = () => call<ModerationLesson[]>('moderation_lessons').then((d) => d ?? []);

export interface LessonReview {
  lesson_id: string;
  review_status: string;
  feedback: string | null;
  reviewed_at: string;
}

export const myLessonReviews = () => call<LessonReview[]>('my_lesson_reviews').then((d) => d ?? []);

export const deleteMyAccount = () => call<void>('delete_my_account');

export const departmentKeys = {
  owner: ['departments', 'owner'] as const,
  members: (id: string) => ['departments', 'owner', id, 'members'] as const,
  ownerUsers: (q: string, role: string) => ['departments', 'owner-users', q, role] as const,
  overview: ['departments', 'head', 'overview'] as const,
  teachers: ['departments', 'head', 'teachers'] as const,
  students: (q: string) => ['departments', 'head', 'students', q] as const,
  mine: ['departments', 'mine'] as const,
  moderation: ['departments', 'moderation'] as const,
  lessonReviews: ['departments', 'lesson-reviews'] as const,
};

/** Емтихан P (0..100, scoring.level_score) → «84%». */
export function percent(p: number | string | null | undefined): string {
  const n = typeof p === 'string' ? Number(p) : p;
  return typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n)}%` : '—';
}
