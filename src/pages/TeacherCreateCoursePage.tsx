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
  const { data: subjects } = useSubjects();

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
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      1. Курс негізі
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Алдымен жаңа курс жасаңыз немесе бұрынғы курсты таңдаңыз.
                    </p>
                  </div>
                </div>

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
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-foreground">
                        2. Курс баптаулары
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Access түрі, баға, сипаттама және жариялау күйін реттеңіз.
                      </p>
                    </div>

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
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-foreground">
                        3. Контент және басқару
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Хабарландыру, материалдар, invite code, жариялау және қауіпті әрекеттер.
                      </p>
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
                        <CoursePublishPanel
                          courseId={selectedCourse.id}
                          status={courseEdit.status}
                          pending={quickStatusMutation.isPending}
                          onChangeStatus={(input) => quickStatusMutation.mutate(input)}
                        />

                        <CourseDangerZone
                          deleting={deleteCourseMutation.isPending}
                          onDeleteCourse={() => {
                            if (
                              window.confirm(
                                t('page.teacher_course_builder.confirm.delete_course')
                              )
                            ) {
                              deleteCourseMutation.mutate(selectedCourse.id);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-foreground">
                        4. Модульдер және сабақтар
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Курстың оқу құрылымын жасаңыз: модуль, сабақ, mini quiz және файлдар.
                      </p>
                    </div>

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