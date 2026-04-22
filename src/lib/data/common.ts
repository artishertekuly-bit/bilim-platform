import { supabase } from '@/integrations/supabase/client';

export type Locale = 'kk' | 'ru';

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
  return localizedText(locale, 'Талдау деректері негізінде', 'На основе аналитических данных');
}

export function isSoftSchemaError(message: string) {
  return /does not exist|schema cache|column .* does not exist/i.test(message);
}

export async function deleteContentReviewsSafe(contentId: string) {
  const { error } = await supabase
    .from('content_reviews')
    .delete()
    .eq('content_id', contentId);

  if (error && !isSoftSchemaError(error.message || '')) {
    throw new Error(error.message);
  }
}

export async function queryOrThrow<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<Exclude<T, null | undefined>> {
  const { data, error } = await promise;

  if (error) {
    throw new Error(error.message);
  }

  if (data === null || data === undefined) {
    throw new Error('Сұрау нәтижесі бос қайтты');
  }

  return data as Exclude<T, null | undefined>;
}