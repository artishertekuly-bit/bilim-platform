// Сынып беті (karta §4.2, D33): қосылу коды, кодты жаңарту, оқушылар тізімі, оқушыны шығару.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import UserAvatar from '@/components/UserAvatar';
import { Banner, Card, LoadingBlock, SectionLabel } from '@/components/exam/ExamUi';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { classKeys, classRoster, removeClassMember, rotateJoinCode, teacherClasses } from '@/lib/classes-api';

export default function TeacherClassPage() {
  const { classId = '' } = useParams();
  const queryClient = useQueryClient();
  const classes = useQuery({ queryKey: classKeys.teacherClasses, queryFn: teacherClasses });
  const roster = useQuery({ queryKey: classKeys.roster(classId), queryFn: () => classRoster(classId), enabled: !!classId });
  const current = classes.data?.find((item) => item.class_id === classId);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: classKeys.teacherClasses });
    void queryClient.invalidateQueries({ queryKey: ['classes', 'roster'] });
  };

  const rotate = useMutation({ mutationFn: () => rotateJoinCode(classId), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: (studentId: string) => removeClassMember(classId, studentId),
    onSuccess: refresh,
  });

  const onRotate = () => {
    if (window.confirm('Жаңа код жасалады, ескі код бірден жарамсыз болады. Жалғастырамыз ба?')) rotate.mutate();
  };

  const onRemove = (studentId: string, name: string) => {
    if (window.confirm(`${name} сыныптан шығарылсын ба? Ол осы пән бойынша нәтижесін сізге көрсетпейтін болады.`)) {
      remove.mutate(studentId);
    }
  };

  return (
    <TeacherScreen title={current?.title ?? 'Сынып'} back="/teacher">
      {classes.isLoading ? <LoadingBlock /> : null}
      {classes.isError ? <Banner tone="bad">{(classes.error as Error).message}</Banner> : null}
      {classes.data && !current ? <Banner tone="bad">Сынып табылмады.</Banner> : null}

      {current ? (
        <>
          <Card className="flex flex-col items-center gap-2 px-4 py-5 text-center">
            <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[#5E5E5E]">
              Қосылу коды · {current.subject}
            </span>
            <span className="font-mono text-4xl font-bold tracking-[0.25em]">{current.join_code}</span>
            <span className="text-[13px] leading-snug text-[#5E5E5E]">
              Оқушы кодты «Сыныптарым» бетінде енгізеді.
            </span>
            <button
              type="button"
              onClick={onRotate}
              disabled={rotate.isPending}
              className="mt-1 h-10 rounded-xl border border-[#D9D6D0] bg-white px-4 text-sm font-semibold disabled:opacity-60"
            >
              {rotate.isPending ? 'Жаңартылуда…' : 'Кодты жаңарту'}
            </button>
          </Card>
          {rotate.isError ? <Banner tone="bad">{(rotate.error as Error).message}</Banner> : null}

          <section className="flex flex-col gap-2.5">
            <SectionLabel>Оқушылар · {roster.data?.length ?? current.member_count}</SectionLabel>
            {roster.isLoading ? <LoadingBlock /> : null}
            {roster.isError ? <Banner tone="bad">{(roster.error as Error).message}</Banner> : null}
            {remove.isError ? <Banner tone="bad">{(remove.error as Error).message}</Banner> : null}
            {roster.data && roster.data.length === 0 ? (
              <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">Сыныпқа әлі ешкім қосылмаған.</Card>
            ) : null}
            {roster.data?.map((student) => (
              <Card key={student.student_id} className="flex items-center gap-3 px-4 py-3">
                <UserAvatar
                  name={student.full_name}
                  avatarUrl={student.avatar_url ?? undefined}
                  className="h-9 w-9"
                  fallbackClassName="bg-[#ECE9E3] text-xs font-semibold text-[#111111]"
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{student.full_name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(student.student_id, student.full_name)}
                  disabled={remove.isPending}
                  className="h-9 rounded-lg px-3 text-sm font-semibold text-[#B42323] hover:bg-[#FBEAEA] disabled:opacity-60"
                >
                  Шығару
                </button>
              </Card>
            ))}
          </section>
        </>
      ) : null}
    </TeacherScreen>
  );
}
