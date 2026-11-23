// Бір бағаны ашу (хабарламадан, оқушы бетінен): растау экранының өзі (дизайн: TeacherReview.dc.html).
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import GradeReview from '@/components/teacher/GradeReview';
import { useExaminerApi } from '@/lib/examiner-api';
import { useStudentNames } from '@/lib/teacher-ui';

export default function TeacherGradePage() {
  const { gradeId = '' } = useParams();
  const navigate = useNavigate();
  const api = useExaminerApi();
  const names = useStudentNames();
  const detail = useQuery({ queryKey: ['examiner', 'teacher', 'grade', gradeId], queryFn: () => api.teacherGradeDetail(gradeId), enabled: !!gradeId });

  return (
    <GradeReview
      gradeId={gradeId}
      back="/teacher/review"
      title="Бағаны растау"
      meta={detail.data ? names.get(detail.data.student_id) ?? 'Оқушы' : undefined}
      onNext={() => navigate('/teacher/review')}
      nextLabel="Кезекке оралу"
    />
  );
}
