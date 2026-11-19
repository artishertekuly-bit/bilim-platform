// Сессия нәтижесі (дизайн: Result.dc.html; api §3.7). X3 деңгей балына кірмейді (bagalau §4.2).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  Banner,
  Card,
  CheckIcon,
  ExamScreen,
  LoadingBlock,
  PrimaryLink,
  SecondaryLink,
  SectionLabel,
  SimpleHeader,
} from '@/components/exam/ExamUi';
import { LevelGrid } from '@/components/exam/LevelGrid';
import { FORMAT_TITLES, LEVEL_TITLES, useExaminerApi } from '@/lib/examiner-api';

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function ExamResultPage() {
  const { sessionId = '' } = useParams();
  const api = useExaminerApi();
  const queryClient = useQueryClient();
  const [appealItem, setAppealItem] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [appealSuccess, setAppealSuccess] = useState<string | null>(null);
  const [appealError, setAppealError] = useState<string | null>(null);

  const result = useQuery({
    queryKey: ['examiner', 'result', sessionId],
    queryFn: () => api.result(sessionId),
    enabled: Boolean(sessionId),
    retry: false,
  });

  const sendAppeal = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) => api.appeal(sessionId, itemId, reason),
    onSuccess: () => {
      setAppealItem(null);
      setAppealReason('');
      setAppealError(null);
      setAppealSuccess('Шағым мұғалімнің тексеру кезегіне жіберілді.');
      void queryClient.invalidateQueries({ queryKey: ['examiner', 'result', sessionId] });
    },
    onError: (err) => {
      setAppealError(err instanceof Error ? err.message : 'Шағым жіберілмеді.');
    },
  });

  const footer = (
    <>
      <PrimaryLink to="/exam">Басқа деңгей таңдау</PrimaryLink>
      <SecondaryLink to="/exam/profile">Профильге өту</SecondaryLink>
    </>
  );

  if (result.isError) {
    return (
      <ExamScreen header={<SimpleHeader title="Нәтиже" to="/exam" />} footer={footer}>
        <Banner tone="bad">{(result.error as Error).message}</Banner>
      </ExamScreen>
    );
  }
  const data = result.data;
  if (!data) {
    return (
      <ExamScreen header={<SimpleHeader title="Нәтиже" to="/exam" />}>
        <LoadingBlock />
      </ExamScreen>
    );
  }

  const x3Title =
    data.x3.status === 'passed'
      ? 'Деңгей боссы жеңілді'
      : data.x3.status === 'failed'
        ? 'Деңгей боссы жеңілмеді'
        : 'Деңгей боссы ашылмады';

  return (
    <ExamScreen header={<SimpleHeader title="Нәтиже" to="/exam" />} footer={footer}>
      <p className="m-0 text-sm text-[#5E5E5E]">
        {data.level} · {LEVEL_TITLES[data.level]} — {data.scope.title}
      </p>
      <Card className="flex flex-col items-center gap-2 rounded-[20px] px-4 py-6">
        <span className="text-[56px] font-bold leading-none tracking-[-0.03em]">{Math.round(data.p)}%</span>
        {data.mastered ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#E6F3EA] px-3 py-1.5 text-sm font-semibold text-[#1F6B3F]">
            <CheckIcon size={16} /> Меңгерілді
          </span>
        ) : (
          <span className="rounded-full bg-[#ECE9E3] px-3 py-1.5 text-sm font-semibold text-[#4A4A4A]">Әлі меңгерілмеді</span>
        )}
        <span className="text-[13px] text-[#5E5E5E]">Меңгеру шегі — {data.threshold}%</span>
      </Card>

      <Card className="flex flex-col">
        {data.breakdown.map((row) => (
          <div key={`${row.format}-${row.block}`} className="flex items-center justify-between border-b border-[#ECE9E3] px-4 py-3.5">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{FORMAT_TITLES[row.format] ?? row.format}</span>
              <span className="text-[13px] text-[#5E5E5E]">{row.tasks} тапсырма</span>
            </span>
            <span className="text-[15px] font-semibold">
              {row.score} / {row.max}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-3.5">
          <span className="text-[15px] font-bold">Барлығы</span>
          <span className="text-[15px] font-bold">
            {data.total.score} / {data.total.max}
          </span>
        </div>
      </Card>

      {!data.is_final ? (
        <Banner tone="warn">ЖИ бағалаған тапсырмалар мұғалім растағанша алдын ала, сондықтан нәтиже өзгеруі мүмкін.</Banner>
      ) : null}

      {data.level === 3 && data.part_d != null && data.part_a != null ? (
        <Card className="grid grid-cols-2 gap-3 px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-[#5E5E5E]">Диалог блогы (70%)</span>
            <span className="text-lg font-bold">{Math.round(data.part_d * 100)}%</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-[#5E5E5E]">Ұшқырлық блогы (30%)</span>
            <span className="text-lg font-bold">{Math.round(data.part_a * 100)}%</span>
          </div>
        </Card>
      ) : null}

      {data.items && data.items.some((item) => item.appealable) ? (
        <Card className="flex flex-col gap-2.5 px-4 py-3.5">
          <span className="text-[15px] font-semibold">ЖИ бағасына шағымдану</span>
          {appealSuccess ? <Banner tone="good">{appealSuccess}</Banner> : null}
          {appealError ? <Banner tone="warn">{appealError}</Banner> : null}
          <div className="flex flex-col gap-2">
            {data.items
              .filter((item) => item.appealable)
              .map((item) => (
                <div key={item.item_id} className="flex flex-col gap-2 border-t border-[#F1EFEA] pt-2 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">
                      #{item.position} · {FORMAT_TITLES[item.format] ?? item.format} ({item.score} / {item.max_score})
                    </span>
                    {item.appealed ? (
                      <span className="text-xs font-semibold text-[#5E5E5E]">Шағым жіберілді</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAppealItem(appealItem === item.item_id ? null : item.item_id);
                          setAppealError(null);
                        }}
                        className="rounded-lg border border-[#D9D6D0] px-2.5 py-1 text-xs font-semibold text-[#111111]"
                      >
                        Шағымдану
                      </button>
                    )}
                  </div>
                  {appealItem === item.item_id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={appealReason}
                        onChange={(e) => setAppealReason(e.target.value)}
                        placeholder="Неге қайта қарау керек? Қысқаша жазыңыз…"
                        className="w-full rounded-xl border border-[#E2E0DB] bg-[#F6F5F2] p-2.5 text-sm text-[#111111]"
                      />
                      <button
                        type="button"
                        disabled={appealReason.trim().length < 3 || sendAppeal.isPending}
                        onClick={() => sendAppeal.mutate({ itemId: item.item_id, reason: appealReason.trim() })}
                        className="h-10 rounded-xl bg-[#121212] text-sm font-semibold text-white disabled:bg-[#D9D6D0] disabled:text-[#4A4A4A]"
                      >
                        {sendAppeal.isPending ? 'Жіберілуде…' : 'Жіберу'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-1.5 px-4 py-3.5">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {data.x3.status === 'passed' ? <CheckIcon /> : <LockIcon />}
          {x3Title}
        </span>
        <p className="m-0 text-sm leading-snug text-[#5E5E5E]">
          {data.x3.reason ??
            (data.x3.status === 'passed'
              ? 'Деңгейдің ең қиын тапсырмасына дұрыс жауап бердіңіз. Ол балға кірмейді, рейтингте ескеріледі.'
              : 'Деңгейдің ең қиын тапсырмасы балға кірмейді, тек рейтингте ескеріледі.')}
        </p>
      </Card>

      {data.scope.type === 'subject' ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Профиль · {data.subject_profile.subject.book_title}</SectionLabel>
          <LevelGrid levels={data.subject_profile.levels} />
          <p className="m-0 text-[13px] leading-snug text-[#5E5E5E]">
            Жалпы балл төрт деңгей түгел тапсырылғанда есептеледі.
          </p>
        </section>
      ) : (
        <p className="m-0 text-[13px] leading-snug text-[#5E5E5E]">
          Профиль мен жалпы балл тек «Пән» көлеміндегі емтиханнан құрылады. Тақырып пен тараудың нәтижесі деңгей таңдау
          экранында көрінеді.
        </p>
      )}
    </ExamScreen>
  );
}
