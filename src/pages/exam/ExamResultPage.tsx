// Сессия нәтижесі (дизайн: Result.dc.html; api §3.7). X3 деңгей балына кірмейді (bagalau §4.2).
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

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
import { FORMAT_TITLES, LEVEL_TITLES, mixSummary, useExaminerApi } from '@/lib/examiner-api';

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

  const result = useQuery({
    queryKey: ['examiner', 'result', sessionId],
    queryFn: () => api.result(sessionId),
    enabled: Boolean(sessionId),
    retry: false,
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

  // D97: «Пән бойынша тест» — жаттығу. Меңгеру шегі, деңгей боссы мен профиль тек деңгейлік емтиханда.
  const mixed = data.mode === 'mixed';

  return (
    <ExamScreen header={<SimpleHeader title="Нәтиже" to="/exam" />} footer={footer}>
      <p className="m-0 text-sm text-[#5E5E5E]">
        {mixed ? 'Пән бойынша тест' : `${data.level} · ${LEVEL_TITLES[data.level]}`} — {data.scope.title}
      </p>
      <Card className="flex flex-col items-center gap-2 rounded-[20px] px-4 py-6">
        <span className="text-[56px] font-bold leading-none tracking-[-0.03em]">{Math.round(data.p)}%</span>
        {mixed ? (
          <span className="text-[13px] text-[#5E5E5E]">
            {data.mix ? mixSummary(data.mix) : `${data.total.max / 4} тапсырма`}
          </span>
        ) : data.mastered ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#E6F3EA] px-3 py-1.5 text-sm font-semibold text-[#1F6B3F]">
            <CheckIcon size={16} /> Меңгерілді
          </span>
        ) : (
          <span className="rounded-full bg-[#ECE9E3] px-3 py-1.5 text-sm font-semibold text-[#4A4A4A]">Әлі меңгерілмеді</span>
        )}
        {mixed ? null : <span className="text-[13px] text-[#5E5E5E]">Меңгеру шегі — {data.threshold}%</span>}
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
      {data.items?.some((item) => item.appealable && !item.appealed) ? (
        <Link
          to={`/exam/result/${sessionId}/appeal`}
          className="flex min-h-11 items-center self-start text-sm font-semibold text-[#111111] underline underline-offset-2"
        >
          Бағамен келіспеймін
        </Link>
      ) : null}
      {data.items?.some((item) => item.appealed) ? (
        <Banner tone="info">Шағымыңыз мұғалімнің растау кезегінде. Шешім шыққанда хабарлама келеді.</Banner>
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


      {mixed ? null : (
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
      )}

      {mixed ? (
        <p className="m-0 text-[13px] leading-snug text-[#5E5E5E]">
          Пән бойынша тест — жаттығу: нәтижесі деңгейлер профиліне және сынып рейтингіне кірмейді.
        </p>
      ) : data.scope.type === 'subject' ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Профиль · {data.subject_profile.subject.title}</SectionLabel>
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
