// Сынып нәтижесі (дизайн: TeacherClass.dc.html; karta §4.1, D38): «Профильдер» — P1…P4 ұяшықтары,
// «Рейтинг» — F бойынша, тек төрт деңгейді түгел тапсырғандар (D23, D37). Рейтинг тек мұғалімге көрінеді.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, EmptyNote, ErrorNote, LoadingBlock, Segmented, Select } from '@/components/bl/ui';
import { useExaminerApi, type LevelResult } from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

function LevelCell({ level, index }: { level: LevelResult | undefined; index: number }) {
  const base = 'flex h-9 items-center justify-center rounded-[10px] text-[13px] font-bold tabular-nums';
  if (!level || level.p === null) {
    return (
      <span aria-label={`${index + 1}-деңгей өтпеді`} className={cn(base, 'border border-dashed border-bl-dash bg-bl-bg text-bl-ink3')}>
        —
      </span>
    );
  }
  const p = Math.round(level.p);
  return (
    <span
      aria-label={`${index + 1}-деңгей ${p}%${level.mastered ? ', меңгерілді' : ''}${level.is_final ? '' : ', алдын ала'}`}
      className={cn(base, 'bg-white', level.mastered ? 'border-2 border-bl-ok text-bl-ink' : 'border border-bl-line text-bl-ink3')}
    >
      {p}
      {level.is_final ? '' : '*'}
    </span>
  );
}

export default function ClassAnalytics({
  classId,
  names,
  studentLink,
}: {
  classId: string;
  names: Map<string, string>;
  studentLink?: (studentId: string) => string;
}) {
  const api = useExaminerApi();
  const [tab, setTab] = useState<'profiles' | 'rating'>('profiles');
  const [book, setBook] = useState<string | null>(null);
  const profiles = useQuery({
    queryKey: ['examiner', 'teacher', 'class-profiles', classId],
    queryFn: () => api.teacherClassProfiles(classId),
  });
  const rating = useQuery({
    queryKey: ['examiner', 'teacher', 'class-rating', classId, book],
    queryFn: () => api.teacherClassRating(classId, book ?? undefined),
    enabled: tab === 'rating',
  });
  const activeBook = book ?? rating.data?.book ?? profiles.data?.books[0]?.book ?? null;

  const rows = useMemo(
    () =>
      (profiles.data?.students ?? [])
        .map((s) => ({
          id: s.student_id,
          name: names.get(s.student_id) ?? 'Оқушы',
          profile: s.profiles.find((p) => p.subject.book === activeBook),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'kk')),
    [profiles.data, activeBook, names],
  );

  return (
    <div className="flex flex-col gap-3">
      <Segmented<'profiles' | 'rating'>
        label="Сынып нәтижесі"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'profiles', label: 'Профильдер' },
          { id: 'rating', label: 'Рейтинг' },
        ]}
      />
      {(profiles.data?.books.length ?? 0) > 1 ? (
        <>
          <label htmlFor="class-book" className="sr-only">
            Оқулық
          </label>
          <Select id="class-book" className="h-12" value={activeBook ?? ''} onChange={(e) => setBook(e.target.value)}>
            {profiles.data?.books.map((b) => (
              <option key={b.book} value={b.book}>
                {b.title} · {b.grade}-сынып
              </option>
            ))}
          </Select>
        </>
      ) : null}

      {tab === 'profiles' ? (
        <>
          {profiles.isLoading ? <LoadingBlock rows={4} /> : null}
          {profiles.isError ? <ErrorNote error={profiles.error} onRetry={() => profiles.refetch()} /> : null}
          {profiles.data && !rows.length ? <EmptyNote>Сыныпта әлі оқушы жоқ.</EmptyNote> : null}
          {rows.length ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,48px)] gap-1.5 px-3 text-xs font-semibold text-bl-ink2" aria-hidden="true">
                <span>Оқушы</span>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className="text-center">
                    {n}
                  </span>
                ))}
              </div>
              {rows.map((row) => {
                const inner = (
                  <>
                    <span className="truncate text-[15px] font-semibold">{row.name}</span>
                    {[0, 1, 2, 3].map((i) => (
                      <LevelCell key={i} index={i} level={row.profile?.levels[i]} />
                    ))}
                  </>
                );
                const cls = 'grid grid-cols-[minmax(0,1fr)_repeat(4,48px)] items-center gap-1.5 rounded-[14px] border border-bl-line bg-white px-3 py-2.5 text-bl-ink no-underline';
                return studentLink ? (
                  <Link key={row.id} to={studentLink(row.id)} className={cn(cls, 'hover:border-bl-field')}>
                    {inner}
                  </Link>
                ) : (
                  <div key={row.id} className={cls}>
                    {inner}
                  </div>
                );
              })}
              <p className="m-0 mt-1 text-[13px] leading-[1.45] text-bl-ink2">
                Қалың жиек — деңгей меңгерілді. «—» — деңгей өтпеді. * — растауды күтеді. Тек «Пән» көлеміндегі емтихан.
              </p>
            </>
          ) : null}
        </>
      ) : (
        <>
          {rating.isLoading ? <LoadingBlock rows={4} /> : null}
          {rating.isError ? <ErrorNote error={rating.error} onRetry={() => rating.refetch()} /> : null}
          {rating.data ? (
            <>
              {rating.data.entries.length ? (
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {rating.data.entries.map((e) => (
                    <li key={e.student_id} className="flex items-center gap-3 rounded-[14px] border border-bl-line bg-white px-3.5 py-3">
                      <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-bl-ink text-sm font-bold text-white">
                        {e.rank}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{names.get(e.student_id) ?? 'Оқушы'}</span>
                      {e.f_is_final ? null : <Badge tone="muted">алдын ала</Badge>}
                      <span className="text-base font-bold tabular-nums">{e.f.toFixed(1).replace('.', ',')}%</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyNote>Рейтингке төрт деңгейді түгел тапсырған оқушы ғана кіреді. Әзірге ондай оқушы жоқ.</EmptyNote>
              )}
              <div className="flex gap-2.5 rounded-[14px] border border-bl-line bg-white px-4 py-3.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none text-bl-ink3">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <p className="m-0 text-sm leading-[1.45] text-bl-ink3">
                  Рейтинг тек сізге көрінеді. Оған төрт деңгейді түгел тапсырған оқушылар ғана кіреді: {rating.data.full_count} / {rating.data.total}.
                </p>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
