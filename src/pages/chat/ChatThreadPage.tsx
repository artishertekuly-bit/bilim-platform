// Бір чат (дизайн: Chat.dc.html, TeacherChats.dc.html · тред): күн бойынша топ, нақты уақыттағы хабарламалар.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import Avatar from '@/components/bl/Avatar';
import { BackIcon, SendIcon } from '@/components/bl/icons';
import { ErrorNote, LoadingBlock } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import { CHAT_ROLE_LABEL, chatKeys, dayLabel } from '@/lib/chat-ui';
import {
  getChatContacts,
  getChatMessages,
  getMyChatThreads,
  markChatThreadRead,
  removeChatSubscription,
  sendChatMessage,
  subscribeToThreadMessages,
  type ChatMessage,
} from '@/lib/data/chat-actions';

const MAX = 4000;

export default function ChatThreadPage() {
  const { threadId = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const threads = useQuery({ queryKey: chatKeys.threads, queryFn: getMyChatThreads });
  const contacts = useQuery({ queryKey: chatKeys.contacts, queryFn: getChatContacts });
  const messages = useQuery({ queryKey: chatKeys.messages(threadId), queryFn: () => getChatMessages(threadId, 100), enabled: !!threadId });

  const thread = threads.data?.find((t) => t.threadId === threadId);
  const contact = thread?.otherUserId ? contacts.data?.find((c) => c.userId === thread.otherUserId) : undefined;

  useEffect(() => {
    if (!threadId) return;
    void markChatThreadRead(threadId).then(() => queryClient.invalidateQueries({ queryKey: chatKeys.threads }));
    const channel = subscribeToThreadMessages(threadId, (message) => {
      queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(threadId), (prev = []) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message],
      );
      if (message.senderId !== user?.id) void markChatThreadRead(threadId);
    });
    return () => {
      void removeChatSubscription(channel);
    };
  }, [threadId, queryClient, user?.id]);

  const sorted = useMemo(
    () => [...(messages.data ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [messages.data],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [sorted.length]);

  const send = useMutation({
    mutationFn: (text: string) => sendChatMessage(threadId, text),
    onSuccess: async () => {
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: chatKeys.messages(threadId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.threads });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  };

  const name = thread?.displayName ?? contact?.fullName ?? 'Чат';

  return (
    <div className="flex h-[100dvh] flex-col bg-bl-bg font-sans text-bl-ink">
      <header className="flex items-center gap-2.5 border-b border-bl-line bg-white pb-2.5 pl-1 pr-4 pt-3">
        <Link
          to="/chat"
          aria-label="Чаттарға оралу"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-bl-ink no-underline hover:bg-bl-soft"
        >
          <BackIcon />
        </Link>
        <Avatar name={name} url={thread?.displayAvatarUrl ?? contact?.avatarUrl} tone="soft" className="h-10 w-10 text-sm" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-base font-semibold">{name}</span>
          {contact ? <span className="text-[13px] text-bl-ink2">{CHAT_ROLE_LABEL[contact.role]}</span> : null}
        </span>
      </header>

      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2.5 p-4">
          {messages.isLoading ? <LoadingBlock rows={3} /> : null}
          {messages.isError ? <ErrorNote error={messages.error} onRetry={() => messages.refetch()} /> : null}
          {messages.data && !sorted.length ? (
            <p className="m-0 py-6 text-center text-sm text-bl-ink2">Әзірге хабарлама жоқ. Бірінші болып жазыңыз.</p>
          ) : null}
          {sorted.map((m, i) => {
            const mine = m.senderId === user?.id;
            const day = dayLabel(m.createdAt);
            const newDay = i === 0 || dayLabel(sorted[i - 1].createdAt) !== day;
            return (
              <Fragment key={m.id}>
                {newDay ? <span className="self-center text-xs text-bl-ink2">{day}</span> : null}
                <div className={mine ? 'flex max-w-[82%] flex-col items-end gap-[3px] self-end' : 'flex max-w-[82%] flex-col items-start gap-[3px] self-start'}>
                  <div
                    className={
                      mine
                        ? 'whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-bl-ink px-3.5 py-[11px] text-[15px] leading-[1.45] text-white'
                        : 'whitespace-pre-wrap rounded-[16px_16px_16px_4px] border border-bl-line bg-white px-3.5 py-[11px] text-[15px] leading-[1.45]'
                    }
                  >
                    {m.deletedAt ? <span className="italic opacity-70">Хабарлама өшірілді</span> : m.body}
                  </div>
                  <span className="text-[11px] text-bl-ink2">
                    {new Date(m.createdAt).toLocaleTimeString('kk-KZ', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </Fragment>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-bl-line bg-bl-bg">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2 px-4 pb-6 pt-2.5">
          {send.isError ? <ErrorNote error={send.error} /> : null}
          <div className="flex items-end gap-2">
            <label htmlFor="chat-msg" className="sr-only">
              Хабарлама
            </label>
            <textarea
              id="chat-msg"
              rows={1}
              value={draft}
              maxLength={MAX}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Хабарлама"
              className="box-border max-h-[120px] min-h-12 flex-1 resize-none rounded-[14px] border border-bl-field bg-white px-3.5 py-3 text-base leading-[1.4] text-bl-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink"
            />
            <button
              type="submit"
              aria-label="Жіберу"
              disabled={!draft.trim() || send.isPending}
              className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] border-0 bg-bl-btn text-white disabled:bg-bl-handle disabled:text-bl-ink3"
            >
              <SendIcon size={20} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
