import type {
  CourseAccessType,
  CourseAnnouncementPriority,
  CourseVisibility,
} from '@/lib/app-data-types';

export const courseStatuses = ['draft', 'published', 'archived'] as const;
export type CourseStatus = (typeof courseStatuses)[number];

export const courseAccessTypes: CourseAccessType[] = [
  'public_free',
  'private_invite',
  'paid',
];

export const announcementPriorities: CourseAnnouncementPriority[] = [
  'normal',
  'important',
  'urgent',
];

export function resolveVisibilityFromAccessType(accessType: CourseAccessType): CourseVisibility {
  if (accessType === 'private_invite') return 'unlisted';
  return 'public';
}

export function shouldShowCoursePricing(accessType: CourseAccessType) {
  return accessType === 'paid';
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function getSortedBySortOrder<T extends { sortOrder: number }>(items: T[] = []) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getNextSortOrder<T extends { sortOrder: number }>(items: T[] = []) {
  const maxSortOrder = items.reduce(
    (max, item) => Math.max(max, Number(item.sortOrder) || 0),
    0
  );

  return String(maxSortOrder + 1);
}

export function getAccessTypeLabel(type: CourseAccessType) {
  const map: Record<CourseAccessType, string> = {
    public_free: 'Ашық курс',
    private_invite: 'Жабық курс',
    paid: 'Ақылы курс',
    subscription_only: 'Ақылы курс',
    school_only: 'Жабық курс',
  };

  return map[type] || type;
}

export function getAccessTypeHint(type: CourseAccessType) {
  const map: Record<CourseAccessType, string> = {
    public_free: 'Каталогта көрінеді. Оқушы тегін жазыла алады.',
    private_invite: 'Каталогта көрінбейді. Оқушы тек кіру коды арқылы кіреді.',
    paid: 'Каталогта көрінеді. Оқушы қолжетімділік сұрайды, кейін төлем арқылы ашылады.',
    subscription_only: 'Ақылы курс ретінде өңделеді.',
    school_only: 'Жабық курс ретінде өңделеді.',
  };

  return map[type] || '';
}

export function normalizeCurrency(value: string) {
  return (value || 'KZT').trim().toUpperCase();
}

export function parsePrice(value: string) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Баға 0 немесе одан жоғары болуы керек.');
  }

  return parsed;
}

export function parseMaxStudents(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Оқушы лимиті бос немесе 1-ден жоғары бүтін сан болуы керек.');
  }

  return parsed;
}

export function formatPrice(price: number, currency: string) {
  if (!price) return 'Тегін';
  return `${price.toLocaleString('kk-KZ')} ${currency}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Шектеусіз';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number) => String(part).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

export function normalizeExternalUrlInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('Материал сілтемесін енгізіңіз.');
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Сілтеме форматы дұрыс емес.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Сілтеме http немесе https болуы керек.');
  }

  return parsed.toString();
}

export function getFilenameFromUrl(value: string, fallback: string) {
  try {
    const parsed = new URL(value);
    const lastPart = parsed.pathname.split('/').filter(Boolean).at(-1);
    if (lastPart) return decodeURIComponent(lastPart);
  } catch {
    // noop
  }

  return fallback;
}

export function formatAssetTitle(value: string | null | undefined, filename: string) {
  return value?.trim() || filename || 'Материал';
}

export function getCourseStatusTone(status: CourseStatus) {
  if (status === 'published') return 'success';
  if (status === 'archived') return 'muted';
  return 'warning';
}

export function scrollToBuilderSection(id: string) {
  const element = document.getElementById(id);

  if (!element) return;

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function getAnnouncementPriorityLabel(priority: CourseAnnouncementPriority) {
  const map: Record<CourseAnnouncementPriority, string> = {
    normal: 'Қалыпты',
    important: 'Маңызды',
    urgent: 'Шұғыл',
  };

  return map[priority] || priority;
}

export function getAnnouncementPriorityTone(priority: CourseAnnouncementPriority) {
  if (priority === 'urgent') return 'danger';
  if (priority === 'important') return 'warning';
  return 'info';
}

export function isExpiredDate(value: string | null | undefined) {
  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() <= Date.now();
}
