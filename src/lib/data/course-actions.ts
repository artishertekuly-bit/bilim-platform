import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type {
  CourseAccessSettingsPayload,
  CourseAccessType,
  CourseAnnouncementRow,
  CourseAnnouncementView,
  CourseInviteRow,
  CourseVisibility,
  CreateCourseAnnouncementPayload,
  CreateCourseInvitePayload,
  DeleteCourseAnnouncementPayload,
  EntitlementRow,
  ManualApproveOrderResponse,
  ManualGrantCourseAccessPayload,
  OrderRow,
  RedeemCourseInvitePayload,
  RedeemCourseInviteResponse,
  RequestPaidCourseAccessPayload,
  UpdateCourseAnnouncementPayload,
} from '@/lib/app-data-types';
import { execOrThrow, localizedText, queryOrThrow } from './common';

type CourseStatus = Tables<'courses'>['status'];

type CoursePatch = Partial<Tables<'courses'>> & {
  access_type?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: string;
  published_at?: string | null;
  enrollment_open?: boolean;
  max_students?: number | null;
};

type CourseInsert = Tables<'courses'>['Insert'] & {
  access_type?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: string;
  enrollment_open?: boolean;
  max_students?: number | null;
};

/* ================= HELPERS ================= */

function normalizeCurrency(currency?: string | null) {
  return (currency || 'KZT').trim().toUpperCase();
}

function assertCurrency(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      localizedText(
        'kk',
        'Валюта 3 әріптен тұруы керек. Мысалы: KZT, USD.',
        'Валюта должна состоять из 3 букв. Например: KZT, USD.'
      )
    );
  }
}

function assertNonNegativePrice(price: number) {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(
      localizedText(
        'kk',
        'Курс бағасы 0 немесе одан жоғары болуы керек.',
        'Цена курса должна быть 0 или больше.'
      )
    );
  }
}

function assertMaxStudents(maxStudents: number | null | undefined) {
  if (maxStudents !== null && maxStudents !== undefined) {
    if (!Number.isInteger(maxStudents) || maxStudents <= 0) {
      throw new Error(
        localizedText(
          'kk',
          'Оқушы санының лимиті бос немесе 1-ден жоғары бүтін сан болуы керек.',
          'Лимит студентов должен быть пустым или целым числом больше 0.'
        )
      );
    }
  }
}

function normalizeAccessSettings(input: CourseAccessSettingsPayload) {
  const accessType = input.accessType;
  const visibility = input.visibility;
  const price = Number(input.price ?? 0);
  const currency = normalizeCurrency(input.currency);
  const enrollmentOpen = input.enrollmentOpen;
  const maxStudents = input.maxStudents ?? null;

  assertNonNegativePrice(price);
  assertCurrency(currency);
  assertMaxStudents(maxStudents);

  if (accessType === 'paid' && price <= 0) {
    throw new Error(
      localizedText(
        'kk',
        'Ақылы курс үшін баға 0-ден жоғары болуы керек.',
        'Для платного курса цена должна быть больше 0.'
      )
    );
  }

  return {
    accessType,
    visibility,
    price,
    currency,
    enrollmentOpen,
    maxStudents,
  };
}

function normalizeInviteCode(code: string) {
  const normalized = code.trim().toUpperCase();

  if (normalized.length < 6) {
    throw new Error(
      localizedText(
        'kk',
        'Invite code кемінде 6 таңбадан тұруы керек.',
        'Invite code должен содержать минимум 6 символов.'
      )
    );
  }

  return normalized;
}

/* ================= UPDATE ================= */

export async function updateCourse(input: {
  courseId: string;
  title?: string;
  description?: string | null;
  subjectId?: string | null;
  thumbnailUrl?: string | null;
  status?: CourseStatus;

  /**
   * MVP 1 access fields.
   * Бұлар optional, сондықтан бұрынғы updateCourse қолданылған жерлер бұзылмайды.
   */
  accessType?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: string;
  enrollmentOpen?: boolean;
  maxStudents?: number | null;
}) {
  const patch: CoursePatch = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.subjectId !== undefined) patch.subject_id = input.subjectId;
  if (input.thumbnailUrl !== undefined) patch.thumbnail_url = input.thumbnailUrl;

  if (input.status !== undefined) {
    patch.status = input.status;

    if (input.status === 'published') {
      patch.published_at = new Date().toISOString();
    }
  }

  if (input.accessType !== undefined) patch.access_type = input.accessType;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.price !== undefined) {
    assertNonNegativePrice(input.price);
    patch.price = input.price;
  }
  if (input.currency !== undefined) {
    const currency = normalizeCurrency(input.currency);
    assertCurrency(currency);
    patch.currency = currency;
  }
  if (input.enrollmentOpen !== undefined) {
    patch.enrollment_open = input.enrollmentOpen;
  }
  if (input.maxStudents !== undefined) {
    assertMaxStudents(input.maxStudents);
    patch.max_students = input.maxStudents;
  }

  const { error } = await supabase
    .from('courses')
    .update(patch as never)
    .eq('id', input.courseId);

  if (error) throw new Error(error.message);
}

export async function updateCourseAccessSettings(
  input: CourseAccessSettingsPayload & {
    courseId: string;
  }
) {
  const settings = normalizeAccessSettings(input);

  return queryOrThrow(
    supabase
      .from('courses')
      .update({
        access_type: settings.accessType,
        visibility: settings.visibility,
        price: settings.price,
        currency: settings.currency,
        enrollment_open: settings.enrollmentOpen,
        max_students: settings.maxStudents,
      } as never)
      .eq('id', input.courseId)
      .select('*')
      .single()
  ) as Promise<Tables<'courses'>>;
}

export async function updateModule(input: {
  moduleId: string;
  title?: string;
  sortOrder?: number;
}) {
  const patch: Partial<Tables<'modules'>> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { error } = await supabase
    .from('modules')
    .update(patch)
    .eq('id', input.moduleId);

  if (error) throw new Error(error.message);
}

export async function updateLesson(input: {
  lessonId: string;
  title?: string;
  contentBody?: string | null;
  practiceContent?: string | null;
  mediaUrl?: string | null;
  sortOrder?: number;
  isPublished?: boolean;
}) {
  const patch: Partial<Tables<'lessons'>> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.contentBody !== undefined) patch.content_body = input.contentBody;
  if (input.practiceContent !== undefined) patch.practice_content = input.practiceContent;
  if (input.mediaUrl !== undefined) patch.media_url = input.mediaUrl;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;

  const { error } = await supabase
    .from('lessons')
    .update(patch)
    .eq('id', input.lessonId);

  if (error) throw new Error(error.message);
}

/* ================= CREATE ================= */

export async function createCourse(input: {
  title: string;
  description?: string;
  subjectId?: string;
  teacherId: string;
  status?: CourseStatus;

  /**
   * MVP 1 defaults:
   * Жаңа курс әдепкіде тегін, public, enrollment ашық болып құрылады.
   */
  accessType?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: string;
  enrollmentOpen?: boolean;
  maxStudents?: number | null;
}) {
  const currency = normalizeCurrency(input.currency);
  const price = Number(input.price ?? 0);
  const maxStudents = input.maxStudents ?? null;

  assertCurrency(currency);
  assertNonNegativePrice(price);
  assertMaxStudents(maxStudents);

  if (input.accessType === 'paid' && price <= 0) {
    throw new Error(
      localizedText(
        'kk',
        'Ақылы курс құру үшін баға 0-ден жоғары болуы керек.',
        'Для создания платного курса цена должна быть больше 0.'
      )
    );
  }

  const payload: CourseInsert = {
    title: input.title,
    description: input.description || null,
    subject_id: input.subjectId || null,
    teacher_id: input.teacherId,
    status: input.status || 'draft',
    access_type: input.accessType || 'public_free',
    visibility: input.visibility || 'public',
    price,
    currency,
    enrollment_open: input.enrollmentOpen ?? true,
    max_students: maxStudents,
  };

  return queryOrThrow(
    supabase
      .from('courses')
      .insert(payload as never)
      .select('*')
      .single()
  ) as Promise<Tables<'courses'>>;
}

export async function createModule(input: {
  courseId: string;
  title: string;
  sortOrder?: number;
}) {
  return queryOrThrow(
    supabase
      .from('modules')
      .insert({
        course_id: input.courseId,
        title: input.title,
        sort_order: input.sortOrder || 1,
      })
      .select('*')
      .single()
  );
}

export async function createLesson(input: {
  moduleId: string;
  subjectId?: string;
  title: string;
  contentBody?: string;
  sortOrder?: number;
  isPublished?: boolean;
  practiceContent?: string;
  mediaUrl?: string;
}) {
  return queryOrThrow(
    supabase
      .from('lessons')
      .insert({
        module_id: input.moduleId,
        subject_id: input.subjectId || null,
        title: input.title,
        content_body: input.contentBody || null,
        practice_content: input.practiceContent || null,
        media_url: input.mediaUrl || null,
        sort_order: input.sortOrder || 1,
        is_published: input.isPublished ?? false,
      })
      .select('*')
      .single()
  );
}

export async function createSubject(input: {
  slug: string;
  nameKk: string;
  nameRu?: string;
  sortOrder?: number;
}) {
  return queryOrThrow(
    supabase
      .from('subjects')
      .insert({
        slug: input.slug,
        name_kk: input.nameKk,
        name_ru: input.nameRu || null,
        sort_order: input.sortOrder || 1,
      })
      .select('*')
      .single()
  );
}

/* ================= STATUS ================= */

export async function updateCourseStatus(courseId: string, status: CourseStatus) {
  const patch: CoursePatch = { status };

  if (status === 'published') {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('courses')
    .update(patch as never)
    .eq('id', courseId);

  if (error) throw new Error(error.message);
}

/* ================= COURSE ACCESS ================= */

export async function canAccessCourse(courseId: string, userId?: string) {
  const args = userId
    ? {
        p_course_id: courseId,
        p_user_id: userId,
      }
    : {
        p_course_id: courseId,
      };

  return queryOrThrow(
    supabase.rpc('can_access_course' as never, args as never)
  ) as Promise<boolean>;
}

export async function userHasActiveEntitlement(input: {
  userId: string;
  resourceType: 'course' | 'subscription' | 'ai_feature' | 'consultation' | 'certificate';
  resourceId: string;
}) {
  return queryOrThrow(
    supabase.rpc('user_has_active_entitlement' as never, {
      p_user_id: input.userId,
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId,
    } as never)
  ) as Promise<boolean>;
}

/* ================= COURSE INVITES ================= */

export async function createCourseInvite(input: CreateCourseInvitePayload) {
  if (input.maxUses !== undefined && input.maxUses !== null) {
    if (!Number.isInteger(input.maxUses) || input.maxUses <= 0) {
      throw new Error(
        localizedText(
          'kk',
          'Invite қолдану лимиті 1 немесе одан жоғары болуы керек.',
          'Лимит использования invite должен быть 1 или больше.'
        )
      );
    }
  }

  return queryOrThrow(
    supabase.rpc('create_course_invite' as never, {
      p_course_id: input.courseId,
      p_max_uses: input.maxUses ?? null,
      p_expires_at: input.expiresAt ?? null,
    } as never)
  ) as Promise<CourseInviteRow>;
}

export async function redeemCourseInvite(
  input: RedeemCourseInvitePayload | string
) {
  const code = typeof input === 'string' ? input : input.code;
  const normalizedCode = normalizeInviteCode(code);

  return queryOrThrow(
    supabase.rpc('redeem_course_invite' as never, {
      p_code: normalizedCode,
    } as never)
  ) as Promise<RedeemCourseInviteResponse>;
}

export async function getCourseInvites(courseId: string) {
  return queryOrThrow(
    supabase
      .from('course_invites' as never)
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
  ) as Promise<CourseInviteRow[]>;
}

export async function setCourseInviteActive(input: {
  inviteId: string;
  isActive: boolean;
}) {
  return queryOrThrow(
    supabase
      .from('course_invites' as never)
      .update({
        is_active: input.isActive,
      } as never)
      .eq('id', input.inviteId)
      .select('*')
      .single()
  ) as Promise<CourseInviteRow>;
}

export async function deactivateCourseInvite(inviteId: string) {
  return setCourseInviteActive({
    inviteId,
    isActive: false,
  });
}

/* ================= PAID ACCESS / MANUAL PAYMENT SKELETON ================= */

export async function requestPaidCourseAccess(
  input: RequestPaidCourseAccessPayload | string
) {
  const courseId = typeof input === 'string' ? input : input.courseId;

  return queryOrThrow(
    supabase.rpc('request_paid_course_access' as never, {
      p_course_id: courseId,
    } as never)
  ) as Promise<OrderRow>;
}

export async function manualGrantCourseAccess(
  input: ManualGrantCourseAccessPayload
) {
  return queryOrThrow(
    supabase.rpc('manual_grant_course_access' as never, {
      p_user_id: input.userId,
      p_course_id: input.courseId,
      p_reason: input.reason ?? null,
    } as never)
  ) as Promise<EntitlementRow>;
}

export async function manualApproveOrder(orderId: string) {
  return queryOrThrow(
    supabase.rpc('manual_approve_order' as never, {
      p_order_id: orderId,
    } as never)
  ) as Promise<ManualApproveOrderResponse>;
}

export async function getMyOrders() {
  return queryOrThrow(
    supabase
      .from('orders' as never)
      .select('*')
      .order('created_at', { ascending: false })
  ) as Promise<OrderRow[]>;
}

export async function getPendingOrdersForAdmin() {
  return queryOrThrow(
    supabase
      .from('orders' as never)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
  ) as Promise<OrderRow[]>;
}

/* ================= DELETE ================= */

export async function deleteLesson(lessonId: string) {
  await execOrThrow(
    supabase.rpc('delete_lesson_deep' as never, {
      p_lesson_id: lessonId,
    } as never)
  );
}

export async function deleteModule(moduleId: string) {
  await execOrThrow(
    supabase.rpc('delete_module_deep' as never, {
      p_module_id: moduleId,
    } as never)
  );
}

export async function deleteCourse(courseId: string) {
  console.log('[deleteCourse] start', courseId);

  const result = await supabase.rpc('delete_course_deep' as never, {
    p_course_id: courseId,
  } as never);

  console.log('[deleteCourse] rpc result', result);

  await execOrThrow(Promise.resolve(result));
}

/* ================= REORDER ================= */

export async function reorderModules(courseId: string, orderedModuleIds: string[]) {
  const modules = await queryOrThrow(
    supabase.from('modules').select('id, course_id').in('id', orderedModuleIds)
  );

  const validIds = new Set(
    modules.filter((m) => m.course_id === courseId).map((m) => m.id)
  );

  if (validIds.size !== orderedModuleIds.length) {
    throw new Error(localizedText('kk', 'Модульдер қате', 'Некорректные модули'));
  }

  await Promise.all(
    orderedModuleIds.map((id, i) =>
      updateModule({ moduleId: id, sortOrder: i + 1 })
    )
  );
}

export async function reorderLessons(moduleId: string, orderedLessonIds: string[]) {
  const lessons = await queryOrThrow(
    supabase.from('lessons').select('id, module_id').in('id', orderedLessonIds)
  );

  const validIds = new Set(
    lessons.filter((l) => l.module_id === moduleId).map((l) => l.id)
  );

  if (validIds.size !== orderedLessonIds.length) {
    throw new Error(localizedText('kk', 'Сабақтар қате', 'Некорректные уроки'));
  }

  await Promise.all(
    orderedLessonIds.map((id, i) =>
      updateLesson({ lessonId: id, sortOrder: i + 1 })
    )
  );
}