import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  platformKeys,
  useCourseAnnouncements,
  useCourseAssets,
  useLessonAttachments,
  useLessonMiniQuiz,
  useSubjects,
  useTeacherCourseWorkspace,
} from '@/hooks/use-platform-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
} from '@/components/common/DataState';
import { useToast } from '@/hooks/use-toast';
import { BuilderStatCard } from '@/components/course-builder/BuilderStatCard';
import { CourseAnnouncementsPanel } from '@/components/course-builder/CourseAnnouncementsPanel';
import { CourseBuilderStepper } from '@/components/course-builder/CourseBuilderStepper';
import { TeacherCourseBuilderSkeleton } from '@/components/course-builder/TeacherCourseBuilderSkeleton';
import { LessonMiniQuizEditor } from '@/components/course-builder/LessonMiniQuizEditor';
import { CourseMaterialsPanel } from '@/components/course-builder/CourseMaterialsPanel';
import { CourseInviteCodesPanel } from '@/components/course-builder/CourseInviteCodesPanel';
import { LessonAttachmentPanel } from '@/components/course-builder/LessonAttachmentPanel';
import { ModuleListPanel } from '@/components/course-builder/ModuleListPanel';
import { LessonEditorPanel } from '@/components/course-builder/LessonEditorPanel';
import { CourseBasicCreateCard } from '@/components/course-builder/CourseBasicCreateCard';
import { CourseManageList } from '@/components/course-builder/CourseManageList';
import { CourseSettingsCard } from '@/components/course-builder/CourseSettingsCard';
import { CourseSummaryCard } from '@/components/course-builder/CourseSummaryCard';
import { CoursePublishPanel } from '@/components/course-builder/CoursePublishPanel';
import { CourseDangerZone } from '@/components/course-builder/CourseDangerZone';
import { useCourseBuilderForms } from '@/hooks/course-factor/useCourseBuilderForms';
import { useCourseBuilderCourseMutations } from '@/hooks/course-factor/useCourseBuilderCourseMutations';
import { useCourseBuilderSidePanels } from '@/hooks/course-factor/useCourseBuilderSidePanels';
import { useCourseBuilderMiniQuiz } from '@/hooks/course-factor/useCourseBuilderMiniQuiz';
import {
  formatPrice,
  getAccessTypeLabel,
  getCourseStatusTone,
  getNextSortOrder,
  getSortedBySortOrder,
  normalizeCurrency,
  parsePrice,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import { getNextMiniQuizQuestionSortOrder } from '@/lib/course-creator/mini-quiz-utils';
import {
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Settings,
} from 'lucide-react';

export default function TeacherCreateCoursePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedCourseId = searchParams.get('courseId') || '';

  const { data: subjects } = useSubjects();
  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
  } = useTeacherCourseWorkspace(user?.id || '', !!user?.id);

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const lastSeededCourseId = useRef('');

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
    inviteForm,
    setInviteForm,
    courseAssetForm,
    setCourseAssetForm,
    lessonAttachmentForm,
    setLessonAttachmentForm,
    miniQuizForm,
    setMiniQuizForm,
    miniQuizQuestionForm,
    setMiniQuizQuestionForm,
    editingMiniQuizQuestionId,
    setEditingMiniQuizQuestionId,
    announcementForm,
    setAnnouncementForm,
    editingAnnouncementId,
    setEditingAnnouncementId,
  } = useCourseBuilderForms();

  const selectedCourse = useMemo(
    () =>
      workspace?.courses.find((course) => course.id === selectedCourseId) ||
      workspace?.courses.find((course) => course.id === requestedCourseId) ||
      workspace?.courses[0] ||
      null,
    [workspace, selectedCourseId, requestedCourseId]
  );

  const selectedCourseModules = useMemo(
    () => getSortedBySortOrder(selectedCourse?.modules || []),
    [selectedCourse]
  );

  const selectedEditingLesson = useMemo(
    () =>
      selectedCourse?.modules
        .flatMap((module) => module.lessons)
        .find((lesson) => lesson.id === editingLessonId) || null,
    [editingLessonId, selectedCourse]
  );

  const {
    data: courseAssets,
    isLoading: courseAssetsLoading,
  } = useCourseAssets(selectedCourse?.id || '', !!selectedCourse?.id);

  const {
    data: courseAnnouncements,
    isLoading: courseAnnouncementsLoading,
  } = useCourseAnnouncements(selectedCourse?.id || '', !!selectedCourse?.id, true);

  const {
    data: lessonAttachments,
    isLoading: lessonAttachmentsLoading,
  } = useLessonAttachments(editingLessonId || '', !!editingLessonId);

  const {
    data: miniQuizData,
    isLoading: miniQuizLoading,
  } = useLessonMiniQuiz(editingLessonId || '', user?.id, !!editingLessonId, true);

  const selectedMiniQuiz = miniQuizData?.quiz || null;

  const selectedCourseModuleSignature =
    selectedCourseModules.map((module) => module.id).join('|') || '';

  const subjectOptions = subjects || [];

  const defaultModuleId = selectedCourseModules[0]?.id || '';

  const courseStatusLabels: Record<CourseStatus, string> = {
    draft: t('course.status.draft'),
    published: t('course.status.published'),
    archived: t('course.status.archived'),
  };

  const syncCourseParam = useCallback(
    (courseId?: string) => {
      const next = new URLSearchParams(searchParams);

      if (courseId) {
        next.set('courseId', courseId);
      } else {
        next.delete('courseId');
      }

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const selectCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    syncCourseParam(courseId);
    setEditingLessonId(null);
    setEditingMiniQuizQuestionId(null);
    setEditingAnnouncementId(null);
    setLessonAttachmentForm({ title: '', description: '', externalUrl: '' });
    setMiniQuizQuestionForm({
      questionText: '',
      questionType: 'single_choice',
      options: ['', '', '', ''],
      correctAnswer: [],
      explanation: '',
      sortOrder: '1',
    });
    setAnnouncementForm({
      title: '',
      body: '',
      priority: 'normal',
      isPinned: false,
      expiresAt: '',
    });
  };

  const getNextLessonSortOrder = useCallback(
    (moduleId?: string) => {
      if (!selectedCourse || !moduleId) return '1';

      const module = selectedCourse.modules.find((item) => item.id === moduleId);
      if (!module) return '1';

      return getNextSortOrder(module.lessons || []);
    },
    [selectedCourse]
  );

  const resetNewCourse = () => {
    setNewCourse({
      title: '',
      description: '',
      subjectId: '',
      accessType: 'public_free',
      visibility: 'public',
      price: '0',
      currency: 'KZT',
      enrollmentOpen: true,
      maxStudents: '',
      moduleTitle: t('page.teacher_course_builder.defaults.module_title'),
      lessonTitle: t('page.teacher_course_builder.defaults.lesson_title'),
      lessonBody: t('page.teacher_course_builder.defaults.lesson_body'),
      lessonPractice: t('page.teacher_course_builder.defaults.lesson_practice'),
      lessonVideo: '',
    });
  };

  const resetLessonForm = useCallback(() => {
    const moduleId = defaultModuleId;

    setLessonForm({
      moduleId,
      title: '',
      contentBody: '',
      practiceContent: '',
      mediaUrl: '',
      sortOrder: getNextLessonSortOrder(moduleId),
      isPublished: false,
    });
    setEditingLessonId(null);
    setEditingMiniQuizQuestionId(null);
    setLessonAttachmentForm({ title: '', description: '', externalUrl: '' });
    setMiniQuizQuestionForm({
      questionText: '',
      questionType: 'single_choice',
      options: ['', '', '', ''],
      correctAnswer: [],
      explanation: '',
      sortOrder: '1',
    });
  }, [defaultModuleId, getNextLessonSortOrder]);

  const seedEditFromCourse = (courseId: string) => {
    const course = workspace?.courses.find((item) => item.id === courseId);
    if (!course) return;

    const sortedModules = getSortedBySortOrder(course.modules || []);
    const firstModuleId = sortedModules[0]?.id || '';

    selectCourse(courseId);
    setCourseEdit({
      title: course.title,
      description: course.description || '',
      subjectId: course.subjectId || '',
      thumbnailUrl: course.thumbnailUrl || '',
      status: course.status === 'archived' ? 'archived' : course.status === 'published' ? 'published' : 'draft',
      accessType: course.accessType || 'public_free',
      visibility: course.visibility || 'public',
      price: String(course.price ?? 0),
      currency: course.currency || 'KZT',
      enrollmentOpen: course.enrollmentOpen ?? true,
      maxStudents: course.maxStudents ? String(course.maxStudents) : '',
    });
    setLessonForm((prev) => ({
      ...prev,
      moduleId: firstModuleId,
      sortOrder: firstModuleId
        ? getNextSortOrder(sortedModules[0]?.lessons || [])
        : '1',
    }));
    setEditingLessonId(null);
  };

  useEffect(() => {
    if (!workspace?.courses?.length) {
      if (selectedCourseId) {
        setSelectedCourseId('');
      }
      if (requestedCourseId) {
        syncCourseParam();
      }
      return;
    }

    const course =
      workspace.courses.find((item) => item.id === requestedCourseId) ||
      workspace.courses.find((item) => item.id === selectedCourseId) ||
      workspace.courses[0];

    if (!course) return;

    if (course.id !== selectedCourseId) {
      setSelectedCourseId(course.id);
    }

    if (requestedCourseId !== course.id) {
      syncCourseParam(course.id);
    }
  }, [workspace, requestedCourseId, selectedCourseId, syncCourseParam]);

  useEffect(() => {
    if (!selectedCourse) return;
    if (lastSeededCourseId.current === selectedCourse.id) return;

    lastSeededCourseId.current = selectedCourse.id;

    setCourseEdit({
      title: selectedCourse.title,
      description: selectedCourse.description || '',
      subjectId: selectedCourse.subjectId || '',
      thumbnailUrl: selectedCourse.thumbnailUrl || '',
      status: selectedCourse.status === 'archived' ? 'archived' : selectedCourse.status === 'published' ? 'published' : 'draft',
      accessType: selectedCourse.accessType || 'public_free',
      visibility: selectedCourse.visibility || 'public',
      price: String(selectedCourse.price ?? 0),
      currency: selectedCourse.currency || 'KZT',
      enrollmentOpen: selectedCourse.enrollmentOpen ?? true,
      maxStudents: selectedCourse.maxStudents ? String(selectedCourse.maxStudents) : '',
    });
  }, [selectedCourse]);

  useEffect(() => {
    if (!selectedCourse) return;

    setLessonForm((prev) => {
      const hasCurrentModule =
        !!prev.moduleId &&
        selectedCourse.modules.some((module) => module.id === prev.moduleId);

      const nextModuleId = hasCurrentModule ? prev.moduleId : defaultModuleId;

      return {
        ...prev,
        moduleId: nextModuleId,
        sortOrder:
          prev.moduleId === nextModuleId
            ? prev.sortOrder
            : getNextLessonSortOrder(nextModuleId),
      };
    });
  }, [selectedCourse, defaultModuleId, getNextLessonSortOrder, selectedCourseModuleSignature]);

  useEffect(() => {
    if (!selectedCourse || !editingLessonId) return;

    const lessonStillExists = selectedCourse.modules.some((module) =>
      module.lessons.some((lesson) => lesson.id === editingLessonId)
    );

    if (!lessonStillExists) {
      setEditingLessonId(null);
      setEditingMiniQuizQuestionId(null);
      setLessonAttachmentForm({ title: '', description: '', externalUrl: '' });
      setMiniQuizQuestionForm({
        questionText: '',
        questionType: 'single_choice',
        options: ['', '', '', ''],
        correctAnswer: [],
        explanation: '',
        sortOrder: '1',
      });
    }
  }, [selectedCourse, editingLessonId]);

  useEffect(() => {
    if (!selectedMiniQuiz) {
      setMiniQuizForm((prev) => ({
        ...prev,
        title: 'Сабақ соңындағы қысқа тест',
        description: '',
        passingScore: '60',
        isPublished: false,
      }));
      setMiniQuizQuestionForm((prev) => ({
        ...prev,
        sortOrder: '1',
      }));
      return;
    }

    setMiniQuizForm({
      title: selectedMiniQuiz.title,
      description: selectedMiniQuiz.description || '',
      passingScore: String(selectedMiniQuiz.passingScore),
      isPublished: selectedMiniQuiz.isPublished,
    });

    setMiniQuizQuestionForm((prev) => ({
      ...prev,
      sortOrder: getNextMiniQuizQuestionSortOrder(selectedMiniQuiz.questions),
    }));
  }, [selectedMiniQuiz?.id, selectedMiniQuiz?.updatedAt, selectedMiniQuiz?.questionsCount]);

  const refetchWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherCourseWorkspace(user?.id || ''),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherDashboard(user?.id || ''),
      }),
      queryClient.invalidateQueries({ queryKey: ['courses'] }),
      queryClient.invalidateQueries({ queryKey: ['course-invites'] }),
      queryClient.invalidateQueries({ queryKey: ['course-assets'] }),
      queryClient.invalidateQueries({ queryKey: ['course-announcements'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-attachments'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-mini-quiz'] }),
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: platformKeys.adminDashboard }),
      queryClient.invalidateQueries({ queryKey: platformKeys.moderationQueue }),
    ]);
  };

  const {
    createMutation,
    updateCourseMutation,
    deleteCourseMutation,
    addModuleMutation,
    deleteModuleMutation,
    reorderModulesMutation,
    addOrUpdateLessonMutation,
    deleteLessonMutation,
    reorderLessonsMutation,
    quickStatusMutation,
    updateModuleTitleMutation,
    startEditLesson,
    canCreateCourse,
    canAddModule,
    canSaveLesson,
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
  });

  const {
    courseInvites,
    courseInvitesLoading,
    createInviteMutation,
    deactivateInviteMutation,
    createAnnouncementMutation,
    updateAnnouncementMutation,
    deleteAnnouncementMutation,
    createCourseAssetMutation,
    deleteCourseAssetMutation,
    createLessonAttachmentMutation,
    deleteLessonAttachmentMutation,
    handleCreateInvite,
    handleDeactivateInvite,
    copyInviteCode,
    handleCreateCourseAsset,
    handleDeleteCourseAsset,
    resetAnnouncementForm,
    handleEditAnnouncement,
    handleSaveAnnouncement,
    handleDeleteAnnouncement,
    handleCreateLessonAttachment,
    handleDeleteLessonAttachment,
    canCreateCourseAsset,
    canSaveAnnouncement,
    canCreateLessonAttachment,
  } = useCourseBuilderSidePanels({
    user,
    selectedCourse,
    selectedEditingLesson,
    courseAssets,
    lessonAttachments,
    inviteForm,
    setInviteForm,
    courseAssetForm,
    setCourseAssetForm,
    lessonAttachmentForm,
    setLessonAttachmentForm,
    announcementForm,
    setAnnouncementForm,
    editingAnnouncementId,
    setEditingAnnouncementId,
    refetchWorkspace,
    toast,
  });

  const {
    upsertMiniQuizMutation,
    deleteMiniQuizMutation,
    createMiniQuizQuestionMutation,
    updateMiniQuizQuestionMutation,
    deleteMiniQuizQuestionMutation,
    reorderMiniQuizQuestionsMutation,
    resetMiniQuizQuestionForm,
    handleSaveMiniQuiz,
    handleDeleteMiniQuiz,
    handleToggleMiniQuizCorrectAnswer,
    handleEditMiniQuizQuestion,
    handleSaveMiniQuizQuestion,
    handleDeleteMiniQuizQuestion,
    handleMoveMiniQuizQuestion,
    canSaveMiniQuiz,
    canSaveMiniQuizQuestion,
  } = useCourseBuilderMiniQuiz({
    user,
    selectedCourse,
    selectedEditingLesson,
    selectedMiniQuiz,
    miniQuizForm,
    setMiniQuizForm,
    miniQuizQuestionForm,
    setMiniQuizQuestionForm,
    editingMiniQuizQuestionId,
    setEditingMiniQuizQuestionId,
    refetchWorkspace,
    toast,
  });

  const courseCount = workspace?.courses?.length || 0;
  const selectedCourseLessonCount =
    selectedCourse?.modules.reduce(
      (sum, module) => sum + (module.lessons?.length || 0),
      0
    ) || 0;

  const selectedCoursePrice = shouldShowCoursePricing(courseEdit.accessType)
    ? formatPrice(parsePrice(courseEdit.price || '0'), normalizeCurrency(courseEdit.currency))
    : 'Тегін';

  return (
    <DashboardLayout>
  <div className="space-y-6 animate-fade-in">
    <PageHeader
      eyebrow={
        <>
          <LayoutDashboard size={13} />
          Мұғалім course builder
        </>
      }
      icon={<GraduationCap size={20} />}
      title={t('page.teacher_course_builder.title')}
      description={t('page.teacher_course_builder.subtitle')}
      actions={
        selectedCourse ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={getCourseStatusTone(courseEdit.status)}>
              {courseStatusLabels[courseEdit.status]}
            </StatusBadge>

            <Button
              type="button"
              variant="outline"
              onClick={() => updateCourseMutation.mutate()}
              disabled={updateCourseMutation.isPending}
            >
              <Settings size={15} className="mr-2" />
              Сақтау
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canCreateCourse}
          >
            <Plus size={15} className="mr-2" />
            Курс құру
          </Button>
        )
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
      <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BuilderStatCard
            label="Курстар"
            value={courseCount}
            icon={<BookOpen size={17} />}
          />
          <BuilderStatCard
            label="Модульдер"
            value={selectedCourseModules.length}
            icon={<FileText size={17} />}
          />
          <BuilderStatCard
            label="Сабақтар"
            value={selectedCourseLessonCount}
            icon={<CheckCircle2 size={17} />}
          />
          <BuilderStatCard
            label="Курс түрі"
            value={selectedCourse ? getAccessTypeLabel(courseEdit.accessType) : '—'}
            icon={<KeyRound size={17} />}
          />
        </div>

        <CourseBuilderStepper hasSelectedCourse={!!selectedCourse} />

        <div className="space-y-6">
          <div className="space-y-6">
            <CourseBasicCreateCard
              newCourse={newCourse}
              setNewCourse={setNewCourse}
              subjectOptions={subjectOptions}
              canCreateCourse={canCreateCourse}
              creating={createMutation.isPending}
              onCreateCourse={() => createMutation.mutate()}
            />

            <CourseManageList
              courses={workspace?.courses || []}
              selectedCourseId={selectedCourse?.id || null}
              courseStatusLabels={courseStatusLabels}
              onSelectCourse={seedEditFromCourse}
            />
          </div>

          {selectedCourse ? (
            <div className="space-y-6">
              <div className="space-y-6">
                <CourseSettingsCard
                  courseEdit={courseEdit}
                  setCourseEdit={setCourseEdit}
                  subjectOptions={subjectOptions}
                  selectedCoursePrice={selectedCoursePrice}
                  updating={updateCourseMutation.isPending}
                  onSaveCourse={() => updateCourseMutation.mutate()}
                />

                <div className="space-y-4">
                  <CourseSummaryCard
                    selectedCourse={selectedCourse}
                    moduleCount={selectedCourseModules.length}
                    lessonCount={selectedCourseLessonCount}
                    accessType={courseEdit.accessType}
                    selectedCoursePrice={selectedCoursePrice}
                  />

                  <CourseAnnouncementsPanel
                    announcementForm={announcementForm}
                    setAnnouncementForm={setAnnouncementForm}
                    editingAnnouncementId={editingAnnouncementId}
                    courseAnnouncements={courseAnnouncements || []}
                    courseAnnouncementsLoading={courseAnnouncementsLoading}
                    onResetAnnouncementForm={resetAnnouncementForm}
                    onSaveAnnouncement={handleSaveAnnouncement}
                    onEditAnnouncement={handleEditAnnouncement}
                    onDeleteAnnouncement={handleDeleteAnnouncement}
                    canSaveAnnouncement={canSaveAnnouncement}
                    creatingAnnouncement={createAnnouncementMutation.isPending}
                    updatingAnnouncement={updateAnnouncementMutation.isPending}
                    deletingAnnouncement={deleteAnnouncementMutation.isPending}
                  />

                  <CourseMaterialsPanel
                    courseAssetForm={courseAssetForm}
                    setCourseAssetForm={setCourseAssetForm}
                    onCreateCourseAsset={handleCreateCourseAsset}
                    canCreateCourseAsset={canCreateCourseAsset}
                    courseAssets={courseAssets || []}
                    courseAssetsLoading={courseAssetsLoading}
                    deleteCourseAssetPending={deleteCourseAssetMutation.isPending}
                    onDeleteCourseAsset={handleDeleteCourseAsset}
                  />

                  <CourseInviteCodesPanel
                    accessType={courseEdit.accessType}
                    inviteForm={inviteForm}
                    setInviteForm={setInviteForm}
                    courseInvites={courseInvites || []}
                    courseInvitesLoading={courseInvitesLoading}
                    createInvitePending={createInviteMutation.isPending}
                    deactivateInvitePending={deactivateInviteMutation.isPending}
                    onCreateInvite={handleCreateInvite}
                    onDeactivateInvite={handleDeactivateInvite}
                    onCopyInviteCode={copyInviteCode}
                  />

                  <CoursePublishPanel
                    courseId={selectedCourse.id}
                    status={courseEdit.status}
                    pending={quickStatusMutation.isPending}
                    onChangeStatus={(input) => quickStatusMutation.mutate(input)}
                  />

                  <CourseDangerZone
                    deleting={deleteCourseMutation.isPending}
                    onDeleteCourse={() => {
                      if (window.confirm(t('page.teacher_course_builder.confirm.delete_course'))) {
                        deleteCourseMutation.mutate(selectedCourse.id);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <ModuleListPanel
                  selectedCourseModules={selectedCourseModules}
                  moduleForm={moduleForm}
                  setModuleForm={setModuleForm}
                  canAddModule={canAddModule}
                  reorderModulesPending={reorderModulesMutation.isPending}
                  deleteModulePending={deleteModuleMutation.isPending}
                  reorderLessonsPending={reorderLessonsMutation.isPending}
                  deleteLessonPending={deleteLessonMutation.isPending}
                  onAddModule={() => addModuleMutation.mutate()}
                  onUpdateModuleTitle={(moduleId, title) =>
                    updateModuleTitleMutation.mutate({ moduleId, title })
                  }
                  onReorderModule={(moduleId, direction) =>
                    reorderModulesMutation.mutate({ moduleId, direction })
                  }
                  onDeleteModule={(moduleId) => deleteModuleMutation.mutate(moduleId)}
                  onStartEditLesson={startEditLesson}
                  onReorderLesson={(moduleId, lessonId, direction) =>
                    reorderLessonsMutation.mutate({ moduleId, lessonId, direction })
                  }
                  onDeleteLesson={(input) => deleteLessonMutation.mutate(input)}
                />

                <LessonEditorPanel
                  editingLessonId={editingLessonId}
                  lessonForm={lessonForm}
                  setLessonForm={setLessonForm}
                  selectedCourseModules={selectedCourseModules}
                  getNextLessonSortOrder={getNextLessonSortOrder}
                  canSaveLesson={canSaveLesson}
                  onSaveLesson={() => addOrUpdateLessonMutation.mutate()}
                  onResetLessonForm={resetLessonForm}
                />

                <LessonMiniQuizEditor
                  editingLessonId={editingLessonId}
                  selectedEditingLesson={selectedEditingLesson}
                  miniQuizLoading={miniQuizLoading}
                  miniQuizForm={miniQuizForm}
                  setMiniQuizForm={setMiniQuizForm}
                  selectedMiniQuiz={selectedMiniQuiz}
                  handleDeleteMiniQuiz={handleDeleteMiniQuiz}
                  deleteMiniQuizPending={deleteMiniQuizMutation.isPending}
                  handleSaveMiniQuiz={handleSaveMiniQuiz}
                  canSaveMiniQuiz={canSaveMiniQuiz}
                  upsertMiniQuizPending={upsertMiniQuizMutation.isPending}
                  miniQuizQuestionForm={miniQuizQuestionForm}
                  setMiniQuizQuestionForm={setMiniQuizQuestionForm}
                  editingMiniQuizQuestionId={editingMiniQuizQuestionId}
                  resetMiniQuizQuestionForm={resetMiniQuizQuestionForm}
                  handleSaveMiniQuizQuestion={handleSaveMiniQuizQuestion}
                  canSaveMiniQuizQuestion={canSaveMiniQuizQuestion}
                  updateMiniQuizQuestionPending={updateMiniQuizQuestionMutation.isPending}
                  createMiniQuizQuestionPending={createMiniQuizQuestionMutation.isPending}
                  handleToggleMiniQuizCorrectAnswer={handleToggleMiniQuizCorrectAnswer}
                  handleEditMiniQuizQuestion={handleEditMiniQuizQuestion}
                  handleDeleteMiniQuizQuestion={handleDeleteMiniQuizQuestion}
                  handleMoveMiniQuizQuestion={handleMoveMiniQuizQuestion}
                  deleteMiniQuizQuestionPending={deleteMiniQuizQuestionMutation.isPending}
                  reorderMiniQuizQuestionsPending={reorderMiniQuizQuestionsMutation.isPending}
                />

                <LessonAttachmentPanel
                  editingLessonId={editingLessonId}
                  selectedEditingLesson={selectedEditingLesson}
                  lessonAttachmentForm={lessonAttachmentForm}
                  setLessonAttachmentForm={setLessonAttachmentForm}
                  handleCreateLessonAttachment={handleCreateLessonAttachment}
                  canCreateLessonAttachment={canCreateLessonAttachment}
                  createLessonAttachmentPending={createLessonAttachmentMutation.isPending}
                  lessonAttachmentsLoading={lessonAttachmentsLoading}
                  lessonAttachments={lessonAttachments || []}
                  handleDeleteLessonAttachment={handleDeleteLessonAttachment}
                  deleteLessonAttachmentPending={deleteLessonAttachmentMutation.isPending}
                />
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-10">
                <EmptyState
                  title={t('page.teacher_course_builder.empty.select_course_title')}
                  text={t('page.teacher_course_builder.empty.select_course_text')}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </>
    ) : null}
  </div>
</DashboardLayout>
  );
}
