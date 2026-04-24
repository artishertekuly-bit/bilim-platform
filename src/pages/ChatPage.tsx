import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
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

function formatDateTime(value?: string | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat('kk-KZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getRoleLabel(role?: UserRole | null) {
  switch (role) {
    case 'teacher':
      return 'Мұғалім';
    case 'parent':
      return 'Ата-ана';
    case 'admin':
      return 'Админ';
    case 'student':
    default:
      return 'Оқушы';
  }
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition ${
        active
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:bg-accent'
      }`}
    >
      <div className="flex gap-3">
        <UserAvatar
          name={thread.displayName}
          avatarUrl={thread.displayAvatarUrl}
          className="h-10 w-10"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium">{thread.displayName}</p>

            {thread.lastMessageCreatedAt ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatDateTime(thread.lastMessageCreatedAt)}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {thread.lastMessageBody || 'Хабарлама жоқ'}
            </p>

            {thread.unreadCount > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {thread.unreadCount}
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex items-center gap-3">
        <UserAvatar
          name={contact.fullName}
          avatarUrl={contact.avatarUrl}
          className="h-9 w-9"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{contact.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {getRoleLabel(contact.role)}
            {contact.email ? ` · ${contact.email}` : ''}
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
  return (
    <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2 shadow-sm ${
          own
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-card'
        }`}
      >
        {!own ? (
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {message.senderName}
          </p>
        ) : null}

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.body}
        </p>

        <p
          className={`mt-1 text-right text-[10px] ${
            own ? 'text-primary-foreground/70' : 'text-muted-foreground'
          }`}
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

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const threadsQuery = useQuery({
    queryKey: ['chat', 'threads'],
    queryFn: getMyChatThreads,
  });

  const contactsQuery = useQuery({
    queryKey: ['chat', 'contacts'],
    queryFn: getChatContacts,
  });

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', selectedThreadId],
    queryFn: () => getChatMessages(selectedThreadId || ''),
    enabled: Boolean(selectedThreadId),
  });

  const threads = threadsQuery.data || [];
  const contacts = contactsQuery.data || [];
  const selectedThread = threads.find((thread) => thread.threadId === selectedThreadId);

  const filteredThreads = useMemo(() => {
    const q = normalizeSearch(search);

    if (!q) return threads;

    return threads.filter((thread) => {
      return (
        thread.displayName.toLowerCase().includes(q) ||
        (thread.lastMessageBody || '').toLowerCase().includes(q)
      );
    });
  }, [threads, search]);

  const filteredContacts = useMemo(() => {
    const q = normalizeSearch(search);

    if (!q) return contacts;

    return contacts.filter((contact) => {
      return (
        contact.fullName.toLowerCase().includes(q) ||
        (contact.email || '').toLowerCase().includes(q) ||
        getRoleLabel(contact.role).toLowerCase().includes(q)
      );
    });
  }, [contacts, search]);

  useEffect(() => {
    setMessages(messagesQuery.data || []);
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!selectedThreadId) return;

    void markChatThreadRead(selectedThreadId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] });
      })
      .catch((error) => {
        console.error('Failed to mark chat thread as read', error);
      });
  }, [queryClient, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) return;

    const channel = subscribeToThreadMessages(selectedThreadId, (nextMessage) => {
      setMessages((current) => {
        if (current.some((message) => message.id === nextMessage.id)) {
          return current;
        }

        return sortMessages([...current, nextMessage]);
      });

      void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] });

      if (nextMessage.senderId !== user?.id) {
        void markChatThreadRead(selectedThreadId)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] });
          })
          .catch((error) => {
            console.error('Failed to mark incoming message as read', error);
          });
      }
    });

    return () => {
      void removeChatSubscription(channel);
    };
  }, [queryClient, selectedThreadId, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedThreadId]);

  const refreshChat = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] }),
      queryClient.invalidateQueries({ queryKey: ['chat', 'contacts'] }),
      selectedThreadId
        ? queryClient.invalidateQueries({
            queryKey: ['chat', 'messages', selectedThreadId],
          })
        : Promise.resolve(),
    ]);
  };

  const openThread = async (threadId: string) => {
    setSelectedThreadId(threadId);
    setDraft('');

    try {
      await markChatThreadRead(threadId);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] });
    } catch (error) {
      console.error('Failed to mark selected chat as read', error);
    }
  };

  const startDirectChat = async (contact: ChatContact) => {
    setStartingChatUserId(contact.userId);

    try {
      const threadId = await getOrCreateDirectChat(contact.userId);
      setSelectedThreadId(threadId);
      setDraft('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] }),
        queryClient.invalidateQueries({ queryKey: ['chat', 'messages', threadId] }),
      ]);
    } catch (error) {
      toast({
        title: 'Чатты ашу мүмкін болмады',
        description:
          error instanceof Error
            ? error.message
            : 'Бұл қолданушымен чат бастау мүмкін болмады.',
        variant: 'destructive',
      });
    } finally {
      setStartingChatUserId(null);
    }
  };

  const handleSend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedThreadId || !draft.trim() || sending) return;

    setSending(true);

    try {
      await sendChatMessage(selectedThreadId, draft);
      setDraft('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chat', 'threads'] }),
        queryClient.invalidateQueries({
          queryKey: ['chat', 'messages', selectedThreadId],
        }),
      ]);

      await markChatThreadRead(selectedThreadId);
    } catch (error) {
      toast({
        title: 'Хабарлама жіберілмеді',
        description:
          error instanceof Error
            ? error.message
            : 'Хабарламаны жіберу мүмкін болмады.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const initialLoading = threadsQuery.isLoading || contactsQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-7rem)] min-h-[620px] space-y-4 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Чат</h2>
            <p className="text-sm text-muted-foreground">
              Мұғалімдермен, оқушылармен және ата-аналармен хабарласыңыз.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={refreshChat}
            disabled={threadsQuery.isFetching || contactsQuery.isFetching}
          >
            <RefreshCw
              size={16}
              className={`mr-2 ${
                threadsQuery.isFetching || contactsQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Жаңарту
          </Button>
        </div>

        <div className="grid h-[calc(100%-4.5rem)] gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="flex min-h-0 flex-col rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-4">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />

                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                            active={thread.threadId === selectedThreadId}
                            onClick={() => void openThread(thread.threadId)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
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
                        {filteredContacts.map((contact) => (
                          <ContactItem
                            key={contact.userId}
                            contact={contact}
                            loading={startingChatUserId === contact.userId}
                            onClick={() => void startDirectChat(contact)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                        Қолжетімді контакт табылмады.
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col rounded-2xl border bg-card shadow-sm">
            {selectedThreadId ? (
              <>
                <div className="flex items-center gap-3 border-b p-4">
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
                  ) : messages.length ? (
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          own={message.senderId === user?.id}
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

                <form onSubmit={handleSend} className="border-t p-4">
                  <div className="flex gap-2">
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Хабарлама жазыңыз..."
                      maxLength={4000}
                      disabled={sending}
                    />

                    <Button
                      type="submit"
                      disabled={!draft.trim() || sending}
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
                    {draft.length}/4000
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
                    Сол жақтан бар чатты таңдаңыз немесе контактіні басып жаңа чат бастаңыз.
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