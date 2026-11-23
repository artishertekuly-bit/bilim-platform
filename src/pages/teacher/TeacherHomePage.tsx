// Мұғалім панелі (дизайн: TeacherHome.dc.html; karta §4.1): сынып ауыстырғыш, назар аударатын оқушылар,
// растау кезегі, деңгейлер бойынша сынып нәтижесі, сыныптар мен ойын бөлмесі.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ChevronIcon, PlusIcon } from '@/components/bl/icons';
import { ButtonLink, CountBadge, ErrorNote, ListGroup, ListRow, LoadingBlock, Segmented, Select, StateCard } from '@/components/bl/ui';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { useAuth } from '@/lib/auth-context';
import { classKeys, classRoster, teacherClasses } from '@/lib/classes-api';
import { LEVEL_TITLES, useExaminerApi } from '@/lib/examiner-api';
import { ALERT_CATEGORY_TITLES, attentionList, platformKeys } from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';

const CLASS_KEY = 'bilim.teacher.class';

function readClass(): string | null {
  try {
    return window.localStorage.getItem(CLASS_KEY);
  } catch {
    return null;
  }
}

export default function TeacherHomePage() {
  const { user } = useAuth();
  const api = useExaminerApi();
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const [classId, setClassId] = useState<string | null>(readClass);

  useEffect(() => {
    const list = classes.data;
    if (list?.length && (!classId || !list.some((c) => c.class_id === classId))) setClassId(list[0].class_id);
  }, [classes.data, classId]);

  const pick = (id: string) => {
    setClassId(id);
    try {
      window.localStorage.setItem(CLASS_KEY, id);
    } catch {
      /* жеке терезе */
    }
  };

  const current = classes.data?.find((c) => c.class_id === classId) ?? null;
  const roster = useQuery({ queryKey: classKeys.roster(classId ?? undefined), queryFn: () => classRoster(classId as string), enabled: Boolean(classId) });
  const attention = useQuery({ queryKey: platformKeys.attention, queryFn: attentionList });
  const queue = useQuery({
    queryKey: ['examiner', 'teacher', 'queue', 'summary', classId],
    queryFn: () => api.teacherReviewQueue(classId ?? undefined, 1, 0),
    enabled: Boolean(classId),
  });
  const profiles = useQuery({
    queryKey: ['examiner', 'teacher', 'class-profiles', classId],
    queryFn: () => api.teacherClassProfiles(classId as string),
    enabled: Boolean(classId),
  });

  const names = useMemo(() => new Map((roster.data ?? []).map((s) => [s.student_id, s.full_name])), [roster.data]);
  const attentionRows = (attention.data ?? []).filter((row) => names.has(row.student_id));

  // Бірінші оқулық бойынша әр деңгейді тапсырған және меңгерген оқушылар саны.
  const levelStats = useMemo(() => {
    const data = profiles.data;
    if (!data) return [];
    const book = data.books[0]?.book;
    return [1, 2, 3, 4].map((level) => {
      let taken = 0;
      let mastered = 0;
      data.students.forEach((s) => {
        const profile = s.profiles.find((p) => p.subject.book === book) ?? s.profiles[0];
        const lv = profile?.levels.find((l) => l.level === level);
        if (lv && lv.p !== null) taken += 1;
        if (lv?.mastered) mastered += 1;
      });
      return { level, taken, mastered };
    });
  }, [profiles.data]);
  const studentCount = profiles.data?.students.length ?? current?.member_count ?? 0;
  const pct = (n: number) => `${studentCount ? Math.round((n / studentCount) * 100) : 0}%`;
  const subjects = [...new Set((classes.data ?? []).map((c) => c.subject))].join(', ');

  return (
    <TeacherScreen title="Мұғалім панелі" subtitle={[user?.fullName, subjects].filter(Boolean).join(' · ')}>
      {classes.isLoading ? <LoadingBlock rows={3} /> : null}
      {classes.isError ? <ErrorNote error={classes.error} onRetry={() => classes.refetch()} /> : null}

      {classes.data && classes.data.length === 0 ? (
        <StateCard title="Әзірге сынып жоқ" text="Сынып ашып, қосылу кодын оқушыларға беріңіз. Сонда олардың нәтижесі осында көрінеді.">
          <ButtonLink to="/teacher/classes?new=1">Сынып ашу</ButtonLink>
        </StateCard>
      ) : null}

      {classes.data && classes.data.length > 0 ? (
        classes.data.length <= 3 ? (
          <Segmented
            label="Сынып"
            value={classId ?? ''}
            onChange={pick}
            options={classes.data.map((c) => ({ id: c.class_id, label: c.title }))}
          />
        ) : (
          <>
            <label htmlFor="teacher-class" className="sr-only">
              Сынып
            </label>
            <Select id="teacher-class" value={classId ?? ''} onChange={(e) => pick(e.target.value)}>
              {classes.data.map((c) => (
                <option key={c.class_id} value={c.class_id}>
                  {c.title} · {c.subject}
                </option>
              ))}
            </Select>
          </>
        )
      ) : null}

      {current ? (
        <>
          <section className="flex flex-col gap-2.5 rounded-2xl border border-bl-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-base font-semibold">Назар аударуды қажет ететін оқушылар</h2>
              {attentionRows.length ? <CountBadge count={attentionRows.length} /> : null}
            </div>
            {attention.isError ? <ErrorNote error={attention.error} /> : null}
            {attentionRows.map((row) => (
              <Link
                key={row.student_id}
                to={`/teacher/students/${row.student_id}`}
                className="flex min-h-[52px] items-center gap-2.5 border-t border-bl-soft py-2 text-bl-ink no-underline"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{names.get(row.student_id)}</span>
                  <span className="text-[13px] leading-[1.35] text-bl-ink2">
                    {(row.last_category && ALERT_CATEGORY_TITLES[row.last_category]) || 'Дабыл'} · {row.open_count} ашық
                    {row.last_alert_at ? ` · ${formatDateTime(row.last_alert_at)}` : ''}
                  </span>
                </span>
                <ChevronIcon />
              </Link>
            ))}
            {attention.data && !attentionRows.length ? <p className="m-0 text-sm text-bl-ink2">Қазір назар аударатын оқушы жоқ</p> : null}
          </section>

          <section className="flex items-center gap-3 rounded-2xl border border-bl-line bg-white p-4">
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-base font-semibold">Растау кезегі · {queue.isLoading ? '…' : queue.data?.total ?? 0}</span>
              <span className="text-[13px] leading-[1.4] text-bl-ink2">ЖИ қойған бағалар және дәйексөзі табылмаған жауаптар</span>
            </span>
            <ButtonLink to="/teacher/review" size="sm" full={false}>
              Қарау
            </ButtonLink>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-bl-line bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="m-0 text-base font-semibold">Сынып нәтижесі</h2>
              <span className="text-[13px] text-bl-ink2">{studentCount} оқушы</span>
            </div>
            {profiles.isLoading ? <LoadingBlock rows={2} /> : null}
            {profiles.isError ? <ErrorNote error={profiles.error} onRetry={() => profiles.refetch()} /> : null}
            {levelStats.map((lv) => (
              <div key={lv.level} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">
                    {lv.level} · {LEVEL_TITLES[lv.level]}
                  </span>
                  <span className="text-bl-ink3">
                    тапсырды {lv.taken} · меңгерді {lv.mastered}
                  </span>
                </div>
                <div aria-hidden="true" className="relative h-2 overflow-hidden rounded-full bg-[#F1EFEA]">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-bl-avatar" style={{ width: pct(lv.taken) }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-bl-ink" style={{ width: pct(lv.mastered) }} />
                </div>
              </div>
            ))}
            <ButtonLink to={`/teacher/classes/${current.class_id}`} variant="secondary" size="sm">
              Толық кесте мен рейтинг
            </ButtonLink>
          </section>
        </>
      ) : null}

      <ListGroup>
        <ListRow to="/teacher/classes">Сыныптар мен кодтар</ListRow>
        <ListRow to="/teacher/games">Ойын бөлмесін ашу · проектор</ListRow>
      </ListGroup>

      <Link
        to="/teacher/lessons/new"
        className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#8C877E] bg-transparent text-[15px] font-semibold text-bl-ink no-underline"
      >
        <PlusIcon size={18} />
        Жаңа сабақ жазу
      </Link>
    </TeacherScreen>
  );
}
