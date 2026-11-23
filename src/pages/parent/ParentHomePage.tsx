// Ата-ана беті «Балам» (karta §2.1, D26, D27, D31): баласының P1…P4 профилі тек оқу режимінде.
// Ата-ана Tutor диалогтарын, жауаптарды, рейтингті және дабылдарды көрмейді.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { Banner, Card, Chip, ExamScreen, LoadingBlock, PrimaryButton, SectionLabel } from '@/components/exam/ExamUi';
import { LevelGrid } from '@/components/exam/LevelGrid';
import { useExaminerApi } from '@/lib/examiner-api';
import {
  cancelParentLink,
  myChildren,
  outgoingParentRequests,
  platformKeys,
  requestParentLink,
  type ChildRow,
} from '@/lib/platform-api';
import { formatDateTime, inputClass } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

const REQUEST_STATUS: Record<string, string> = {
  pending: 'Баланың растауын күтеді',
  accepted: 'Расталды',
  declined: 'Бас тартты',
  cancelled: 'Тоқтатылды',
  expired: 'Мерзімі өтті',
};

function ChildProfile({ child }: { child: ChildRow }) {
  const api = useExaminerApi();
  const profile = useQuery({
    queryKey: ['examiner', 'parent', 'child', child.student_id],
    queryFn: () => api.parentChildProfile(child.student_id),
  });
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel>{child.full_name}</SectionLabel>
      {profile.isLoading ? <LoadingBlock /> : null}
      {profile.isError ? <Banner tone="bad">{(profile.error as Error).message}</Banner> : null}
      {profile.data && profile.data.subjects.length === 0 ? (
        <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">Әзірге «Пән» көлеміндегі емтихан нәтижесі жоқ.</Card>
      ) : null}
      {profile.data?.subjects.map((subject) => (
        <div key={subject.subject.book} className="flex flex-col gap-2">
          <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">
                {subject.subject.title} · {subject.subject.grade}-сынып
              </span>
              <span className="text-[13px] text-[#5E5E5E]">
                Жалпы балл (F){subject.f !== null && subject.f_is_final === false ? ' · алдын ала' : ''}
              </span>
            </span>
            <span className="text-2xl font-bold">{subject.f === null ? '—' : `${Math.round(subject.f)}%`}</span>
          </Card>
          <LevelGrid levels={subject.levels} />
        </div>
      ))}
    </section>
  );
}

export default function ParentHomePage() {
  const queryClient = useQueryClient();
  const children = useQuery({ queryKey: platformKeys.children, queryFn: myChildren });
  const requests = useQuery({ queryKey: platformKeys.outgoing, queryFn: outgoingParentRequests });
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: platformKeys.outgoing });
    void queryClient.invalidateQueries({ queryKey: platformKeys.children });
  };
  const send = useMutation({
    mutationFn: () => requestParentLink(email),
    onSuccess: () => {
      setEmail('');
      setSent(true);
      refresh();
    },
  });
  const cancel = useMutation({ mutationFn: cancelParentLink, onSuccess: refresh });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || send.isPending) return;
    setSent(false);
    send.mutate();
  };

  const pending = requests.data?.filter((row) => row.status === 'pending') ?? [];

  return (
    <ExamScreen
      header={
        <header className="flex min-h-14 items-center gap-2 px-4 pb-1 pt-3">
          <h1 className="m-0 flex-1 text-lg font-bold">Балам</h1>
        </header>
      }
      footer={
        <nav aria-label="Ата-ана мәзірі" className="grid grid-cols-3 gap-1.5">
          {[
            { to: '/parent', label: 'Балам', active: true },
            { to: '/chat', label: 'Чат', active: false },
            { to: '/profile', label: 'Баптаулар', active: false },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center justify-center rounded-xl text-sm font-semibold no-underline',
                item.active ? 'bg-[#121212] text-white' : 'text-[#4A4A4A] hover:bg-[#ECE9E3]',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      }
    >
      {children.isLoading ? <LoadingBlock /> : null}
      {children.isError ? <Banner tone="bad">{(children.error as Error).message}</Banner> : null}
      {children.data?.map((child) => <ChildProfile key={child.student_id} child={child} />)}

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Баланы қосу</SectionLabel>
        <Card className="p-4">
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Баланың платформадағы email-і
              <input
                type="email"
                className={inputClass}
                value={email}
                maxLength={254}
                autoComplete="off"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <p className="m-0 text-[13px] leading-snug text-[#5E5E5E]">
              Бала сұранысты өз аккаунтында («Сыныптарым» бетінде) 72 сағат ішінде растауы керек.
            </p>
            <PrimaryButton type="submit" disabled={!email.trim() || send.isPending}>
              {send.isPending ? 'Жіберілуде…' : 'Сұраныс жіберу'}
            </PrimaryButton>
          </form>
        </Card>
        {send.isError ? <Banner tone="bad">{(send.error as Error).message}</Banner> : null}
        {sent ? <Banner tone="good">Сұраныс жіберілді. Бала растағанда профилі осында шығады.</Banner> : null}
        {cancel.isError ? <Banner tone="bad">{(cancel.error as Error).message}</Banner> : null}
        {pending.map((row) => (
          <Card key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold">{row.child_email}</span>
              <span className="text-[13px] text-[#5E5E5E]">
                {REQUEST_STATUS[row.status]} · {formatDateTime(row.expires_at)} дейін
              </span>
            </span>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(row.id)}
              className="h-9 rounded-lg px-3 text-sm font-semibold text-[#B42323] hover:bg-[#FBEAEA]"
            >
              Тоқтату
            </button>
          </Card>
        ))}
        {requests.data?.filter((row) => row.status !== 'pending').slice(0, 5).map((row) => (
          <span key={row.id} className="flex items-center justify-between text-[13px] text-[#5E5E5E]">
            {row.child_email}
            <Chip tone="muted">{REQUEST_STATUS[row.status] ?? row.status}</Chip>
          </span>
        ))}
      </section>
    </ExamScreen>
  );
}
