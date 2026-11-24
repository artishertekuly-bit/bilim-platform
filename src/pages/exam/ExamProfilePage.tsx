// Профиль · өз нәтижесі (дизайн: Profile.dc.html; api §3.8). Пән мен сынып бойынша P1…P4 және F (D63).
import { useQuery } from '@tanstack/react-query';

import {
  Banner,
  Card,
  ExamScreen,
  LoadingBlock,
  PrimaryLink,
  SecondaryLink,
  SectionLabel,
  SimpleHeader,
} from '@/components/exam/ExamUi';
import { LevelGrid } from '@/components/exam/LevelGrid';
import { useExaminerApi } from '@/lib/examiner-api';

export default function ExamProfilePage() {
  const api = useExaminerApi();
  const profile = useQuery({ queryKey: ['examiner', 'profile'], queryFn: api.profile });

  return (
    <ExamScreen header={<SimpleHeader title="Профиль" to="/exam" />}>
      {profile.isLoading ? <LoadingBlock /> : null}
      {profile.isError ? <Banner tone="bad">{(profile.error as Error).message}</Banner> : null}
      {profile.data && profile.data.subjects.length === 0 ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="m-0 text-[15px] font-semibold">Профиль әлі бос</p>
          <p className="m-0 text-sm leading-snug text-[#5E5E5E]">
            Профиль «Пән» көлеміндегі емтиханнан құрылады. Оқулықты таңдап, «Пән» көлемінде кез келген деңгейді
            тапсырыңыз.
          </p>
          <PrimaryLink to="/exam">Емтиханға өту</PrimaryLink>
        </Card>
      ) : null}
      {profile.data?.subjects.map((subject) => {
        const mastered = subject.levels.filter((level) => level.mastered).map((level) => level.level);
        return (
          // D93: профиль пән бойынша, сыныпқа бөлінбейді.
          <section key={subject.subject.id} className="flex flex-col gap-2.5">
            <SectionLabel>{subject.subject.title}</SectionLabel>
            <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">
                  Жалпы балл (F){subject.f !== null && subject.f_is_final === false ? ' · алдын ала' : ''}
                </span>
                <span className="text-[13px] text-[#5E5E5E]">
                  {subject.f === null ? 'Төрт деңгей түгел тапсырылғанда есептеледі' : 'Төрт деңгейдің орташасы'}
                </span>
              </span>
              <span className="text-2xl font-bold">{subject.f === null ? '—' : `${Math.round(subject.f)}%`}</span>
            </Card>
            <LevelGrid levels={subject.levels} />
            <p className="m-0 text-[13px] text-[#5E5E5E]">
              {mastered.length
                ? `Меңгерілген деңгей: ${mastered.join(', ')} (ең жоғарысы — ${Math.max(...mastered)})`
                : 'Әзірге меңгерілген деңгей жоқ'}
            </p>
          </section>
        );
      })}
      <section className="flex flex-col gap-2.5">
        <SectionLabel>Мұғалімдер</SectionLabel>
        <SecondaryLink to="/classes">Сыныпқа қосылу · Мұғалімдерім</SecondaryLink>
      </section>
    </ExamScreen>
  );
}
