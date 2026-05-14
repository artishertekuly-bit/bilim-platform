import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
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
import { useCourseBuilderController } from '@/hooks/course-factor/useCourseBuilderController';
import { useCourseBuilderCourseMutations } from '@/hooks/course-factor/useCourseBuilderCourseMutations';
import { useCourseBuilderSidePanels } from '@/hooks/course-factor/useCourseBuilderSidePanels';
import { useCourseBuilderMiniQuiz } from '@/hooks/course-factor/useCourseBuilderMiniQuiz';
import CourseAnalyticsPanel from '@/components/course-builder/CourseAnalyticsPanel';
import {
  formatPrice,
  getAccessTypeLabel,
  getCourseStatusTone,
  normalizeCurrency,
  parsePrice,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-base font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

export default function TeacherCreateCoursePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjects();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
  } = useTeacherCourseWorkspace(user?.id || '', !!user?.id);

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

  const selectedCourseTitle = selectedCourse?.title?.trim() || '';
  const deleteConfirmMatches =
    !!selectedCourseTitle && deleteConfirmText.trim() === selectedCourseTitle;

  useEffect(() => {
    setDeleteConfirmOpen(false);
    setDeleteConfirmText('');
  }, [selectedCourse?.id]);

  const handleDeleteCourse = () => {
    if (!selectedCourse) return;

    if (!deleteConfirmMatches) {
      toast({
        title: 'Курс атауы сәйкес келмейді',
        description: 'Курс атауын дәл енгізіңіз.',
        variant: 'destructive',
      });
      return;
    }

    deleteCourseMutation.mutate(selectedCourse.id);
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
            selectedCourse ? (
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
                value={selectedCourseModules.length}
                icon={<FileText size={17} />}
              />
              <BuilderStatCard
                label="Сабақтар"
                value={selectedCourseLessonCount}
                icon={<CheckCircle2 size={17} />}
              />
              <BuilderStatCard
                label="Қолжетімділік"
                value={selectedCourse ? getAccessTypeLabel(courseEdit.accessType) : '—'}
                icon={<KeyRound size={17} />}
              />
            </div>

            <CourseBuilderStepper hasSelectedCourse={!!selectedCourse} />

            <div className="space-y-6">
              <section className="space-y-4">
                <SectionTitle>1. Курсты бастау</SectionTitle>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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
              </section>

              {selectedCourse ? (
                <div className="space-y-6">
                  <section className="space-y-4">
                    <SectionTitle>2. Негізгі баптаулар</SectionTitle>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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

                        <CourseAnalyticsPanel
                          courseId={selectedCourse.id}
                          teacherId={user?.id || ''}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionTitle>3. Оқу құрылымы</SectionTitle>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
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

                      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
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
                  </section>

                  <section className="space-y-4">
                    <SectionTitle>4. Қосымша басқару</SectionTitle>

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

                      <CoursePublishPanel
                        courseId={selectedCourse.id}
                        status={courseEdit.status}
                        pending={quickStatusMutation.isPending}
                        onChangeStatus={(input) => quickStatusMutation.mutate(input)}
                      />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <SectionTitle>5. Қауіпті әрекеттер</SectionTitle>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                      <CourseDangerZone
                        deleting={deleteCourseMutation.isPending}
                        onDeleteCourse={() => setDeleteConfirmOpen(true)}
                      />

                      {deleteConfirmOpen ? (
                        <Card className="border-destructive/35 bg-destructive/5">
                          <CardContent className="space-y-4 p-5">
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
                              onChange={(event) => setDeleteConfirmText(event.target.value)}
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
                                disabled={!deleteConfirmMatches || deleteCourseMutation.isPending}
                              >
                                <Trash2 size={15} className="mr-2" />
                                Толық өшіру
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : (
                <Card className="border-dashed">
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