import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { UserRole } from '@/lib/auth-context';

type RpcError = {
  message: string;
} | null;

type RpcExecutor = <T>(
  fn: string,
  args?: Record<string, unknown>
) => Promise<{
  data: T;
  error: RpcError;
}>;

const callSupabaseRpc = supabase.rpc as unknown as RpcExecutor;

async function rpcOrThrow<T>(
  fn: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await callSupabaseRpc<T>(fn, args);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export type ChatContact = {
  userId: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  role: UserRole;
  source: string;
};

export type ChatThread = {
  threadId: string;
  threadType: 'direct' | 'course' | 'support';
  title: string | null;
  courseId: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
  otherUserId: string | null;
  displayName: string;
  displayAvatarUrl: string | null;
  lastMessageBody: string | null;
  lastMessageCreatedAt: string | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

type ChatContactRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: UserRole;
  source: string;
};

type ChatThreadRow = {
  thread_id: string;
  thread_type: 'direct' | 'course' | 'support';
  title: string | null;
  course_id: string | null;
  last_message_at: string | null;
  updated_at: string;
  other_user_id: string | null;
  display_name: string;
  display_avatar_url: string | null;
  last_message_body: string | null;
  last_message_created_at: string | null;
  unread_count: number | null;
};

type ChatMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

type ChatMessageInsertRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_name_snapshot: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

function mapContact(row: ChatContactRow): ChatContact {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    role: row.role,
    source: row.source,
  };
}

function mapThread(row: ChatThreadRow): ChatThread {
  return {
    threadId: row.thread_id,
    threadType: row.thread_type,
    title: row.title,
    courseId: row.course_id,
    lastMessageAt: row.last_message_at,
    updatedAt: row.updated_at,
    otherUserId: row.other_user_id,
    displayName: row.display_name,
    displayAvatarUrl: row.display_avatar_url,
    lastMessageBody: row.last_message_body,
    lastMessageCreatedAt: row.last_message_created_at,
    unreadCount: row.unread_count ?? 0,
  };
}

function mapMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

function mapInsertedMessage(row: ChatMessageInsertRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: row.sender_name_snapshot,
    body: row.deleted_at ? 'Хабарлама өшірілді' : row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

export async function getChatContacts(): Promise<ChatContact[]> {
  const rows = await rpcOrThrow<ChatContactRow[]>('get_chat_contacts');
  return (rows ?? []).map(mapContact);
}

export async function getMyChatThreads(): Promise<ChatThread[]> {
  const rows = await rpcOrThrow<ChatThreadRow[]>('get_my_chat_threads');
  return (rows ?? []).map(mapThread);
}

export async function getChatMessages(
  threadId: string,
  limit = 50
): Promise<ChatMessage[]> {
  const rows = await rpcOrThrow<ChatMessageRow[]>('get_chat_messages', {
    p_thread_id: threadId,
    p_limit: limit,
  });

  return (rows ?? []).map(mapMessage);
}

export async function getOrCreateDirectChat(otherUserId: string): Promise<string> {
  if (!otherUserId) {
    throw new Error('Қолданушы таңдалмаған');
  }

  return rpcOrThrow<string>('get_or_create_direct_chat', {
    p_other_user_id: otherUserId,
  });
}

export async function sendChatMessage(
  threadId: string,
  body: string
): Promise<string> {
  const normalizedBody = body.trim();

  if (!threadId) {
    throw new Error('Чат таңдалмаған');
  }

  if (!normalizedBody) {
    throw new Error('Хабарлама бос болмауы керек');
  }

  if (normalizedBody.length > 4000) {
    throw new Error('Хабарлама тым ұзын');
  }

  return rpcOrThrow<string>('send_chat_message', {
    p_thread_id: threadId,
    p_body: normalizedBody,
  });
}

export async function markChatThreadRead(threadId: string): Promise<void> {
  if (!threadId) return;

  await rpcOrThrow<void>('mark_chat_thread_read', {
    p_thread_id: threadId,
  });
}

export function subscribeToThreadMessages(
  threadId: string,
  onMessage: (message: ChatMessage) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`chat-thread:${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessageInsertRow;
        onMessage(mapInsertedMessage(row));
      }
    )
    .subscribe();

  return channel;
}

export async function removeChatSubscription(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}