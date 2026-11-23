// Әкімші (дизайн: Admin.dc.html; karta §2, D25): пайдаланушылар мен рөлдер, пәндер мен оқулықтар, сабақ модерациясы.
// Рөлді тек әкімші береді; мұғалім мен ата-ана аккаунты осылай ашылады.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { Badge, Banner, Button, EmptyNote, ErrorNote, LoadingBlock, Page, PageTitle, TextArea } from '@/components/bl/ui';
import { platformKeys as legacyKeys, useUsers } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { setUserRole } from '@/lib/classes-api';
import { createSubject } from '@/lib/data/course-actions';
import { getSubjects } from '@/lib/data/student-data';
import { useExaminerApi } from '@/lib/examiner-api';
import { LESSON_STATUS_TITLES, adminLessons, adminSetLessonStatus, platformKeys } from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

type AssignableRole = 'student' | 'teacher' | 'parent';
const ROLE_NAMES: Record<string, string> = { student: 'Оқушы', teacher: 'Мұғалім', parent: 'Ата-ана', admin: 'Әкімші' };

function RoleSwitch({ userId, name, role, onDone }: { userId: string; name: string; role: string; onDone: (text: string) => void }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (next: AssignableRole) => setUserRole(userId, next),
    onSuccess: async (_, next) => {
      await queryClient.invalidateQueries({ queryKey: legacyKeys.users });
      onDone(`${name} — енді ${ROLE_NAMES[next].toLowerCase()}`);
    },
  });
  if (role === 'admin') return <Badge tone="dark">Әкімші</Badge>;
  return (
    <div role="group" aria-label={`${name} рөлі`} className="inline-flex gap-0.5 rounded-[10px] bg-bl-soft p-[3px]">
      {(['student', 'teacher', 'parent'] as AssignableRole[]).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={role === r}
          disabled={change.isPending}
          onClick={() => role !== r && change.mutate(r)}
          className={cn(
            'h-8 rounded-lg border-0 px-2.5 text-[13px] font-semibold disabled:opacity-60',
            role === r ? 'bg-white text-bl-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'bg-transparent text-bl-ink3',
          )}
        >
          {ROLE_NAMES[r]}
        </button>
      ))}
    </div>
  );
}

export function AdminUsersPage() {
  const { user } = useAuth();
  const users = useUsers(true, 'kk');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (users.data ?? []).filter(
      (u) => (filter === 'all' || u.role === filter) && (!query || u.fullName.toLowerCase().includes(query) || u.userId.startsWith(query)),
    );
  }, [users.data, q, filter]);

  return (
    <AppShell>
      <Page wide>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em] lg:text-[32px]">Пайдаланушылар мен рөлдер</h1>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="admin-q" className="sr-only">
              Аты бойынша іздеу
            </label>
            <input
              id="admin-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Аты бойынша іздеу"
              className="box-border h-11 w-[260px] max-w-full rounded-xl border border-bl-field bg-white px-3.5 text-[15px] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink"
            />
            <label htmlFor="admin-role" className="sr-only">
              Рөл бойынша сүзу
            </label>
            <select
              id="admin-role"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-11 rounded-xl border border-bl-field bg-white px-3 text-[15px]"
            >
              <option value="all">Барлық рөл</option>
              {Object.entries(ROLE_NAMES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {toast ? (
          <p role="status" className="m-0 rounded-xl bg-bl-okbg px-4 py-3 text-sm font-semibold text-[#14532D]">
            {toast}
          </p>
        ) : null}
        {users.isLoading ? <LoadingBlock rows={5} /> : null}
        {users.isError ? <ErrorNote error={users.error} onRetry={() => users.refetch()} /> : null}
        {users.data ? (
          <section className="overflow-x-auto rounded-[18px] border border-bl-line bg-white">
            <table className="w-full min-w-[560px] border-collapse text-[15px]">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-bl-line px-5 py-3.5 text-left text-[13px] font-semibold text-bl-ink2">
                    Аты-жөні
                  </th>
                  <th scope="col" className="border-b border-bl-line px-3 py-3.5 text-left text-[13px] font-semibold text-bl-ink2">
                    Тіркелді
                  </th>
                  <th scope="col" className="border-b border-bl-line px-5 py-3.5 text-left text-[13px] font-semibold text-bl-ink2">
                    Рөл
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.userId}>
                    <th scope="row" className="border-b border-bl-soft px-5 py-3 text-left font-semibold">
                      {u.fullName}
                      {u.userId === user?.id ? <span className="ml-2 text-xs font-medium text-bl-ink2">сіз</span> : null}
                    </th>
                    <td className="border-b border-bl-soft px-3 py-3 text-bl-ink3">{formatDateTime(u.createdAt)}</td>
                    <td className="border-b border-bl-soft px-5 py-2">
                      <RoleSwitch userId={u.userId} name={u.fullName} role={u.role} onDone={setToast} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <p className="m-0 p-6 text-center text-sm text-bl-ink2">Ешкім табылмады</p> : null}
          </section>
        ) : null}
        <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
          Тіркелген адам әдепкіде оқушы болады. Мұғалім мен ата-ана рөлін осы жерден беріңіз: олар алғаш кіргенде құпиясөз қояды.
        </p>
      </Page>
    </AppShell>
  );
}

export function AdminSubjectsPage() {
  const queryClient = useQueryClient();
  const api = useExaminerApi();
  const subjects = useQuery({ queryKey: legacyKeys.subjects, queryFn: getSubjects });
  const catalog = useQuery({ queryKey: ['examiner', 'subjects'], queryFn: api.subjects });
  const [name, setName] = useState('');

  const add = useMutation({
    mutationFn: () => {
      const clean = name.trim();
      const slug =
        clean
          .toLowerCase()
          .replace(/[^a-zа-яәіңғүұқөһ0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || `subject-${Date.now()}`;
      return createSubject({ slug, nameKk: clean });
    },
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: legacyKeys.subjects });
    },
  });

  const booksBySubject = useMemo(() => new Map((catalog.data ?? []).map((s) => [s.subject_id, s.books])), [catalog.data]);
  const list = (subjects.data ?? []) as { id: string; name_kk: string; slug: string }[];

  return (
    <AppShell>
      <Page wide>
        <PageTitle title="Пәндер мен оқулықтар" subtitle="Тьютор, Емтихан және Ойындар тек корпусы жүктелген оқулықпен жұмыс істейді." />
        {subjects.isLoading ? <LoadingBlock rows={4} /> : null}
        {subjects.isError ? <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} /> : null}
        {list.length ? (
          <section className="overflow-hidden rounded-[18px] border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
            {list.map((s) => {
              const books = booksBySubject.get(s.id) ?? [];
              return (
                <div key={s.id} className="flex min-h-[60px] flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                    <span className="text-base font-semibold">{s.name_kk}</span>
                    <span className="text-[13px] text-bl-ink2">
                      {books.length ? books.map((b) => `${b.title} · ${b.grade}-сынып`).join(', ') : 'Оқулық жоқ'}
                    </span>
                  </span>
                  <Badge tone={books.length ? 'good' : 'warn'}>{books.length ? 'Корпус жүктелген' : 'Корпус жоқ'}</Badge>
                </div>
              );
            })}
          </section>
        ) : subjects.data ? (
          <EmptyNote>Әзірге пән жоқ.</EmptyNote>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) add.mutate();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-subject" className="text-sm font-semibold">
              Жаңа пән
            </label>
            <input
              id="new-subject"
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Биология"
              className="box-border h-11 w-[260px] max-w-full rounded-xl border border-bl-field bg-white px-3.5 text-[15px] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink"
            />
          </div>
          <Button type="submit" size="sm" full={false} disabled={name.trim().length < 2} loading={add.isPending}>
            Қосу
          </Button>
        </form>
        {add.isError ? <ErrorNote error={add.error} /> : null}
        <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">Оқулық корпусын жүктеу — сервер жағындағы ingest құралы арқылы.</p>
      </Page>
    </AppShell>
  );
}

export function AdminLessonsPage() {
  const queryClient = useQueryClient();
  const lessons = useQuery({ queryKey: platformKeys.adminLessons, queryFn: adminLessons });
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const set = useMutation({
    mutationFn: ({ id, status, feedback }: { id: string; status: 'published' | 'hidden'; feedback?: string }) => adminSetLessonStatus(id, status, feedback),
    onSuccess: async () => {
      setEditing(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: platformKeys.adminLessons });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'lessons'] });
    },
  });

  return (
    <AppShell>
      <Page wide>
        <PageTitle title="Сабақ модерациясы" subtitle="Жасырылған сабақ каталогтан кетеді. Себебі мұғалімге жіберіледі." />
        {lessons.isLoading ? <LoadingBlock rows={3} /> : null}
        {lessons.isError ? <ErrorNote error={lessons.error} onRetry={() => lessons.refetch()} /> : null}
        {set.isError ? <ErrorNote error={set.error} /> : null}
        {lessons.data && !lessons.data.length ? <EmptyNote>Жарияланған не жасырылған сабақ жоқ.</EmptyNote> : null}
        <div className="flex flex-col gap-3">
          {lessons.data?.map((l) => (
            <section key={l.id} className="flex flex-col gap-2.5 rounded-[18px] border border-bl-line bg-white px-5 py-[18px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <Link to={`/lessons/${l.id}`} className="text-base font-semibold text-bl-ink no-underline hover:underline">
                    {l.title}
                  </Link>
                  <span className="text-[13px] text-bl-ink2">
                    {l.author_name} · {formatDateTime(l.updated_at)}
                  </span>
                </span>
                <Badge tone={l.status === 'published' ? 'good' : 'warn'}>{LESSON_STATUS_TITLES[l.status]}</Badge>
              </div>
              {editing === l.id ? (
                <>
                  <label htmlFor={`reason-${l.id}`} className="text-sm font-semibold">
                    Себебі (мұғалімге көрінеді)
                  </label>
                  <TextArea id={`reason-${l.id}`} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className="min-h-20" />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      full={false}
                      disabled={reason.trim().length < 3}
                      loading={set.isPending}
                      onClick={() => set.mutate({ id: l.id, status: 'hidden', feedback: reason.trim() })}
                    >
                      Жасыру
                    </Button>
                    <Button variant="secondary" size="sm" full={false} onClick={() => setEditing(null)} disabled={set.isPending}>
                      Болдырмау
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  full={false}
                  className="h-10 self-start rounded-[10px]"
                  disabled={set.isPending}
                  onClick={() => {
                    if (l.status === 'published') {
                      setEditing(l.id);
                      setReason('');
                    } else set.mutate({ id: l.id, status: 'published' });
                  }}
                >
                  {l.status === 'published' ? 'Жасыру' : 'Қайта ашу'}
                </Button>
              )}
            </section>
          ))}
        </div>
        <Banner tone="info">Мұғалім өз сабағын жобаға қайтарып, түзете алады, бірақ жасырылған сабақты тек әкімші қайта ашады.</Banner>
      </Page>
    </AppShell>
  );
}
