// Оқушының дабылдары (ortaq §5, api §5.4, D41, D70): мұғалім дәлел мәтінін көреді және шешім қабылдайды.
// Examiner дабылы «қате дабыл» болса — Examiner API страйкты жояды, содан кейін дабыл `false_positive` болып жабылады.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Banner, Card, Chip, LoadingBlock, SectionLabel } from '@/components/exam/ExamUi';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { useExaminerApi } from '@/lib/examiner-api';
import {
  ALERT_CATEGORY_TITLES,
  ALERT_SOURCE_TITLES,
  platformKeys,
  resolveAlert,
  studentAlerts,
  type AlertRow,
} from '@/lib/platform-api';
import { formatDateTime, useStudentNames } from '@/lib/teacher-ui';
import { formatBlockedUntil, tutorKeys, useTutorApi } from '@/lib/tutor-api';

// Tutor бұғаты (personarag §6.3, D70): бірінші Hard Alert — 30 минут, мұғалім ертерек аша не өзі ашқанша жаба алады.
function TutorBlockPanel({ studentId }: { studentId: string }) {
  const api = useTutorApi();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: tutorKeys.block(studentId),
    queryFn: () => api.teacherBlockState(studentId),
    enabled: !!studentId,
  });
  const apply = (data: Awaited<ReturnType<typeof api.teacherBlockState>>) =>
    queryClient.setQueryData(tutorKeys.block(studentId), data);
  const unblock = useMutation({ mutationFn: () => api.teacherUnblock(studentId), onSuccess: apply });
  const lock = useMutation({ mutationFn: () => api.teacherLock(studentId), onSuccess: apply });
  const busy = unblock.isPending || lock.isPending;
  const error = (state.error ?? unblock.error ?? lock.error) as Error | null;
  const reason = state.data?.blocked_reason ?? null;

  const status =
    reason === 'teacher'
      ? 'Сіз ашқанша жабық'
      : reason === 'cooldown'
        ? `Уақытша бұғатталған, ${formatBlockedUntil(state.data?.blocked_until ?? null)}-де өзі ашылады`
        : 'Ашық';

  return (
    <Card className="flex flex-col gap-2.5 px-4 py-3.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold">Тьютор</span>
        {state.data ? <Chip tone={reason ? 'neutral' : 'good'}>{status}</Chip> : null}
      </span>
      {error ? <Banner tone="bad">{error.message}</Banner> : null}
      {state.data ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || !reason}
            onClick={() => unblock.mutate()}
            className="h-10 rounded-xl bg-[#121212] text-sm font-semibold text-white disabled:opacity-40"
          >
            Бұғатты ашу
          </button>
          <button
            type="button"
            disabled={busy || reason === 'teacher'}
            onClick={() => lock.mutate()}
            className="h-10 rounded-xl border border-[#D9D6D0] bg-white text-sm font-semibold disabled:opacity-40"
          >
            Мен ашқанша жабу
          </button>
        </div>
      ) : null}
    </Card>
  );
}

const STATUS_TITLES: Record<AlertRow['status'], string> = {
  open: 'Ашық',
  resolved: 'Шешілді',
  false_positive: 'Қате дабыл',
};

function AlertCard({ alert, studentId }: { alert: AlertRow; studentId: string }) {
  const api = useExaminerApi();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [falseOpen, setFalseOpen] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: platformKeys.alerts(studentId) });
    void queryClient.invalidateQueries({ queryKey: platformKeys.attention });
  };
  const resolve = useMutation({ mutationFn: () => resolveAlert(alert.alert_id, 'resolved'), onSuccess: refresh });
  const falsePositive = useMutation({
    mutationFn: async () => {
      if (alert.source_system === 'examiner') {
        // Страйк жойылады, сессия бұғаттан шығады (examiner §7.2); бастапқы жазба сақталады.
        await api.teacherFalsePositive(alert.alert_id, reason.trim());
      }
      await resolveAlert(alert.alert_id, 'false_positive');
    },
    onSuccess: refresh,
  });
  const busy = resolve.isPending || falsePositive.isPending;
  const error = (resolve.error ?? falsePositive.error) as Error | null;

  return (
    <Card className="flex flex-col gap-2.5 px-4 py-3.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <Chip tone={alert.status === 'open' ? 'neutral' : 'muted'}>{STATUS_TITLES[alert.status]}</Chip>
        <Chip>{ALERT_SOURCE_TITLES[alert.source_system] ?? alert.source_system}</Chip>
        <Chip>{ALERT_CATEGORY_TITLES[alert.category] ?? alert.category}</Chip>
        {alert.severity === 'hard' ? <Chip>Қатаң</Chip> : null}
        <span className="text-xs text-[#5E5E5E]">{formatDateTime(alert.created_at)}</span>
      </span>
      <blockquote className="m-0 whitespace-pre-wrap border-l-[3px] border-[#D9D6D0] pl-3 text-sm text-[#4A4A4A]">
        {alert.evidence_text}
      </blockquote>
      {error ? <Banner tone="bad">{error.message}</Banner> : null}
      {alert.status === 'open' ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => resolve.mutate()}
              className="h-10 rounded-xl bg-[#121212] text-sm font-semibold text-white disabled:opacity-60"
            >
              Шешілді
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setFalseOpen((value) => !value)}
              className="h-10 rounded-xl border border-[#D9D6D0] bg-white text-sm font-semibold disabled:opacity-60"
            >
              Қате дабыл
            </button>
          </div>
          {falseOpen ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-[#5E5E5E]">
                Себебі {alert.source_system === 'examiner' ? '(міндетті: страйк жойылады)' : ''}
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="rounded-xl border border-[#D9D6D0] bg-white px-3 py-2 text-sm font-normal text-[#111111] outline-none focus:border-[#111111]"
                />
              </label>
              <button
                type="button"
                disabled={busy || (alert.source_system === 'examiner' && reason.trim().length < 3)}
                onClick={() => falsePositive.mutate()}
                className="h-10 rounded-xl bg-[#121212] text-sm font-semibold text-white disabled:opacity-60"
              >
                {falsePositive.isPending ? 'Сақталуда…' : 'Қате дабыл деп жабу'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export default function TeacherStudentAlertsPage() {
  const { studentId = '' } = useParams();
  const names = useStudentNames();
  const alerts = useQuery({
    queryKey: platformKeys.alerts(studentId),
    queryFn: () => studentAlerts(studentId),
    enabled: !!studentId,
  });
  const open = alerts.data?.filter((alert) => alert.status === 'open') ?? [];
  const closed = alerts.data?.filter((alert) => alert.status !== 'open') ?? [];

  return (
    <TeacherScreen title={names.get(studentId) ?? 'Оқушы'} back="/teacher">
      <Banner tone="info">
        Мұғалімге тек қауіпсіздік ережесін бұзған хабарлама жіберіледі. Тьютормен басқа диалогтар оқушының жеке
        ісі болып қалады.
      </Banner>
      <TutorBlockPanel studentId={studentId} />
      {alerts.isLoading ? <LoadingBlock /> : null}
      {alerts.isError ? <Banner tone="bad">{(alerts.error as Error).message}</Banner> : null}
      {alerts.data && alerts.data.length === 0 ? (
        <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">Бұл оқушыда дабыл жоқ.</Card>
      ) : null}
      {open.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Назар аударуды қажет етеді · {open.length}</SectionLabel>
          {open.map((alert) => <AlertCard key={alert.alert_id} alert={alert} studentId={studentId} />)}
        </section>
      ) : null}
      {closed.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Жабылғандар</SectionLabel>
          {closed.map((alert) => <AlertCard key={alert.alert_id} alert={alert} studentId={studentId} />)}
        </section>
      ) : null}
      <Link to={`/chat?with=${studentId}`} className="text-center text-[15px] font-semibold text-[#111111]">
        Оқушыға жазу
      </Link>
    </TeacherScreen>
  );
}
