// Чат беттеріне ортақ кілттер мен уақыт пішімі.
import type { UserRole } from '@/lib/auth-context';

export const chatKeys = {
  threads: ['chat', 'threads'] as const,
  contacts: ['chat', 'contacts'] as const,
  messages: (threadId: string) => ['chat', 'messages', threadId] as const,
};

export const CHAT_ROLE_LABEL: Record<UserRole, string> = { student: 'Оқушы', teacher: 'Мұғалім', parent: 'Ата-ана', head: 'Әкімші', admin: 'Платформа иесі' };

export function chatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('kk-KZ', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'кеше';
  return d.toLocaleDateString('kk-KZ', { day: 'numeric', month: 'short' });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Бүгін';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Кеше';
  return d.toLocaleDateString('kk-KZ', { day: 'numeric', month: 'long' });
}
