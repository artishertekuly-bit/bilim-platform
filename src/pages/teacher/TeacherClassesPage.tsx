// Сыныптар мен кодтар (дизайн: TeacherClassSettings.dc.html; api §5.2, D25, D33, D83):
// тізім → сынып (код, QR, кодты жаңарту, оқушылар, шығару) және жаңа сынып.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { ChevronIcon, PlusIcon } from '@/components/bl/icons';
import { Banner, BareScreen, Button, ConfirmSheet, EmptyNote, ErrorNote, Field, LoadingBlock, Page, Select, TextInput, TopBar } from '@/components/bl/ui';
import JoinCodeQr from '@/components/teacher/JoinCodeQr';
import { classKeys, classRoster, createClass, listSubjects, removeClassMember, rotateJoinCode, teacherClasses } from '@/lib/classes-api';
import { formatDateTime } from '@/lib/teacher-ui';

type Confirm = { kind: 'regen' } | { kind: 'remove'; id: string; name: string } | null;

function ClassView({ classId, onBack }: { classId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const roster = useQuery({ queryKey: classKeys.roster(classId), queryFn: () => classRoster(classId) });
  const [qrOpen, setQrOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const current = classes.data?.find((c) => c.class_id === classId);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['classes'] });
    void queryClient.invalidateQueries({ queryKey: ['examiner', 'teacher'] });
  };
  const rotate = useMutation({ mutationFn: () => rotateJoinCode(classId), onSuccess: () => { refresh(); setConfirm(null); } });
  const remove = useMutation({
    mutationFn: (studentId: string) => removeClassMember(classId, studentId),
    onSuccess: () => {
      refresh();
      setConfirm(null);
    },
  });

  return (
    <AppShell nav={false}>
      <TopBar onBack={onBack} backLabel="Сыныптарға оралу" title={current ? `${current.title} · ${current.subject}` : 'Сынып'} />
      <Page className="gap-4 pt-2">
        {classes.isLoading ? <LoadingBlock rows={3} /> : null}
        {current ? (
          <section className="flex flex-col items-center gap-2.5 rounded-2xl border border-bl-line bg-white px-4 py-[18px]">
            <span className="text-[13px] font-semibold text-bl-ink2">Сынып коды · {current.subject}</span>
            <span className="pl-[0.22em] text-[34px] font-bold tabular-nums tracking-[0.22em]">{current.join_code}</span>
            <span className="text-center text-sm leading-[1.45] text-bl-ink2">Оқушы кодты Профильдегі «Сыныпқа қосылу» арқылы енгізеді.</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" full={false} aria-expanded={qrOpen} onClick={() => setQrOpen((v) => !v)}>
                {qrOpen ? 'QR-ды жасыру' : 'QR көрсету'}
              </Button>
              <Button variant="secondary" size="sm" full={false} onClick={() => setConfirm({ kind: 'regen' })}>
                Кодты жаңарту
              </Button>
            </div>
            {qrOpen ? (
              <div className="rounded-xl border border-bl-line bg-white p-3">
                <JoinCodeQr code={current.join_code} size={168} />
              </div>
            ) : null}
          </section>
        ) : null}
        {rotate.isError ? <ErrorNote error={rotate.error} /> : null}
        {remove.isError ? <ErrorNote error={remove.error} /> : null}

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-bl-ink2">Оқушылар</h2>
            <span className="text-sm font-semibold">{roster.data?.length ?? current?.member_count ?? 0}</span>
          </div>
          {roster.isLoading ? <LoadingBlock rows={3} /> : null}
          {roster.isError ? <ErrorNote error={roster.error} onRetry={() => roster.refetch()} /> : null}
          {roster.data && !roster.data.length ? <EmptyNote>Сыныпқа әлі ешкім қосылмаған. Кодты оқушыларға беріңіз.</EmptyNote> : null}
          {roster.data?.length ? (
            <div className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
              {roster.data.map((s) => (
                <div key={s.student_id} className="flex min-h-[60px] items-center gap-3 py-2 pl-4 pr-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{s.full_name}</span>
                    <span className="text-[13px] text-bl-ink2">Қосылды · {formatDateTime(s.joined_at)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${s.full_name} сыныптан шығару`}
                    onClick={() => setConfirm({ kind: 'remove', id: s.student_id, name: s.full_name })}
                    className="h-11 border-0 bg-transparent px-3 text-sm font-semibold text-bl-danger"
                  >
                    Шығару
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </Page>

      <ConfirmSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        primary="confirm"
        title={confirm?.kind === 'regen' ? 'Кодты жаңартасыз ба?' : 'Оқушыны шығарасыз ба?'}
        description={
          confirm?.kind === 'regen'
            ? 'Ескі код жұмысын тоқтатады. Қосылып қойған оқушылар сыныпта қалады.'
            : confirm?.kind === 'remove'
              ? `${confirm.name} сыныптан шығады. Сіз оның нәтижесін көрмейсіз, чат жабылады. Оқушы кодпен қайта қосыла алады.`
              : undefined
        }
        confirmLabel={confirm?.kind === 'regen' ? 'Жаңарту' : 'Шығару'}
        busy={rotate.isPending || remove.isPending}
        onConfirm={() => {
          if (confirm?.kind === 'regen') rotate.mutate();
          else if (confirm?.kind === 'remove') remove.mutate(confirm.id);
        }}
      />
    </AppShell>
  );
}

function NewClassView({ onBack, onCreated }: { onBack: () => void; onCreated: (classId: string) => void }) {
  const queryClient = useQueryClient();
  const subjects = useQuery({ queryKey: classKeys.subjects, queryFn: listSubjects });
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const create = useMutation({
    mutationFn: () => createClass(title.trim(), subjectId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: classKeys.teacherClasses });
      onCreated(result.class_id);
    },
  });
  const ready = title.trim().length > 0 && Boolean(subjectId);

  return (
    <BareScreen
      header={<TopBar onBack={onBack} backLabel="Сыныптарға оралу" title="Жаңа сынып" />}
      footer={
        <Button onClick={() => create.mutate()} disabled={!ready} loading={create.isPending}>
          {create.isPending ? 'Ашылуда…' : 'Сынып ашу'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 px-4 pb-5 pt-2">
        <p className="m-0 text-[15px] leading-normal text-bl-ink2">Әр пәнге бөлек сынып ашылады. Сіз оқушылардың тек осы пән бойынша нәтижесін көресіз.</p>
        <Field label="Сынып атауы" htmlFor="class-title">
          <TextInput id="class-title" value={title} maxLength={120} placeholder="8 «В»" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Пән" htmlFor="class-subject">
          <Select id="class-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Пәнді таңдаңыз</option>
            {subjects.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_kk}
              </option>
            ))}
          </Select>
        </Field>
        {subjects.isError ? <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} /> : null}
        {create.isError ? <ErrorNote error={create.error} /> : null}
      </div>
    </BareScreen>
  );
}

export default function TeacherClassesPage() {
  const [params, setParams] = useSearchParams();
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const openId = params.get('open');
  const isNew = params.get('new') === '1';
  const [created, setCreated] = useState<string | null>(null);
  const createdTitle = useMemo(() => classes.data?.find((c) => c.class_id === created)?.title, [classes.data, created]);

  if (isNew) {
    return (
      <NewClassView
        onBack={() => setParams({}, { replace: true })}
        onCreated={(id) => {
          setCreated(id);
          setParams({ open: id }, { replace: true });
        }}
      />
    );
  }
  if (openId) return <ClassView classId={openId} onBack={() => setParams({}, { replace: true })} />;

  return (
    <AppShell nav={false}>
      <TopBar back="/teacher" backLabel="Панельге оралу" title="Сыныптар мен кодтар" />
      <Page className="gap-3 pt-2">
        {createdTitle ? <Banner tone="good">«{createdTitle}» сыныбы ашылды.</Banner> : null}
        {classes.isLoading ? <LoadingBlock rows={3} /> : null}
        {classes.isError ? <ErrorNote error={classes.error} onRetry={() => classes.refetch()} /> : null}
        {classes.data && !classes.data.length ? <EmptyNote>Әзірге сынып жоқ.</EmptyNote> : null}
        {classes.data?.length ? (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
            {classes.data.map((c) => (
              <button
                key={c.class_id}
                type="button"
                onClick={() => setParams({ open: c.class_id })}
                className="flex min-h-16 w-full items-center gap-3 border-0 bg-white px-4 py-2.5 text-left text-bl-ink hover:bg-[#FBFAF8]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-base font-semibold">
                    {c.title} · {c.subject}
                  </span>
                  <span className="text-[13px] text-bl-ink2">{c.member_count} оқушы</span>
                </span>
                <span className="text-sm font-bold tabular-nums tracking-[0.12em]">{c.join_code}</span>
                <ChevronIcon />
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setParams({ new: '1' })}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#8C877E] bg-transparent text-[15px] font-semibold text-bl-ink"
        >
          <PlusIcon size={18} />
          Жаңа сынып
        </button>
      </Page>
    </AppShell>
  );
}
