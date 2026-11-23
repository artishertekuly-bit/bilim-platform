// Оқушы беті · дабыл (дизайн: TeacherStudent.dc.html; ortaq §5, api §5.4, D41, D70).
// Мұғалім тек ереже бұзды деп белгіленген хабарламаны көреді. Емтихан дабылы «қате» болса —
// Examiner API страйкты жояды және балды қалпына келтіреді; Тьютор дабылында бұғатты ашады не жабық қалдырады.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Avatar from '@/components/bl/Avatar';
import { Badge, Banner, ButtonLink, ConfirmSheet, ErrorNote, Field, ListGroup, ListRow, LoadingBlock, Section, Sheet, Button, TextArea } from '@/components/bl/ui';
import { LevelGrid } from '@/components/exam/LevelGrid';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { classKeys, classRoster, removeClassMember, teacherClasses } from '@/lib/classes-api';
import { useExaminerApi } from '@/lib/examiner-api';
import { ALERT_CATEGORY_TITLES, ALERT_SOURCE_TITLES, platformKeys, resolveAlert, studentAlerts, type AlertRow } from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';
import { formatBlockedUntil, tutorKeys, useTutorApi } from '@/lib/tutor-api';

const PRIVACY: Record<string, string> = {
  examiner: 'Сізге тек ереже бұзылды деп белгіленген жауап көрсетіледі.',
  tutor: 'Диалогтың қалған бөлігі оқушының өзінде ғана қалады.',
  games: 'Ойындағы басқа мәтіндер көрсетілмейді.',
};

function AlertCard({ alert, studentId }: { alert: AlertRow; studentId: string }) {
  const examiner = useExaminerApi();
  const tutor = useTutorApi();
  const queryClient = useQueryClient();
  const [fpOpen, setFpOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: platformKeys.alerts(studentId) });
    void queryClient.invalidateQueries({ queryKey: platformKeys.attention });
    void queryClient.invalidateQueries({ queryKey: tutorKeys.block(studentId) });
  };

  const primary = useMutation({
    mutationFn: async () => {
      if (alert.source_system === 'tutor') await tutor.teacherUnblock(studentId);
      await resolveAlert(alert.alert_id, 'resolved');
    },
    onSuccess: () => {
      setDone(alert.source_system === 'tutor' ? 'Тьютор ашылды.' : 'Дабыл жабылды.');
      refresh();
    },
  });
  const secondary = useMutation({
    mutationFn: async () => {
      if (alert.source_system === 'tutor') {
        await tutor.teacherLock(studentId);
        await resolveAlert(alert.alert_id, 'resolved');
        return;
      }
      if (alert.source_system === 'examiner') await examiner.teacherFalsePositive(alert.alert_id, reason.trim());
      await resolveAlert(alert.alert_id, 'false_positive');
    },
    onSuccess: () => {
      setFpOpen(false);
      setDone(
        alert.source_system === 'tutor'
          ? 'Диалог жабылды. Оны осы беттен кез келген уақытта аша аласыз.'
          : alert.source_system === 'examiner'
            ? 'Страйк жойылды, балл қайта есептелді.'
            : 'Қате дабыл деп белгіленді.',
      );
      refresh();
    },
  });
  const busy = primary.isPending || secondary.isPending;
  const error = (primary.error ?? secondary.error) as Error | null;

  const source = ALERT_SOURCE_TITLES[alert.source_system] ?? alert.source_system;
  const category = ALERT_CATEGORY_TITLES[alert.category] ?? alert.category;
  const labels =
    alert.source_system === 'tutor'
      ? ['Бұғатты қазір ашу', 'Мен ашқанша жабық тұрсын']
      : alert.source_system === 'examiner'
        ? ['Дабыл дұрыс, жабу', 'Қате дабыл: балды қалпына келтіру']
        : ['Дабыл дұрыс, жабу', 'Қате дабыл'];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-bl-ink bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-bold">
          {source} · {category}
        </h2>
        <span className="whitespace-nowrap text-[13px] text-bl-ink2">{formatDateTime(alert.created_at)}</span>
      </div>
      {alert.severity === 'hard' ? <Badge tone="warn">Қатаң дабыл</Badge> : null}
      <div className="flex flex-col gap-1 rounded-xl bg-[#F1EFEA] px-3.5 py-3">
        <span className="text-xs font-semibold text-bl-ink2">Белгіленген хабарлама</span>
        <span className="whitespace-pre-wrap text-[15px] leading-[1.45]">{alert.evidence_text}</span>
      </div>
      <span className="text-[13px] leading-[1.4] text-bl-ink2">{PRIVACY[alert.source_system] ?? PRIVACY.games}</span>
      {error ? <ErrorNote error={error} /> : null}
      {done ? (
        <div role="status" className="rounded-xl bg-bl-okbg px-3.5 py-3 text-sm font-semibold leading-[1.45] text-[#14532D]">
          {done}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button size="md" onClick={() => primary.mutate()} loading={primary.isPending} disabled={busy}>
            {labels[0]}
          </Button>
          <Button
            variant="secondary"
            size="md"
            disabled={busy}
            loading={secondary.isPending && alert.source_system === 'tutor'}
            onClick={() => (alert.source_system === 'tutor' ? secondary.mutate() : setFpOpen(true))}
          >
            {labels[1]}
          </Button>
        </div>
      )}

      <Sheet
        open={fpOpen}
        onClose={() => setFpOpen(false)}
        title="Қате дабыл"
        description={
          alert.source_system === 'examiner'
            ? 'Страйк жойылады, тапсырманың балы қалпына келеді. Бастапқы жазба журналда сақталады.'
            : 'Дабыл қате деп белгіленеді.'
        }
      >
        <Field label="Себебі" htmlFor={`fp-${alert.alert_id}`} hint={alert.source_system === 'examiner' ? 'Міндетті, кемінде 3 таңба' : undefined}>
          <TextArea
            id={`fp-${alert.alert_id}`}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[100px]"
          />
        </Field>
        <Button
          onClick={() => secondary.mutate()}
          loading={secondary.isPending}
          disabled={alert.source_system === 'examiner' && reason.trim().length < 3}
        >
          {alert.source_system === 'examiner' ? 'Балды қалпына келтіру' : 'Қате деп белгілеу'}
        </Button>
        <Button variant="secondary" size="md" onClick={() => setFpOpen(false)} disabled={secondary.isPending}>
          Болдырмау
        </Button>
      </Sheet>
    </section>
  );
}

function TutorState({ studentId }: { studentId: string }) {
  const api = useTutorApi();
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: tutorKeys.block(studentId), queryFn: () => api.teacherBlockState(studentId) });
  const apply = (data: Awaited<ReturnType<typeof api.teacherBlockState>>) => queryClient.setQueryData(tutorKeys.block(studentId), data);
  const unblock = useMutation({ mutationFn: () => api.teacherUnblock(studentId), onSuccess: apply });
  const lock = useMutation({ mutationFn: () => api.teacherLock(studentId), onSuccess: apply });
  const reason = state.data?.blocked_reason ?? null;
  if (!state.data) return state.isError ? <ErrorNote error={state.error} /> : null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-bl-line bg-white px-4 py-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">Тьютор</span>
        <span className="text-[13px] text-bl-ink2">
          {reason === 'teacher'
            ? 'Сіз ашқанша жабық'
            : reason === 'cooldown'
              ? `Уақытша жабық, ${formatBlockedUntil(state.data.blocked_until)}-де өзі ашылады`
              : 'Ашық'}
        </span>
      </span>
      {reason ? (
        <Button size="sm" full={false} onClick={() => unblock.mutate()} loading={unblock.isPending}>
          Ашу
        </Button>
      ) : (
        <Button variant="secondary" size="sm" full={false} onClick={() => lock.mutate()} loading={lock.isPending}>
          Жабу
        </Button>
      )}
    </div>
  );
}

export default function TeacherStudentAlertsPage() {
  const { studentId = '' } = useParams();
  const navigate = useNavigate();
  const api = useExaminerApi();
  const queryClient = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const roster = useQuery({ queryKey: classKeys.roster(), queryFn: () => classRoster() });
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const entry = roster.data?.find((s) => s.student_id === studentId);
  const cls = classes.data?.find((c) => c.class_id === entry?.class_id);
  const alerts = useQuery({ queryKey: platformKeys.alerts(studentId), queryFn: () => studentAlerts(studentId), enabled: !!studentId });
  const profiles = useQuery({
    queryKey: ['examiner', 'teacher', 'class-profiles', cls?.class_id],
    queryFn: () => api.teacherClassProfiles(cls!.class_id),
    enabled: Boolean(cls),
  });
  const profile = useMemo(() => profiles.data?.students.find((s) => s.student_id === studentId)?.profiles[0], [profiles.data, studentId]);

  const remove = useMutation({
    mutationFn: () => removeClassMember(cls!.class_id, studentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      navigate('/teacher', { replace: true });
    },
  });

  const open = alerts.data?.filter((a) => a.status === 'open') ?? [];
  const closed = alerts.data?.filter((a) => a.status !== 'open') ?? [];

  return (
    <TeacherScreen title="Оқушы" back="/teacher" backLabel="Панельге оралу">
      <div className="flex items-center gap-3.5">
        <Avatar name={entry?.full_name} url={entry?.avatar_url} size="md" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xl font-bold">{entry?.full_name ?? 'Оқушы'}</span>
          {cls ? (
            <span className="text-sm text-bl-ink2">
              {cls.title} · {cls.subject}
            </span>
          ) : null}
        </span>
      </div>

      {alerts.isLoading ? <LoadingBlock rows={2} /> : null}
      {alerts.isError ? <ErrorNote error={alerts.error} onRetry={() => alerts.refetch()} /> : null}
      {open.map((a) => (
        <AlertCard key={a.alert_id} alert={a} studentId={studentId} />
      ))}
      {alerts.data && !open.length ? <Banner tone="info">Ашық дабыл жоқ.</Banner> : null}

      <TutorState studentId={studentId} />

      {profile ? (
        <section className="flex flex-col gap-2.5 rounded-2xl border border-bl-line bg-white p-3.5">
          <span className="text-base font-semibold">Емтихан · {profile.subject.title}</span>
          <LevelGrid levels={profile.levels} />
          <span className="text-[13px] text-bl-ink2">Тек сыныптың пәні бойынша. Тьютор диалогтары көрінбейді.</span>
        </section>
      ) : null}

      <ListGroup>
        <ListRow onClick={() => navigate('/chat', { state: { with: studentId } })}>Оқушыға жазу</ListRow>
        <ListRow onClick={() => navigate('/chat', { state: { filter: 'parent' } })}>Ата-анасына жазу</ListRow>
        {cls ? (
          <ListRow danger onClick={() => setConfirmRemove(true)}>
            Сыныптан шығару
          </ListRow>
        ) : null}
      </ListGroup>
      {remove.isError ? <ErrorNote error={remove.error} /> : null}

      {closed.length ? (
        <Section label="Жабылған дабылдар">
          <ListGroup>
            {closed.map((a) => (
              <div key={a.alert_id} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="text-sm font-semibold">
                  {ALERT_SOURCE_TITLES[a.source_system] ?? a.source_system} · {ALERT_CATEGORY_TITLES[a.category] ?? a.category}
                </span>
                <span className="text-[13px] text-bl-ink2">
                  {a.status === 'false_positive' ? 'Қате дабыл' : 'Шешілді'} · {formatDateTime(a.resolved_at ?? a.created_at)}
                </span>
              </div>
            ))}
          </ListGroup>
        </Section>
      ) : null}

      {!entry && roster.data ? (
        <ButtonLink to="/teacher" variant="secondary" size="md">
          Панельге оралу
        </ButtonLink>
      ) : null}

      <ConfirmSheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        primary="confirm"
        title="Оқушыны шығарасыз ба?"
        description={`${entry?.full_name ?? 'Оқушы'} сыныптан шығады. Сіз оның нәтижесін көрмейсіз, чат жабылады. Оқушы кодпен қайта қосыла алады.`}
        confirmLabel="Шығару"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </TeacherScreen>
  );
}
