import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  GraduationCap,
  Plus,
  RotateCcw,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  useSubjects,
  useTeacherCourseWorkspace,
} from '@/hooks/use-platform-data';
import { TeacherCourseBuilderSkeleton } from '@/components/course-builder/TeacherCourseBuilderSkeleton';
import { CourseBasicCreateCard } from '@/components/course-builder/CourseBasicCreateCard';
import { useCourseBuilderForms } from '@/hooks/course-factor/useCourseBuilderForms';
import { useCourseBuilderController } from '@/hooks/course-factor/useCourseBuilderController';
import { useCourseBuilderCourseMutations } from '@/hooks/course-factor/useCourseBuilderCourseMutations';

export default function TeacherCreateCoursePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjects();

  // Legacy redirect: if a courseId query param was passed, redirect to the dedicated edit page
  useEffect(() => {
    const requestedCourseId = new URLSearchParams(window.location.search).get('courseId');
    if (requestedCourseId) {
      navigate(`/teacher/courses/${requestedCourseId}/edit`, { replace: true });
    }
  }, [navigate]);

  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
  } = useTeacherCourseWorkspace(user?.id || '', Boolean(user?.id));

  const {
    newCourse,
    setNewCourse,
    courseEdit,
    setCourseEdit,
    moduleForm,
    setModuleForm,
    lessonForm,
    setLessonForm,
    editingLessonId,
    setEditingLessonId,
    setLessonAttachmentForm,
    setMiniQuizQuestionForm,
    setAnnouncementForm,
    setEditingAnnouncementId,
    setEditingMiniQuizQuestionId,
  } = useCourseBuilderForms();

  const {
    setSelectedCourseId,
    selectedCourse,
    syncCourseParam,
    selectCourse,
    resetNewCourse,
    resetLessonForm,
    refetchWorkspace,
  } = useCourseBuilderController({
    userId: user?.id,
    workspace,
    queryClient,
    setNewCourse,
    setCourseEdit,
    setLessonForm,
    editingLessonId,
    setEditingLessonId,
    setEditingMiniQuizQuestionId,
    setLessonAttachmentForm,
    setMiniQuizQuestionForm,
    setAnnouncementForm,
    setEditingAnnouncementId,
  });

  const subjectOptions = subjects || [];

  const {
    createMutation,
    canCreateCourse,
  } = useCourseBuilderCourseMutations({
    user,
    workspace,
    selectedCourse,
    newCourse,
    courseEdit,
    moduleForm,
    lessonForm,
    editingLessonId,
    setSelectedCourseId,
    setModuleForm,
    setLessonForm,
    setEditingLessonId,
    queryClient,
    syncCourseParam,
    selectCourse,
    resetNewCourse,
    resetLessonForm,
    refetchWorkspace,
    toast,
    onCourseCreated: (course) => {
      navigate(`/teacher/courses/${course.id}/edit`);
    },
  });

  const handleCreateCourse = () => {
    createMutation.mutate();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-12">
        <PageHeader
          eyebrow={
            <>
              <GraduationCap size={13} />
              Курс құрастыру
            </>
          }
          icon={<Plus size={20} />}
          title="Жаңа курс құру"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="rounded-full text-xs font-semibold shadow-xs"
            >
              <Link to="/manage-courses">
                <BookOpen size={13} className="mr-1.5" />
                Курстарым
              </Link>
            </Button>
          }
        />

        {workspaceLoading ? <TeacherCourseBuilderSkeleton /> : null}

        {!workspaceLoading && workspaceError ? (
          <ErrorState
            text={t('page.teacher_course_builder.error')}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                <RotateCcw size={15} className="mr-2" />
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {!workspaceLoading && !workspaceError ? (
          <div className="mx-auto max-w-4xl space-y-6">
            <CourseBasicCreateCard
              userId={user?.id || ''}
              newCourse={newCourse}
              setNewCourse={setNewCourse}
              subjectOptions={subjectOptions}
              canCreateCourse={canCreateCourse}
              creating={createMutation.isPending}
              onCreateCourse={handleCreateCourse}
            />
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}