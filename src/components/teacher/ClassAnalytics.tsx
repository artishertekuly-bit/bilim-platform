// Сынып аналитикасы (karta §4.1, D38): оқулық бойынша P1…P4 кестесі және F рейтингі (D23, D37).
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Banner, Card, Chip, LoadingBlock, SectionLabel } from '@/components/exam/ExamUi';
import { useExaminerApi, type LevelResult } from '@/lib/examiner-api';
import { inputClass } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

function LevelCell({ level }: { level: LevelResult | undefined }) {
  if (!level || level.p === null) {
    return <span className="text-[#9A968F]" title="Өтпеді">—</span>;
  }
  return (
    <span
      className={cn('font-semibold tabular-nums', level.mastered ? 'text-[#1F6B3F]' : 'text-[#111111]')}
      title={`${level.mastered ? 'Меңгерілді' : 'Меңгерілмеді'}${level.is_final ? '' : ' · алдын ала'}`}
    >
      {Math.round(level.p)}
      {level.is_final ? '' : '*'}
    </span>
  );
}

export default function ClassAnalytics({ classId, names }: { classId: string; names: Map<string, string> }) {
  const api = useExaminerApi();
  const [book, setBook] = useState<string | null>(null);
  const profiles = useQuery({
    queryKey: ['examiner', 'teacher', 'class-profiles', classId],
    queryFn: () => api.teacherClassProfiles(classId),
  });
  const rating = useQuery({
    queryKey: ['examiner', 'teacher', 'class-rating', classId, book],
    queryFn: () => api.teacherClassRating(classId, book ?? undefined),
  });
  const activeBook = book ?? rating.data?.book ?? profiles.data?.books[0]?.book ?? null;

  const booksWithResults = useMemo(() => {
    const used = new Set(profiles.data?.students.flatMap((s) => s.profiles.map((p) => p.subject.book)) ?? []);
    return (profiles.data?.books ?? []).filter((b) => used.has(b.book) || b.book === activeBook);
  }, [profiles.data, activeBook]);

  const rows = useMemo(
    () =>
      (profiles.data?.students ?? [])
        .map((student) => ({
          id: student.student_id,
          name: names.get(student.student_id) ?? 'Оқушы',
          profile: student.profiles.find((p) => p.subject.book === activeBook),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'kk')),
    [profiles.data, activeBook, names],
  );

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <SectionLabel>Аналитика · {profiles.data?.subject_title ?? ''}</SectionLabel>
        {booksWithResults.length > 1 ? (
          <select
            aria-label="Оқулық"
            className={inputClass}
            value={activeBook ?? ''}
            onChange={(event) => setBook(event.target.value)}
          >
            {booksWithResults.map((b) => (
              <option key={b.book} value={b.book}>
                {b.title} · {b.grade}-сынып
              </option>
            ))}
          </select>
        ) : null}
        {profiles.isLoading ? <LoadingBlock /> : null}
        {profiles.isError ? <Banner tone="bad">{(profiles.error as Error).message}</Banner> : null}
        {profiles.data && rows.length === 0 ? (
          <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">Сыныпта әлі оқушы жоқ.</Card>
        ) : null}
        {rows.length ? (
          <Card className="overflow-hidden">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="bg-[#F6F5F2] text-xs text-[#5E5E5E]">
                  <th className="w-[38%] px-3 py-2 text-left font-semibold">Оқушы</th>
                  {[1, 2, 3, 4].map((level) => (
                    <th key={level} className="px-1 py-2 text-center font-semibold">P{level}</th>
                  ))}
                  <th className="px-2 py-2 text-center font-semibold">F</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#ECE9E3]">
                    <td className="truncate px-3 py-2.5 font-medium">{row.name}</td>
                    {[0, 1, 2, 3].map((index) => (
                      <td key={index} className="px-1 py-2.5 text-center">
                        <LevelCell level={row.profile?.levels[index]} />
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-center font-bold tabular-nums">
                      {row.profile?.f === null || row.profile?.f === undefined ? (
                        <span className="font-normal text-[#9A968F]">—</span>
                      ) : (
                        `${Math.round(row.profile.f)}${row.profile.f_is_final ? '' : '*'}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
        <p className="m-0 text-xs leading-snug text-[#5E5E5E]">
          Тек «Пән» көлеміндегі емтихан нәтижесі. Жасыл — меңгерілген деңгей, «—» — өтпеді, * — растауды күтеді.
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Рейтинг · F бойынша</SectionLabel>
        {rating.isLoading ? <LoadingBlock /> : null}
        {rating.isError ? <Banner tone="bad">{(rating.error as Error).message}</Banner> : null}
        {rating.data ? (
          <>
            {rating.data.entries.length === 0 ? (
              <Card className="px-4 py-3.5 text-sm leading-snug text-[#5E5E5E]">
                Рейтингке төрт деңгейді түгел тапсырған оқушы ғана кіреді. Әзірге ондай оқушы жоқ.
              </Card>
            ) : (
              <Card className="flex flex-col">
                {rating.data.entries.map((entry) => (
                  <div
                    key={entry.student_id}
                    className="flex items-center gap-3 border-t border-[#ECE9E3] px-4 py-3 first:border-0"
                  >
                    <span className="w-6 text-center text-base font-bold">{entry.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                      {names.get(entry.student_id) ?? 'Оқушы'}
                    </span>
                    {entry.f_is_final ? null : <Chip tone="muted">алдын ала</Chip>}
                    <span className="text-[15px] font-bold tabular-nums">{Math.round(entry.f)}%</span>
                  </div>
                ))}
              </Card>
            )}
            <p className="m-0 text-xs text-[#5E5E5E]">
              Толық профилі бар: {rating.data.full_count} / {rating.data.total}. F тең болса, X.3 нәтижесі шешеді.
            </p>
          </>
        ) : null}
      </section>
    </>
  );
}
