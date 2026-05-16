import { supabase } from '@/integrations/supabase/client';
import type {
  Json,
  Tables,
  TablesInsert,
} from '@/integrations/supabase/types';
import type {
  CourseAssetRow,
  CourseAssetView,
  CreateCourseAssetPayload,
  CreateCourseExternalAssetPayload,
  CreateExternalFileAssetPayload,
  CreateLessonAttachmentPayload,
  CreateLessonExternalAttachmentPayload,
  DeleteCourseAssetPayload,
  DeleteFileAssetPayload,
  DeleteLessonAttachmentPayload,
  DeleteLessonNotePayload,
  FileAssetRow,
  FileAssetView,
  LessonAttachmentRow,
  LessonAttachmentView,
  LessonLearningState,
  RemoveSavedLessonPayload,
  ReviewLaterItemRow,
  ReviewLaterItemView,
  SavedLessonView,
  StudentLessonBookmarkRow,
  StudentLessonNoteRow,
  ToggleLessonBookmarkPayload,
  ToggleReviewLaterPayload,
  UpsertLessonNotePayload,
} from '@/lib/app-data-types';
import { removeNullCharacters } from '@/lib/utils';

/* ================= TYPES ================= */

type SupabaseResponse<T> = {
  data: T | null;
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
};

type LessonLiteRow = Pick<
  Tables<'lessons'>,
  'id' | 'title' | 'module_id' | 'sort_order' | 'is_published'
>;

type ModuleLiteRow = Pick<
  Tables<'modules'>,
  'id' | 'title' | 'course_id' | 'sort_order'
>;

type CourseLiteRow = Pick<
  Tables<'courses'>,
  'id' | 'title' | 'subject_id' | 'status'
>;

type SubjectLiteRow = Pick<
  Tables<'subjects'>,
  'id' | 'name_kk' | 'name_ru'
>;

type LessonProgressLiteRow = Pick<
  Tables<'lesson_progress'>,
  'lesson_id' | 'is_completed' | 'completed_at'
>;

type FileAssetInsert = TablesInsert<'file_assets'>;
type StudentLessonNoteInsert = TablesInsert<'student_lesson_notes'>;
type StudentLessonBookmarkInsert = TablesInsert<'student_lesson_bookmarks'>;
type ReviewLaterItemInsert = TablesInsert<'review_later_items'>;
type LessonAttachmentInsert = TablesInsert<'lesson_attachments'>;
type CourseAssetInsert = TablesInsert<'course_assets'>;

type CurrentUserContext = {
  userId: string;
  isTeacher: boolean;
  isAdmin: boolean;
};

/* ================= SUPABASE HELPERS ================= */

async function unwrap<T>(request: PromiseLike<SupabaseResponse<T>>): Promise<T> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message || 'Supabase request failed');
  }

  if (data === null) {
    throw new Error('Supabase response data is empty.');
  }

  return data;
}

async function unwrapMaybe<T>(
  request: PromiseLike<SupabaseResponse<T>>,
): Promise<T | null> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message || 'Supabase request failed');
  }

  return data || null;
}

async function execute(request: PromiseLike<SupabaseResponse<unknown>>): Promise<void> {
  const { error } = await request;

  if (error) {
    throw new Error(error.message || 'Supabase request failed');
  }
}

/* ================= BASIC HELPERS ================= */

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function uniqueStrings(items: Array<string | null | undefined>): string[] {
  return unique(items.map((item) => normalizeText(item)).filter(Boolean));
}

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

function normalizeExternalUrl(value: string): string {
  const trimmed = normalizeText(value);

  if (!trimmed) {
    throw new Error('Файл сілтемесін енгізіңіз.');
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Файл сілтемесінің форматы дұрыс емес.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Файл сілтемесі http немесе https болуы керек.');
  }

  return parsed.toString();
}

function normalizeFilename(value: string, fallbackUrl?: string): string {
  const trimmed = normalizeText(value);

  if (trimmed) return trimmed;

  if (fallbackUrl) {
    try {
      const parsed = new URL(fallbackUrl);
      const lastPart = parsed.pathname.split('/').filter(Boolean).at(-1);

      if (lastPart) {
        return normalizeText(decodeURIComponent(lastPart)) || 'Қосымша материал';
      }
    } catch {
      // Fallback below.
    }
  }

  return 'Қосымша материал';
}

function normalizeSortOrder(value: number | undefined): number {
  if (value === undefined || value === null) return 1;

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Sort order 1 немесе одан жоғары бүтін сан болуы керек.');
  }

  return value;
}

function normalizeSizeBytes(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;

  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Файл көлемі 0 немесе одан жоғары болуы керек.');
  }

  return Math.round(value);
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toJson(value: unknown): Json {
  return value as Json;
}

function getSubjectName(subject?: SubjectLiteRow | null): string {
  if (!subject) return 'Пән көрсетілмеген';

  return subject.name_kk || subject.name_ru || 'Пән көрсетілмеген';
}

function assertNonEmptyId(value: string, label: string): void {
  if (!normalizeText(value)) {
    throw new Error(`${label} бос болмауы керек.`);
  }
}

/* ================= AUTH / OWNERSHIP HELPERS ================= */

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

async function assertCourseManager(courseId: string) {
  const normalizedCourseId = normalizeText(courseId);

  assertNonEmptyId(normalizedCourseId, 'Course ID');

  const context = await getCurrentUserContext();

  const course = await unwrapMaybe<{
    id: string;
    teacher_id: string | null;
  }>(
    supabase
      .from('courses')
      .select('id, teacher_id')
      .eq('id', normalizedCourseId)
      .maybeSingle(),
  );

  if (!course) {
    throw new Error('Курс табылмады.');
  }

  if (!context.isAdmin && course.teacher_id !== context.userId) {
    throw new Error('Бұл курстың материалдарын басқаруға рұқсатыңыз жоқ.');
  }

  return {
    ...context,
    courseId: course.id,
    teacherId: course.teacher_id,
  };
}

async function assertLessonBelongsToCourse(
  lessonId: string,
  courseId: string,
): Promise<string> {
  const actualCourseId = await getCourseIdForLesson(lessonId);
  const normalizedCourseId = normalizeText(courseId);

  if (actualCourseId !== normalizedCourseId) {
    throw new Error('Сабақ көрсетілген курсқа тиесілі емес.');
  }

  return actualCourseId;
}

async function assertLessonManager(lessonId: string, courseId?: string): Promise<string> {
  const normalizedLessonId = normalizeText(lessonId);

  assertNonEmptyId(normalizedLessonId, 'Lesson ID');

  const actualCourseId = courseId
    ? await assertLessonBelongsToCourse(normalizedLessonId, courseId)
    : await getCourseIdForLesson(normalizedLessonId);

  await assertCourseManager(actualCourseId);

  return actualCourseId;
}

async function assertFileAssetOwner(fileAssetId: string) {
  const normalizedFileAssetId = normalizeText(fileAssetId);

  assertNonEmptyId(normalizedFileAssetId, 'File asset ID');

  const context = await getCurrentUserContext();

  const file = await unwrapMaybe<{
    id: string;
    owner_id: string;
  }>(
    supabase
      .from('file_assets')
      .select('id, owner_id')
      .eq('id', normalizedFileAssetId)
      .maybeSingle(),
  );

  if (!file) {
    throw new Error('Файл табылмады.');
  }

  if (!context.isAdmin && file.owner_id !== context.userId) {
    throw new Error('Бұл файлды өшіруге рұқсатыңыз жоқ.');
  }

  return file;
}

/* ================= MAPPERS ================= */

function mapFileAsset(row: FileAssetRow): FileAssetView {
  return {
    id: row.id,
    ownerId: row.owner_id,
    visibility: row.visibility,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    externalUrl: row.external_url,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    metadata: normalizeMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLessonAttachment(
  row: LessonAttachmentRow,
  file: FileAssetRow,
): LessonAttachmentView {
  const fileView = mapFileAsset(file);

  return {
    id: row.id,
    lessonId: row.lesson_id,
    courseId: row.course_id,
    fileAssetId: row.file_asset_id,
    title: row.title || fileView.filename,
    description: row.description,
    sortOrder: row.sort_order,
    file: fileView,
    createdAt: row.created_at,
  };
}

function mapCourseAsset(row: CourseAssetRow, file: FileAssetRow): CourseAssetView {
  const fileView = mapFileAsset(file);

  return {
    id: row.id,
    courseId: row.course_id,
    fileAssetId: row.file_asset_id,
    title: row.title || fileView.filename,
    description: row.description,
    sortOrder: row.sort_order,
    file: fileView,
    createdAt: row.created_at,
  };
}

function mapReviewLaterItem(row: ReviewLaterItemRow): ReviewLaterItemView {
  return {
    id: row.id,
    itemType: row.item_type,
    itemId: row.item_id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    testQuestionId: row.test_question_id,
    title: row.title || 'Кейін қайталау',
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ================= DATA HELPERS ================= */

async function getCourseIdForLesson(lessonId: string): Promise<string> {
  const normalizedLessonId = normalizeText(lessonId);

  assertNonEmptyId(normalizedLessonId, 'Lesson ID');

  const courseId = await unwrap<string | null>(
    supabase.rpc('get_lesson_course_id', {
      p_lesson_id: normalizedLessonId,
    }),
  );

  if (!courseId) {
    throw new Error('Сабаққа тиесілі курс табылмады.');
  }

  return courseId;
}

async function getFileAssetsByIds(fileAssetIds: string[]): Promise<Map<string, FileAssetRow>> {
  const uniqueIds = uniqueStrings(fileAssetIds);

  if (uniqueIds.length === 0) {
    return new Map<string, FileAssetRow>();
  }

  const rows = await unwrap<FileAssetRow[]>(
    supabase
      .from('file_assets')
      .select('*')
      .in('id', uniqueIds),
  );

  return new Map(rows.map((row) => [row.id, row]));
}

async function getCompletedLessonIds(
  studentId: string,
  lessonIds: string[],
): Promise<Set<string>> {
  const normalizedStudentId = normalizeText(studentId);
  const uniqueLessonIds = uniqueStrings(lessonIds);

  if (!normalizedStudentId || uniqueLessonIds.length === 0) {
    return new Set<string>();
  }

  const rows = await unwrap<LessonProgressLiteRow[]>(
    supabase
      .from('lesson_progress')
      .select('lesson_id, is_completed, completed_at')
      .eq('student_id', normalizedStudentId)
      .in('lesson_id', uniqueLessonIds),
  );

  return new Set(
    rows
      .filter((row) => row.is_completed === true || Boolean(row.completed_at))
      .map((row) => row.lesson_id),
  );
}

async function getExistingReviewLaterItem(input: {
  studentId: string;
  lessonId?: string | null;
  testQuestionId?: string | null;
  itemId?: string | null;
  itemType?: ReviewLaterItemRow['item_type'] | null;
}): Promise<ReviewLaterItemRow | null> {
  const studentId = normalizeText(input.studentId);
  const lessonId = normalizeNullableText(input.lessonId);
  const testQuestionId = normalizeNullableText(input.testQuestionId);
  const itemId = normalizeNullableText(input.itemId);

  assertNonEmptyId(studentId, 'Student ID');

  let query = supabase
    .from('review_later_items')
    .select('*')
    .eq('student_id', studentId);

  if (lessonId) {
    query = query.eq('lesson_id', lessonId);
  } else if (testQuestionId) {
    query = query.eq('test_question_id', testQuestionId);
  } else if (itemId && input.itemType) {
    query = query
      .eq('item_type', input.itemType)
      .eq('item_id', itemId);
  } else {
    return null;
  }

  return unwrapMaybe<ReviewLaterItemRow>(query.maybeSingle());
}

async function deleteFileAssetIfUnused(fileAssetId: string): Promise<void> {
  const normalizedFileAssetId = normalizeText(fileAssetId);

  if (!normalizedFileAssetId) return;

  const [lessonRefs, courseRefs] = await Promise.all([
    unwrap<Array<{ id: string }>>(
      supabase
        .from('lesson_attachments')
        .select('id')
        .eq('file_asset_id', normalizedFileAssetId)
        .limit(1),
    ),
    unwrap<Array<{ id: string }>>(
      supabase
        .from('course_assets')
        .select('id')
        .eq('file_asset_id', normalizedFileAssetId)
        .limit(1),
    ),
  ]);

  if (lessonRefs.length > 0 || courseRefs.length > 0) {
    return;
  }

  await execute(
    supabase
      .from('file_assets')
      .delete()
      .eq('id', normalizedFileAssetId),
  );
}

/* ================= LESSON LEARNING STATE ================= */

export async function getLessonLearningState(input: {
  studentId: string;
  lessonId: string;
}): Promise<LessonLearningState> {
  const studentId = normalizeText(input.studentId);
  const lessonId = normalizeText(input.lessonId);

  assertNonEmptyId(studentId, 'Student ID');
  assertNonEmptyId(lessonId, 'Lesson ID');

  const courseId = await getCourseIdForLesson(lessonId);

  const [note, bookmark, reviewLaterItem, attachments, courseAssets] =
    await Promise.all([
      unwrapMaybe<StudentLessonNoteRow>(
        supabase
          .from('student_lesson_notes')
          .select('*')
          .eq('student_id', studentId)
          .eq('lesson_id', lessonId)
          .maybeSingle(),
      ),
      unwrapMaybe<StudentLessonBookmarkRow>(
        supabase
          .from('student_lesson_bookmarks')
          .select('*')
          .eq('student_id', studentId)
          .eq('lesson_id', lessonId)
          .maybeSingle(),
      ),
      unwrapMaybe<ReviewLaterItemRow>(
        supabase
          .from('review_later_items')
          .select('*')
          .eq('student_id', studentId)
          .eq('lesson_id', lessonId)
          .maybeSingle(),
      ),
      getLessonAttachments(lessonId),
      getCourseAssets(courseId),
    ]);

  return {
    lessonId,
    courseId,
    studentId,

    note,
    noteContent: note?.content || '',

    bookmarked: Boolean(bookmark),
    bookmarkId: bookmark?.id || null,

    reviewLater: Boolean(reviewLaterItem),
    reviewLaterItemId: reviewLaterItem?.id || null,

    attachments,
    courseAssets,
  };
}

/* ================= NOTES ================= */

export async function upsertLessonNote(
  input: UpsertLessonNotePayload,
): Promise<StudentLessonNoteRow> {
  const studentId = normalizeText(input.studentId);
  const lessonId = normalizeText(input.lessonId);
  const courseId = normalizeText(input.courseId);

  assertNonEmptyId(studentId, 'Student ID');
  assertNonEmptyId(lessonId, 'Lesson ID');
  assertNonEmptyId(courseId, 'Course ID');

  const payload: StudentLessonNoteInsert = {
    student_id: studentId,
    lesson_id: lessonId,
    course_id: courseId,
    content: normalizeMultilineText(input.content),
  };

  return unwrap<StudentLessonNoteRow>(
    supabase
      .from('student_lesson_notes')
      .upsert(payload, {
        onConflict: 'student_id,lesson_id',
      })
      .select('*')
      .single(),
  );
}

export async function deleteLessonNote(input: DeleteLessonNotePayload): Promise<void> {
  const studentId = normalizeText(input.studentId);
  const lessonId = normalizeText(input.lessonId);

  assertNonEmptyId(studentId, 'Student ID');
  assertNonEmptyId(lessonId, 'Lesson ID');

  await execute(
    supabase
      .from('student_lesson_notes')
      .delete()
      .eq('student_id', studentId)
      .eq('lesson_id', lessonId),
  );
}

/* ================= LESSON BOOKMARKS ================= */

export async function toggleLessonBookmark(
  input: ToggleLessonBookmarkPayload,
): Promise<StudentLessonBookmarkRow | null> {
  const studentId = normalizeText(input.studentId);
  const lessonId = normalizeText(input.lessonId);
  const courseId = normalizeText(input.courseId);

  assertNonEmptyId(studentId, 'Student ID');
  assertNonEmptyId(lessonId, 'Lesson ID');
  assertNonEmptyId(courseId, 'Course ID');

  if (input.bookmarked) {
    const payload: StudentLessonBookmarkInsert = {
      student_id: studentId,
      lesson_id: lessonId,
      course_id: courseId,
    };

    return unwrap<StudentLessonBookmarkRow>(
      supabase
        .from('student_lesson_bookmarks')
        .upsert(payload, {
          onConflict: 'student_id,lesson_id',
        })
        .select('*')
        .single(),
    );
  }

  await execute(
    supabase
      .from('student_lesson_bookmarks')
      .delete()
      .eq('student_id', studentId)
      .eq('lesson_id', lessonId),
  );

  return null;
}

export async function getSavedLessons(studentId: string): Promise<SavedLessonView[]> {
  const normalizedStudentId = normalizeText(studentId);

  if (!normalizedStudentId) return [];

  const bookmarks = await unwrap<StudentLessonBookmarkRow[]>(
    supabase
      .from('student_lesson_bookmarks')
      .select('*')
      .eq('student_id', normalizedStudentId)
      .order('created_at', { ascending: false }),
  );

  if (bookmarks.length === 0) return [];

  const lessonIds = uniqueStrings(bookmarks.map((bookmark) => bookmark.lesson_id));

  const lessons = await unwrap<LessonLiteRow[]>(
    supabase
      .from('lessons')
      .select('id, title, module_id, sort_order, is_published')
      .in('id', lessonIds),
  );

  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const moduleIds = uniqueStrings(lessons.map((lesson) => lesson.module_id));

  const modules = moduleIds.length
    ? await unwrap<ModuleLiteRow[]>(
        supabase
          .from('modules')
          .select('id, title, course_id, sort_order')
          .in('id', moduleIds),
      )
    : [];

  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const courseIds = uniqueStrings([
    ...bookmarks.map((bookmark) => bookmark.course_id),
    ...modules.map((module) => module.course_id),
  ]);

  const courses = courseIds.length
    ? await unwrap<CourseLiteRow[]>(
        supabase
          .from('courses')
          .select('id, title, subject_id, status')
          .in('id', courseIds),
      )
    : [];

  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const subjectIds = uniqueStrings(courses.map((course) => course.subject_id));

  const subjects = subjectIds.length
    ? await unwrap<SubjectLiteRow[]>(
        supabase
          .from('subjects')
          .select('id, name_kk, name_ru')
          .in('id', subjectIds),
      )
    : [];

  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const completedLessonIds = await getCompletedLessonIds(normalizedStudentId, lessonIds);

  return bookmarks
    .map((bookmark) => {
      const lesson = lessonsById.get(bookmark.lesson_id);
      if (!lesson) return null;

      const module = modulesById.get(lesson.module_id);
      const course = coursesById.get(bookmark.course_id || module?.course_id || '');

      if (!module || !course) return null;

      const subject = course.subject_id ? subjectsById.get(course.subject_id) : null;

      return {
        bookmarkId: bookmark.id,
        lessonId: lesson.id,
        courseId: course.id,
        moduleId: module.id,

        lessonTitle: lesson.title || 'Сабақ',
        moduleTitle: module.title || 'Модуль',
        courseTitle: course.title || 'Курс',
        subjectName: getSubjectName(subject),

        sortOrder: Number(lesson.sort_order || 0),
        isCompleted: completedLessonIds.has(lesson.id),
        isLocked: false,

        createdAt: bookmark.created_at,
      };
    })
    .filter((item): item is SavedLessonView => item !== null);
}

export async function removeSavedLesson(input: RemoveSavedLessonPayload): Promise<void> {
  const studentId = normalizeText(input.studentId);
  const lessonId = normalizeText(input.lessonId);

  assertNonEmptyId(studentId, 'Student ID');
  assertNonEmptyId(lessonId, 'Lesson ID');

  await execute(
    supabase
      .from('student_lesson_bookmarks')
      .delete()
      .eq('student_id', studentId)
      .eq('lesson_id', lessonId),
  );
}

/* ================= REVIEW LATER ================= */

export async function toggleReviewLater(
  input: ToggleReviewLaterPayload,
): Promise<ReviewLaterItemRow | null> {
  const studentId = normalizeText(input.studentId);
  const lessonId = normalizeNullableText(input.lessonId);
  const testQuestionId = normalizeNullableText(input.testQuestionId);
  const itemType = input.itemType;

  assertNonEmptyId(studentId, 'Student ID');

  const courseId =
    normalizeNullableText(input.courseId) ||
    (lessonId ? await getCourseIdForLesson(lessonId) : null);

  const itemId =
    normalizeNullableText(input.itemId) ||
    lessonId ||
    testQuestionId ||
    null;

  const existing = await getExistingReviewLaterItem({
    studentId,
    lessonId,
    testQuestionId,
    itemId,
    itemType,
  });

  if (!input.reviewLater) {
    if (!existing) return null;

    await execute(
      supabase
        .from('review_later_items')
        .delete()
        .eq('id', existing.id),
    );

    return null;
  }

  const payload: ReviewLaterItemInsert = {
    student_id: studentId,
    item_type: itemType,
    item_id: itemId,
    course_id: courseId,
    lesson_id: lessonId,
    test_question_id: testQuestionId,
    title: normalizeNullableText(input.title),
    note: normalizeNullableMultilineText(input.note),
  };

  if (existing) {
    return unwrap<ReviewLaterItemRow>(
      supabase
        .from('review_later_items')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single(),
    );
  }

  return unwrap<ReviewLaterItemRow>(
    supabase
      .from('review_later_items')
      .insert(payload)
      .select('*')
      .single(),
  );
}

export async function getReviewLaterItems(studentId: string): Promise<ReviewLaterItemView[]> {
  const normalizedStudentId = normalizeText(studentId);

  if (!normalizedStudentId) return [];

  const rows = await unwrap<ReviewLaterItemRow[]>(
    supabase
      .from('review_later_items')
      .select('*')
      .eq('student_id', normalizedStudentId)
      .order('created_at', { ascending: false }),
  );

  return rows.map(mapReviewLaterItem);
}

/* ================= FILE ASSETS ================= */

export async function createExternalFileAsset(
  input: CreateExternalFileAssetPayload,
): Promise<FileAssetRow> {
  const ownerId = normalizeText(input.ownerId);

  assertNonEmptyId(ownerId, 'Owner ID');

  const externalUrl = normalizeExternalUrl(input.externalUrl);
  const filename = normalizeFilename(input.filename, externalUrl);
  const sizeBytes = normalizeSizeBytes(input.sizeBytes);

  const payload: FileAssetInsert = {
    owner_id: ownerId,
    visibility: input.visibility || 'course',
    storage_bucket: null,
    storage_path: null,
    external_url: externalUrl,
    filename,
    mime_type: normalizeNullableText(input.mimeType),
    size_bytes: sizeBytes,
    metadata: toJson(input.metadata || {}),
  };

  return unwrap<FileAssetRow>(
    supabase
      .from('file_assets')
      .insert(payload)
      .select('*')
      .single(),
  );
}

export async function deleteFileAsset(input: DeleteFileAssetPayload | string): Promise<void> {
  const fileAssetId = normalizeText(
    typeof input === 'string' ? input : input.fileAssetId,
  );

  await assertFileAssetOwner(fileAssetId);

  await execute(
    supabase
      .from('file_assets')
      .delete()
      .eq('id', fileAssetId),
  );
}

/* ================= LESSON ATTACHMENTS ================= */

export async function getLessonAttachments(
  lessonId: string,
): Promise<LessonAttachmentView[]> {
  const normalizedLessonId = normalizeText(lessonId);

  if (!normalizedLessonId) return [];

  const rows = await unwrap<LessonAttachmentRow[]>(
    supabase
      .from('lesson_attachments')
      .select('*')
      .eq('lesson_id', normalizedLessonId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  );

  const filesById = await getFileAssetsByIds(rows.map((row) => row.file_asset_id));

  return rows
    .map((row) => {
      const file = filesById.get(row.file_asset_id);

      return file ? mapLessonAttachment(row, file) : null;
    })
    .filter((item): item is LessonAttachmentView => item !== null);
}

export async function createLessonAttachment(
  input: CreateLessonAttachmentPayload,
): Promise<LessonAttachmentView> {
  const lessonId = normalizeText(input.lessonId);
  const courseId = normalizeText(input.courseId);
  const fileAssetId = normalizeText(input.fileAssetId);
  const createdBy = normalizeText(input.createdBy);

  assertNonEmptyId(lessonId, 'Lesson ID');
  assertNonEmptyId(courseId, 'Course ID');
  assertNonEmptyId(fileAssetId, 'File asset ID');
  assertNonEmptyId(createdBy, 'Created by');

  await assertLessonManager(lessonId, courseId);

  const payload: LessonAttachmentInsert = {
    lesson_id: lessonId,
    course_id: courseId,
    file_asset_id: fileAssetId,
    created_by: createdBy,
    title: normalizeNullableText(input.title),
    description: normalizeNullableMultilineText(input.description),
    sort_order: normalizeSortOrder(input.sortOrder),
  };

  const row = await unwrap<LessonAttachmentRow>(
    supabase
      .from('lesson_attachments')
      .insert(payload)
      .select('*')
      .single(),
  );

  const filesById = await getFileAssetsByIds([row.file_asset_id]);
  const file = filesById.get(row.file_asset_id);

  if (!file) {
    throw new Error('Файл табылмады.');
  }

  return mapLessonAttachment(row, file);
}

export async function createLessonExternalAttachment(
  input: CreateLessonExternalAttachmentPayload,
): Promise<LessonAttachmentView> {
  const ownerId = normalizeText(input.ownerId);
  const lessonId = normalizeText(input.lessonId);
  const courseId = normalizeText(input.courseId);

  assertNonEmptyId(ownerId, 'Owner ID');
  assertNonEmptyId(lessonId, 'Lesson ID');
  assertNonEmptyId(courseId, 'Course ID');

  await assertLessonManager(lessonId, courseId);

  const fileAsset = await createExternalFileAsset({
    ownerId,
    filename: input.filename || input.title || 'Сабақ материалы',
    externalUrl: input.externalUrl,
    mimeType: input.mimeType || null,
    sizeBytes: input.sizeBytes ?? null,
    visibility: 'course',
    metadata: {
      source: 'lesson_attachment',
      lesson_id: lessonId,
      course_id: courseId,
    },
  });

  try {
    return await createLessonAttachment({
      lessonId,
      courseId,
      fileAssetId: fileAsset.id,
      createdBy: ownerId,
      title: input.title || fileAsset.filename,
      description: input.description || null,
      sortOrder: input.sortOrder || 1,
    });
  } catch (error) {
    await deleteFileAsset(fileAsset.id).catch(() => undefined);
    throw error;
  }
}

export async function deleteLessonAttachment(
  input: DeleteLessonAttachmentPayload | string,
): Promise<void> {
  const attachmentId = normalizeText(
    typeof input === 'string' ? input : input.attachmentId,
  );

  assertNonEmptyId(attachmentId, 'Attachment ID');

  const row = await unwrapMaybe<LessonAttachmentRow>(
    supabase
      .from('lesson_attachments')
      .select('*')
      .eq('id', attachmentId)
      .maybeSingle(),
  );

  if (!row) {
    throw new Error('Сабақ материалы табылмады.');
  }

  await assertLessonManager(row.lesson_id, row.course_id);

  await execute(
    supabase
      .from('lesson_attachments')
      .delete()
      .eq('id', attachmentId),
  );

  await deleteFileAssetIfUnused(row.file_asset_id);
}

/* ================= COURSE ASSETS ================= */

export async function getCourseAssets(courseId: string): Promise<CourseAssetView[]> {
  const normalizedCourseId = normalizeText(courseId);

  if (!normalizedCourseId) return [];

  const rows = await unwrap<CourseAssetRow[]>(
    supabase
      .from('course_assets')
      .select('*')
      .eq('course_id', normalizedCourseId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  );

  const filesById = await getFileAssetsByIds(rows.map((row) => row.file_asset_id));

  return rows
    .map((row) => {
      const file = filesById.get(row.file_asset_id);

      return file ? mapCourseAsset(row, file) : null;
    })
    .filter((item): item is CourseAssetView => item !== null);
}

export async function createCourseAsset(
  input: CreateCourseAssetPayload,
): Promise<CourseAssetView> {
  const courseId = normalizeText(input.courseId);
  const fileAssetId = normalizeText(input.fileAssetId);
  const createdBy = normalizeText(input.createdBy);

  assertNonEmptyId(courseId, 'Course ID');
  assertNonEmptyId(fileAssetId, 'File asset ID');
  assertNonEmptyId(createdBy, 'Created by');

  await assertCourseManager(courseId);

  const payload: CourseAssetInsert = {
    course_id: courseId,
    file_asset_id: fileAssetId,
    created_by: createdBy,
    title: normalizeNullableText(input.title),
    description: normalizeNullableMultilineText(input.description),
    sort_order: normalizeSortOrder(input.sortOrder),
  };

  const row = await unwrap<CourseAssetRow>(
    supabase
      .from('course_assets')
      .insert(payload)
      .select('*')
      .single(),
  );

  const filesById = await getFileAssetsByIds([row.file_asset_id]);
  const file = filesById.get(row.file_asset_id);

  if (!file) {
    throw new Error('Файл табылмады.');
  }

  return mapCourseAsset(row, file);
}

export async function createCourseExternalAsset(
  input: CreateCourseExternalAssetPayload,
): Promise<CourseAssetView> {
  const ownerId = normalizeText(input.ownerId);
  const courseId = normalizeText(input.courseId);

  assertNonEmptyId(ownerId, 'Owner ID');
  assertNonEmptyId(courseId, 'Course ID');

  await assertCourseManager(courseId);

  const fileAsset = await createExternalFileAsset({
    ownerId,
    filename: input.filename || input.title || 'Курс материалы',
    externalUrl: input.externalUrl,
    mimeType: input.mimeType || null,
    sizeBytes: input.sizeBytes ?? null,
    visibility: 'course',
    metadata: {
      source: 'course_asset',
      course_id: courseId,
    },
  });

  try {
    return await createCourseAsset({
      courseId,
      fileAssetId: fileAsset.id,
      createdBy: ownerId,
      title: input.title || fileAsset.filename,
      description: input.description || null,
      sortOrder: input.sortOrder || 1,
    });
  } catch (error) {
    await deleteFileAsset(fileAsset.id).catch(() => undefined);
    throw error;
  }
}

export async function deleteCourseAsset(
  input: DeleteCourseAssetPayload | string,
): Promise<void> {
  const assetId = normalizeText(typeof input === 'string' ? input : input.assetId);

  assertNonEmptyId(assetId, 'Course asset ID');

  const row = await unwrapMaybe<CourseAssetRow>(
    supabase
      .from('course_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle(),
  );

  if (!row) {
    throw new Error('Курс материалы табылмады.');
  }

  await assertCourseManager(row.course_id);

  await execute(
    supabase
      .from('course_assets')
      .delete()
      .eq('id', assetId),
  );

  await deleteFileAssetIfUnused(row.file_asset_id);
}