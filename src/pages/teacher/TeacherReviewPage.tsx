// Растау кезегі (api §3.9, D16, D69): өз сыныптарындағы оқушылардың ЖИ бағалары, сыныптың пәні бойынша.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Banner, Card, Chip, LoadingBlock, SectionLabel } from '@/components/exam/ExamUi';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { classKeys, teacherClasses } from '@/lib/classes-api';
import { FORMAT_TITLES, LEVEL_TITLES, useExaminerApi } from '@/lib/examiner-api';
import { formatDateTime, inputClass, reviewReasonTitle, useStudentNames } from '@/lib/teacher-ui';

const PAGE = 20;

export default function TeacherReviewPage() {
  const api = useExaminerApi();
  const [classId, setClassId] = useState('');
  const [offset, setOffset] = useState(0);
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const names = useStudentNames();
  const queue = useQuery({
    queryKey: ['examiner', 'teacher', 'queue', classId, offset],
    queryFn: () => api.teacherReviewQueue(classId || undefined, PAGE, offset),
  });

  const total = queue.data?.total ?? 0;

  return (
    <TeacherScreen title="Бағаны растау">
      {classes.data && classes.data.length > 1 ? (
        <select
          aria-label="Сынып"
          className={inputClass}
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">Барлық сыныптар</option>
          {classes.data.map((item) => (
            <option key={item.class_id} value={item.class_id}>
              {item.title} · {item.subject}
            </option>
          ))}
        </select>
      ) : null}

      {queue.isLoading ? <LoadingBlock /> : null}
      {queue.isError ? <Banner tone="bad">{(queue.error as Error).message}</Banner> : null}
      {queue.data && total === 0 ? (
        <Card className="flex flex-col gap-1.5 px-4 py-3.5">
          <span className="text-[15px] font-semibold">Кезек бос</span>
          <span className="text-sm leading-snug text-[#5E5E5E]">
            Сыныптарыңыздағы оқушылардың сынып пәні бойынша барлық ЖИ бағасы расталған.
          </span>
        </Card>
      ) : null}

      {queue.data && total > 0 ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Растауды күтеді · {total}</SectionLabel>
          {queue.data.items.map((item) => (
            <Link key={item.grade_id} to={`/teacher/grades/${item.grade_id}`} className="no-underline text-inherit">
              <Card className="flex flex-col gap-2 px-4 py-3.5">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-[15px] font-semibold">{names.get(item.student_id) ?? 'Оқушы'}</span>
                  <span className="text-lg font-bold">
                    {item.effective_score ?? '—'}
                    <span className="text-sm font-semibold text-[#5E5E5E]">/4</span>
                  </span>
                </span>
                <span className="text-[13px] text-[#5E5E5E]">
                  {FORMAT_TITLES[item.format] ?? item.format} · {item.level}-деңгей ({LEVEL_TITLES[item.level] ?? ''}) ·{' '}
                  {formatDateTime(item.created_at)}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Chip tone={item.review_reason ? 'neutral' : 'muted'}>{reviewReasonTitle(item.review_reason)}</Chip>
                  {item.appealed ? <Chip>Шағым бар</Chip> : null}
                </span>
              </Card>
            </Link>
          ))}
          {total > PAGE ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                className="h-10 rounded-xl border border-[#D9D6D0] bg-white px-4 font-semibold disabled:opacity-50"
              >
                Алдыңғы
              </button>
              <span className="text-[#5E5E5E]">
                {offset + 1}–{Math.min(offset + PAGE, total)} / {total}
              </span>
              <button
                type="button"
                disabled={offset + PAGE >= total}
                onClick={() => setOffset(offset + PAGE)}
                className="h-10 rounded-xl border border-[#D9D6D0] bg-white px-4 font-semibold disabled:opacity-50"
              >
                Келесі
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </TeacherScreen>
  );
}
