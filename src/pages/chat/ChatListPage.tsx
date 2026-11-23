// Чаттар тізімі (дизайн: TeacherChats.dc.html, ParentChats.dc.html; api §5.3, D24, D28).
// Чат тек мұғалім ↔ сынып оқушысы және мұғалім ↔ оның ата-анасы арасында.
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import Avatar from '@/components/bl/Avatar';
import { CountBadge, EmptyNote, ErrorNote, LoadingBlock, Page, PageTitle, Section, Segmented, TopBar } from '@/components/bl/ui';
import { useAuth, type UserRole } from '@/lib/auth-context';
import { CHAT_ROLE_LABEL as ROLE_LABEL, chatKeys, chatTime } from '@/lib/chat-ui';
import { getChatContacts, getMyChatThreads, getOrCreateDirectChat, type ChatContact } from '@/lib/data/chat-actions';
import { cn } from '@/lib/utils';

const FOOTNOTE: Record<UserRole, string> = {
  teacher: 'Чат тек сіздің сыныптарыңыздың оқушыларымен және олардың ата-аналарымен ашық.',
  student: 'Чат тек сыныбыңыздың мұғалімдерімен ашық.',
  parent: 'Чат балаңыздың мұғалімдерімен ашық.',
  admin: 'Әкімшіге чат қолжетімді емес.',
};

type Filter = 'all' | 'student' | 'parent';

export default function ChatListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role ?? 'student';
  const [filter, setFilter] = useState<Filter>('all');

  const threads = useQuery({ queryKey: chatKeys.threads, queryFn: getMyChatThreads, refetchInterval: 30_000 });
  const contacts = useQuery({ queryKey: chatKeys.contacts, queryFn: getChatContacts });
  const contactById = useMemo(() => new Map((contacts.data ?? []).map((c) => [c.userId, c])), [contacts.data]);

  const open = useMutation({
    mutationFn: (userId: string) => getOrCreateDirectChat(userId),
    onSuccess: (threadId) => navigate(`/chat/${threadId}`, { replace: Boolean((location.state as { with?: string } | null)?.with) }),
  });

  // Профильдегі «Жазу» батырмасы: /chat-қа { with: userId } күйімен келеді.
  const withUser = (location.state as { with?: string } | null)?.with;
  useEffect(() => {
    if (withUser && !open.isPending && !open.isSuccess && !open.isError) open.mutate(withUser);
  }, [withUser, open]);

  const withThread = new Set((threads.data ?? []).map((t) => t.otherUserId).filter(Boolean));
  const roleOf = (id: string | null) => (id ? contactById.get(id)?.role : undefined);
  const shown = (threads.data ?? []).filter((t) => filter === 'all' || roleOf(t.otherUserId) === filter);
  const fresh: ChatContact[] = (contacts.data ?? []).filter(
    (c) => !withThread.has(c.userId) && (filter === 'all' || c.role === filter),
  );

  return (
    <AppShell nav={role !== 'student'}>
      {role === 'student' ? <TopBar back="/profile" backLabel="Профильге оралу" title="Чат" /> : null}
      <Page className={cn('gap-4', role === 'student' && 'pt-2')}>
        {role !== 'student' ? <PageTitle title="Чат" /> : null}

        {role === 'teacher' ? (
          <Segmented<Filter>
            label="Чат сүзгісі"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'Барлығы' },
              { id: 'student', label: 'Оқушылар' },
              { id: 'parent', label: 'Ата-аналар' },
            ]}
          />
        ) : null}

        {threads.isLoading ? <LoadingBlock rows={4} /> : null}
        {threads.isError ? <ErrorNote error={threads.error} onRetry={() => threads.refetch()} /> : null}
        {open.isError ? <ErrorNote error={open.error} /> : null}

        {shown.length ? (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
            {shown.map((t) => {
              const r = roleOf(t.otherUserId);
              return (
                <button
                  key={t.threadId}
                  type="button"
                  onClick={() => navigate(`/chat/${t.threadId}`)}
                  className="flex w-full items-center gap-3 border-0 bg-white px-3.5 py-3 text-left text-bl-ink hover:bg-[#FBFAF8]"
                >
                  <Avatar name={t.displayName} url={t.displayAvatarUrl} tone="soft" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex justify-between gap-2">
                      <span className={cn('truncate text-[15px]', t.unreadCount ? 'font-bold' : 'font-semibold')}>{t.displayName}</span>
                      <span className="whitespace-nowrap text-xs text-bl-ink2">{chatTime(t.lastMessageCreatedAt ?? t.lastMessageAt)}</span>
                    </span>
                    {r ? <span className="text-xs text-bl-ink2">{ROLE_LABEL[r]}</span> : null}
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-bl-ink3">{t.lastMessageBody ?? 'Әзірге хабарлама жоқ'}</span>
                      <CountBadge count={t.unreadCount} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : threads.data && !fresh.length ? (
          <EmptyNote>Әзірге чат жоқ.</EmptyNote>
        ) : null}

        {fresh.length ? (
          <Section label="Жаңа чат бастау">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
              {fresh.map((c) => (
                <div key={c.userId} className="flex items-center gap-3 px-3.5 py-3">
                  <Avatar name={c.fullName} url={c.avatarUrl} tone="soft" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{c.fullName}</span>
                    <span className="text-[13px] text-bl-ink2">{ROLE_LABEL[c.role]}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => open.mutate(c.userId)}
                    disabled={open.isPending}
                    className="h-11 flex-none rounded-xl border-0 bg-bl-btn px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Жазу
                  </button>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">{FOOTNOTE[role]}</p>
      </Page>
    </AppShell>
  );
}
