// Хабарламалар (public.notifications; RLS: тек өз хабарламасы). Жазуды сервер жағы жасайды.
import { supabase } from '@/integrations/supabase/client';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export const notificationKeys = { list: ['notifications'] as const };

export async function listNotifications(limit = 60): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, type, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Хабарламаларды жүктеу мүмкін болмады.');
  return (data ?? []) as AppNotification[];
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  if (error) throw new Error('Хабарламаларды белгілеу мүмкін болмады.');
}

export function notificationGroup(iso: string): 'today' | 'week' | 'earlier' {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'today';
  return now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000 ? 'week' : 'earlier';
}
