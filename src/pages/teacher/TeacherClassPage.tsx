// Сынып нәтижесі (дизайн: TeacherClass.dc.html; karta §4.2, D38): профильдер кестесі және рейтинг.
// Код, QR және оқушыны шығару — «Сыныптар мен кодтар» бетінде (/teacher/classes).
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { ButtonLink, ErrorNote, LoadingBlock, StateCard } from '@/components/bl/ui';
import ClassAnalytics from '@/components/teacher/ClassAnalytics';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { classKeys, classRoster, teacherClasses } from '@/lib/classes-api';

export default function TeacherClassPage() {
  const { classId = '' } = useParams();
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const roster = useQuery({ queryKey: classKeys.roster(classId), queryFn: () => classRoster(classId), enabled: !!classId });
  const current = classes.data?.find((c) => c.class_id === classId);
  const names = useMemo(() => new Map((roster.data ?? []).map((s) => [s.student_id, s.full_name])), [roster.data]);

  return (
    <TeacherScreen
      title={current ? `${current.title} · ${current.subject}` : 'Сынып'}
      back="/teacher"
      backLabel="Панельге оралу"
      right={
        current ? (
          <ButtonLink to={`/teacher/classes?open=${current.class_id}`} variant="ghost" size="sm" full={false}>
            Код
          </ButtonLink>
        ) : undefined
      }
    >
      {classes.isLoading ? <LoadingBlock rows={4} /> : null}
      {classes.isError ? <ErrorNote error={classes.error} onRetry={() => classes.refetch()} /> : null}
      {classes.data && !current ? (
        <StateCard mark="404" title="Сынып табылмады" text="Сынып жойылған немесе ол сіздің сыныбыңыз емес.">
          <ButtonLink to="/teacher">Панельге оралу</ButtonLink>
        </StateCard>
      ) : null}
      {current ? <ClassAnalytics classId={classId} names={names} studentLink={(id) => `/teacher/students/${id}`} /> : null}
    </TeacherScreen>
  );
}
