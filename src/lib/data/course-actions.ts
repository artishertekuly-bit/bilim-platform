import { supabase } from '@/integrations/supabase/client';
import type {
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/integrations/supabase/types';
import type {
  CourseAccessSettingsPayload,
  CourseAnnouncementPriority,
  CourseAnnouncementView,
  CreateCourseAnnouncementPayload,
  CreateCourseInvitePayload,
  CreateLessonMiniQuizQuestionPayload,
  DeleteCourseAnnouncementPayload,
  DeleteLessonMiniQuizPayload,
  DeleteLessonMiniQuizQuestionPayload,
  EntitlementRow,
  LessonMiniQuizAttemptView,
  LessonMiniQuizQuestionType,
  LessonMiniQuizQuestionView,
  LessonMiniQuizSubmitResult,
  LessonMiniQuizView,
  ManualApproveOrderResponse,
  ManualGrantCourseAccessPayload,
  RedeemCourseInvitePayload,
  RedeemCourseInviteResponse,
  ReorderLessonMiniQuizQuestionsPayload,
  RequestPaidCourseAccessPayload,
  SubmitLessonMiniQuizPayload,
  UpdateCourseAnnouncementPayload,
  UpdateLessonMiniQuizQuestionPayload,
  UpsertLessonMiniQuizPayload,
} from '@/lib/app-data-types';
import { removeNullCharacters } from '@/lib/utils';
import { execOrThrow, localizedText, queryOrThrow } from './common';

/* ================= TYPES ================= */

type CourseRow = Tables<'courses'>;
type CourseInsert = TablesInsert<'courses'>;
type CoursePatch = TablesUpdate<'courses'>;
type CourseStatus = Tables<'courses'>['status'];
type CourseAccessType = Tables<'courses'>['access_type'];
type CourseVisibility = Tables<'courses'>['visibility'];

type ModuleRow = Tables<'modules'>;
type ModulePatch = TablesUpdate<'modules'>;

type LessonRow = Tables<'lessons'>;
type LessonPatch = TablesUpdate<'lessons'>;

type SubjectInsert = TablesInsert<'subjects'>;

type CourseAnnouncementRow = Tables<'course_announcements'>;
type CourseAnnouncementInsert = TablesInsert<'course_announcements'>;
type CourseAnnouncementPatch = TablesUpdate<'course_announcements'>;

type CourseInviteRow = Tables<'course_invites'>;
type CourseInvitePatch = TablesUpdate<'course_invites'>;

type LessonMiniQuizRow = Tables<'lesson_mini_quizzes'>;
type LessonMiniQuizInsert = TablesInsert<'lesson_mini_quizzes'>;
type LessonMiniQuizPatch = TablesUpdate<'lesson_mini_quizzes'>;

type LessonMiniQuizQuestionRow = Tables<'lesson_mini_quiz_questions'>;
type LessonMiniQuizQuestionInsert = TablesInsert<'lesson_mini_quiz_questions'>;
type LessonMiniQuizQuestionPatch = TablesUpdate<'lesson_mini_quiz_questions'>;

type LessonMiniQuizAttemptRow = Tables<'lesson_mini_quiz_attempts'>;
type LessonMiniQuizAttemptInsert = TablesInsert<'lesson_mini_quiz_attempts'>;

type OrderRow = Tables<'orders'>;
type EntitlementDbRow = Tables<'entitlements'>;

type CurrentUserContext = {
  userId: string;
  isTeacher: boolean;
  isAdmin: boolean;
};

/* ================= NORMALIZE ================= */

function normalizeText(value: unknown): string {
  return removeNullCharacters(String(value ?? '')).replace(/\s+/g, ' ').trim();
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeMultilineText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeNullableMultilineText(value: unknown): string | null {
  const normalized = normalizeMultilineText(value);

  return normalized || null;
}

function normalizeCourseAccessType(value: unknown): CourseAccessType {
  if (
    value === 'public_free' ||
    value === 'private_invite' ||
    value === 'paid' ||
    value === 'subscription_only' ||
    value === 'school_only'
  ) {
    return value;
  }

  if (value === 'open' || value === 'free') return 'public_free';
  if (value === 'closed' || value === 'invite_only') return 'private_invite';

  return 'public_free';
}

function getDefaultVisibilityForAccessType(
  accessType: CourseAccessType,
): CourseVisibility {
  if (accessType === 'private_invite' || accessType === 'school_only') {
    return 'private';
  }

  if (accessType === 'paid' || accessType === 'subscription_only') {
    return 'unlisted';
  }

  return 'public';
}

function normalizeCourseVisibility(
  value: unknown,
  accessType: CourseAccessType,
): CourseVisibility {
  if (value === 'public' || value === 'unlisted' || value === 'private') {
    return value;
  }

  if (value === 'school') {
    return 'private';
  }

  return getDefaultVisibilityForAccessType(accessType);
}

function normalizeOptionalIsoDate(value: unknown): string | null {
  const normalized = normalizeNullableText(value);

  if (!normalized) return null;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Мерзім форматы қате.');
  }

  return date.toISOString();
}

function normalizeCurrency(currency?: string | null): string {
  return normalizeText(currency || 'KZT').toUpperCase();
}

function normalizePositiveInteger(value: unknown, fallback = 1): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.round(parsed);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(Number))]
    .filter((item) => Number.isInteger(item) && item >= 0)
    .sort((a, b) => a - b);
}

function normalizeMiniQuizAnswers(value: unknown): Record<string, number[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([questionId, answer]) => [
        normalizeText(questionId),
        normalizeNumberArray(answer),
      ])
      .filter(([questionId]) => Boolean(questionId)),
  );
}

function normalizeAnnouncementPriority(value: unknown): CourseAnnouncementPriority {
  if (value === 'important' || value === 'urgent') {
    return value;
  }

  return 'normal';
}

function normalizeLessonMiniQuizQuestionType(
  value: unknown,
): LessonMiniQuizQuestionType {
  return value === 'multiple_choice' ? 'multiple_choice' : 'single_choice';
}

function toJson(value: unknown): Json {
  return value as Json;
}

/* ================= ASSERTIONS ================= */

function assertNonEmptyId(value: string, label: string): void {
  if (!normalizeText(value)) {
    throw new Error(`${label} бос болмауы керек.`);
  }
}

function assertCurrency(currency: string): void {
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

function assertNonNegativePrice(price: number): void {
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

function assertMaxStudents(maxStudents: number | null | undefined): void {
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

function assertCourseTitle(title: string): void {
  if (!title) {
    throw new Error('Курс атауы міндетті.');
  }
}

function assertModuleTitle(title: string): void {
  if (!title) {
    throw new Error('Модуль атауы міндетті.');
  }
}

function assertLessonTitle(title: string): void {
  if (!title) {
    throw new Error('Сабақ атауы міндетті.');
  }
}

function assertSubjectPayload(input: {
  slug: string;
  nameKk: string;
}): void {
  if (!input.slug) {
    throw new Error('Пән slug міндетті.');
  }

  if (!input.nameKk) {
    throw new Error('Пән атауы міндетті.');
  }
}

function assertAnnouncementText(title: string, body: string): void {
  if (!title) {
    throw new Error(
      localizedText(
        'kk',
        'Хабарландыру тақырыбы міндетті.',
        'Заголовок объявления обязателен.',
      ),
    );
  }

  if (!body) {
    throw new Error(
      localizedText(
        'kk',
        'Хабарландыру мәтіні міндетті.',
        'Текст объявления обязателен.',
      ),
    );
  }
}

function assertMiniQuizBase(input: {
  title: string;
  passingScore: number;
}): void {
  if (!input.title) {
    throw new Error('Шағын тест атауы міндетті.');
  }

  if (
    !Number.isInteger(input.passingScore) ||
    input.passingScore < 0 ||
    input.passingScore > 100
  ) {
    throw new Error('Өту пайызы 0 мен 100 аралығында болуы керек.');
  }
}

function assertMiniQuizQuestion(input: {
  questionText: string;
  questionType: LessonMiniQuizQuestionType;
  options: string[];
  correctAnswer: number[];
}): void {
  if (!input.questionText) {
    throw new Error('Сұрақ мәтіні міндетті.');
  }

  if (input.options.length < 2) {
    throw new Error('Кемінде 2 жауап нұсқасы болуы керек.');
  }

  if (input.correctAnswer.length === 0) {
    throw new Error('Дұрыс жауап таңдалуы керек.');
  }

  const invalidIndex = input.correctAnswer.some(
    (index) => index < 0 || index >= input.options.length,
  );

  if (invalidIndex) {
    throw new Error('Дұрыс жауап индексі жауап нұсқаларына сәйкес емес.');
  }

  if (input.questionType === 'single_choice' && input.correctAnswer.length !== 1) {
    throw new Error('Single choice сұрақта бір ғана дұрыс жауап болуы керек.');
  }
}

function arraysEqualAsSet(a: number[], b: number[]): boolean {
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);

  if (left.length !== right.length) return false;

  return left.every((value, index) => value === right[index]);
}

/* ================= AUTH / OWNERSHIP ================= */

async function getCurrentUserContext(): Promise<CurrentUserContext> {
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

  const [teacherResult, adminResult] = await Promise.all([
    supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'teacher',
    }),
    supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    }),
  ]);

  if (teacherResult.error) {
    throw new Error(teacherResult.error.message);
  }

  if (adminResult.error) {
    throw new Error(adminResult.error.message);
  }

  return {
    userId: user.id,
    isTeacher: Boolean(teacherResult.data),
    isAdmin: Boolean(adminResult.data),
  };
}

async function getCurrentUserId(): Promise<string> {
  const context = await getCurrentUserContext();

  return context.userId;
}

async function assertCanCreateCourse(): Promise<CurrentUserContext> {
  const context = await getCurrentUserContext();

  if (!context.isTeacher && !context.isAdmin) {
    throw new Error('Курс құру үшін мұғалім немесе admin рөлі қажет.');
  }

  return context;
}

async function assertCourseOwner(courseId: string) {
  const trimmedCourseId = normalizeText(courseId);

  assertNonEmptyId(trimmedCourseId, 'Course ID');

  const context = await getCurrentUserContext();

  const { data, error } = await supabase
    .from('courses')
    .select('id, teacher_id, subject_id')
    .eq('id', trimmedCourseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Курс табылмады.');
  }

  if (!context.isAdmin && data.teacher_id !== context.userId) {
    throw new Error('Бұл курсты өңдеуге рұқсатыңыз жоқ.');
  }

  return {
    ...context,
    courseId: data.id,
    teacherId: data.teacher_id,
    subjectId: data.subject_id,
  };
}

async function assertModuleOwner(moduleId: string) {
  const trimmedModuleId = normalizeText(moduleId);

  assertNonEmptyId(trimmedModuleId, 'Module ID');

  const { data, error } = await supabase
    .from('modules')
    .select('id, course_id')
    .eq('id', trimmedModuleId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Модуль табылмады.');
  }

  const owner = await assertCourseOwner(data.course_id);

  return {
    ...owner,
    moduleId: data.id,
  };
}

async function assertLessonOwner(lessonId: string) {
  const trimmedLessonId = normalizeText(lessonId);

  assertNonEmptyId(trimmedLessonId, 'Lesson ID');

  const { data, error } = await supabase
    .from('lessons')
    .select('id, module_id')
    .eq('id', trimmedLessonId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Сабақ табылмады.');
  }

  const owner = await assertModuleOwner(data.module_id);

  return {
    ...owner,
    lessonId: data.id,
    moduleId: data.module_id,
  };
}

async function assertCourseAnnouncementOwner(announcementId: string) {
  const trimmedAnnouncementId = normalizeText(announcementId);

  assertNonEmptyId(trimmedAnnouncementId, 'Announcement ID');

  const { data, error } = await supabase
    .from('course_announcements')
    .select('id, course_id')
    .eq('id', trimmedAnnouncementId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Хабарландыру табылмады.');
  }

  await assertCourseOwner(data.course_id);

  return data;
}

async function assertCourseInviteOwner(inviteId: string) {
  const trimmedInviteId = normalizeText(inviteId);

  assertNonEmptyId(trimmedInviteId, 'Шақыру коды ID');

  const { data, error } = await supabase
    .from('course_invites')
    .select('id, course_id')
    .eq('id', trimmedInviteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Шақыру коды табылмады.');
  }

  await assertCourseOwner(data.course_id);

  return data;
}

async function assertLessonMiniQuizOwner(quizId: string) {
  const trimmedQuizId = normalizeText(quizId);

  assertNonEmptyId(trimmedQuizId, 'Quiz ID');

  const { data, error } = await supabase
    .from('lesson_mini_quizzes')
    .select('id, lesson_id, course_id')
    .eq('id', trimmedQuizId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Шағын тест табылмады.');
  }

  await assertCourseOwner(data.course_id);

  return data;
}

async function assertLessonMiniQuizQuestionOwner(questionId: string) {
  const trimmedQuestionId = normalizeText(questionId);

  assertNonEmptyId(trimmedQuestionId, 'Question ID');

  const { data, error } = await supabase
    .from('lesson_mini_quiz_questions')
    .select('id, quiz_id')
    .eq('id', trimmedQuestionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Шағын тест сұрағы табылмады.');
  }

  await assertLessonMiniQuizOwner(data.quiz_id);

  return data;
}

/* ================= HELPERS ================= */

function normalizeAccessSettings(input: CourseAccessSettingsPayload) {
  const accessType = normalizeCourseAccessType(input.accessType);
  const visibility = normalizeCourseVisibility(input.visibility, accessType);
  const price = Number(input.price ?? 0);
  const currency = normalizeCurrency(input.currency);
  const enrollmentOpen = input.enrollmentOpen ?? true;
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

function normalizeInviteCode(code: string): string {
  const normalized = normalizeText(code).toUpperCase();

  if (normalized.length < 6) {
    throw new Error(
      localizedText(
        'kk',
        'Шақыру коды кемінде 6 таңбадан тұруы керек.',
        'Код приглашения должен содержать минимум 6 символов.',
      ),
    );
  }

  return normalized;
}

function isExpiredAnnouncement(expiresAt: string | null): boolean {
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

    priority: normalizeAnnouncementPriority(row.priority),
    isPinned: row.is_pinned,

    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    isExpired: isExpiredAnnouncement(row.expires_at),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLessonMiniQuizQuestionView(
  row: LessonMiniQuizQuestionRow,
): LessonMiniQuizQuestionView {
  return {
    id: row.id,
    quizId: row.quiz_id,

    questionText: row.question_text,
    questionType: normalizeLessonMiniQuizQuestionType(row.question_type),

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

function assertOrderedIds(ids: string[], label: string): string[] {
  const normalizedIds = ids.map((id) => normalizeText(id)).filter(Boolean);
  const uniqueIds = [...new Set(normalizedIds)];

  if (uniqueIds.length !== ids.length || uniqueIds.length !== normalizedIds.length) {
    throw new Error(`${label}: бос немесе қайталанған ID бар.`);
  }

  return uniqueIds;
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
  const { userId, isAdmin } = await assertCourseOwner(input.courseId);

  const patch: CoursePatch = {};

  if (input.title !== undefined) {
    const title = normalizeText(input.title);
    assertCourseTitle(title);
    patch.title = title;
  }

  if (input.description !== undefined) {
    patch.description = normalizeNullableMultilineText(input.description);
  }

  if (input.subjectId !== undefined) {
    patch.subject_id = normalizeNullableText(input.subjectId);
  }

  if (input.thumbnailUrl !== undefined) {
    patch.thumbnail_url = normalizeNullableText(input.thumbnailUrl);
  }

  if (input.status !== undefined) {
    patch.status = input.status;

    if (input.status === 'published') {
      patch.published_at = new Date().toISOString();
    }
  }

  if (input.accessType !== undefined) {
    patch.access_type = normalizeCourseAccessType(input.accessType);
  }

  if (input.visibility !== undefined) {
    patch.visibility = normalizeCourseVisibility(
      input.visibility,
      patch.access_type || input.accessType || 'public_free',
    );
  }

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

  let query = supabase.from('courses').update(patch).eq('id', input.courseId);

  if (!isAdmin) {
    query = query.eq('teacher_id', userId);
  }

  const { error } = await query;

  if (error) throw new Error(error.message);
}

export async function updateCourseAccessSettings(
  input: CourseAccessSettingsPayload & {
    courseId: string;
  },
) {
  const { userId, isAdmin } = await assertCourseOwner(input.courseId);
  const settings = normalizeAccessSettings(input);

  const patch: CoursePatch = {
    access_type: settings.accessType,
    visibility: settings.visibility,
    price: settings.price,
    currency: settings.currency,
    enrollment_open: settings.enrollmentOpen,
    max_students: settings.maxStudents,
  };

  let query = supabase
    .from('courses')
    .update(patch)
    .eq('id', input.courseId);

  if (!isAdmin) {
    query = query.eq('teacher_id', userId);
  }

  return queryOrThrow(query.select('*').single()) as Promise<CourseRow>;
}

export async function updateModule(input: {
  moduleId: string;
  title?: string;
  sortOrder?: number;
}) {
  await assertModuleOwner(input.moduleId);

  const patch: ModulePatch = {};

  if (input.title !== undefined) {
    const title = normalizeText(input.title);
    assertModuleTitle(title);
    patch.title = title;
  }

  if (input.sortOrder !== undefined) {
    patch.sort_order = normalizePositiveInteger(input.sortOrder);
  }

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

  const patch: LessonPatch = {};

  if (input.title !== undefined) {
    const title = normalizeText(input.title);
    assertLessonTitle(title);
    patch.title = title;
  }

  if (input.contentBody !== undefined) {
    patch.content_body = normalizeNullableMultilineText(input.contentBody);
  }

  if (input.practiceContent !== undefined) {
    patch.practice_content = normalizeNullableMultilineText(input.practiceContent);
  }

  if (input.mediaUrl !== undefined) {
    patch.media_url = normalizeNullableText(input.mediaUrl);
  }

  if (input.sortOrder !== undefined) {
    patch.sort_order = normalizePositiveInteger(input.sortOrder);
  }

  if (input.isPublished !== undefined) {
    patch.is_published = input.isPublished;
  }

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
  const context = await assertCanCreateCourse();

  if (!context.isAdmin && input.teacherId && input.teacherId !== context.userId) {
    throw new Error('Курсты тек ағымдағы мұғалім аккаунтымен құруға болады.');
  }

  const title = normalizeText(input.title);
  assertCourseTitle(title);

  const currency = normalizeCurrency(input.currency);
  const price = Number(input.price ?? 0);
  const maxStudents = input.maxStudents ?? null;
  const accessType = normalizeCourseAccessType(input.accessType);
  const visibility = normalizeCourseVisibility(input.visibility, accessType);

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
    description: normalizeNullableMultilineText(input.description),
    subject_id: normalizeNullableText(input.subjectId),
    teacher_id: context.isAdmin && input.teacherId ? input.teacherId : context.userId,
    status: input.status || 'draft',
    access_type: accessType,
    visibility,
    price,
    currency,
    enrollment_open: input.enrollmentOpen ?? true,
    max_students: maxStudents,
  };

  return queryOrThrow(
    supabase
      .from('courses')
      .insert(payload)
      .select('*')
      .single(),
  ) as Promise<CourseRow>;
}

export async function createModule(input: {
  courseId: string;
  title: string;
  sortOrder?: number;
}) {
  await assertCourseOwner(input.courseId);

  const title = normalizeText(input.title);
  assertModuleTitle(title);

  const payload: TablesInsert<'modules'> = {
    course_id: input.courseId,
    title,
    sort_order: normalizePositiveInteger(input.sortOrder),
  };

  return queryOrThrow(
    supabase
      .from('modules')
      .insert(payload)
      .select('*')
      .single(),
  ) as Promise<ModuleRow>;
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

  const title = normalizeText(input.title);
  assertLessonTitle(title);

  const payload: TablesInsert<'lessons'> = {
    module_id: input.moduleId,
    subject_id: normalizeNullableText(input.subjectId),
    title,
    content_body: normalizeNullableMultilineText(input.contentBody),
    practice_content: normalizeNullableMultilineText(input.practiceContent),
    media_url: normalizeNullableText(input.mediaUrl),
    sort_order: normalizePositiveInteger(input.sortOrder),
    is_published: input.isPublished ?? false,
  };

  return queryOrThrow(
    supabase
      .from('lessons')
      .insert(payload)
      .select('*')
      .single(),
  ) as Promise<LessonRow>;
}

export async function createSubject(input: {
  slug: string;
  nameKk: string;
  nameRu?: string;
  sortOrder?: number;
}) {
  const slug = normalizeText(input.slug);
  const nameKk = normalizeText(input.nameKk);
  const nameRu = normalizeNullableText(input.nameRu);

  assertSubjectPayload({ slug, nameKk });

  const payload: SubjectInsert = {
    slug,
    name_kk: nameKk,
    name_ru: nameRu,
    sort_order: normalizePositiveInteger(input.sortOrder),
  };

  return queryOrThrow(
    supabase
      .from('subjects')
      .insert(payload)
      .select('*')
      .single(),
  );
}

/* ================= STATUS ================= */

export async function updateCourseStatus(courseId: string, status: CourseStatus) {
  const { userId, isAdmin } = await assertCourseOwner(courseId);

  const patch: CoursePatch = { status };

  if (status === 'published') {
    patch.published_at = new Date().toISOString();
  }

  let query = supabase.from('courses').update(patch).eq('id', courseId);

  if (!isAdmin) {
    query = query.eq('teacher_id', userId);
  }

  const { error } = await query;

  if (error) throw new Error(error.message);
}

/* ================= COURSE ACCESS ================= */

export async function canAccessCourse(courseId: string, userId?: string) {
  const normalizedCourseId = normalizeText(courseId);

  assertNonEmptyId(normalizedCourseId, 'Course ID');

  return queryOrThrow(
    supabase.rpc('can_access_course', {
      p_course_id: normalizedCourseId,
      ...(userId ? { p_user_id: normalizeText(userId) } : {}),
    }),
  ) as Promise<boolean>;
}

export async function userHasActiveEntitlement(input: {
  userId: string;
  resourceType: Tables<'entitlements'>['resource_type'];
  resourceId: string;
}) {
  const userId = normalizeText(input.userId);
  const resourceId = normalizeText(input.resourceId);

  assertNonEmptyId(userId, 'User ID');
  assertNonEmptyId(resourceId, 'Resource ID');

  return queryOrThrow(
    supabase.rpc('user_has_active_entitlement', {
      p_user_id: userId,
      p_resource_type: input.resourceType,
      p_resource_id: resourceId,
    }),
  ) as Promise<boolean>;
}

/* ================= COURSE ANNOUNCEMENTS ================= */

export async function getCourseAnnouncements(input: {
  courseId: string;
  includeExpired?: boolean;
}): Promise<CourseAnnouncementView[]> {
  const courseId = normalizeText(input.courseId);

  if (!courseId) {
    return [];
  }

  let query = supabase
    .from('course_announcements')
    .select('*')
    .eq('course_id', courseId)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false });

  if (!input.includeExpired) {
    query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  }

  const rows = await queryOrThrow(query);

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
  const owner = await assertCourseOwner(input.courseId);

  const title = normalizeText(input.title);
  const body = normalizeMultilineText(input.body);

  assertAnnouncementText(title, body);

  const payload: CourseAnnouncementInsert = {
    course_id: input.courseId,
    author_id: owner.userId,
    title,
    body,
    priority: input.priority || 'normal',
    is_pinned: input.isPinned ?? false,
    published_at: normalizeOptionalIsoDate(input.publishedAt) || new Date().toISOString(),
    expires_at: normalizeOptionalIsoDate(input.expiresAt),
  };

  return queryOrThrow(
    supabase
      .from('course_announcements')
      .insert(payload)
      .select('*')
      .single(),
  ) as Promise<CourseAnnouncementRow>;
}

export async function updateCourseAnnouncement(
  input: UpdateCourseAnnouncementPayload,
) {
  await assertCourseAnnouncementOwner(input.announcementId);

  const title = normalizeText(input.title);
  const body = normalizeMultilineText(input.body);

  assertAnnouncementText(title, body);

  const patch: CourseAnnouncementPatch = {
    title,
    body,
    priority: input.priority,
    is_pinned: input.isPinned,
    expires_at: normalizeOptionalIsoDate(input.expiresAt),
  };

  if (input.publishedAt !== undefined) {
    patch.published_at =
      normalizeOptionalIsoDate(input.publishedAt) || new Date().toISOString();
  }

  return queryOrThrow(
    supabase
      .from('course_announcements')
      .update(patch)
      .eq('id', input.announcementId)
      .select('*')
      .single(),
  ) as Promise<CourseAnnouncementRow>;
}

export async function deleteCourseAnnouncement(
  input: DeleteCourseAnnouncementPayload | string,
) {
  const announcementId =
    typeof input === 'string' ? input : input.announcementId;

  await assertCourseAnnouncementOwner(announcementId);

  await execOrThrow(
    supabase
      .from('course_announcements')
      .delete()
      .eq('id', normalizeText(announcementId)),
  );
}

/* ================= LESSON MINI QUIZ ================= */

export async function getLessonMiniQuiz(input: {
  lessonId: string;
  studentId?: string;
  includeUnpublished?: boolean;
}) {
  const lessonId = normalizeText(input.lessonId);

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
    .from('lesson_mini_quizzes')
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

  const questions = await queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions')
      .select('*')
      .eq('quiz_id', quizRow.id)
      .order('sort_order', { ascending: true }),
  );

  let latestAttempt: LessonMiniQuizAttemptView | null = null;

  if (input.studentId) {
    const { data: attemptRow, error: attemptError } = await supabase
      .from('lesson_mini_quiz_attempts')
      .select('*')
      .eq('quiz_id', quizRow.id)
      .eq('student_id', normalizeText(input.studentId))
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attemptError) {
      throw new Error(attemptError.message);
    }

    latestAttempt = attemptRow ? mapLessonMiniQuizAttemptView(attemptRow) : null;
  }

  return {
    quiz: mapLessonMiniQuizView(quizRow, questions),
    latestAttempt,
  };
}

export async function upsertLessonMiniQuiz(input: UpsertLessonMiniQuizPayload) {
  const lessonOwner = await assertLessonOwner(input.lessonId);

  if (lessonOwner.courseId !== input.courseId) {
    throw new Error('Шағын тест courseId сабаққа сәйкес емес.');
  }

  const title = normalizeText(input.title);

  assertMiniQuizBase({
    title,
    passingScore: input.passingScore,
  });

  const payload: LessonMiniQuizInsert = {
    lesson_id: input.lessonId,
    course_id: input.courseId,
    created_by: lessonOwner.userId,
    title,
    description: normalizeNullableText(input.description),
    is_published: input.isPublished,
    passing_score: input.passingScore,
  };

  return queryOrThrow(
    supabase
      .from('lesson_mini_quizzes')
      .upsert(payload, {
        onConflict: 'lesson_id',
      })
      .select('*')
      .single(),
  ) as Promise<LessonMiniQuizRow>;
}

export async function deleteLessonMiniQuiz(input: DeleteLessonMiniQuizPayload | string) {
  const quizId = typeof input === 'string' ? input : input.quizId;

  await assertLessonMiniQuizOwner(quizId);

  await execOrThrow(
    supabase
      .from('lesson_mini_quizzes')
      .delete()
      .eq('id', normalizeText(quizId)),
  );
}

export async function createLessonMiniQuizQuestion(
  input: CreateLessonMiniQuizQuestionPayload,
) {
  await assertLessonMiniQuizOwner(input.quizId);

  const questionText = normalizeText(input.questionText);
  const options = normalizeStringArray(input.options);
  const correctAnswer = normalizeNumberArray(input.correctAnswer);
  const questionType = input.questionType;

  assertMiniQuizQuestion({
    questionText,
    questionType,
    options,
    correctAnswer,
  });

  const payload: LessonMiniQuizQuestionInsert = {
    quiz_id: input.quizId,
    question_text: questionText,
    question_type: questionType,
    options: toJson(options),
    correct_answer: toJson(correctAnswer),
    explanation: normalizeNullableText(input.explanation),
    sort_order: normalizePositiveInteger(input.sortOrder),
  };

  return queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions')
      .insert(payload)
      .select('*')
      .single(),
  ) as Promise<LessonMiniQuizQuestionRow>;
}

export async function updateLessonMiniQuizQuestion(
  input: UpdateLessonMiniQuizQuestionPayload,
) {
  await assertLessonMiniQuizQuestionOwner(input.questionId);

  const questionText = normalizeText(input.questionText);
  const options = normalizeStringArray(input.options);
  const correctAnswer = normalizeNumberArray(input.correctAnswer);
  const questionType = input.questionType;

  assertMiniQuizQuestion({
    questionText,
    questionType,
    options,
    correctAnswer,
  });

  const patch: LessonMiniQuizQuestionPatch = {
    question_text: questionText,
    question_type: questionType,
    options: toJson(options),
    correct_answer: toJson(correctAnswer),
    explanation: normalizeNullableText(input.explanation),
    sort_order: normalizePositiveInteger(input.sortOrder),
  };

  return queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions')
      .update(patch)
      .eq('id', input.questionId)
      .select('*')
      .single(),
  ) as Promise<LessonMiniQuizQuestionRow>;
}

export async function deleteLessonMiniQuizQuestion(
  input: DeleteLessonMiniQuizQuestionPayload | string,
) {
  const questionId = typeof input === 'string' ? input : input.questionId;

  await assertLessonMiniQuizQuestionOwner(questionId);

  await execOrThrow(
    supabase
      .from('lesson_mini_quiz_questions')
      .delete()
      .eq('id', normalizeText(questionId)),
  );
}

export async function reorderLessonMiniQuizQuestions(
  input: ReorderLessonMiniQuizQuestionsPayload,
) {
  await assertLessonMiniQuizOwner(input.quizId);

  const orderedQuestionIds = assertOrderedIds(
    input.orderedQuestionIds,
    'Шағын тест сұрақтары',
  );

  if (orderedQuestionIds.length === 0) {
    return;
  }

  const rows = await queryOrThrow(
    supabase
      .from('lesson_mini_quiz_questions')
      .select('id, quiz_id')
      .in('id', orderedQuestionIds),
  );

  const validIds = new Set(
    rows.filter((row) => row.quiz_id === input.quizId).map((row) => row.id),
  );

  if (validIds.size !== orderedQuestionIds.length) {
    throw new Error('Шағын тест сұрақтары қате.');
  }

  await Promise.all(
    orderedQuestionIds.map((questionId, index) => {
      const patch: LessonMiniQuizQuestionPatch = {
        sort_order: index + 1,
      };

      return queryOrThrow(
        supabase
          .from('lesson_mini_quiz_questions')
          .update(patch)
          .eq('id', questionId)
          .select('id')
          .single(),
      );
    }),
  );
}

export async function submitLessonMiniQuiz(
  input: SubmitLessonMiniQuizPayload,
): Promise<LessonMiniQuizSubmitResult> {
  const currentUserId = await getCurrentUserId();

  if (currentUserId !== input.studentId) {
    throw new Error('Шағын тест тек ағымдағы оқушы аккаунтымен жіберіледі.');
  }

  const { quiz } = await getLessonMiniQuiz({
    lessonId: input.lessonId,
    studentId: input.studentId,
    includeUnpublished: false,
  });

  if (!quiz) {
    throw new Error('Шағын тест табылмады немесе жарияланбаған.');
  }

  if (quiz.id !== input.quizId) {
    throw new Error('Шағын тест сабаққа сәйкес емес.');
  }

  if (quiz.courseId !== input.courseId) {
    throw new Error('Шағын тест courseId сәйкес емес.');
  }

  if (quiz.questions.length === 0) {
    throw new Error('Шағын тест ішінде сұрақ жоқ.');
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

  const payload: LessonMiniQuizAttemptInsert = {
    quiz_id: quiz.id,
    lesson_id: input.lessonId,
    course_id: input.courseId,
    student_id: input.studentId,
    score,
    correct_count: correctCount,
    total_questions: totalQuestions,
    passed,
    answers: toJson(normalizedAnswers),
  };

  const attemptRow = await queryOrThrow(
    supabase
      .from('lesson_mini_quiz_attempts')
      .insert(payload)
      .select('*')
      .single(),
  );

  return {
    attempt: mapLessonMiniQuizAttemptView(attemptRow),
    breakdown,
  };
}

/* ================= COURSE ACCESS CODES ================= */

export async function createCourseInvite(input: CreateCourseInvitePayload) {
  await assertCourseOwner(input.courseId);

  if (input.maxUses !== undefined && input.maxUses !== null) {
    if (!Number.isInteger(input.maxUses) || input.maxUses <= 0) {
      throw new Error(
        localizedText(
          'kk',
          'Шақыру кодының қолдану лимиті 1 немесе одан жоғары болуы керек.',
          'Лимит использования кода приглашения должен быть 1 или больше.',
        ),
      );
    }
  }

  const args: {
    p_course_id: string;
    p_max_uses?: number;
    p_expires_at?: string;
  } = {
    p_course_id: normalizeText(input.courseId),
  };

  if (input.maxUses !== undefined && input.maxUses !== null) {
    args.p_max_uses = input.maxUses;
  }

  const expiresAt = normalizeOptionalIsoDate(input.expiresAt);

  if (expiresAt) {
    args.p_expires_at = expiresAt;
  }

  return queryOrThrow(
    supabase.rpc('create_course_invite', args),
  ) as Promise<CourseInviteRow>;
}

export async function redeemCourseInvite(
  input: RedeemCourseInvitePayload | string,
) {
  const code = typeof input === 'string' ? input : input.code;
  const normalizedCode = normalizeInviteCode(code);

  return queryOrThrow(
    supabase.rpc('redeem_course_invite', {
      p_code: normalizedCode,
    }),
  ) as unknown as Promise<RedeemCourseInviteResponse>;
}

export async function getCourseInvites(courseId: string) {
  const normalizedCourseId = normalizeText(courseId);

  await assertCourseOwner(normalizedCourseId);

  return queryOrThrow(
    supabase
      .from('course_invites')
      .select('*')
      .eq('course_id', normalizedCourseId)
      .order('created_at', { ascending: false }),
  ) as Promise<CourseInviteRow[]>;
}

export async function setCourseInviteActive(input: {
  inviteId: string;
  isActive: boolean;
}) {
  const inviteId = normalizeText(input.inviteId);

  await assertCourseInviteOwner(inviteId);

  const patch: CourseInvitePatch = {
    is_active: input.isActive,
  };

  return queryOrThrow(
    supabase
      .from('course_invites')
      .update(patch)
      .eq('id', inviteId)
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
  const normalizedCourseId = normalizeText(courseId);

  assertNonEmptyId(normalizedCourseId, 'Course ID');

  return queryOrThrow(
    supabase.rpc('request_paid_course_access', {
      p_course_id: normalizedCourseId,
    }),
  ) as Promise<OrderRow>;
}

export async function manualGrantCourseAccess(
  input: ManualGrantCourseAccessPayload,
) {
  const courseId = normalizeText(input.courseId);
  const userId = normalizeText(input.userId);

  await assertCourseOwner(courseId);

  const args: {
    p_user_id: string;
    p_course_id: string;
    p_reason?: string;
  } = {
    p_user_id: userId,
    p_course_id: courseId,
  };

  const reason = normalizeNullableText(input.reason);

  if (reason) {
    args.p_reason = reason;
  }

  return queryOrThrow(
    supabase.rpc('manual_grant_course_access', args),
  ) as unknown as Promise<EntitlementRow | EntitlementDbRow>;
}

export async function manualApproveOrder(orderId: string) {
  const normalizedOrderId = normalizeText(orderId);

  assertNonEmptyId(normalizedOrderId, 'Order ID');

  return queryOrThrow(
    supabase.rpc('manual_approve_order', {
      p_order_id: normalizedOrderId,
    }),
  ) as unknown as Promise<ManualApproveOrderResponse>;
}

export async function getMyOrders() {
  return queryOrThrow(
    supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false }),
  ) as Promise<OrderRow[]>;
}

export async function getPendingOrdersForAdmin() {
  return queryOrThrow(
    supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ) as Promise<OrderRow[]>;
}

/* ================= DELETE ================= */

export async function deleteLesson(lessonId: string) {
  const normalizedLessonId = normalizeText(lessonId);

  await assertLessonOwner(normalizedLessonId);

  await execOrThrow(
    supabase.rpc('delete_lesson_deep', {
      p_lesson_id: normalizedLessonId,
    }),
  );
}

export async function deleteModule(moduleId: string) {
  const normalizedModuleId = normalizeText(moduleId);

  await assertModuleOwner(normalizedModuleId);

  await execOrThrow(
    supabase.rpc('delete_module_deep', {
      p_module_id: normalizedModuleId,
    }),
  );
}

export async function deleteCourse(courseId: string) {
  const normalizedCourseId = normalizeText(courseId);

  await assertCourseOwner(normalizedCourseId);

  await execOrThrow(
    supabase.rpc('delete_course_deep', {
      p_course_id: normalizedCourseId,
    }),
  );
}

/* ================= REORDER ================= */

export async function reorderModules(courseId: string, orderedModuleIds: string[]) {
  const normalizedCourseId = normalizeText(courseId);

  await assertCourseOwner(normalizedCourseId);

  const normalizedIds = assertOrderedIds(orderedModuleIds, 'Модульдер');

  if (normalizedIds.length === 0) {
    return;
  }

  await execOrThrow(
    supabase.rpc('reorder_modules', {
      p_course_id: normalizedCourseId,
      p_module_ids: normalizedIds,
    }),
  );
}

export async function reorderLessons(moduleId: string, orderedLessonIds: string[]) {
  const normalizedModuleId = normalizeText(moduleId);

  await assertModuleOwner(normalizedModuleId);

  const normalizedIds = assertOrderedIds(orderedLessonIds, 'Сабақтар');

  if (normalizedIds.length === 0) {
    return;
  }

  await execOrThrow(
    supabase.rpc('reorder_lessons', {
      p_module_id: normalizedModuleId,
      p_lesson_ids: normalizedIds,
    }),
  );
}