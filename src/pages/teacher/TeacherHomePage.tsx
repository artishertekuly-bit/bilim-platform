// Мұғалім панелі (karta §4.1): растау кезегі, сыныптар және жаңа сынып (api §5.2, D33, D38).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { Banner, Card, Chip, LoadingBlock, PrimaryButton, SectionLabel } from '@/components/exam/ExamUi';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { classKeys, createClass, listSubjects, teacherClasses } from '@/lib/classes-api';
import { useExaminerApi } from '@/lib/examiner-api';
import { ALERT_CATEGORY_TITLES, attentionList, platformKeys } from '@/lib/platform-api';
import { formatDateTime, inputClass, useStudentNames } from '@/lib/teacher-ui';

export default function TeacherHomePage() {
  const api = useExaminerApi();
  const queryClient = useQueryClient();
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const subjects = useQuery({ queryKey: classKeys.subjects, queryFn: listSubjects });
  const queue = useQuery({
    queryKey: ['examiner', 'teacher', 'queue', 'summary'],
    queryFn: () => api.teacherReviewQueue(undefined, 1, 0),
  });
  const attention = useQuery({ queryKey: platformKeys.attention, queryFn: attentionList });
  const names = useStudentNames();

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [created, setCreated] = useState<{ title: string; code: string } | null>(null);

  const create = useMutation({
    mutationFn: () => createClass(title.trim(), subjectId),
    onSuccess: (result) => {
      setCreated({ title: title.trim(), code: result.join_code });
      setTitle('');
      void queryClient.invalidateQueries({ queryKey: classKeys.teacherClasses });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !subjectId || create.isPending) return;
    setCreated(null);
    create.mutate();
  };

  const pending = queue.data?.total ?? 0;

  return (
    <TeacherScreen title="Мұғалім панелі">
      <Link to="/teacher/review" className="no-underline text-inherit">
        <Card className="flex items-center justify-between gap-3 px-4 py-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Бағаны растау</span>
            <span className="text-[13px] text-[#5E5E5E]">
              {queue.isError ? 'Кезек жүктелмеді' : 'ЖИ қойған, растауды күтетін бағалар'}
            </span>
          </span>
          <span className="text-2xl font-bold">{queue.isLoading ? '…' : pending}</span>
        </Card>
      </Link>

      {attention.data && attention.data.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Назар аударуды қажет ететін оқушылар</SectionLabel>
          {attention.data.map((row) => (
            <Link key={row.student_id} to={`/teacher/students/${row.student_id}`} className="no-underline text-inherit">
              <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{names.get(row.student_id) ?? 'Оқушы'}</span>
                  <span className="text-[13px] text-[#5E5E5E]">
                    {(row.last_category && ALERT_CATEGORY_TITLES[row.last_category]) || 'Дабыл'}
                    {row.last_alert_at ? ` · ${formatDateTime(row.last_alert_at)}` : ''}
                  </span>
                </span>
                <span className="rounded-full bg-[#FBEAEA] px-2.5 py-1 text-xs font-bold text-[#B42323]">
                  {row.open_count}
                </span>
              </Card>
            </Link>
          ))}
        </section>
      ) : null}
      {attention.isError ? <Banner tone="warn">Дабылдар жүктелмеді: {(attention.error as Error).message}</Banner> : null}

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Сыныптарым</SectionLabel>
        {classes.isLoading ? <LoadingBlock /> : null}
        {classes.isError ? <Banner tone="bad">{(classes.error as Error).message}</Banner> : null}
        {classes.data && classes.data.length === 0 ? (
          <Card className="px-4 py-3.5 text-sm leading-snug text-[#5E5E5E]">
            Әзірге сынып жоқ. Төменде сынып жасаңыз да, кодын оқушыларға беріңіз.
          </Card>
        ) : null}
        {classes.data?.map((item) => (
          <Link key={item.class_id} to={`/teacher/classes/${item.class_id}`} className="no-underline text-inherit">
            <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold">{item.title}</span>
                <span className="text-[13px] text-[#5E5E5E]">
                  {item.subject} · {item.member_count} оқушы
                </span>
              </span>
              <Chip>{item.join_code}</Chip>
            </Card>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Жаңа сынып</SectionLabel>
        <Card className="p-4">
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Атауы
              <input
                className={inputClass}
                value={title}
                maxLength={120}
                placeholder="Мысалы: 5 «А» — Қазақстан тарихы"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Пән
              <select
                className={inputClass}
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
              >
                <option value="">Пәнді таңдаңыз</option>
                {subjects.data?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name_kk}
                  </option>
                ))}
              </select>
            </label>
            <p className="m-0 text-[13px] leading-snug text-[#5E5E5E]">
              Сыныптағы оқушылардың тек осы пән бойынша нәтижесін көресіз.
            </p>
            <PrimaryButton type="submit" disabled={!title.trim() || !subjectId || create.isPending}>
              {create.isPending ? 'Жасалуда…' : 'Сынып жасау'}
            </PrimaryButton>
          </form>
        </Card>
        {create.isError ? <Banner tone="bad">{(create.error as Error).message}</Banner> : null}
        {created ? (
          <Banner tone="good">
            «{created.title}» сыныбы жасалды. Қосылу коды: {created.code}
          </Banner>
        ) : null}
      </section>
    </TeacherScreen>
  );
}
