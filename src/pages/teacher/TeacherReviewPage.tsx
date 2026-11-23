// Растау кезегі (дизайн: TeacherReview.dc.html; api §3.9, D16, D69): ЖИ бағаларын бір-бірлеп растау не түзету.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ButtonLink, ErrorNote, LoadingBlock, StateCard } from '@/components/bl/ui';
import GradeReview from '@/components/teacher/GradeReview';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { useExaminerApi } from '@/lib/examiner-api';
import { useStudentNames } from '@/lib/teacher-ui';

const PAGE = 50;

export default function TeacherReviewPage() {
  const api = useExaminerApi();
  const names = useStudentNames();
  const [index, setIndex] = useState(0);
  // Кезек бірінші жүктелгендегі күйінде қалады: растағаннан кейін элемент кезектен шықса да, реттік нөмір сақталады.
  const queue = useQuery({
    queryKey: ['examiner', 'teacher', 'queue', 'review-flow'],
    queryFn: () => api.teacherReviewQueue(undefined, PAGE, 0),
    staleTime: Infinity,
  });

  const items = queue.data?.items ?? [];
  const total = queue.data?.total ?? 0;
  const item = items[index];

  if (queue.isLoading || queue.isError || !items.length || !item) {
    return (
      <TeacherScreen title="Растау">
        {queue.isLoading ? <LoadingBlock rows={3} /> : null}
        {queue.isError ? <ErrorNote error={queue.error} onRetry={() => queue.refetch()} /> : null}
        {queue.data && (!items.length || !item) ? (
          <StateCard
            markTone="ok"
            mark="✓"
            title={items.length ? 'Кезек аяқталды' : 'Кезек бос'}
            text="Сыныптарыңыздағы оқушылардың сынып пәні бойынша барлық ЖИ бағасы расталған."
          >
            {items.length ? (
              <ButtonLink
                to="/teacher/review"
                onClick={() => {
                  setIndex(0);
                  void queue.refetch();
                }}
                variant="secondary"
                size="md"
              >
                Кезекті жаңарту
              </ButtonLink>
            ) : null}
            <ButtonLink to="/teacher">Панельге оралу</ButtonLink>
          </StateCard>
        ) : null}
      </TeacherScreen>
    );
  }

  return (
    <GradeReview
      key={item.grade_id}
      gradeId={item.grade_id}
      back="/teacher"
      title={`Растау · ${index + 1} / ${Math.max(total, items.length)}`}
      meta={names.get(item.student_id) ?? 'Оқушы'}
      onNext={() => setIndex((i) => i + 1)}
      nextLabel={index + 1 < items.length ? 'Келесі жауап' : 'Аяқтау'}
    />
  );
}
