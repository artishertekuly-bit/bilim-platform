import { supabase } from '@/integrations/supabase/client';
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
  ReviewLaterItemRow,
  ReviewLaterItemView,
  StudentLessonBookmarkRow,
  StudentLessonNoteRow,
  ToggleLessonBookmarkPayload,
  ToggleReviewLaterPayload,
  UpsertLessonNotePayload,
} from '@/lib/app-data-types';

type SupabaseResponse<T> = {
  data: T | null;
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null;
};

async function unwrap<T>(request: PromiseLike<SupabaseResponse<T>>): Promise<T> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message || 'Supabase request failed');
  }

  return data as T;
}

async function unwrapMaybe<T>(request: PromiseLike<SupabaseResponse<T>>): Promise<T | null> {
  const { data, error } = await request;

  if (error) {
    throw new Error(error.message || 'Supabase request failed');
  }

  return data || null;
}

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();

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

function normalizeFilename(value: string, fallbackUrl?: string) {
  const trimmed = value.trim();

  if (trimmed) return trimmed;

  if (fallbackUrl) {
    try {
      const parsed = new URL(fallbackUrl);
      const lastPart = parsed.pathname.split('/').filter(Boolean).at(-1);

      if (lastPart) {
        return decodeURIComponent(lastPart);
      }
    } catch {
      // Ignore and use fallback below.
    }
  }

  return 'Қосымша материал';
}

function assertPositiveSortOrder(value: number | undefined) {
  if (value === undefined) return;

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Sort order 1 немесе одан жоғары бүтін сан болуы керек.');
  }
}

function normalizeSizeBytes(value: number | null | undefined) {
  if (value === undefined || value === null) return null;

  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Файл көлемі 0 немесе одан жоғары болуы керек.');
  }

  return Math.round(value);
}

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
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLessonAttachment(
  row: LessonAttachmentRow,
  file: FileAssetRow
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

async function getCourseIdForLesson(lessonId: string) {
  const db = supabase as any;

  const courseId = await unwrap<string>(
    db.rpc('get_lesson_course_id', {
      p_lesson_id: lessonId,
    })
  );

  if (!courseId) {
    throw new Error('Сабаққа тиесілі курс табылмады.');
  }

  return courseId;
}

async function getFileAssetsByIds(fileAssetIds: string[]) {
  const uniqueIds = [...new Set(fileAssetIds)].filter(Boolean);

  if (uniqueIds.length === 0) {
    return new Map<string, FileAssetRow>();
  }

  const db = supabase as any;

  const rows = await unwrap<FileAssetRow[]>(
    db
      .from('file_assets')
      .select('*')
      .in('id', uniqueIds)
  );

  return new Map((rows || []).map((row) => [row.id, row]));
}

async function getExistingReviewLaterItem(input: {
  studentId: string;
  lessonId?: string | null;
  testQuestionId?: string | null;
  itemId?: string | null;
  itemType?: string | null;
}) {
  const db = supabase as any;

  let query = db
    .from('review_later_items')
    .select('*')
    .eq('student_id', input.studentId);

  if (input.lessonId) {
    query = query.eq('lesson_id', input.lessonId);
  } else if (input.testQuestionId) {
    query = query.eq('test_question_id', input.testQuestionId);
  } else if (input.itemId && input.itemType) {
    query = query
      .eq('item_type', input.itemType)
      .eq('item_id', input.itemId);
  } else {
    return null;
  }

  return unwrapMaybe<ReviewLaterItemRow>(query.maybeSingle());
}

/* ================= LESSON LEARNING STATE ================= */

export async function getLessonLearningState(input: {
  studentId: string;
  lessonId: string;
}): Promise<LessonLearningState> {
  const { studentId, lessonId } = input;
  const db = supabase as any;

  const courseId = await getCourseIdForLesson(lessonId);

  const [note, bookmark, reviewLaterItem, attachments, courseAssets] = await Promise.all([
    unwrapMaybe<StudentLessonNoteRow>(
      db
        .from('student_lesson_notes')
        .select('*')
        .eq('student_id', studentId)
        .eq('lesson_id', lessonId)
        .maybeSingle()
    ),
    unwrapMaybe<StudentLessonBookmarkRow>(
      db
        .from('student_lesson_bookmarks')
        .select('*')
        .eq('student_id', studentId)
        .eq('lesson_id', lessonId)
        .maybeSingle()
    ),
    unwrapMaybe<ReviewLaterItemRow>(
      db
        .from('review_later_items')
        .select('*')
        .eq('student_id', studentId)
        .eq('lesson_id', lessonId)
        .maybeSingle()
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
  input: UpsertLessonNotePayload
): Promise<StudentLessonNoteRow> {
  const db = supabase as any;

  return unwrap<StudentLessonNoteRow>(
    db
      .from('student_lesson_notes')
      .upsert(
        {
          student_id: input.studentId,
          lesson_id: input.lessonId,
          course_id: input.courseId,
          content: input.content,
        },
        {
          onConflict: 'student_id,lesson_id',
        }
      )
      .select('*')
      .single()
  );
}

export async function deleteLessonNote(input: DeleteLessonNotePayload) {
  const db = supabase as any;

  await unwrap<unknown>(
    db
      .from('student_lesson_notes')
      .delete()
      .eq('student_id', input.studentId)
      .eq('lesson_id', input.lessonId)
  );
}

/* ================= LESSON BOOKMARKS ================= */

export async function toggleLessonBookmark(
  input: ToggleLessonBookmarkPayload
): Promise<StudentLessonBookmarkRow | null> {
  const db = supabase as any;

  if (input.bookmarked) {
    return unwrap<StudentLessonBookmarkRow>(
      db
        .from('student_lesson_bookmarks')
        .upsert(
          {
            student_id: input.studentId,
            lesson_id: input.lessonId,
            course_id: input.courseId,
          },
          {
            onConflict: 'student_id,lesson_id',
          }
        )
        .select('*')
        .single()
    );
  }

  await unwrap<unknown>(
    db
      .from('student_lesson_bookmarks')
      .delete()
      .eq('student_id', input.studentId)
      .eq('lesson_id', input.lessonId)
  );

  return null;
}

/* ================= REVIEW LATER ================= */

export async function toggleReviewLater(
  input: ToggleReviewLaterPayload
): Promise<ReviewLaterItemRow | null> {
  const db = supabase as any;

  const courseId =
    input.courseId ||
    (input.lessonId ? await getCourseIdForLesson(input.lessonId) : null);

  const itemId =
    input.itemId ||
    input.lessonId ||
    input.testQuestionId ||
    null;

  const existing = await getExistingReviewLaterItem({
    studentId: input.studentId,
    lessonId: input.lessonId,
    testQuestionId: input.testQuestionId,
    itemId,
    itemType: input.itemType,
  });

  if (!input.reviewLater) {
    if (!existing) return null;

    await unwrap<unknown>(
      db
        .from('review_later_items')
        .delete()
        .eq('id', existing.id)
    );

    return null;
  }

  const payload = {
    student_id: input.studentId,
    item_type: input.itemType,
    item_id: itemId,
    course_id: courseId,
    lesson_id: input.lessonId || null,
    test_question_id: input.testQuestionId || null,
    title: input.title || null,
    note: input.note || null,
  };

  if (existing) {
    return unwrap<ReviewLaterItemRow>(
      db
        .from('review_later_items')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single()
    );
  }

  return unwrap<ReviewLaterItemRow>(
    db
      .from('review_later_items')
      .insert(payload)
      .select('*')
      .single()
  );
}

export async function getReviewLaterItems(studentId: string): Promise<ReviewLaterItemView[]> {
  const db = supabase as any;

  const rows = await unwrap<ReviewLaterItemRow[]>(
    db
      .from('review_later_items')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
  );

  return (rows || []).map(mapReviewLaterItem);
}

/* ================= FILE ASSETS ================= */

export async function createExternalFileAsset(
  input: CreateExternalFileAssetPayload
): Promise<FileAssetRow> {
  const db = supabase as any;
  const externalUrl = normalizeExternalUrl(input.externalUrl);
  const filename = normalizeFilename(input.filename, externalUrl);
  const sizeBytes = normalizeSizeBytes(input.sizeBytes);

  return unwrap<FileAssetRow>(
    db
      .from('file_assets')
      .insert({
        owner_id: input.ownerId,
        visibility: input.visibility || 'course',
        external_url: externalUrl,
        filename,
        mime_type: input.mimeType || null,
        size_bytes: sizeBytes,
        metadata: input.metadata || {},
      })
      .select('*')
      .single()
  );
}

export async function deleteFileAsset(input: DeleteFileAssetPayload | string) {
  const fileAssetId = typeof input === 'string' ? input : input.fileAssetId;
  const db = supabase as any;

  await unwrap<unknown>(
    db
      .from('file_assets')
      .delete()
      .eq('id', fileAssetId)
  );
}

/* ================= LESSON ATTACHMENTS ================= */

export async function getLessonAttachments(lessonId: string): Promise<LessonAttachmentView[]> {
  const db = supabase as any;

  const rows = await unwrap<LessonAttachmentRow[]>(
    db
      .from('lesson_attachments')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
  );

  const filesById = await getFileAssetsByIds((rows || []).map((row) => row.file_asset_id));

  return (rows || [])
    .map((row) => {
      const file = filesById.get(row.file_asset_id);
      return file ? mapLessonAttachment(row, file) : null;
    })
    .filter((item): item is LessonAttachmentView => item !== null);
}

export async function createLessonAttachment(
  input: CreateLessonAttachmentPayload
): Promise<LessonAttachmentView> {
  const db = supabase as any;

  assertPositiveSortOrder(input.sortOrder);

  const row = await unwrap<LessonAttachmentRow>(
    db
      .from('lesson_attachments')
      .insert({
        lesson_id: input.lessonId,
        course_id: input.courseId,
        file_asset_id: input.fileAssetId,
        created_by: input.createdBy,
        title: input.title || null,
        description: input.description || null,
        sort_order: input.sortOrder || 1,
      })
      .select('*')
      .single()
  );

  const filesById = await getFileAssetsByIds([row.file_asset_id]);
  const file = filesById.get(row.file_asset_id);

  if (!file) {
    throw new Error('Файл табылмады.');
  }

  return mapLessonAttachment(row, file);
}

export async function createLessonExternalAttachment(
  input: CreateLessonExternalAttachmentPayload
): Promise<LessonAttachmentView> {
  const fileAsset = await createExternalFileAsset({
    ownerId: input.ownerId,
    filename: input.filename || input.title || 'Сабақ материалы',
    externalUrl: input.externalUrl,
    mimeType: input.mimeType || null,
    sizeBytes: input.sizeBytes ?? null,
    visibility: 'course',
    metadata: {
      source: 'lesson_attachment',
      lesson_id: input.lessonId,
      course_id: input.courseId,
    },
  });

  return createLessonAttachment({
    lessonId: input.lessonId,
    courseId: input.courseId,
    fileAssetId: fileAsset.id,
    createdBy: input.ownerId,
    title: input.title || fileAsset.filename,
    description: input.description || null,
    sortOrder: input.sortOrder || 1,
  });
}

export async function deleteLessonAttachment(
  input: DeleteLessonAttachmentPayload | string
) {
  const attachmentId = typeof input === 'string' ? input : input.attachmentId;
  const db = supabase as any;

  await unwrap<unknown>(
    db
      .from('lesson_attachments')
      .delete()
      .eq('id', attachmentId)
  );
}

/* ================= COURSE ASSETS ================= */

export async function getCourseAssets(courseId: string): Promise<CourseAssetView[]> {
  const db = supabase as any;

  const rows = await unwrap<CourseAssetRow[]>(
    db
      .from('course_assets')
      .select('*')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
  );

  const filesById = await getFileAssetsByIds((rows || []).map((row) => row.file_asset_id));

  return (rows || [])
    .map((row) => {
      const file = filesById.get(row.file_asset_id);
      return file ? mapCourseAsset(row, file) : null;
    })
    .filter((item): item is CourseAssetView => item !== null);
}

export async function createCourseAsset(
  input: CreateCourseAssetPayload
): Promise<CourseAssetView> {
  const db = supabase as any;

  assertPositiveSortOrder(input.sortOrder);

  const row = await unwrap<CourseAssetRow>(
    db
      .from('course_assets')
      .insert({
        course_id: input.courseId,
        file_asset_id: input.fileAssetId,
        created_by: input.createdBy,
        title: input.title || null,
        description: input.description || null,
        sort_order: input.sortOrder || 1,
      })
      .select('*')
      .single()
  );

  const filesById = await getFileAssetsByIds([row.file_asset_id]);
  const file = filesById.get(row.file_asset_id);

  if (!file) {
    throw new Error('Файл табылмады.');
  }

  return mapCourseAsset(row, file);
}

export async function createCourseExternalAsset(
  input: CreateCourseExternalAssetPayload
): Promise<CourseAssetView> {
  const fileAsset = await createExternalFileAsset({
    ownerId: input.ownerId,
    filename: input.filename || input.title || 'Курс материалы',
    externalUrl: input.externalUrl,
    mimeType: input.mimeType || null,
    sizeBytes: input.sizeBytes ?? null,
    visibility: 'course',
    metadata: {
      source: 'course_asset',
      course_id: input.courseId,
    },
  });

  return createCourseAsset({
    courseId: input.courseId,
    fileAssetId: fileAsset.id,
    createdBy: input.ownerId,
    title: input.title || fileAsset.filename,
    description: input.description || null,
    sortOrder: input.sortOrder || 1,
  });
}

export async function deleteCourseAsset(input: DeleteCourseAssetPayload | string) {
  const assetId = typeof input === 'string' ? input : input.assetId;
  const db = supabase as any;

  await unwrap<unknown>(
    db
      .from('course_assets')
      .delete()
      .eq('id', assetId)
  );
}