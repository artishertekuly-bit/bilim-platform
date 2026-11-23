// Ата-ана · «Балам» (дизайн: Parent.dc.html; karta §2.1, D26, D27): баланың P1…P4 нәтижесі тек оқу режимінде,
// баланың мұғалімдері және чат. Ата-ана Тьютор диалогтарын, жауаптарды, рейтингті және дабылдарды көрмейді.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import Avatar from '@/components/bl/Avatar';
import { ButtonLink, Card, EmptyNote, ErrorNote, ListGroup, LoadingBlock, Page, PageTitle, Section, Segmented, StateCard } from '@/components/bl/ui';
import { LevelGrid } from '@/components/exam/LevelGrid';
import { chatKeys } from '@/lib/chat-ui';
import { getChatContacts } from '@/lib/data/chat-actions';
import { useExaminerApi } from '@/lib/examiner-api';
import { myChildren, outgoingParentRequests, platformKeys, type ChildRow } from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';

function ChildResults({ child }: { child: ChildRow }) {
  const api = useExaminerApi();
  const profile = useQuery({
    queryKey: ['examiner', 'parent', 'child', child.student_id],
    queryFn: () => api.parentChildProfile(child.student_id),
  });
  return (
    <Section label="Емтихан нәтижелері">
      {profile.isLoading ? <LoadingBlock rows={2} /> : null}
      {profile.isError ? <ErrorNote error={profile.error} onRetry={() => profile.refetch()} /> : null}
      {profile.data && !profile.data.subjects.length ? <EmptyNote>Әзірге «Пән» көлеміндегі емтихан нәтижесі жоқ.</EmptyNote> : null}
      {profile.data?.subjects.map((s) =>
        s.levels.some((l) => l.p !== null) ? (
          <Card key={s.subject.book} className="flex flex-col gap-2.5 p-3.5">
            <span className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold">{s.subject.title}</span>
              {s.f !== null ? (
                <span className="text-sm font-semibold">
                  F {Math.round(s.f)}%{s.f_is_final === false ? ' · алдын ала' : ''}
                </span>
              ) : null}
            </span>
            <LevelGrid levels={s.levels} />
          </Card>
        ) : (
          <div key={s.subject.book} className="flex items-center justify-between rounded-2xl border border-bl-line bg-white p-3.5">
            <span className="text-base font-semibold">{s.subject.title}</span>
            <span className="text-[13px] text-bl-ink2">Барлық деңгей өтпеді</span>
          </div>
        ),
      )}
    </Section>
  );
}

export default function ParentHomePage() {
  const navigate = useNavigate();
  const children = useQuery({ queryKey: platformKeys.children, queryFn: myChildren });
  const requests = useQuery({ queryKey: platformKeys.outgoing, queryFn: outgoingParentRequests });
  const contacts = useQuery({ queryKey: chatKeys.contacts, queryFn: getChatContacts });
  const [childId, setChildId] = useState<string | null>(null);

  useEffect(() => {
    const list = children.data;
    if (list?.length && (!childId || !list.some((c) => c.student_id === childId))) setChildId(list[0].student_id);
  }, [children.data, childId]);

  const child = children.data?.find((c) => c.student_id === childId) ?? null;
  const teachers = (contacts.data ?? []).filter((c) => c.role === 'teacher');
  const pending = (requests.data ?? []).filter((r) => r.status === 'pending');

  return (
    <AppShell>
      <Page>
        <PageTitle title="Балам" />
        {children.isLoading ? <LoadingBlock rows={3} /> : null}
        {children.isError ? <ErrorNote error={children.error} onRetry={() => children.refetch()} /> : null}

        {children.data && !children.data.length ? (
          <StateCard
            title={pending.length ? 'Баланың растауын күтудеміз' : 'Бала әлі қосылмаған'}
            text={
              pending.length
                ? `${pending.map((r) => r.child_email).join(', ')} сұранысты растағанда нәтижелері осында көрінеді.`
                : 'Баланың Bilim аккаунтындағы email-ын енгізіңіз. Ол сұранысты өз Хабарламаларында растайды.'
            }
          >
            <ButtonLink to="/parent/link">Баланы қосу</ButtonLink>
          </StateCard>
        ) : null}

        {children.data && children.data.length > 1 ? (
          <Segmented
            label="Бала"
            value={childId ?? ''}
            onChange={setChildId}
            options={children.data.map((c) => ({ id: c.student_id, label: c.full_name.split(/\s+/)[0] }))}
          />
        ) : null}

        {child ? (
          <>
            <div className="flex items-center gap-3.5 rounded-2xl border border-bl-line bg-white p-3.5">
              <Avatar name={child.full_name} url={child.avatar_url} size="md" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[17px] font-semibold">{child.full_name}</span>
                <span className="text-sm text-bl-ink2">Байланыс расталды · {formatDateTime(child.linked_at)}</span>
              </span>
            </div>

            <ChildResults key={child.student_id} child={child} />

            <div className="flex gap-2.5 rounded-[14px] border border-bl-line bg-white px-4 py-3.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none text-bl-ink3">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <p className="m-0 text-sm leading-[1.45] text-bl-ink3">
                Мұнда тек нәтижелер көрінеді. Баланың Тьютормен диалогтары мен емтихандағы жауаптары жеке болып қалады.
              </p>
            </div>

            <Section label="Мұғалімдер">
              {contacts.isError ? <ErrorNote error={contacts.error} onRetry={() => contacts.refetch()} /> : null}
              {contacts.data && !teachers.length ? <EmptyNote>Бала сыныпқа қосылғанда мұғалімдері осында көрінеді.</EmptyNote> : null}
              {teachers.length ? (
                <ListGroup>
                  {teachers.map((t) => (
                    <div key={t.userId} className="flex items-center gap-3 px-3.5 py-3">
                      <Avatar name={t.fullName} url={t.avatarUrl} tone="soft" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold">{t.fullName}</span>
                        <span className="text-[13px] text-bl-ink2">Мұғалім</span>
                      </span>
                      <button
                        type="button"
                        aria-label={`${t.fullName} мұғалімге жазу`}
                        onClick={() => navigate('/chat', { state: { with: t.userId } })}
                        className="h-11 flex-none rounded-xl border-0 bg-bl-btn px-4 text-sm font-semibold text-white"
                      >
                        Жазу
                      </button>
                    </div>
                  ))}
                </ListGroup>
              ) : null}
            </Section>
          </>
        ) : null}
      </Page>
    </AppShell>
  );
}
