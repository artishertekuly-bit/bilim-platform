import { supabase } from '@/integrations/supabase/client';
import type {
  Tables,
  TablesInsert,
} from '@/integrations/supabase/types';
import type {
  CourseAccessSettingsPayload,
  CourseAccessType,
  CourseAnnouncementRow,
  CourseAnnouncementView,
  CourseInviteRow,
  CourseVisibility,
  CreateCourseAnnouncementPayload,
  CreateCourseInvitePayload,
  CreateLessonMiniQuizQuestionPayload,
  DeleteCourseAnnouncementPayload,
  DeleteLessonMiniQuizPayload,
  DeleteLessonMiniQuizQuestionPayload,
  EntitlementRow,
  LessonMiniQuizAttemptRow,
  LessonMiniQuizAttemptView,
  LessonMiniQuizQuestionRow,
  LessonMiniQuizQuestionType,
  LessonMiniQuizQuestionView,
  LessonMiniQuizRow,
  LessonMiniQuizSubmitResult,
  LessonMiniQuizView,
  ManualApproveOrderResponse,
  ManualGrantCourseAccessPayload,
  OrderRow,
  RedeemCourseInvitePayload,
  RedeemCourseInviteResponse,
  ReorderLessonMiniQuizQuestionsPayload,
  RequestPaidCourseAccessPayload,
  SubmitLessonMiniQuizPayload,
  UpdateCourseAnnouncementPayload,
  UpdateLessonMiniQuizQuestionPayload,
  UpsertLessonMiniQuizPayload,
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

type CourseInsert = TablesInsert<'courses'> & {
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
        'Валюта должна состоять из 3 букв. Например: KZT, USD.',
      ),
    );
  }
}

function assertNonNegativePrice(price: number) {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(
      localizedText(
        'kk',
        'Курс бағасы 0 немесе одан жоғары болуы керек.',
        'Цена курса должна быть 0 или больше.',
      ),
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
          'Лимит студентов должен быть пустым или целым числом больше 0.',
        ),
      );
    }
  }
}

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user?.id) {
    throw new Error('Авторизация қажет.');
  }

  return user.id;
}

async function assertCourseOwner(courseId: string) {
  const trimmedCourseId = courseId.trim();

  if (!trimmedCourseId) {
    throw new Error('Course ID бос болмауы керек.');
  }

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('courses')
    .select('id, teacher_id')
    .eq('id', trimmedCourseId)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Бұл курсты өңдеуге рұқсатыңыз жоқ.');
  }

  return {
    userId,
    courseId: data.id,
  };
}

async function assertModuleOwner(moduleId: string) {
  const trimmedModuleId = moduleId.trim();

  if (!trimmedModuleId) {
    throw new Error('Module ID бос болмауы керек.');
  }

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('modules')
    .select('id, course_id, courses!inner(id, teacher_id)')
    .eq('id', trimmedModuleId)
    .eq('courses.teacher_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Бұл модульді өңдеуге рұқсатыңыз жоқ.');
  }

  const row = data as unknown as {
    id: string;
    course_id: string;
  };

  return {
    userId,
    moduleId: row.id,
    courseId: row.course_id,
  };
}

async function assertLessonOwner(lessonId: string) {
  const trimmedLessonId = lessonId.trim();

  if (!trimmedLessonId) {
    throw new Error('Lesson ID бос болмауы керек.');
  }

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('lessons')
    .select('id, module_id, modules!inner(id, course_id, courses!inner(id, teacher_id))')
    .eq('id', trimmedLessonId)
    .eq('modules.courses.teacher_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Бұл сабақты өңдеуге рұқсатыңыз жоқ.');
  }

  const row = data as unknown as {
    id: string;
    module_id: string;
    modules?: {
      course_id?: string;
    };
  };

  const courseId = row.modules?.course_id;

  if (!courseId) {
    throw new Error('Сабақтың courseId анықталмады.');
  }

  return {
    userId,
    lessonId: row.id,
    moduleId: row.module_id,
    courseId,
  };
}

async function assertCourseAnnouncementOwner(announcementId: string) {
  const trimmedAnnouncementId = announcementId.trim();

  if (!trimmedAnnouncementId) {
    throw new Error('Announcement ID бос болмауы керек.');
  }

  const { data, error } = await supabase
    .from('course_announcements' as never)
    .select('id, course_id')
    .eq('id', trimmedAnnouncementId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Хабарландыру табылмады.');
  }

  const row = data as unknown as {
    id: string;
    course_id: string;
  };

  await assertCourseOwner(row.course_id);

  return row;
}

async function assertCourseInviteOwner(inviteId: string) {
  const trimmedInviteId = inviteId.trim();

  if (!trimmedInviteId) {
    throw new Error('Invite ID бос болмауы керек.');
  }

  const { data, error } = await supabase
    .from('course_invites' as never)
    .select('id, course_id')
    .eq('id', trimmedInviteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Invite табылмады.');
  }

  const row = data as unknown as {
    id: string;
    course_id: string;
  };

  await assertCourseOwner(row.course_id);

  return row;
}

async function assertLessonMiniQuizOwner(quizId: string) {
  const trimmedQuizId = quizId.trim();

  if (!trimmedQuizId) {
    throw new Error('Quiz ID бос болмауы керек.');
  }

  const { data, error } = await supabase
    .from('lesson_mini_quizzes' as never)
    .select('id, lesson_id, course_id')
    .eq('id', trimmedQuizId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Mini quiz табылмады.');
  }

  const row = data as unknown as {
    id: string;
    lesson_id: string;
    course_id: string;
  };

  await assertCourseOwner(row.course_id);

  return row;
}

async function assertLessonMiniQuizQuestionOwner(questionId: string) {
  const trimmedQuestionId = questionId.trim();

  if (!trimmedQuestionId) {
    throw new Error('Question ID бос болмауы керек.');
  }

  const { data, error } = await supabase
    .from('lesson_mini_quiz_questions' as never)
    .select('id, quiz_id')
    .eq('id', trimmedQuestionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Mini quiz сұрағы табылмады.');
  }

  const row = data as unknown as {
    id: string;
    quiz_id: string;
  };

  await assertLessonMiniQuizOwner(row.quiz_id);

  return row;
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
        'Для платного курса цена должна быть больше 0.',
      ),
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
        'Invite code должен содержать минимум 6 символов.',
      ),
    );
  }

  return normalized;
}

function assertAnnouncementText(title: string, body: string) {
  if (!title.trim()) {
    throw new Error(
      localizedText(
        'kk',
        'Хабарландыру тақырыбы міндетті.',
        'Заголовок объявления обязателен.',
      ),
    );
  }

  if (!body.trim()) {
    throw new Error(
      localizedText(
        'kk',
        'Хабарландыру мәтіні міндетті.',
        'Текст объявления обязателен.',
      ),
    );
  }
}

function isExpiredAnnouncement(expiresAt: string | null) {
  if (!expiresAt) return false;

  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() <= Date.now();
}

function mapCourseAnnouncementView(
  row: CourseAnnouncementRow,
  courseTitle: string | null,
  authorProfile?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null,
): CourseAnnouncementView {
  return {
    id: row.id,

    courseId: row.course_id,
    courseTitle,

    authorId: row.author_id,
    authorName: authorProfile?.full_name || null,
    authorAvatarUrl: authorProfile?.avatar_url || null,

    title: row.title,
    body: row.body,

    priority: row.priority,
    isPinned: row.is_pinned,

    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    isExpired: isExpiredAnnouncement(row.expires_at),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0);
}

function normalizeMiniQuizAnswers(value: unknown): Record<string, number[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([questionId, answer]) => [
      questionId,
      normalizeNumberArray(answer),
    ]),
  );
}

function arraysEqualAsSet(a: number[], b: number[]) {
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);

  if (left.length !== right.length) return false;

  return left.every((value, index) => value === right[index]);
}

function assertMiniQuizBase(input: {
  title: string;
  passingScore: number;
}) {
  if (!input.title.trim()) {
    throw new Error('Mini quiz атауы міндетті.');
  }

  if (
    !Number.isInteger(input.passingScore) ||
    input.passingScore < 0 ||
    input.passingScore > 100
  ) {
    throw new Error('Passing score 0 мен 100 аралығында болуы керек.');
  }
}

function assertMiniQuizQuestion(input: {
  questionText: string;
  questionType: LessonMiniQuizQuestionType;
  options: string[];
  correctAnswer: number[];
}) {
  if (!input.questionText.trim()) {
    throw new Error('Сұрақ мәтіні міндетті.');
  }

  const options = input.options.map((item) => item.trim()).filter(Boolean);

  if (options.length < 2) {
    throw new Error('Кемінде 2 жауап нұсқасы болуы керек.');
  }

  if (input.questionType === 'single_choice' && input.correctAnswer.length !== 1) {
    throw new Error('Single choice сұрақта бір ғана дұрыс жауап болуы керек.');
  }

  if (input.correctAnswer.length === 0) {
    throw new Error('Дұрыс жауап таңдалуы керек.');
  }

  const invalidIndex = input.correctAnswer.some(
    (index) => !Number.isInteger(index) || index < 0 || index >= options.length,
  );

  if (invalidIndex) {
    throw new Error('Дұрыс жауап индексі жауап нұсқаларына сәйкес емес.');
  }
}

function mapLessonMiniQuizQuestionView(
  row: LessonMiniQuizQuestionRow,
): LessonMiniQuizQuestionView {
  return {
    id: row.id,
    quizId: row.quiz_id,

    questionText: row.question_text,
    questionType: row.question_type,

    options: normalizeStringArray(row.options),
    correctAnswer: normalizeNumberArray(row.correct_answer),

    explanation: row.explanation,
    sortOrder: row.sort_order,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLessonMiniQuizAttemptView(
  row: LessonMiniQuizAttemptRow,
): LessonMiniQuizAttemptView {
  return {
    id: row.id,

    quizId: row.quiz_id,
    lessonId: row.lesson_id,
    courseId: row.course_id,
    studentId: row.student_id,

    score: row.score,
    correctCount: row.correct_count,
    totalQuestions: row.total_questions,

    passed: row.passed,
    answers: normalizeMiniQuizAnswers(row.answers),

    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapLessonMiniQuizView(
  quiz: LessonMiniQuizRow,
  questions: LessonMiniQuizQuestionRow[],
): LessonMiniQuizView {
  const mappedQuestions = questions
    .map(mapLessonMiniQuizQuestionView)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    id: quiz.id,

    lessonId: quiz.lesson_id,
    courseId: quiz.course_id,
    createdBy: quiz.created_by,

    title: quiz.title,
    description: quiz.description,

    isPublished: quiz.is_published,
    passingScore: quiz.passing_score,

    questions: mappedQuestions,
    questionsCount: mappedQuestions.length,

    createdAt: quiz.created_at,
    updatedAt: quiz.updated_at,
  };
}

/* ================= UPDATE ================= */

export async function updateCourse(input: {
  courseId: string;
  title?: string;
  description?: string | null;
  subjectId?: string | null;
  thumbnailUrl?: string | null;
  status?: CourseStatus;
  accessType?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: string;
  enrollmentOpen?: boolean;
  maxStudents?: number | null;
}) {
  const { userId } = await assertCourseOwner(input.courseId);

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
    .eq('id', input.courseId)
    .eq('teacher_id', userId);

  if (error) throw new Error(error.message);
}

export async function updateCourseAccessSettings(
  input: CourseAccessSettingsPayload & {
    courseId: string;
  },
) {
  const { userId } = await assertCourseOwner(input.courseId);
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
      .eq('teacher_id', userId)
      .select('*')
      .single(),
  ) as Promise<Tables<'courses'>>;
}

export async function updateModule(input: {
  moduleId: string;
  title?: string;
  sortOrder?: number;
}) {
  await assertModuleOwner(input.moduleId);

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
  await assertLessonOwner(input.lessonId);

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
  accessType?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: string;
  enrollmentOpen?: boolean;
  maxStudents?: number | null;
}) {
  const teacherId = await getCurrentUserId();

  if (input.teacherId && input.teacherId !== teacherId) {
    throw new Error('Курсты тек ағымдағы мұғалім аккаунтымен құруға болады.');
  }

  const title = input.title.trim();

  if (!title) {
    throw new Error('Курс атауы міндетті.');
  }

  const currency = normalizeCurrency(input.currency);
  const price = Number(input.price ?? 0);
  const maxStudents = input.maxStudents ?? null;
  const accessType = input.accessType || 'public_free';

  assertCurrency(currency);
  assertNonNegativePrice(price);
  assertMaxStudents(maxStudents);

  if (accessType === 'paid' && price <= 0) {
    throw new Error(
      localizedText(
        'kk',
        'Ақылы курс құру үшін баға 0-ден жоғары болуы керек.',
        'Для создания платного курса цена должна быть больше 0.',
      ),
    );
  }

  const payload: CourseInsert = {
    title,
    description: input.description?.trim() || null,
    subject_id: input.subjectId || null,
    teacher_id: teacherId,
    status: input.status || 'draft',
    access_type: accessType,
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
      .single(),
  ) as Promise<Tables<'courses'>>;
}

export async function createModule(input: {
  courseId: string;
  title: string;
  sortOrder?: number;
}) {
  await assertCourseOwner(input.courseId);

  const title = input.title.trim();

  if (!title) {
    throw new Error('Модуль атауы міндетті.');
  }

  return queryOrThrow(
    supabase
      .from('modules')
      .insert({
        course_id: input.courseId,
        title,
        sort_order: input.sortOrder || 1,
      })
      .select('*')
      .single(),
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
  await assertModuleOwner(input.moduleId);

  const title = input.title.trim();

  if (!title) {
    throw new Error('Сабақ атауы міндетті.');
  }

  return queryOrThrow(
    supabase
      .from('lessons')
      .insert({
        module_id: input.moduleId,
        subject_id: input.subjectId || null,
        title,
        content_body: input.contentBody?.trim() || null,
        practice_content: input.practiceContent?.trim() || null,
        media_url: input.mediaUrl?.trim() || null,
        sort_order: input.sortOrder || 1,
        is_published: input.isPublished ?? false,
      })
      .select('*')
      .single(),
  );
}

export async function createSubject(input: {
  slug: string;
  nameKk: string;
  nameRu?: string;
  sortOrder?: number;
}) {
  const slug = input.slug.trim();
  const nameKk = input.nameKk.trim();
  const nameRu = input.nameRu?.trim() || null;

  if (!slug) {
    throw new Error('Пән slug міндетті.');
  }

  if (!nameKk) {
    throw new Error('Пән атауы міндетті.');
  }

  return queryOrThrow(
    supabase
      .from('subjects')
      .insert({
        slug,
        name_kk: nameKk,
        name_ru: nameRu,
        sort_order: input.sortOrder || 1,
      })
      .select('*')
      .single(),
  );
}

/* ================= STATUS ================= */

export async function updateCourseStatus(courseId: string, status: CourseStatus) {
  const { userId } = await assertCourseOwner(courseId);

  const patch: CoursePatch = { status };

  if (status === 'published') {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('courses')
    .update(patch as never)
    .eq('id', courseId)
    .eq('teacher_id', userId);

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
    supabase.rpc('can_access_course' as never, args as never),
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
    } as never),
  ) as Promise<boolean>;
}

/* ================= COURSE ANNOUNCEMENTS ================= */

export async function getCourseAnnouncements(input: {
  courseId: string;
  includeExpired?: boolean;
}) {
  const courseId = input.courseId.trim();

  if (!courseId) {
    return [];
  }

  let query = supabase
    .from('course_announcements' as never)
    .select('*')
    .eq('course_id', courseId)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false });

  if (!input.includeExpired) {
    query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  }

  const rows = (await queryOrThrow(query)) as unknown as CourseAnnouncementRow[];

  if (rows.length === 0) {
    return [];
  }

  const authorIds = Array.from(new Set(rows.map((row) => row.author_id).filter(Boolean)));

  const [courseRows, profileRows] = await Promise.all([
    queryOrThrow(
      supabase
        .from('courses')
        .select('id, title')
        .eq('id', courseId),
    ) as Promise<Array<{ id: string; title: string }>>,

    authorIds.length > 0
      ? (queryOrThrow(
          supabase
            .from('profiles')
            .select('user_id, full_name, avatar_url')
            .in('user_id', authorIds),
        ) as Promise<
          Array<{
            user_id: string;
            full_name: string | null;
            avatar_url: string | null;
          }>
        >)
      : Promise.resolve([]),
  ]);

  const courseTitle = courseRows[0]?.title || null;

  const profilesByUserId = new Map(
    profileRows.map((profile) => [profile.user_id, profile]),
  );

  return rows.map((row) =>
    mapCourseAnnouncementView(
      row,
      courseTitle,
      profilesByUserId.get(row.author_id) || null,
    ),
  );
}

export async function createCourseAnnouncement(
  input: CreateCourseAnnouncementPayload,
) {
  await assertCourseOwner(input.courseId);

  const title = input.title.trim();
  const body = input.body.trim();

  assertAnnouncementText(title, body);

  return queryOrThrow(
    supabase
      .from('course_announcements' as never)
      .insert({
        course_id: input.courseId,
        author_id: input.authorId,
        title,
        body,
        priority: input.priority || 'normal',
        is_pinned: input.isPinned ?? false,
        published_at: input.publishedAt || new Date().toISOString(),
        expires_at: input.expiresAt || null,
      } as never)
      .select('*')
      .single(),
  ) as unknown as Promise<CourseAnnouncementRow>;
}

export async function updateCourseAnnouncement(
  input: UpdateCourseAnnouncementPayload,
) {
  await assertCourseAnnouncementOwner(input.announcementId);

  const title = input.title.trim();
  const body = input.body.trim();

  assertAnnouncementText(title, body);

  return queryOrThrow(
    supabase
      .from('course_announcements' as never)
      .update({
        title,
        body,
        priority: input.priority,
        is_pinned: input.isPinned,
        published_at: input.publishedAt || new Date().toISOString(),
        expires_at: input.expiresAt || null,
      } as never)
      .eq('id', input.announcementId)
      .select('*')
      .single(),
  ) as unknown as Promise<CourseAnnouncementRow>;
}

export async function deleteCourseAnnouncement(
  input: DeleteCourseAnnouncementPayload | string,
) {
  const announcementId =
    typeof input === 'string' ? input : input.announcementId;

  await assertCourseAnnouncementOwner(announcementId);

  await execOrThrow(
    supabase
      .from('course_announcements' as never)
      .delete()
      .eq('id', announcementId),
  );
}

/* ================= LESSON MINI QUIZ ================= */

export async function getLessonMiniQuiz(input: {
  lessonId: string;
  studentId?: string;
  includeUnpublished?: boolean;
}) {
  const lessonId = input.lessonId.trim();

  if (!lessonId) {
    return {
      quiz: null,
      latestAttempt: null,
    };
  }

  if (input.includeUnpublished) {
    await assertLessonOwner(lessonId);
  }

  let quizQuery = supabase
    .from('lesson_mini_quizzes' as never)
    .select('*')
    .eq('lesson_id', lessonId);

  if (!input.includeUnpublished) {
    quizQuery = quizQuery.eq('is_published', true);
  }

  const { data: quizRow, error: quizError } = await quizQuery.maybeSingle();

  if (quizError) {
    throw new Error(quizError.message);
  }

  if (!quizRow) {
    return {
      quiz: null,
      latestAttempt: null,
    };
  }

  const quiz = quizRow as unknown as LessonMiniQuizRow;

  const questions = (await queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions' as never)
      .select('*')
      .eq('quiz_id', quiz.id)
      .order('sort_order', { ascending: true }),
  )) as unknown as LessonMiniQuizQuestionRow[];

  let latestAttempt: LessonMiniQuizAttemptView | null = null;

  if (input.studentId) {
    const { data: attemptRow, error: attemptError } = await supabase
      .from('lesson_mini_quiz_attempts' as never)
      .select('*')
      .eq('quiz_id', quiz.id)
      .eq('student_id', input.studentId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attemptError) {
      throw new Error(attemptError.message);
    }

    latestAttempt = attemptRow
      ? mapLessonMiniQuizAttemptView(attemptRow as unknown as LessonMiniQuizAttemptRow)
      : null;
  }

  return {
    quiz: mapLessonMiniQuizView(quiz, questions),
    latestAttempt,
  };
}

export async function upsertLessonMiniQuiz(input: UpsertLessonMiniQuizPayload) {
  const lessonOwner = await assertLessonOwner(input.lessonId);

  if (lessonOwner.courseId !== input.courseId) {
    throw new Error('Mini quiz courseId lesson-ға сәйкес емес.');
  }

  const title = input.title.trim();

  assertMiniQuizBase({
    title,
    passingScore: input.passingScore,
  });

  return queryOrThrow(
    supabase
      .from('lesson_mini_quizzes' as never)
      .upsert(
        {
          lesson_id: input.lessonId,
          course_id: input.courseId,
          created_by: lessonOwner.userId,
          title,
          description: input.description?.trim() || null,
          is_published: input.isPublished,
          passing_score: input.passingScore,
        } as never,
        {
          onConflict: 'lesson_id',
        },
      )
      .select('*')
      .single(),
  ) as unknown as Promise<LessonMiniQuizRow>;
}

export async function deleteLessonMiniQuiz(input: DeleteLessonMiniQuizPayload | string) {
  const quizId = typeof input === 'string' ? input : input.quizId;

  await assertLessonMiniQuizOwner(quizId);

  await execOrThrow(
    supabase
      .from('lesson_mini_quizzes' as never)
      .delete()
      .eq('id', quizId),
  );
}

export async function createLessonMiniQuizQuestion(
  input: CreateLessonMiniQuizQuestionPayload,
) {
  await assertLessonMiniQuizOwner(input.quizId);

  const options = input.options.map((item) => item.trim()).filter(Boolean);
  const correctAnswer = normalizeNumberArray(input.correctAnswer);

  assertMiniQuizQuestion({
    questionText: input.questionText,
    questionType: input.questionType,
    options,
    correctAnswer,
  });

  return queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions' as never)
      .insert({
        quiz_id: input.quizId,
        question_text: input.questionText.trim(),
        question_type: input.questionType,
        options,
        correct_answer: correctAnswer,
        explanation: input.explanation?.trim() || null,
        sort_order: input.sortOrder || 1,
      } as never)
      .select('*')
      .single(),
  ) as unknown as Promise<LessonMiniQuizQuestionRow>;
}

export async function updateLessonMiniQuizQuestion(
  input: UpdateLessonMiniQuizQuestionPayload,
) {
  await assertLessonMiniQuizQuestionOwner(input.questionId);

  const options = input.options.map((item) => item.trim()).filter(Boolean);
  const correctAnswer = normalizeNumberArray(input.correctAnswer);

  assertMiniQuizQuestion({
    questionText: input.questionText,
    questionType: input.questionType,
    options,
    correctAnswer,
  });

  return queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions' as never)
      .update({
        question_text: input.questionText.trim(),
        question_type: input.questionType,
        options,
        correct_answer: correctAnswer,
        explanation: input.explanation?.trim() || null,
        sort_order: input.sortOrder,
      } as never)
      .eq('id', input.questionId)
      .select('*')
      .single(),
  ) as unknown as Promise<LessonMiniQuizQuestionRow>;
}

export async function deleteLessonMiniQuizQuestion(
  input: DeleteLessonMiniQuizQuestionPayload | string,
) {
  const questionId = typeof input === 'string' ? input : input.questionId;

  await assertLessonMiniQuizQuestionOwner(questionId);

  await execOrThrow(
    supabase
      .from('lesson_mini_quiz_questions' as never)
      .delete()
      .eq('id', questionId),
  );
}

export async function reorderLessonMiniQuizQuestions(
  input: ReorderLessonMiniQuizQuestionsPayload,
) {
  await assertLessonMiniQuizOwner(input.quizId);

  const rows = (await queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions' as never)
      .select('id, quiz_id')
      .in('id', input.orderedQuestionIds),
  )) as unknown as Array<{
    id: string;
    quiz_id: string;
  }>;

  const validIds = new Set(
    rows.filter((row) => row.quiz_id === input.quizId).map((row) => row.id),
  );

  if (validIds.size !== input.orderedQuestionIds.length) {
    throw new Error('Mini quiz сұрақтары қате.');
  }

  await Promise.all(
    input.orderedQuestionIds.map((questionId, index) =>
      queryOrThrow(
        supabase
          .from('lesson_mini_quiz_questions' as never)
          .update({
            sort_order: index + 1,
          } as never)
          .eq('id', questionId)
          .select('id')
          .single(),
      ),
    ),
  );
}

export async function submitLessonMiniQuiz(
  input: SubmitLessonMiniQuizPayload,
): Promise<LessonMiniQuizSubmitResult> {
  const { quiz } = await getLessonMiniQuiz({
    lessonId: input.lessonId,
    studentId: input.studentId,
    includeUnpublished: false,
  });

  if (!quiz) {
    throw new Error('Mini quiz табылмады немесе жарияланбаған.');
  }

  if (quiz.id !== input.quizId) {
    throw new Error('Mini quiz lesson-ға сәйкес емес.');
  }

  if (quiz.questions.length === 0) {
    throw new Error('Mini quiz ішінде сұрақ жоқ.');
  }

  const normalizedAnswers = normalizeMiniQuizAnswers(input.answers);

  const breakdown = quiz.questions.map((question) => {
    const selectedAnswer = normalizeNumberArray(normalizedAnswers[question.id]);
    const correctAnswer = normalizeNumberArray(question.correctAnswer);
    const isCorrect = arraysEqualAsSet(selectedAnswer, correctAnswer);

    return {
      questionId: question.id,
      questionText: question.questionText,
      selectedAnswer,
      correctAnswer,
      isCorrect,
      explanation: question.explanation,
    };
  });

  const correctCount = breakdown.filter((item) => item.isCorrect).length;
  const totalQuestions = quiz.questions.length;
  const score =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = score >= quiz.passingScore;

  const attemptRow = (await queryOrThrow(
    supabase
      .from('lesson_mini_quiz_attempts' as never)
      .insert({
        quiz_id: quiz.id,
        lesson_id: input.lessonId,
        course_id: input.courseId,
        student_id: input.studentId,
        score,
        correct_count: correctCount,
        total_questions: totalQuestions,
        passed,
        answers: normalizedAnswers,
      } as never)
      .select('*')
      .single(),
  )) as unknown as LessonMiniQuizAttemptRow;

  return {
    attempt: mapLessonMiniQuizAttemptView(attemptRow),
    breakdown,
  };
}

/* ================= COURSE INVITES ================= */

export async function createCourseInvite(input: CreateCourseInvitePayload) {
  await assertCourseOwner(input.courseId);

  if (input.maxUses !== undefined && input.maxUses !== null) {
    if (!Number.isInteger(input.maxUses) || input.maxUses <= 0) {
      throw new Error(
        localizedText(
          'kk',
          'Invite қолдану лимиті 1 немесе одан жоғары болуы керек.',
          'Лимит использования invite должен быть 1 или больше.',
        ),
      );
    }
  }

  return queryOrThrow(
    supabase.rpc('create_course_invite' as never, {
      p_course_id: input.courseId,
      p_max_uses: input.maxUses ?? null,
      p_expires_at: input.expiresAt ?? null,
    } as never),
  ) as Promise<CourseInviteRow>;
}

export async function redeemCourseInvite(
  input: RedeemCourseInvitePayload | string,
) {
  const code = typeof input === 'string' ? input : input.code;
  const normalizedCode = normalizeInviteCode(code);

  return queryOrThrow(
    supabase.rpc('redeem_course_invite' as never, {
      p_code: normalizedCode,
    } as never),
  ) as Promise<RedeemCourseInviteResponse>;
}

export async function getCourseInvites(courseId: string) {
  await assertCourseOwner(courseId);

  return queryOrThrow(
    supabase
      .from('course_invites' as never)
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false }),
  ) as Promise<CourseInviteRow[]>;
}

export async function setCourseInviteActive(input: {
  inviteId: string;
  isActive: boolean;
}) {
  await assertCourseInviteOwner(input.inviteId);

  return queryOrThrow(
    supabase
      .from('course_invites' as never)
      .update({
        is_active: input.isActive,
      } as never)
      .eq('id', input.inviteId)
      .select('*')
      .single(),
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
  input: RequestPaidCourseAccessPayload | string,
) {
  const courseId = typeof input === 'string' ? input : input.courseId;

  return queryOrThrow(
    supabase.rpc('request_paid_course_access' as never, {
      p_course_id: courseId,
    } as never),
  ) as Promise<OrderRow>;
}

export async function manualGrantCourseAccess(
  input: ManualGrantCourseAccessPayload,
) {
  await assertCourseOwner(input.courseId);

  return queryOrThrow(
    supabase.rpc('manual_grant_course_access' as never, {
      p_user_id: input.userId,
      p_course_id: input.courseId,
      p_reason: input.reason ?? null,
    } as never),
  ) as Promise<EntitlementRow>;
}

export async function manualApproveOrder(orderId: string) {
  return queryOrThrow(
    supabase.rpc('manual_approve_order' as never, {
      p_order_id: orderId,
    } as never),
  ) as Promise<ManualApproveOrderResponse>;
}

export async function getMyOrders() {
  return queryOrThrow(
    supabase
      .from('orders' as never)
      .select('*')
      .order('created_at', { ascending: false }),
  ) as Promise<OrderRow[]>;
}

export async function getPendingOrdersForAdmin() {
  return queryOrThrow(
    supabase
      .from('orders' as never)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ) as Promise<OrderRow[]>;
}

/* ================= DELETE ================= */

export async function deleteLesson(lessonId: string) {
  await assertLessonOwner(lessonId);

  await execOrThrow(
    supabase.rpc('delete_lesson_deep' as never, {
      p_lesson_id: lessonId,
    } as never),
  );
}

export async function deleteModule(moduleId: string) {
  await assertModuleOwner(moduleId);

  await execOrThrow(
    supabase.rpc('delete_module_deep' as never, {
      p_module_id: moduleId,
    } as never),
  );
}

export async function deleteCourse(courseId: string) {
  await assertCourseOwner(courseId);

  const result = await supabase.rpc('delete_course_deep' as never, {
    p_course_id: courseId,
  } as never);

  await execOrThrow(Promise.resolve(result));
}

/* ================= REORDER ================= */

export async function reorderModules(courseId: string, orderedModuleIds: string[]) {
  await assertCourseOwner(courseId);

  const modules = await queryOrThrow(
    supabase.from('modules').select('id, course_id').in('id', orderedModuleIds),
  );

  const validIds = new Set(
    modules.filter((module) => module.course_id === courseId).map((module) => module.id),
  );

  if (validIds.size !== orderedModuleIds.length) {
    throw new Error(localizedText('kk', 'Модульдер қате', 'Некорректные модули'));
  }

  await Promise.all(
    orderedModuleIds.map((id, index) =>
      updateModule({ moduleId: id, sortOrder: index + 1 }),
    ),
  );
}

export async function reorderLessons(moduleId: string, orderedLessonIds: string[]) {
  await assertModuleOwner(moduleId);

  const lessons = await queryOrThrow(
    supabase.from('lessons').select('id, module_id').in('id', orderedLessonIds),
  );

  const validIds = new Set(
    lessons.filter((lesson) => lesson.module_id === moduleId).map((lesson) => lesson.id),
  );

  if (validIds.size !== orderedLessonIds.length) {
    throw new Error(localizedText('kk', 'Сабақтар қате', 'Некорректные уроки'));
  }

  await Promise.all(
    orderedLessonIds.map((id, index) =>
      updateLesson({ lessonId: id, sortOrder: index + 1 }),
    ),
  );
}