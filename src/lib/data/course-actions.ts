import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { deleteContentReviewsSafe, localizedText, queryOrThrow } from './common';

/* ================= UPDATE ================= */

export async function updateCourse(input: {
  courseId: string;
  title?: string;
  description?: string | null;
  subjectId?: string | null;
  thumbnailUrl?: string | null;
  status?: Tables<'courses'>['status'];
}) {
  const patch: Partial<Tables<'courses'>> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.subjectId !== undefined) patch.subject_id = input.subjectId;
  if (input.thumbnailUrl !== undefined) patch.thumbnail_url = input.thumbnailUrl;
  if (input.status !== undefined) patch.status = input.status;

  const { error } = await supabase.from('courses').update(patch).eq('id', input.courseId);
  if (error) throw new Error(error.message);
}

export async function updateModule(input: {
  moduleId: string;
  title?: string;
  sortOrder?: number;
}) {
  const patch: Partial<Tables<'modules'>> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { error } = await supabase.from('modules').update(patch).eq('id', input.moduleId);
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

  const { error } = await supabase.from('lessons').update(patch).eq('id', input.lessonId);
  if (error) throw new Error(error.message);
}

/* ================= CREATE ================= */

export async function createCourse(input: {
  title: string;
  description?: string;
  subjectId?: string;
  teacherId: string;
  status?: Tables<'courses'>['status'];
}) {
  return queryOrThrow(
    supabase
      .from('courses')
      .insert({
        title: input.title,
        description: input.description || null,
        subject_id: input.subjectId || null,
        teacher_id: input.teacherId,
        status: input.status || 'draft',
      })
      .select('*')
      .single()
  );
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

export async function updateCourseStatus(
  courseId: string,
  status: Tables<'courses'>['status']
) {
  const { error } = await supabase.from('courses').update({ status }).eq('id', courseId);
  if (error) throw new Error(error.message);
}

/* ================= DELETE ================= */

export async function deleteLesson(lessonId: string) {
  await queryOrThrow(supabase.from('lesson_progress').delete().eq('lesson_id', lessonId));

  const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
  if (error) throw new Error(error.message);
}

export async function deleteModule(moduleId: string) {
  const lessons = await queryOrThrow(
    supabase.from('lessons').select('id').eq('module_id', moduleId)
  );

  const lessonIds = lessons.map((l) => l.id);

  if (lessonIds.length) {
    await queryOrThrow(
      supabase.from('lesson_progress').delete().in('lesson_id', lessonIds)
    );
    await queryOrThrow(supabase.from('lessons').delete().in('id', lessonIds));
  }

  const { error } = await supabase.from('modules').delete().eq('id', moduleId);
  if (error) throw new Error(error.message);
}

export async function deleteCourse(courseId: string) {
  const modules = await queryOrThrow(
    supabase.from('modules').select('id').eq('course_id', courseId)
  );

  const moduleIds = modules.map((m) => m.id);

  if (moduleIds.length) {
    const lessons = await queryOrThrow(
      supabase.from('lessons').select('id').in('module_id', moduleIds)
    );

    const lessonIds = lessons.map((l) => l.id);

    if (lessonIds.length) {
      await queryOrThrow(
        supabase.from('lesson_progress').delete().in('lesson_id', lessonIds)
      );
      await queryOrThrow(supabase.from('lessons').delete().in('id', lessonIds));
    }

    await queryOrThrow(supabase.from('modules').delete().in('id', moduleIds));
  }

  await queryOrThrow(
    supabase.from('course_bookmarks').delete().eq('course_id', courseId)
  );

  await queryOrThrow(
    supabase.from('course_enrollments').delete().eq('course_id', courseId)
  );

  await deleteContentReviewsSafe(courseId);

  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) throw new Error(error.message);
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