import { supabase } from '@/integrations/supabase/client';

export type Locale = 'kk' | 'ru';

type SupabaseErrorLike = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

type QueryResponse<T> = {
  data: T;
  error: SupabaseErrorLike | null;
};

type ExecResponse = {
  error: SupabaseErrorLike | null;
};

/* ================= LOCALIZATION ================= */

export function localizedText(locale: Locale, kk: string, ru: string) {
  return locale === 'ru' ? ru : kk;
}

export function unknownLabel(locale: Locale) {
  return localizedText(locale, 'Белгісіз', 'Неизвестно');
}

export function unknownCourseLabel(locale: Locale) {
  return localizedText(locale, 'Белгісіз курс', 'Неизвестный курс');
}

export function unknownStudentLabel(locale: Locale) {
  return localizedText(locale, 'Белгісіз оқушы', 'Неизвестный ученик');
}

export function unknownTeacherLabel(locale: Locale) {
  return localizedText(locale, 'Белгісіз мұғалім', 'Неизвестный преподаватель');
}

export function noDescriptionLabel(locale: Locale) {
  return localizedText(locale, 'Сипаттама жоқ', 'Описание отсутствует');
}

export function noTopicLabel(locale: Locale) {
  return localizedText(locale, 'Тақырып жоқ', 'Тема не указана');
}

export function recentTestActionLabel(locale: Locale) {
  return localizedText(locale, 'Тест тапсырды', 'Прошел тест');
}

export function analyticsDerivedTopicLabel(locale: Locale) {
  return localizedText(
    locale,
    'Талдау деректері негізінде',
    'На основе аналитических данных',
  );
}

/* ================= ERROR HELPERS ================= */

function formatSupabaseError(error: SupabaseErrorLike) {
  const parts = [
    error.message,
    error.details ? `Details: ${error.details}` : null,
    error.hint ? `Hint: ${error.hint}` : null,
    error.code ? `Code: ${error.code}` : null,
  ].filter(Boolean);

  return parts.join(' | ');
}

/* ================= SUPABASE HELPERS ================= */

export async function queryOrThrow<T>(
  promise: PromiseLike<QueryResponse<T>>,
): Promise<Exclude<T, null | undefined>> {
  const { data, error } = await promise;

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (data === null || data === undefined) {
    throw new Error('Сұрау нәтижесі бос қайтты');
  }

  return data as Exclude<T, null | undefined>;
}

export async function maybeQueryOrThrow<T>(
  promise: PromiseLike<QueryResponse<T>>,
): Promise<T | null> {
  const { data, error } = await promise;

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  return data ?? null;
}

export async function execOrThrow(
  promise: PromiseLike<ExecResponse>,
): Promise<void> {
  const { error } = await promise;

  if (error) {
    throw new Error(formatSupabaseError(error));
  }
}

/* ================= CONTENT REVIEW HELPERS ================= */

export async function deleteContentReviewsSafe(contentId: string) {
  if (!contentId.trim()) {
    throw new Error('Content ID бос болмауы керек.');
  }

  await execOrThrow(
    supabase
      .from('content_reviews')
      .delete()
      .eq('content_id', contentId),
  );
}