import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth, type UserRole } from '@/lib/auth-context';
import {
  getChatContacts,
  getChatMessages,
  getMyChatThreads,
  getOrCreateDirectChat,
  markChatThreadRead,
  removeChatSubscription,
  sendChatMessage,
  subscribeToThreadMessages,
  type ChatContact,
  type ChatMessage,
  type ChatThread,
} from '@/lib/data/chat-actions';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 180;
const MAX_NAME_CHARS = 160;
const MAX_EMAIL_CHARS = 320;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_SEARCH_CHARS = 160;
const MAX_URL_CHARS = 2_000;
const MAX_ERROR_CHARS = 700;
const MAX_UNREAD_COUNT = 999;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_NAME_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_MESSAGE_CHARS): string {
  return limitText(
    cleanRawText(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
    limit,
  );
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeSearch(value: unknown) {
  return cleanText(value, MAX_SEARCH_CHARS).toLowerCase();
}

function normalizeHttpUrl(value: unknown): string | null {
  const rawUrl = cleanText(value, MAX_URL_CHARS);

  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeCount(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.min(MAX_UNREAD_COUNT, Math.round(numberValue)));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function formatDateTime(value?: string | null) {
  const rawValue = cleanText(value, 80);

  if (!rawValue) return '';

  const date = new Date(rawValue);

  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('kk-KZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getRoleLabel(role?: UserRole | string | null) {
  switch (role) {
    case 'teacher':
      return 'Мұғалім';
    case 'parent':
      return 'Ата-ана';
    case 'admin':
      return 'Әкімші';
    case 'student':
      return 'Оқушы';
    default:
      return 'Пайдаланушы';
  }
}

function getMessageTime(message: ChatMessage) {
  return new Date(cleanText(message.createdAt, 80) || 0).getTime();
}

function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => getMessageTime(a) - getMessageTime(b));
}

function normalizeThread(thread: ChatThread): ChatThread {
  return {
    ...thread,
    threadId: cleanId(thread.threadId),
    displayName: cleanText(thread.displayName) || 'Чат',
    displayAvatarUrl: normalizeHttpUrl(thread.displayAvatarUrl),
    lastMessageBody: cleanMultilineText(thread.lastMessageBody, 500),
    lastMessageCreatedAt: cleanText(thread.lastMessageCreatedAt, 80),
    unreadCount: normalizeCount(thread.unreadCount),
  };
}

function normalizeContact(contact: ChatContact): ChatContact {
  return {
    ...contact,
    userId: cleanId(contact.userId),
    fullName: cleanText(contact.fullName) || 'Пайдаланушы',
    avatarUrl: normalizeHttpUrl(contact.avatarUrl),
    email: cleanText(contact.email, MAX_EMAIL_CHARS),
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    id: cleanId(message.id),
    senderId: cleanId(message.senderId),
    senderName: cleanText(message.senderName) || 'Пайдаланушы',
    body: cleanMultilineText(message.body),
    createdAt: cleanText(message.createdAt, 80),
  };
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();

  return sortMessages(
    messages.reduce<ChatMessage[]>((acc, message, index) => {
      const normalized = normalizeMessage(message);
      const id = normalized.id || `${normalized.senderId}-${normalized.createdAt}-${index}`;

      if (seen.has(id)) return acc;

      seen.add(id);
      acc.push({
        ...normalized,
        id,
      });

      return acc;
    }, []),
  );
}

function ThreadListItem({
  thread,
  active,
  onClick,
}: {
  thread: ChatThread;
  active: boolean;
  onClick: () => void;
}) {
  const unreadCount = normalizeCount(thread.unreadCount);
  const displayName = cleanText(thread.displayName) || 'Чат';
  const lastMessage = cleanMultilineText(thread.lastMessageBody, 500) || 'Хабарлама жоқ';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border p-3 text-left transition-colors active:scale-[0.99]',
        active
          ? 'border-primary-muted bg-primary-soft text-primary'
          : 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/45',
      )}
    >
      <div className="flex gap-3">
        <UserAvatar
          name={displayName}
          avatarUrl={normalizeHttpUrl(thread.displayAvatarUrl)}
          className="h-10 w-10"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {displayName}
            </p>

            {thread.lastMessageCreatedAt ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatDateTime(thread.lastMessageCreatedAt)}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {lastMessage}
            </p>

            {unreadCount > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function ContactItem({
  contact,
  loading,
  onClick,
}: {
  contact: ChatContact;
  loading: boolean;
  onClick: () => void;
}) {
  const fullName = cleanText(contact.fullName) || 'Пайдаланушы';
  const email = cleanText(contact.email, MAX_EMAIL_CHARS);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || !cleanId(contact.userId)}
      className="w-full rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary-muted hover:bg-primary-soft/45 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-center gap-3">
        <UserAvatar
          name={fullName}
          avatarUrl={normalizeHttpUrl(contact.avatarUrl)}
          className="h-9 w-9"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {fullName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {getRoleLabel(contact.role)}
            {email ? ` · ${email}` : ''}
          </p>
        </div>

        {loading ? <Loader2 size={16} className="animate-spin" /> : null}
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  own,
}: {
  message: ChatMessage;
  own: boolean;
}) {
  const senderName = cleanText(message.senderName) || 'Пайдаланушы';
  const body = cleanMultilineText(message.body);

  return (
    <div className={cn('flex', own ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-4 py-2 shadow-sm',
          own
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-card',
        )}
      >
        {!own ? (
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {senderName}
          </p>
        ) : null}

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {body}
        </p>

        <p
          className={cn(
            'mt-1 text-right text-[10px]',
            own ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {formatDateTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const safeUserId = cleanId(user?.id);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const threadsQuery = useQuery({
    queryKey: ['chat', 'threads', safeUserId],
    queryFn: getMyChatThreads,
    enabled: Boolean(safeUserId),
  });

  const contactsQuery = useQuery({
    queryKey: ['chat', 'contacts', safeUserId],
    queryFn: getChatContacts,
    enabled: Boolean(safeUserId),
  });

  const safeSelectedThreadId = cleanId(selectedThreadId);

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', safeSelectedThreadId],
    queryFn: () => getChatMessages(safeSelectedThreadId),
    enabled: Boolean(safeSelectedThreadId && safeUserId),
  });

  const threads = useMemo(
    () => (threadsQuery.data || []).map(normalizeThread).filter((thread) => thread.threadId),
    [threadsQuery.data],
  );

  const contacts = useMemo(
    () => (contactsQuery.data || []).map(normalizeContact).filter((contact) => contact.userId),
    [contactsQuery.data],
  );

  const selectedThread =
    threads.find((thread) => thread.threadId === safeSelectedThreadId) || null;

  const filteredThreads = useMemo(() => {
    const q = normalizeSearch(search);

    if (!q) return threads;

    return threads.filter((thread) =>
      normalizeSearch(
        [thread.displayName, thread.lastMessageBody].filter(Boolean).join(' '),
      ).includes(q),
    );
  }, [threads, search]);

  const filteredContacts = useMemo(() => {
    const q = normalizeSearch(search);

    if (!q) return contacts;

    return contacts.filter((contact) =>
      normalizeSearch(
        [
          contact.fullName,
          contact.email,
          getRoleLabel(contact.role),
        ]
          .filter(Boolean)
          .join(' '),
      ).includes(q),
    );
  }, [contacts, search]);

  useEffect(() => {
    setMessages(normalizeMessages(messagesQuery.data || []));
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!safeSelectedThreadId) return;

    void markChatThreadRead(safeSelectedThreadId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['chat', 'threads', safeUserId] });
      })
      .catch((error: unknown) => {
        console.error('Failed to mark chat thread as read', error);
      });
  }, [queryClient, safeSelectedThreadId, safeUserId]);

  useEffect(() => {
    if (!safeSelectedThreadId) return;

    const channel = subscribeToThreadMessages(safeSelectedThreadId, (nextMessage) => {
      const normalizedMessage = normalizeMessage(nextMessage);

      if (!normalizedMessage.id) return;

      setMessages((current) => normalizeMessages([...current, normalizedMessage]));

      void queryClient.invalidateQueries({ queryKey: ['chat', 'threads', safeUserId] });

      if (normalizedMessage.senderId !== safeUserId) {
        void markChatThreadRead(safeSelectedThreadId)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['chat', 'threads', safeUserId] });
          })
          .catch((error: unknown) => {
            console.error('Failed to mark incoming message as read', error);
          });
      }
    });

    return () => {
      void removeChatSubscription(channel);
    };
  }, [queryClient, safeSelectedThreadId, safeUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, safeSelectedThreadId]);

  const refreshChat = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chat', 'threads', safeUserId] }),
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts', safeUserId] }),
      safeSelectedThreadId
        ? queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', safeSelectedThreadId],
          })
        : Promise.resolve(),
    ]);
  };

  const openThread = async (threadId: string) => {
    const safeThreadId = cleanId(threadId);

    if (!safeThreadId) return;

    setSelectedThreadId(safeThreadId);
    setDraft('');

    try {
      await markChatThreadRead(safeThreadId);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'threads', safeUserId] });
    } catch (error) {
      console.error('Failed to mark selected chat as read', error);
    }
  };

  const startDirectChat = async (contact: ChatContact) => {
    const contactUserId = cleanId(contact.userId);

    if (!contactUserId) return;

    setStartingChatUserId(contactUserId);

    try {
      const threadId = cleanId(await getOrCreateDirectChat(contactUserId));

      if (!threadId) {
        throw new Error('Чат анықталмады.');
      }

      setSelectedThreadId(threadId);
      setDraft('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat', 'threads', safeUserId] }),
        queryClient.invalidateQueries({ queryKey: ['chat', 'messages', threadId] }),
      ]);
    } catch (error) {
      toast({
        title: 'Чатты ашу мүмкін болмады',
        description: getErrorMessage(
          error,
          'Бұл қолданушымен чат бастау мүмкін болмады.',
        ),
        variant: 'destructive',
      });
    } finally {
      setStartingChatUserId(null);
    }
  };

  // `/chat?with=<user_id>`: мұғалім панелінен, «Сыныптарым» не дабыл бетінен тікелей чат ашу (D85).
  const [searchParams, setSearchParams] = useSearchParams();
  const withUserId = cleanId(searchParams.get('with'));
  const openedWithRef = useRef<string | null>(null);
  useEffect(() => {
    if (!withUserId || openedWithRef.current === withUserId) return;
    const contact = contacts.find((item) => item.userId === withUserId);
    if (!contact) return;
    openedWithRef.current = withUserId;
    void startDirectChat(contact);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withUserId, contacts]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const messageBody = cleanMultilineText(draft);
    const threadId = cleanId(selectedThreadId);

    if (!threadId || !messageBody || sending) return;

    setSending(true);

    try {
      await sendChatMessage(threadId, messageBody);
      setDraft('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat', 'threads', safeUserId] }),
        queryClient.invalidateQueries({
          queryKey: ['chat', 'messages', threadId],
        }),
      ]);

      await markChatThreadRead(threadId);
    } catch (error) {
      toast({
        title: 'Хабарлама жіберілмеді',
        description: getErrorMessage(error, 'Хабарламаны жіберу мүмкін болмады.'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const initialLoading = threadsQuery.isLoading || contactsQuery.isLoading;
  const hasListError = threadsQuery.error || contactsQuery.error;
  const draftLength = cleanMultilineText(draft).length;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] min-h-[620px] space-y-4 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <MessageCircle size={13} />
              Байланыс
            </>
          }
          icon={<MessageCircle size={20} />}
          title="Чат"
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={refreshChat}
              disabled={threadsQuery.isFetching || contactsQuery.isFetching}
            >
              <RefreshCw
                size={16}
                className={cn(
                  'mr-2',
                  (threadsQuery.isFetching || contactsQuery.isFetching) &&
                    'animate-spin',
                )}
              />
              Жаңарту
            </Button>
          }
        />

        <div className="grid h-[calc(100%-5.5rem)] gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="flex min-h-0 flex-col rounded-3xl border border-border bg-card shadow-soft">
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />

                <Input
                  value={search}
                  maxLength={MAX_SEARCH_CHARS}
                  onChange={(event) => setSearch(cleanText(event.target.value, MAX_SEARCH_CHARS))}
                  placeholder="Чат немесе контакт іздеу"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {initialLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={22} className="animate-spin" />
                    Чаттар жүктелуде...
                  </div>
                </div>
              ) : hasListError ? (
                <div className="rounded-2xl border border-destructive-muted bg-destructive-soft p-4 text-sm text-destructive">
                  Чат деректерін жүктеу мүмкін болмады.
                </div>
              ) : (
                <div className="space-y-6">
                  <section>
                    <div className="mb-2 flex items-center gap-2">
                      <MessageCircle size={16} />
                      <h3 className="text-sm font-semibold">Менің чаттарым</h3>
                    </div>

                    {filteredThreads.length ? (
                      <div className="space-y-2">
                        {filteredThreads.map((thread) => (
                          <ThreadListItem
                            key={thread.threadId}
                            thread={thread}
                            active={thread.threadId === safeSelectedThreadId}
                            onClick={() => void openThread(thread.threadId)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                        Әзірге чат жоқ.
                      </div>
                    )}
                  </section>

                  <section>
                    <div className="mb-2 flex items-center gap-2">
                      <Users size={16} />
                      <h3 className="text-sm font-semibold">Контактілер</h3>
                    </div>

                    {filteredContacts.length ? (
                      <div className="space-y-2">
                        {filteredContacts.map((contact) => {
                          const contactUserId = cleanId(contact.userId);

                          return (
                            <ContactItem
                              key={contactUserId}
                              contact={contact}
                              loading={startingChatUserId === contactUserId}
                              onClick={() => void startDirectChat(contact)}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                        Қолжетімді контакт табылмады.
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col rounded-3xl border border-border bg-card shadow-soft">
            {safeSelectedThreadId ? (
              <>
                <div className="flex items-center gap-3 border-b border-border p-4">
                  <UserAvatar
                    name={selectedThread?.displayName || 'Чат'}
                    avatarUrl={selectedThread?.displayAvatarUrl || null}
                    className="h-10 w-10"
                  />

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">
                      {selectedThread?.displayName || 'Чат'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {messages.length} хабарлама
                    </p>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4">
                  {messagesQuery.isLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 size={22} className="animate-spin" />
                        Хабарламалар жүктелуде...
                      </div>
                    </div>
                  ) : messagesQuery.error ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-2xl border border-destructive-muted bg-destructive-soft p-4 text-sm text-destructive">
                        Хабарламаларды жүктеу мүмкін болмады.
                      </div>
                    </div>
                  ) : messages.length ? (
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          own={message.senderId === safeUserId}
                        />
                      ))}

                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="max-w-sm text-center">
                        <MessageCircle
                          size={34}
                          className="mx-auto mb-3 text-muted-foreground"
                        />
                        <h3 className="font-semibold">Хабарлама жоқ</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Бірінші хабарламаны төменнен жіберіңіз.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSend} className="border-t border-border p-4">
                  <div className="flex gap-2">
                    <Input
                      value={draft}
                      onChange={(event) =>
                        setDraft(cleanMultilineText(event.target.value))
                      }
                      placeholder="Хабарлама жазыңыз..."
                      maxLength={MAX_MESSAGE_CHARS}
                      disabled={sending}
                    />

                    <Button
                      type="submit"
                      disabled={!draftLength || sending}
                      className="shrink-0"
                    >
                      {sending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </Button>
                  </div>

                  <p className="mt-2 text-right text-[11px] text-muted-foreground">
                    {draftLength}/{MAX_MESSAGE_CHARS}
                  </p>
                </form>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <MessageCircle size={28} className="text-primary" />
                  </div>

                  <h3 className="text-lg font-semibold">Чатты таңдаңыз</h3>

                  <p className="mt-2 text-sm text-muted-foreground">
                    Сол жақтан чатты таңдаңыз немесе контактіні басып жаңа чат бастаңыз.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
