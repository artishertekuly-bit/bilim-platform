import { supabase } from '@/integrations/supabase/client';
import { limitText, removeNullCharacters } from '@/lib/utils';

export const COURSE_THUMBNAIL_BUCKET = 'course-thumbnails';

const MAX_URL_CHARS = 2_000;

export function normalizeCourseThumbnailUrl(value: unknown): string | null {
  const raw = limitText(
    removeNullCharacters(String(value ?? ''))
      .replace(/\s+/g, ' ')
      .trim(),
    MAX_URL_CHARS,
  );

  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function safeDecodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractCourseThumbnailStoragePath(
  value: unknown,
): string | null {
  const url = normalizeCourseThumbnailUrl(value);

  if (!url) return null;

  const marker = `/object/public/${COURSE_THUMBNAIL_BUCKET}/`;
  const cleanUrl = url.split('?')[0];
  const index = cleanUrl.indexOf(marker);

  if (index === -1) return null;

  const path = safeDecodePath(cleanUrl.slice(index + marker.length))
    .replace(/^\/+/, '')
    .trim();

  if (!path || path.includes('..') || path.startsWith('/')) {
    return null;
  }

  return path;
}

export async function removeCourseThumbnailStorageObject(
  value: unknown,
): Promise<void> {
  const path = extractCourseThumbnailStoragePath(value);

  if (!path) return;

  const { error } = await supabase.storage
    .from(COURSE_THUMBNAIL_BUCKET)
    .remove([path]);

  if (error) {
    throw new Error(error.message);
  }
}
