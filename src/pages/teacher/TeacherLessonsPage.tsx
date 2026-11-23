// Мұғалімнің сабақтары (karta §3.2, §4.1, D20): өз сабақтарын жазады, өңдейді, жариялайды.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Banner, Card, Chip, LoadingBlock, PrimaryLink, SectionLabel } from '@/components/exam/ExamUi';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { useAuth } from '@/lib/auth-context';
import { LESSON_STATUS_TITLES, platformKeys, teacherLessons } from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';

export default function TeacherLessonsPage() {
  const { user } = useAuth();
  const lessons = useQuery({
    queryKey: platformKeys.teacherLessons,
    queryFn: () => teacherLessons(user?.id ?? ''),
    enabled: !!user?.id,
  });

  return (
    <TeacherScreen title="Сабақтарым">
      <PrimaryLink to="/teacher/lessons/new">Жаңа сабақ</PrimaryLink>
      <p className="m-0 text-[13px] leading-snug text-[#5E5E5E]">
        Сабақ — өмірлік дағдылар туралы дербес бірлік: онда тест, балл және прогресс жоқ. Жарияланған сабақты барлық
        оқушы каталогтан көреді.
      </p>
      {lessons.isLoading ? <LoadingBlock /> : null}
      {lessons.isError ? <Banner tone="bad">{(lessons.error as Error).message}</Banner> : null}
      {lessons.data && lessons.data.length === 0 ? (
        <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">Әзірге сабақ жоқ.</Card>
      ) : null}
      {lessons.data?.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Барлығы · {lessons.data.length}</SectionLabel>
          {lessons.data.map((lesson) => (
            <Link key={lesson.id} to={`/teacher/lessons/${lesson.id}/edit`} className="no-underline text-inherit">
              <Card className="flex items-center justify-between gap-3 px-4 py-3.5">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{lesson.title}</span>
                  <span className="text-[13px] text-[#5E5E5E]">Өзгертілді: {formatDateTime(lesson.updated_at)}</span>
                </span>
                <Chip tone={lesson.status === 'published' ? 'good' : 'muted'}>{LESSON_STATUS_TITLES[lesson.status]}</Chip>
              </Card>
            </Link>
          ))}
        </section>
      ) : null}
    </TeacherScreen>
  );
}
