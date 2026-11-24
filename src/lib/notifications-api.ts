// Хабарламалар (public.notifications; RLS: тек өз хабарламасы). Жазуды сервер триггерлері жасайды (D91):
// чат, сыныпқа қосылу, дабыл, баға мен шағым, сабақ модерациясы, ата-ана байланысы, басқарма өтінімі.
import { supabase } from '@/integrations/supabase/client';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  /** Қосымша ішіндегі бет (мысалы, `/exam/result/…`). Ескі жазбаларда жоқ. */
  link?: string | null;
}

export const notificationKeys = { list: ['notifications'] as const };

export async function listNotifications(limit = 60): Promise<AppNotification[]> {
  // `*`: `link` бағаны migration қолданылғанша жоқ болса да сұрау құламайды.
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error('Хабарламаларды жүктеу мүмкін болмады.');
  return (data ?? []) as AppNotification[];
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  if (error) throw new Error('Хабарламаларды белгілеу мүмкін болмады.');
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

/** Тек қосымша ішіндегі салыстырмалы жол: сыртқы сілтеме ашылмайды. */
export function safeNotificationLink(link?: string | null): string | null {
  return link && /^\/[A-Za-z0-9]/.test(link) && !link.startsWith('//') ? link : null;
}

export function notificationGroup(iso: string): 'today' | 'week' | 'earlier' {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'today';
  return now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000 ? 'week' : 'earlier';
}
