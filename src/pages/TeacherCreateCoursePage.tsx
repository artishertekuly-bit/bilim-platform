import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { ErrorState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  useCourseAnnouncements,
  useCourseAssets,
  useLessonAttachments,
  useLessonMiniQuiz,
  useSubjects,
  useTeacherCourseWorkspace,
} from '@/hooks/use-platform-data';
import { BuilderStatCard } from '@/components/course-builder/BuilderStatCard';
import { CourseAnnouncementsPanel } from '@/components/course-builder/CourseAnnouncementsPanel';
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
import CourseAnalyticsPanel from '@/components/course-builder/CourseAnalyticsPanel';
import { useCourseBuilderForms } from '@/hooks/course-factor/useCourseBuilderForms';
import { useCourseBuilderController } from '@/hooks/course-factor/useCourseBuilderController';
import { useCourseBuilderCourseMutations } from '@/hooks/course-factor/useCourseBuilderCourseMutations';
import { useCourseBuilderSidePanels } from '@/hooks/course-factor/useCourseBuilderSidePanels';
import { useCourseBuilderMiniQuiz } from '@/hooks/course-factor/useCourseBuilderMiniQuiz';
import {
  formatPrice,
  getAccessTypeLabel,
  getCourseStatusTone,
  normalizeCurrency,
  parsePrice,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-base font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

function getInitialRequestedCourseId() {
  if (typeof window === 'undefined') return '';

  return new URLSearchParams(window.location.search).get('courseId') || '';
}

export default function TeacherCreateCoursePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjects();

  const initialRequestedCourseIdRef = useRef(getInitialRequestedCourseId());
  const openedInitialCourseRef = useRef(false);

  const [courseWorkspaceOpen, setCourseWorkspaceOpen] = useState(false);
  const [courseEditOpen, setCourseEditOpen] = useState(false);
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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

  const {
    setSelectedCourseId,
    selectedCourse,
    selectedCourseModules,
    selectedEditingLesson,
    syncCourseParam,
    selectCourse,
    getNextLessonSortOrder,
    resetNewCourse,
    resetLessonForm,
    seedEditFromCourse,
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

  const activeCourse = courseWorkspaceOpen ? selectedCourse : null;
  const activeCourseModules = activeCourse ? selectedCourseModules : [];
  const activeCourseId = activeCourse?.id || '';

  const { data: courseAssets, isLoading: courseAssetsLoading } = useCourseAssets(
    activeCourseId,
    Boolean(activeCourseId),
  );

  const {
    data: courseAnnouncements,
    isLoading: courseAnnouncementsLoading,
  } = useCourseAnnouncements(activeCourseId, Boolean(activeCourseId), true);

  const {
    data: lessonAttachments,
    isLoading: lessonAttachmentsLoading,
  } = useLessonAttachments(editingLessonId || '', Boolean(editingLessonId));

  const { data: miniQuizData, isLoading: miniQuizLoading } = useLessonMiniQuiz(
    editingLessonId || '',
    user?.id,
    Boolean(editingLessonId),
    true,
  );

  const selectedMiniQuiz = miniQuizData?.quiz || null;
  const subjectOptions = subjects || [];

  const courseStatusLabels: Record<CourseStatus, string> = {
    draft: t('course.status.draft'),
    published: t('course.status.published'),
    archived: t('course.status.archived'),
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

  const activeCourseLessonCount =
    activeCourse?.modules.reduce(
      (sum, module) => sum + (module.lessons?.length || 0),
      0,
    ) || 0;

  const selectedCoursePrice = shouldShowCoursePricing(courseEdit.accessType)
    ? formatPrice(
        parsePrice(courseEdit.price || '0'),
        normalizeCurrency(courseEdit.currency),
      )
    : 'Тегін';

  const selectedCourseTitle = activeCourse?.title?.trim() || '';
  const deleteConfirmMatches =
    Boolean(selectedCourseTitle) && deleteConfirmText.trim() === selectedCourseTitle;

  useEffect(() => {
    const requestedCourseId = initialRequestedCourseIdRef.current;

    if (openedInitialCourseRef.current) return;
    if (!requestedCourseId || !selectedCourse) return;
    if (selectedCourse.id !== requestedCourseId) return;

    openedInitialCourseRef.current = true;
    setCourseWorkspaceOpen(true);
    setCourseEditOpen(true);
    setLessonEditorOpen(false);
  }, [selectedCourse]);

  useEffect(() => {
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
    setCourseEditOpen((current) =>
      openedInitialCourseRef.current && activeCourse ? current : false,
    );
    setLessonEditorOpen(false);
  }, [selectedCourse?.id, activeCourse]);

  useEffect(() => {
    if (!selectedCourse) {
      setCourseWorkspaceOpen(false);
    }
  }, [selectedCourse]);

  const handleSelectCourse = (courseId: string) => {
    seedEditFromCourse(courseId);
    setCourseWorkspaceOpen(true);
    setCourseEditOpen(false);
    setLessonEditorOpen(false);
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
  };

  const handleCreateCourse = () => {
    setCourseWorkspaceOpen(true);
    setCourseEditOpen(false);
    setLessonEditorOpen(false);
    createMutation.mutate();
  };

  const handleOpenCourseEdit = () => {
    setCourseEditOpen((current) => !current);
    setLessonEditorOpen(false);
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
  };

  const handleOpenNewLesson = () => {
    resetLessonForm();
    setLessonEditorOpen(true);
    setCourseEditOpen(false);
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
  };

  const handleStartEditLesson = (lessonId: string) => {
    startEditLesson(lessonId);
    setLessonEditorOpen(true);
    setCourseEditOpen(false);
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
  };

  const handleCloseLessonEditor = () => {
    resetLessonForm();
    setLessonEditorOpen(false);
  };

  const handleCloseCourseEdit = () => {
    setCourseEditOpen(false);
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
  };

  const handleDeleteCourse = () => {
    if (!activeCourse) return;

    if (!deleteConfirmMatches) {
      toast({
        title: 'Курс атауы сәйкес келмейді',
        description: 'Курс атауын дәл енгізіңіз.',
        variant: 'destructive',
      });
      return;
    }

    deleteCourseMutation.mutate(activeCourse.id);
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutDashboard size={13} />
              Курс құрастыру
            </>
          }
          icon={<GraduationCap size={20} />}
          title={t('page.teacher_course_builder.title')}
          actions={
            activeCourse ? (
              <StatusBadge tone={getCourseStatusTone(courseEdit.status)}>
                {courseStatusLabels[courseEdit.status]}
              </StatusBadge>
            ) : null
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
                value={activeCourseModules.length}
                icon={<FileText size={17} />}
              />

              <BuilderStatCard
                label="Сабақтар"
                value={activeCourseLessonCount}
                icon={<CheckCircle2 size={17} />}
              />

              <BuilderStatCard
                label="Қолжетімділік"
                value={activeCourse ? getAccessTypeLabel(courseEdit.accessType) : '—'}
                icon={<KeyRound size={17} />}
              />
            </div>

            <div className="space-y-6">
              <section className="space-y-4">
                <SectionTitle>Курс құру</SectionTitle>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                  <CourseBasicCreateCard
                    userId={user?.id || ''}
                    newCourse={newCourse}
                    setNewCourse={setNewCourse}
                    subjectOptions={subjectOptions}
                    canCreateCourse={canCreateCourse}
                    creating={createMutation.isPending}
                    onCreateCourse={handleCreateCourse}
                  />

                  <CourseManageList
                    courses={workspace?.courses || []}
                    selectedCourseId={activeCourse?.id || null}
                    courseStatusLabels={courseStatusLabels}
                    onSelectCourse={handleSelectCourse}
                  />
                </div>
              </section>

              {activeCourse ? (
                <div className="space-y-6">
                  <section className="space-y-4">
                    <SectionTitle>Таңдалған курс</SectionTitle>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                      <Card className="overflow-hidden">
                        <CardContent className="space-y-4 p-4 sm:p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone={getCourseStatusTone(courseEdit.status)}>
                                  {courseStatusLabels[courseEdit.status]}
                                </StatusBadge>

                                <StatusBadge tone="primary">
                                  {getAccessTypeLabel(courseEdit.accessType)}
                                </StatusBadge>
                              </div>

                              <h3 className="mt-2 line-clamp-2 text-lg font-semibold text-foreground">
                                {activeCourse.title}
                              </h3>
                            </div>

                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button
                                type="button"
                                variant={courseEditOpen ? 'default' : 'outline'}
                                onClick={handleOpenCourseEdit}
                              >
                                <Pencil size={15} className="mr-2" />
                                Курсты өңдеу
                              </Button>

                              <Button
                                type="button"
                                onClick={handleOpenNewLesson}
                                disabled={activeCourseModules.length === 0}
                              >
                                <Plus size={15} className="mr-2" />
                                Сабақ қосу
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <CourseSummaryCard
                        selectedCourse={activeCourse}
                        moduleCount={activeCourseModules.length}
                        lessonCount={activeCourseLessonCount}
                        accessType={courseEdit.accessType}
                        selectedCoursePrice={selectedCoursePrice}
                      />
                    </div>
                  </section>

                  {courseEditOpen ? (
                    <section className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <SectionTitle>Курсты өңдеу</SectionTitle>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseCourseEdit}
                        >
                          <X size={14} className="mr-2" />
                          Жабу
                        </Button>
                      </div>

                      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                        <CourseSettingsCard
                          userId={user?.id || ''}
                          courseEdit={courseEdit}
                          setCourseEdit={setCourseEdit}
                          subjectOptions={subjectOptions}
                          selectedCoursePrice={selectedCoursePrice}
                          updating={updateCourseMutation.isPending}
                          onSaveCourse={() => updateCourseMutation.mutate()}
                        />

                        <div className="space-y-4">
                          <CourseAnalyticsPanel
                            courseId={activeCourse.id}
                            teacherId={user?.id || ''}
                          />

                          <CoursePublishPanel
                            courseId={activeCourse.id}
                            status={courseEdit.status}
                            pending={quickStatusMutation.isPending}
                            onChangeStatus={(input) => quickStatusMutation.mutate(input)}
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
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

                        <div className="space-y-4">
                          <CourseDangerZone
                            deleting={deleteCourseMutation.isPending}
                            onDeleteCourse={() => setDeleteConfirmOpen(true)}
                          />

                          {deleteConfirmOpen ? (
                            <Card className="border-destructive/35 bg-destructive/5">
                              <CardContent className="space-y-4 p-4 sm:p-5">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3">
                                    <span className="mt-0.5 rounded-2xl bg-destructive/10 p-2 text-destructive">
                                      <AlertTriangle size={18} />
                                    </span>

                                    <div>
                                      <h3 className="text-sm font-semibold text-foreground">
                                        Курсты өшіру
                                      </h3>

                                      <p className="mt-1 text-xs font-semibold text-foreground">
                                        {selectedCourseTitle}
                                      </p>
                                    </div>
                                  </div>

                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setDeleteConfirmOpen(false);
                                      setDeleteConfirmText('');
                                    }}
                                    aria-label="Жабу"
                                  >
                                    <X size={16} />
                                  </Button>
                                </div>

                                <input
                                  value={deleteConfirmText}
                                  onChange={(event) =>
                                    setDeleteConfirmText(event.target.value)
                                  }
                                  placeholder="Курс атауын енгізіңіз"
                                  className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />

                                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setDeleteConfirmOpen(false);
                                      setDeleteConfirmText('');
                                    }}
                                  >
                                    Болдырмау
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleDeleteCourse}
                                    disabled={
                                      !deleteConfirmMatches ||
                                      deleteCourseMutation.isPending
                                    }
                                  >
                                    <Trash2 size={15} className="mr-2" />
                                    Толық өшіру
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {lessonEditorOpen ? (
                    <section id="lesson-editor-block" className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <SectionTitle>
                          {editingLessonId ? 'Сабақты өңдеу' : 'Жаңа сабақ'}
                        </SectionTitle>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleCloseLessonEditor}
                        >
                          <X size={14} className="mr-2" />
                          Жабу
                        </Button>
                      </div>

                      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
                        <LessonEditorPanel
                          editingLessonId={editingLessonId}
                          lessonForm={lessonForm}
                          setLessonForm={setLessonForm}
                          selectedCourseModules={activeCourseModules}
                          getNextLessonSortOrder={getNextLessonSortOrder}
                          canSaveLesson={canSaveLesson}
                          onSaveLesson={() => addOrUpdateLessonMutation.mutate()}
                          onResetLessonForm={handleCloseLessonEditor}
                        />

                        {editingLessonId ? (
                          <div className="space-y-4">
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
                              updateMiniQuizQuestionPending={
                                updateMiniQuizQuestionMutation.isPending
                              }
                              createMiniQuizQuestionPending={
                                createMiniQuizQuestionMutation.isPending
                              }
                              handleToggleMiniQuizCorrectAnswer={
                                handleToggleMiniQuizCorrectAnswer
                              }
                              handleEditMiniQuizQuestion={handleEditMiniQuizQuestion}
                              handleDeleteMiniQuizQuestion={handleDeleteMiniQuizQuestion}
                              handleMoveMiniQuizQuestion={handleMoveMiniQuizQuestion}
                              deleteMiniQuizQuestionPending={
                                deleteMiniQuizQuestionMutation.isPending
                              }
                              reorderMiniQuizQuestionsPending={
                                reorderMiniQuizQuestionsMutation.isPending
                              }
                            />

                            <LessonAttachmentPanel
                              editingLessonId={editingLessonId}
                              selectedEditingLesson={selectedEditingLesson}
                              lessonAttachmentForm={lessonAttachmentForm}
                              setLessonAttachmentForm={setLessonAttachmentForm}
                              handleCreateLessonAttachment={handleCreateLessonAttachment}
                              canCreateLessonAttachment={canCreateLessonAttachment}
                              createLessonAttachmentPending={
                                createLessonAttachmentMutation.isPending
                              }
                              lessonAttachmentsLoading={lessonAttachmentsLoading}
                              lessonAttachments={lessonAttachments || []}
                              handleDeleteLessonAttachment={handleDeleteLessonAttachment}
                              deleteLessonAttachmentPending={
                                deleteLessonAttachmentMutation.isPending
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-4">
                    <SectionTitle>Сабақ құрылымы</SectionTitle>

                    <ModuleListPanel
                      selectedCourseModules={activeCourseModules}
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
                      onStartEditLesson={handleStartEditLesson}
                      onReorderLesson={(moduleId, lessonId, direction) =>
                        reorderLessonsMutation.mutate({
                          moduleId,
                          lessonId,
                          direction,
                        })
                      }
                      onDeleteLesson={(input) => deleteLessonMutation.mutate(input)}
                    />
                  </section>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}