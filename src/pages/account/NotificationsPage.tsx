// Хабарламалар (дизайн: Notifications.dc.html): ата-ана байланысының сұранысы (оқушы растайды, D26)
// және «Бүгін / Осы аптада / Ертерек» тізімі.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { homePathFor } from '@/components/bl/nav';
import { EmptyNote, ErrorNote, LoadingBlock, Page, Section, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationGroup,
  notificationKeys,
  safeNotificationLink,
  type AppNotification,
} from '@/lib/notifications-api';
import { incomingParentRequests, platformKeys, respondParentLink } from '@/lib/platform-api';
import { cn } from '@/lib/utils';

const GROUP_TITLES = { today: 'Бүгін', week: 'Осы аптада', earlier: 'Ертерек' } as const;

function timeOf(iso: string, group: keyof typeof GROUP_TITLES) {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString('kk-KZ', { hour: '2-digit', minute: '2-digit' });
  return group === 'today' ? hm : `${d.toLocaleDateString('kk-KZ', { day: 'numeric', month: 'short' })}, ${hm}`;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [done, setDone] = useState<string | null>(null);
  const isStudent = user?.role === 'student';

  const list = useQuery({ queryKey: notificationKeys.list, queryFn: () => listNotifications() });
  const incoming = useQuery({ queryKey: platformKeys.incoming, queryFn: incomingParentRequests, enabled: isStudent });
  const pending = (incoming.data ?? []).filter((r) => r.status === 'pending');

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondParentLink(id, accept),
    onSuccess: async (_, v) => {
      setDone(v.accept ? 'Ата-ана байланысы расталды' : 'Сұраныс қабылданбады');
      await queryClient.invalidateQueries({ queryKey: platformKeys.incoming });
    },
  });

  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(user!.id),
    onSuccess: () => queryClient.setQueryData<AppNotification[]>(notificationKeys.list, (prev = []) => prev.map((n) => ({ ...n, is_read: true }))),
  });

  const groups = (['today', 'week', 'earlier'] as const)
    .map((g) => ({ g, items: (list.data ?? []).filter((n) => notificationGroup(n.created_at) === g) }))
    .filter((x) => x.items.length);
  const hasUnread = (list.data ?? []).some((n) => !n.is_read);
  const back = isStudent ? '/profile' : user?.role === 'parent' ? '/settings' : homePathFor(user?.role);

  return (
    <AppShell nav={false}>
      <TopBar
        back={back}
        backLabel={isStudent ? 'Профильге оралу' : user?.role === 'parent' ? 'Баптауларға оралу' : 'Басты бетке оралу'}
        title="Хабарламалар"
        right={
          hasUnread ? (
            <button
              type="button"
              onClick={() => readAll.mutate()}
              disabled={readAll.isPending}
              className="-mr-2 h-11 border-0 bg-transparent px-2.5 text-sm font-semibold text-bl-ink"
            >
              Бәрін оқыдым
            </button>
          ) : undefined
        }
      />
      <Page className="gap-4 pt-2">
        {pending.map((r) => (
          <section key={r.id} className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4">
            <span className="text-[13px] font-semibold text-bl-ink2">Ата-ана байланысы</span>
            <span className="text-base font-semibold leading-[1.4]">{r.parent_name} сізді баласы ретінде қосқысы келеді</span>
            <span className="text-sm leading-[1.45] text-bl-ink3">
              Растасаңыз, ол тек емтихан нәтижелеріңізді көреді. Тьютор диалогтары мен жауаптарыңыз жеке қалады.
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: r.id, accept: false })}
                className="h-12 rounded-xl border border-bl-field bg-white text-[15px] font-semibold text-bl-ink disabled:opacity-60"
              >
                Қабылдамау
              </button>
              <button
                type="button"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: r.id, accept: true })}
                className="h-12 rounded-xl border-0 bg-bl-btn text-[15px] font-semibold text-white disabled:opacity-60"
              >
                Растау
              </button>
            </div>
          </section>
        ))}
        {done ? (
          <p role="status" className="m-0 rounded-xl bg-bl-soft px-3.5 py-3 text-sm font-semibold">
            {done}
          </p>
        ) : null}
        {respond.isError ? <ErrorNote error={respond.error} /> : null}
        {readAll.isError ? <ErrorNote error={readAll.error} /> : null}

        {list.isLoading ? <LoadingBlock rows={3} /> : null}
        {list.isError ? <ErrorNote error={list.error} onRetry={() => list.refetch()} /> : null}
        {list.data && !list.data.length && !pending.length ? (
          <EmptyNote>{isStudent ? 'Әзірге хабарлама жоқ. Ата-ана сізді email арқылы қосса, сұраныс осында шығады.' : 'Әзірге хабарлама жоқ.'}</EmptyNote>
        ) : null}

        {groups.map(({ g, items }) => (
          <Section key={g} label={GROUP_TITLES[g]}>
            <div className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
              {items.map((n) => {
                const href = safeNotificationLink(n.link);
                const body = (
                  <>
                    <span aria-hidden="true" className={cn('mt-1.5 h-2.5 w-2.5 flex-none rounded-full', n.is_read ? 'bg-transparent' : 'bg-bl-ink')} />
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className={cn('text-[15px]', n.is_read ? 'font-medium' : 'font-bold')}>
                        {n.title}
                        {!n.is_read ? <span className="sr-only"> · оқылмаған</span> : null}
                      </span>
                      <span className="text-sm leading-[1.4] text-bl-ink3">{n.message}</span>
                      <span className="text-xs text-bl-ink2">{timeOf(n.created_at, g)}</span>
                    </span>
                  </>
                );
                return href ? (
                  <Link
                    key={n.id}
                    to={href}
                    onClick={() => {
                      if (!n.is_read) void markNotificationRead(n.id);
                    }}
                    className="flex items-start gap-3 px-4 py-3.5 text-bl-ink no-underline hover:bg-[#FBFAF8]"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3.5">
                    {body}
                  </div>
                );
              })}
            </div>
          </Section>
        ))}
      </Page>
    </AppShell>
  );
}
