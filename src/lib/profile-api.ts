// Профиль: аты-жөн және профиль суреті. Сурет `avatars` бакетіне `<user_id>/avatar-<ts>.jpg`
// болып жүктеледі (RLS: әр пайдаланушы тек өз папкасына жазады), сілтеме `profiles.avatar_url`-да.
import { supabase } from '@/integrations/supabase/client';

export const AVATAR_BUCKET = 'avatars';
export const MAX_AVATAR_MB = 25;
export const AVATAR_OUTPUT_PX = 512;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export type AvatarFileError = 'type' | 'size';

export function checkAvatarFile(file: File): AvatarFileError | null {
  if (!ACCEPTED.includes(file.type)) return 'type';
  if (file.size > MAX_AVATAR_MB * 1024 * 1024) return 'size';
  return null;
}

export const AVATAR_ERRORS: Record<AvatarFileError | 'upload' | 'remove', string> = {
  type: 'Бұл файл сурет емес. JPG, PNG немесе WEBP таңдаңыз.',
  size: `Файл тым үлкен. ${MAX_AVATAR_MB} MB-тан кіші сурет таңдаңыз.`,
  upload: 'Суретті жүктеу мүмкін болмады. Интернетті тексеріп, қайталап көріңіз.',
  remove: 'Суретті өшіру мүмкін болмады. Қайталап көріңіз.',
};

export type PixelArea = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(AVATAR_ERRORS.upload));
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.src = src;
  });
}

/**
 * react-easy-crop берген аймақты (бұрылған сурет координаттарында) шаршы JPEG-ке айналдырады.
 * Бұру: суретті бұрылған шекара өлшемді кенепке салып, сол жерден аймақты қиямыз.
 */
export async function renderAvatar(src: string, area: PixelArea, rotation: number, size = AVATAR_OUTPUT_PX): Promise<Blob> {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const boundW = image.naturalWidth * cos + image.naturalHeight * sin;
  const boundH = image.naturalWidth * sin + image.naturalHeight * cos;

  const rotated = document.createElement('canvas');
  rotated.width = Math.round(boundW);
  rotated.height = Math.round(boundH);
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error(AVATAR_ERRORS.upload);
  rctx.translate(boundW / 2, boundH / 2);
  rctx.rotate(rad);
  rctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error(AVATAR_ERRORS.upload);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, size, size);

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(AVATAR_ERRORS.upload))), 'image/jpeg', 0.9);
  });
}

/** Public URL-дан бакет ішіндегі жолды шығарады (тек өз бакетіміз; `..` жоқ). */
export function avatarStoragePath(url?: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const clean = url.split('?')[0];
  const index = clean.indexOf(marker);
  if (index === -1) return null;
  let path = clean.slice(index + marker.length);
  try {
    path = decodeURIComponent(path);
  } catch {
    /* бұрынғы күйінде қалдырамыз */
  }
  path = path.replace(/^\/+/, '').trim();
  return path && !path.includes('..') ? path : null;
}

async function setProfileFields(userId: string, patch: { avatar_url?: string | null; full_name?: string }) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('user_id', userId).select('user_id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Профиль табылмады. Бетті жаңартып, қайталап көріңіз.');
}

export async function uploadAvatar(userId: string, blob: Blob, previousUrl?: string | null): Promise<string> {
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { upsert: false, contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw new Error(AVATAR_ERRORS.upload);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  await setProfileFields(userId, { avatar_url: data.publicUrl });

  const oldPath = avatarStoragePath(previousUrl);
  if (oldPath && oldPath !== path && oldPath.startsWith(`${userId}/`)) {
    await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
  }
  return data.publicUrl;
}

export async function removeAvatar(userId: string, currentUrl?: string | null): Promise<void> {
  await setProfileFields(userId, { avatar_url: null });
  const oldPath = avatarStoragePath(currentUrl);
  if (oldPath && oldPath.startsWith(`${userId}/`)) {
    await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
  }
}

/** Аккаунт жойылар алдында: пайдаланушы бумасындағы барлық суретті өшіреді (бакет ашық, сурет қалып қоймасын). */
export async function removeAllAvatars(userId: string, currentUrl?: string | null): Promise<void> {
  await removeAvatar(userId, currentUrl);
  const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length) await supabase.storage.from(AVATAR_BUCKET).remove(paths);
}

export async function updateFullName(userId: string, fullName: string): Promise<void> {
  const name = fullName.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (name.length < 3) throw new Error('Аты-жөн кемінде 3 әріп болсын.');
  await setProfileFields(userId, { full_name: name });
}
