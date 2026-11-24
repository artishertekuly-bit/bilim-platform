// Білім басқармасы (D90; дизайн: Admin.dc.html «Басқармалар», Department.dc.html).
// Платформа иесі басқарма ашады, кодын жаңартады, әкімшісін (басшысын) email бойынша тағайындайды.
// Басқарма әкімшісі тек өз мұғалімдері мен солардың сыныптарындағы оқушыларды көреді.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import AppShell from '@/components/bl/AppShell';
import { Badge, Button, ConfirmSheet, CountBadge, EmptyNote, ErrorNote, LoadingBlock, Page, PageTitle } from '@/components/bl/ui';
import {
  type HeadTeacher,
  departmentKeys,
  headApproveTeacher,
  headDeclineTeacher,
  headOverview,
  headRemoveTeacher,
  headRotateCode,
  headStudents,
  headTeachers,
  ownerAppointHead,
  ownerCreateDepartment,
  ownerDepartmentMembers,
  ownerDepartments,
  ownerRemoveHead,
  ownerRotateDepartmentCode,
  percent,
} from '@/lib/departments-api';
import { formatDateTime } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

const inputCls =
  'box-border h-11 rounded-xl border border-bl-field bg-white px-3.5 text-[15px] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink';
const thCls = 'border-b border-bl-line px-3 py-3.5 text-left text-[13px] font-semibold text-bl-ink2';
const tdCls = 'border-b border-bl-soft px-3 py-3 text-bl-ink3';

function useToast(): [string | null, (text: string | null) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);
  return [toast, setToast];
}

function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="status" className="m-0 rounded-xl bg-bl-okbg px-4 py-3 text-sm font-semibold text-[#14532D]">
      {text}
    </p>
  );
}

function CodeBox({ code, onRotate, rotating, big }: { code: string; onRotate: () => void; rotating: boolean; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', !big && 'rounded-[14px] bg-bl-bg px-3.5 py-3')}>
      <span className="flex flex-col gap-0.5">
        {!big ? <span className="text-[13px] font-semibold text-bl-ink2">Мұғалімдерге арналған код</span> : null}
        <span
          aria-label={`Басқарма коды: ${code.split('').join(' ')}`}
          className={cn('font-bold tabular-nums', big ? 'text-[34px] tracking-[0.18em]' : 'text-[22px] tracking-[0.16em]')}
        >
          {code}
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        {big ? (
          <Button
            size="sm"
            full={false}
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? 'Көшірілді' : 'Көшіру'}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" full={false} loading={rotating} onClick={onRotate}>
          Жаңа код
        </Button>
      </span>
    </div>
  );
}

/* ═════════════════════════ Платформа иесі: басқармалар ═════════════════════════ */

export function OwnerDepartmentsPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: departmentKeys.owner, queryFn: ownerDepartments });
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [email, setEmail] = useState('');
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const departments = list.data ?? [];
  const sel = departments.find((d) => d.department_id === selected) ?? departments[0] ?? null;
  const members = useQuery({
    queryKey: departmentKeys.members(sel?.department_id ?? 'none'),
    queryFn: () => ownerDepartmentMembers(sel!.department_id),
    enabled: !!sel,
  });
  const heads = (members.data ?? []).filter((m) => m.member_role === 'head');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: departmentKeys.owner });
  };

  const create = useMutation({
    mutationFn: () => ownerCreateDepartment(name, region),
    onSuccess: async (d) => {
      setToast(`${name.trim()} ашылды. Коды: ${d.join_code}`);
      setName('');
      setRegion('');
      setSelected(d.department_id);
      await refresh();
    },
  });
  const rotate = useMutation({
    mutationFn: (id: string) => ownerRotateDepartmentCode(id),
    onSuccess: async () => {
      setToast('Жаңа код шықты. Ескі код енді жарамайды.');
      await refresh();
    },
  });
  const appoint = useMutation({
    mutationFn: (id: string) => ownerAppointHead(id, email),
    onSuccess: async (h) => {
      setToast(`${h.full_name} — ${sel?.name ?? 'басқарма'} әкімшісі`);
      setEmail('');
      await refresh();
    },
  });
  const removeHead = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => ownerRemoveHead(id, userId),
    onSuccess: async () => {
      setToast(`${removing?.name ?? 'Басшы'} басшылықтан алынды, рөлі — оқушы`);
      setRemoving(null);
      await refresh();
    },
  });

  // refresh() басқарма тізімімен бірге мүшелер кэшін де жаңартады: кілттері ['departments', 'owner', …].
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <AppShell>
      <Page wide>
        <PageTitle
          title="Білім басқармалары"
          subtitle="Әр басқарманың әкімшісі (басшысы) тек өз мұғалімдері мен солардың оқушыларын көреді."
        />
        <Toast text={toast} />
        {list.isLoading ? <LoadingBlock rows={3} /> : null}
        {list.isError ? <ErrorNote error={list.error} onRetry={() => list.refetch()} /> : null}
        {list.data && !departments.length ? <EmptyNote>Әзірге басқарма жоқ. Төменнен біріншісін ашыңыз.</EmptyNote> : null}

        {sel ? (
          <div className="flex flex-wrap items-start gap-4">
            <section aria-label="Басқармалар тізімі" className="min-w-0 flex-[1_1_360px] overflow-hidden rounded-[18px] border border-bl-line bg-white">
              {departments.map((d) => {
                const on = d.department_id === sel.department_id;
                return (
                  <button
                    key={d.department_id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(d.department_id)}
                    className={cn(
                      'flex min-h-[68px] w-full items-center gap-3 border-0 border-b border-bl-soft px-5 py-3 text-left text-bl-ink last:border-b-0',
                      on ? 'bg-bl-bg shadow-[inset_3px_0_0_#111111]' : 'bg-white hover:bg-[#FBFAF8]',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-base font-semibold">{d.name}</span>
                      <span className="text-[13px] text-bl-ink2">
                        {d.heads ? `Басшы: ${d.heads}` : 'Басшы жоқ'} · {d.teacher_count} мұғалім · {d.student_count} оқушы
                      </span>
                    </span>
                    <Badge tone={d.pending_count ? 'warn' : d.heads ? 'good' : 'neutral'}>
                      {d.pending_count ? `${d.pending_count} өтінім` : d.heads ? 'Белсенді' : 'Басшы керек'}
                    </Badge>
                  </button>
                );
              })}
            </section>

            <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5 rounded-[18px] border border-bl-line bg-white p-5">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-xl font-bold">{sel.name}</h2>
                {sel.region ? <span className="text-sm text-bl-ink2">{sel.region}</span> : null}
              </div>
              <CodeBox code={sel.join_code} rotating={rotate.isPending} onRotate={() => rotate.mutate(sel.department_id)} />
              {rotate.isError ? <ErrorNote error={rotate.error} /> : null}

              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[15px] font-bold">Әкімші (басшы)</h3>
                {members.isLoading ? <LoadingBlock rows={1} /> : null}
                {heads.map((h) => (
                  <div key={h.user_id} className="flex items-center gap-3 py-1.5">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold">{h.full_name}</span>
                      <span className="break-all text-[13px] text-bl-ink2">{h.email}</span>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      full={false}
                      className="h-9 text-[13px] text-bl-danger"
                      onClick={() => setRemoving({ id: h.user_id, name: h.full_name })}
                    >
                      Алып тастау
                    </Button>
                  </div>
                ))}
                {members.data && !heads.length ? <p className="m-0 text-sm text-bl-ink2">Басшы тағайындалмаған.</p> : null}
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (emailOk) appoint.mutate(sel.department_id);
                  }}
                >
                  <label htmlFor="head-email" className="text-sm font-semibold">
                    Басшыны email бойынша тағайындау
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      id="head-email"
                      type="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="bolim@edu.kz"
                      className={cn(inputCls, 'min-w-0 flex-[1_1_200px]')}
                    />
                    <Button type="submit" size="sm" full={false} className="h-11" disabled={!emailOk} loading={appoint.isPending}>
                      Тағайындау
                    </Button>
                  </div>
                  <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
                    Адам алдымен тіркелуі керек. Сыныбы бар мұғалімді басшы етуге болмайды.
                  </p>
                  {appoint.isError ? <ErrorNote error={appoint.error} /> : null}
                </form>
              </div>
              <div className="flex gap-4 text-sm text-bl-ink3">
                <span>{sel.teacher_count} мұғалім</span>
                <span>{sel.student_count} оқушы</span>
                {sel.pending_count ? <span>{sel.pending_count} өтінім күтіп тұр</span> : null}
              </div>
            </section>
          </div>
        ) : null}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 3) create.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dept-name" className="text-sm font-semibold">
              Жаңа басқарма
            </label>
            <input
              id="dept-name"
              type="text"
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Талғар аудандық білім бөлімі"
              className={cn(inputCls, 'w-[320px] max-w-full')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dept-region" className="text-sm font-semibold">
              Өңір
            </label>
            <input
              id="dept-region"
              type="text"
              maxLength={120}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Алматы облысы"
              className={cn(inputCls, 'w-[220px] max-w-full')}
            />
          </div>
          <Button type="submit" size="sm" full={false} className="h-11" disabled={name.trim().length < 3} loading={create.isPending}>
            Ашу
          </Button>
        </form>
        {create.isError ? <ErrorNote error={create.error} /> : null}

        <ConfirmSheet
          open={!!removing}
          onClose={() => setRemoving(null)}
          title="Басшыны алып тастайсыз ба?"
          description={`${removing?.name ?? ''} басқарманы енді көрмейді, рөлі оқушыға ауысады. Мұғалімдер мен оқушылар басқармада қалады.`}
          confirmLabel="Алып тастау"
          busy={removeHead.isPending}
          onConfirm={() => sel && removing && removeHead.mutate({ id: sel.department_id, userId: removing.id })}
        />
      </Page>
    </AppShell>
  );
}

/* ═════════════════════════ Басқарма әкімшісі ═════════════════════════ */

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-bl-line bg-white px-5 py-[18px]">
      <span className="text-[13px] font-semibold text-bl-ink2">{label}</span>
      <span className="text-[30px] font-bold tracking-[-0.02em]">{value}</span>
      <span className="text-[13px] text-bl-ink2">{hint}</span>
    </div>
  );
}

function usePendingActions(setToast: (text: string) => void) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: departmentKeys.teachers }),
      queryClient.invalidateQueries({ queryKey: departmentKeys.overview }),
    ]);
  const approve = useMutation({
    mutationFn: (t: HeadTeacher) => headApproveTeacher(t.user_id),
    onSuccess: async (_, t) => {
      setToast(`${t.full_name} мұғалім ретінде басқармаға қосылды`);
      await refresh();
    },
  });
  const decline = useMutation({
    mutationFn: (t: HeadTeacher) => headDeclineTeacher(t.user_id),
    onSuccess: async (_, t) => {
      setToast(`${t.full_name} өтінімі қабылданбады`);
      await refresh();
    },
  });
  return { approve, decline };
}

function PendingRow({ t, actions }: { t: HeadTeacher; actions: ReturnType<typeof usePendingActions> }) {
  const busy = actions.approve.isPending || actions.decline.isPending;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-bl-soft py-3">
      <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold">{t.full_name}</span>
        <span className="break-all text-[13px] text-bl-ink2">
          {t.email} · {formatDateTime(t.requested_at)}
        </span>
      </span>
      <Button variant="secondary" size="sm" full={false} className="h-10" disabled={busy} onClick={() => actions.decline.mutate(t)}>
        Қабылдамау
      </Button>
      <Button size="sm" full={false} className="h-10" disabled={busy} onClick={() => actions.approve.mutate(t)}>
        Растау
      </Button>
    </div>
  );
}

export function HeadHomePage() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: departmentKeys.overview, queryFn: headOverview });
  const teachers = useQuery({ queryKey: departmentKeys.teachers, queryFn: headTeachers });
  const [toast, setToast] = useToast();
  const actions = usePendingActions(setToast);
  const rotate = useMutation({
    mutationFn: headRotateCode,
    onSuccess: async () => {
      setToast('Жаңа код шықты. Ескі код енді жарамайды.');
      await queryClient.invalidateQueries({ queryKey: departmentKeys.overview });
    },
  });
  const pending = (teachers.data ?? []).filter((t) => t.status === 'pending');
  const o = overview.data;

  return (
    <AppShell>
      <Page wide>
        {overview.isLoading ? <LoadingBlock rows={4} /> : null}
        {overview.isError ? <ErrorNote error={overview.error} onRetry={() => overview.refetch()} /> : null}
        {o ? (
          <>
            <PageTitle
              title={o.name}
              subtitle={`${o.region ? `${o.region} · ` : ''}сіз тек осы басқармадағы мұғалімдер мен олардың оқушыларын көресіз`}
            />
            <Toast text={toast} />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <StatCard
                label="Мұғалім"
                value={String(o.teacher_count)}
                hint={o.pending_count ? `${o.pending_count} өтінім күтіп тұр` : 'бәрі расталған'}
              />
              <StatCard label="Оқушы" value={String(o.student_count)} hint={`${o.class_count} сыныпта`} />
              <StatCard label="7 күндегі сессия" value={String(o.sessions_7d)} hint="аяқталған емтихан" />
              <StatCard label="Орташа нәтиже" value={percent(o.avg_p_7d)} hint="соңғы 7 күн" />
            </div>
            <div className="flex flex-wrap items-stretch gap-4">
              <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-[18px] border border-bl-line bg-white p-5">
                <h2 className="m-0 text-lg font-bold">Басқарма коды</h2>
                <CodeBox code={o.join_code} big rotating={rotate.isPending} onRotate={() => rotate.mutate()} />
                <p className="m-0 text-sm leading-[1.45] text-bl-ink3">
                  Мұғалім кодты «Баптаулар → Басқарма» бетінде енгізеді. Сіз растағанда ғана ол басқармаға кіреді және мұғалім
                  рөлін алады.
                </p>
                {rotate.isError ? <ErrorNote error={rotate.error} /> : null}
              </section>
              <section className="flex min-w-0 flex-[2_1_420px] flex-col gap-1 rounded-[18px] border border-bl-line bg-white p-5">
                <h2 className="m-0 mb-2 text-lg font-bold">Растауды күтіп тұр</h2>
                {teachers.isLoading ? <LoadingBlock rows={2} /> : null}
                {teachers.data && !pending.length ? <p className="m-0 text-sm text-bl-ink2">Жаңа өтінім жоқ.</p> : null}
                {pending.map((t) => (
                  <PendingRow key={t.user_id} t={t} actions={actions} />
                ))}
                {actions.approve.isError ? <ErrorNote error={actions.approve.error} /> : null}
                {actions.decline.isError ? <ErrorNote error={actions.decline.error} /> : null}
              </section>
            </div>
          </>
        ) : null}
      </Page>
    </AppShell>
  );
}

export function HeadTeachersPage() {
  const queryClient = useQueryClient();
  const teachers = useQuery({ queryKey: departmentKeys.teachers, queryFn: headTeachers });
  const [toast, setToast] = useToast();
  const actions = usePendingActions(setToast);
  const [removing, setRemoving] = useState<HeadTeacher | null>(null);
  const remove = useMutation({
    mutationFn: (t: HeadTeacher) => headRemoveTeacher(t.user_id),
    onSuccess: async (_, t) => {
      setToast(`${t.full_name} басқармадан шығарылды`);
      setRemoving(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: departmentKeys.teachers }),
        queryClient.invalidateQueries({ queryKey: departmentKeys.overview }),
      ]);
    },
  });
  const active = (teachers.data ?? []).filter((t) => t.status === 'active');
  const pending = (teachers.data ?? []).filter((t) => t.status === 'pending');

  return (
    <AppShell>
      <Page wide>
        <PageTitle title="Мұғалімдер" right={<CountBadge count={pending.length} />} />
        <Toast text={toast} />
        {teachers.isLoading ? <LoadingBlock rows={4} /> : null}
        {teachers.isError ? <ErrorNote error={teachers.error} onRetry={() => teachers.refetch()} /> : null}
        {pending.length ? (
          <section className="flex flex-col gap-1 rounded-[18px] border border-bl-line bg-white p-5">
            <h2 className="m-0 mb-2 text-lg font-bold">Растауды күтіп тұр</h2>
            {pending.map((t) => (
              <PendingRow key={t.user_id} t={t} actions={actions} />
            ))}
          </section>
        ) : null}
        {teachers.data ? (
          active.length ? (
            <section className="overflow-x-auto rounded-[18px] border border-bl-line bg-white">
              <table className="w-full min-w-[720px] border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th scope="col" className={cn(thCls, 'px-5')}>
                      Аты-жөні
                    </th>
                    <th scope="col" className={thCls}>
                      Email
                    </th>
                    <th scope="col" className={cn(thCls, 'text-right')}>
                      Сынып
                    </th>
                    <th scope="col" className={cn(thCls, 'text-right')}>
                      Оқушы
                    </th>
                    <th scope="col" className={cn(thCls, 'px-5')}>
                      <span className="sr-only">Әрекет</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((t) => (
                    <tr key={t.user_id}>
                      <th scope="row" className="border-b border-bl-soft px-5 py-3 text-left font-semibold">
                        {t.full_name}
                      </th>
                      <td className={cn(tdCls, 'break-all')}>{t.email}</td>
                      <td className={cn(tdCls, 'text-right tabular-nums text-bl-ink')}>{t.class_count}</td>
                      <td className={cn(tdCls, 'text-right tabular-nums text-bl-ink')}>{t.student_count}</td>
                      <td className="border-b border-bl-soft px-5 py-2 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          full={false}
                          className="h-9 text-[13px] text-bl-danger"
                          onClick={() => setRemoving(t)}
                        >
                          Басқармадан шығару
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <EmptyNote>Әзірге расталған мұғалім жоқ. Басқарма кодын мұғалімдерге беріңіз.</EmptyNote>
          )
        ) : null}
        <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
          Шығарылған мұғалімнің рөлі мен сыныптары сақталады, бірақ олар басқарма тізімінен кетеді.
        </p>
        <ConfirmSheet
          open={!!removing}
          onClose={() => setRemoving(null)}
          title="Мұғалімді басқармадан шығарасыз ба?"
          description={`${removing?.full_name ?? ''} және оның оқушылары енді сізге көрінбейді.`}
          confirmLabel="Шығару"
          busy={remove.isPending}
          onConfirm={() => removing && remove.mutate(removing)}
        />
      </Page>
    </AppShell>
  );
}

export function HeadStudentsPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const students = useQuery({ queryKey: departmentKeys.students(debounced), queryFn: () => headStudents(debounced) });
  const rows = useMemo(() => students.data ?? [], [students.data]);

  return (
    <AppShell>
      <Page wide>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em] lg:text-[32px]">Оқушылар</h1>
          <div>
            <label htmlFor="head-q" className="sr-only">
              Аты бойынша іздеу
            </label>
            <input
              id="head-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Аты бойынша іздеу"
              className={cn(inputCls, 'w-[260px] max-w-full')}
            />
          </div>
        </div>
        {students.isLoading ? <LoadingBlock rows={5} /> : null}
        {students.isError ? <ErrorNote error={students.error} onRetry={() => students.refetch()} /> : null}
        {students.data ? (
          <section className="overflow-x-auto rounded-[18px] border border-bl-line bg-white">
            <table className="w-full min-w-[760px] border-collapse text-[15px]">
              <thead>
                <tr>
                  <th scope="col" className={cn(thCls, 'px-5')}>
                    Аты-жөні
                  </th>
                  <th scope="col" className={thCls}>
                    Сынып
                  </th>
                  <th scope="col" className={thCls}>
                    Мұғалім
                  </th>
                  <th scope="col" className={cn(thCls, 'text-right')}>
                    Сессия
                  </th>
                  <th scope="col" className={cn(thCls, 'px-5 text-right')}>
                    Орташа
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.student_id}>
                    <th scope="row" className="border-b border-bl-soft px-5 py-3 text-left font-semibold">
                      {s.full_name}
                    </th>
                    <td className={tdCls}>{s.classes}</td>
                    <td className={tdCls}>{s.teachers}</td>
                    <td className={cn(tdCls, 'text-right tabular-nums text-bl-ink')}>{s.sessions_done}</td>
                    <td className="border-b border-bl-soft px-5 py-3 text-right font-semibold tabular-nums">{percent(s.avg_p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <p className="m-0 p-6 text-center text-sm text-bl-ink2">Ешкім табылмады</p> : null}
          </section>
        ) : null}
        <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
          Оқушы басқармаға мұғалімінің сыныбы арқылы кіреді. Мұнда тек жиынтық нәтиже көрінеді: жауаптар мен тьютор диалогтары
          жеке қалады.
        </p>
      </Page>
    </AppShell>
  );
}
