// Сыныпқа қосылу және «Мұғалімдерім» тізімі (karta §4.2, D33, D38, D41; api §5.2).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { Banner, Card, ExamScreen, LoadingBlock, PrimaryButton, SectionLabel, SimpleHeader } from '@/components/exam/ExamUi';
import {
  JOIN_CODE_PATTERN,
  classKeys,
  joinClass,
  myClasses,
  normalizeJoinCode,
  previewClass,
  type ClassPreview,
} from '@/lib/classes-api';
import { incomingParentRequests, platformKeys, respondParentLink } from '@/lib/platform-api';
import { inputClass } from '@/lib/teacher-ui';

export default function StudentClassesPage() {
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: classKeys.mine, queryFn: myClasses });
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: () => previewClass(code),
    onSuccess: (result) => {
      setPreview(result);
      setNotFound(result === null);
    },
  });
  const join = useMutation({
    mutationFn: () => joinClass(code),
    onSuccess: (classId) => {
      if (classId === null) {
        setNotFound(true);
        setPreview(null);
        return;
      }
      setJoined(preview?.title ?? 'Сынып');
      setPreview(null);
      setCode('');
      void queryClient.invalidateQueries({ queryKey: classKeys.mine });
    },
  });

  const onCheck = (event: FormEvent) => {
    event.preventDefault();
    if (!JOIN_CODE_PATTERN.test(code) || check.isPending) return;
    setJoined(null);
    check.mutate();
  };

  const error = (check.error ?? join.error) as Error | null;

  return (
    <ExamScreen header={<SimpleHeader title="Сыныптарым" to="/dashboard" />}>
      <section className="flex flex-col gap-2.5">
        <SectionLabel>Сыныпқа қосылу</SectionLabel>
        <Card className="p-4">
          <form className="flex flex-col gap-3" onSubmit={onCheck}>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Мұғалім берген 6 таңбалы код
              <input
                className={`${inputClass} text-center font-mono text-xl tracking-[0.3em]`}
                value={code}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                placeholder="A7K2QP"
                onChange={(event) => {
                  setCode(normalizeJoinCode(event.target.value));
                  setPreview(null);
                  setNotFound(false);
                }}
              />
            </label>
            <PrimaryButton type="submit" disabled={!JOIN_CODE_PATTERN.test(code) || check.isPending}>
              {check.isPending ? 'Тексерілуде…' : 'Тексеру'}
            </PrimaryButton>
          </form>
        </Card>

        {notFound ? <Banner tone="bad">Бұл код бойынша сынып табылмады. Кодты тексеріңіз.</Banner> : null}
        {error ? <Banner tone="bad">{error.message}</Banner> : null}
        {joined ? <Banner tone="good">«{joined}» сыныбына қосылдыңыз.</Banner> : null}

        {preview ? (
          <Card className="flex flex-col gap-3 p-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-[17px] font-bold">{preview.title}</span>
              <span className="text-sm text-[#5E5E5E]">
                {preview.subject} · Мұғалім: {preview.teacher_name}
              </span>
            </span>
            <p className="m-0 text-sm leading-snug text-[#4A4A4A]">
              Қосылғаннан кейін мұғалім сіздің «{preview.subject}» пәні бойынша емтихан нәтижелеріңізді көреді. Тьютормен
              диалогтарыңыз жеке қалады: мұғалімге тек қауіпсіздік ережесін бұзған хабарлама жіберіледі.
            </p>
            <PrimaryButton disabled={join.isPending} onClick={() => join.mutate()}>
              {join.isPending ? 'Қосылуда…' : 'Растау және қосылу'}
            </PrimaryButton>
          </Card>
        ) : null}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Мұғалімдерім</SectionLabel>
        {mine.isLoading ? <LoadingBlock /> : null}
        {mine.isError ? <Banner tone="bad">{(mine.error as Error).message}</Banner> : null}
        {mine.data && mine.data.length === 0 ? (
          <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">Әзірге ешбір сыныпқа қосылмағансыз.</Card>
        ) : null}
        {mine.data?.map((item) => (
          <Card key={item.class_id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold">{item.teacher_name}</span>
              <span className="text-[13px] text-[#5E5E5E]">
                {item.subject} · {item.title}
              </span>
            </span>
            <Link
              to={`/chat?with=${item.teacher_id}`}
              className="flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-[#111111] no-underline hover:bg-[#ECE9E3]"
            >
              Жазу
            </Link>
          </Card>
        ))}
      </section>

      <ParentRequests />
    </ExamScreen>
  );
}

/** Ата-ананың байланыс сұранысы (D26): бала өзі растайды. */
function ParentRequests() {
  const queryClient = useQueryClient();
  const incoming = useQuery({ queryKey: platformKeys.incoming, queryFn: incomingParentRequests });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondParentLink(id, accept),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: platformKeys.incoming }),
  });
  if (!incoming.data?.length && !respond.isError) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel>Ата-ана сұраныстары</SectionLabel>
      {respond.isError ? <Banner tone="bad">{(respond.error as Error).message}</Banner> : null}
      {incoming.data?.map((row) => (
        <Card key={row.id} className="flex flex-col gap-3 p-4">
          <p className="m-0 text-sm leading-snug">
            <span className="font-semibold">{row.parent_name}</span> сізді баласы ретінде қосқысы келеді. Растасаңыз,
            ол сіздің емтихан нәтижелеріңізді (P1…P4) ғана көреді: жауаптарыңыз, Тьютормен диалогтарыңыз және рейтинг
            оған көрінбейді.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: row.id, accept: true })}
              className="h-11 rounded-xl bg-[#121212] text-sm font-semibold text-white disabled:opacity-60"
            >
              Растау
            </button>
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: row.id, accept: false })}
              className="h-11 rounded-xl border border-[#D9D6D0] bg-white text-sm font-semibold disabled:opacity-60"
            >
              Бас тарту
            </button>
          </div>
        </Card>
      ))}
    </section>
  );
}
