import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Plus,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { CourseSettingsCard } from '@/components/course-builder/CourseSettingsCard';
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

export default function TeacherEditCoursePage() {
  const { courseId: routeCourseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const targetCourseId = routeCourseId || searchParams.get('courseId') || '';

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: subjects } = useSubjects();

  const [activeTab, setActiveTab] = useState<'lessons' | 'settings' | 'materials' | 'analytics'>('lessons');
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
    refetchWorkspace,
  } = useCourseBuilderController({
    userId: user?.id,
    workspace,
    queryClient,
    targetCourseId,
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

  const activeCourse = selectedCourse;
  const activeCourseModules = selectedCourseModules;
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
    canAddModule,
    canSaveLesson,
  } = useCourseBuilderCourseMutations({
    user,
    workspace,
    selectedCourse: activeCourse,
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
    onCourseDeleted: () => {
      navigate('/my-courses');
    },
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
    resetAnnouncementForm,
    handleSaveAnnouncement,
    handleEditAnnouncement,
    handleDeleteAnnouncement,
    canSaveAnnouncement,
    handleCreateCourseAsset,
    canCreateCourseAsset,
    handleDeleteCourseAsset,
    handleCreateLessonAttachment,
    canCreateLessonAttachment,
    handleDeleteLessonAttachment,
    handleCreateInvite,
    handleDeactivateInvite,
    copyInviteCode,
  } = useCourseBuilderSidePanels({
    user,
    selectedCourse: activeCourse,
    selectedEditingLesson,
    courseAssets,
    lessonAttachments,
    announcementForm,
    setAnnouncementForm,
    editingAnnouncementId,
    setEditingAnnouncementId,
    courseAssetForm,
    setCourseAssetForm,
    lessonAttachmentForm,
    setLessonAttachmentForm,
    inviteForm,
    setInviteForm,
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
    selectedCourse: activeCourse,
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

  const activeCourseLessonCount = useMemo(() => {
    return (
      activeCourse?.modules.reduce(
        (sum, module) => sum + (module.lessons?.length || 0),
        0,
      ) || 0
    );
  }, [activeCourse?.modules]);

  const selectedCoursePrice = shouldShowCoursePricing(courseEdit.accessType)
    ? formatPrice(
        parsePrice(courseEdit.price || '0'),
        normalizeCurrency(courseEdit.currency),
      )
    : 'Тегін';

  const selectedCourseTitle = activeCourse?.title?.trim() || '';
  const deleteConfirmMatches =
    Boolean(selectedCourseTitle) && deleteConfirmText.trim() === selectedCourseTitle;

  const handleOpenNewLesson = () => {
    resetLessonForm();
    setLessonEditorOpen(true);
  };

  const handleStartEditLesson = (lessonId: string) => {
    startEditLesson(lessonId);
    setLessonEditorOpen(true);
  };

  const handleCloseLessonEditor = () => {
    resetLessonForm();
    setLessonEditorOpen(false);
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

  if (workspaceLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <TeacherCourseBuilderSkeleton />
        </div>
      </DashboardLayout>
    );
  }

  if (workspaceError) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
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
        </div>
      </DashboardLayout>
    );
  }

  if (!activeCourse) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/my-courses')}
              className="rounded-full text-xs font-semibold"
            >
              <ArrowLeft size={14} className="mr-1.5" />
              Курстар тізімі
            </Button>
          </div>

          <EmptyState
            title="Курс табылмады"
            text="Бұл курс жойылған немесе қолжетімді емес."
            action={
              <Button
                type="button"
                onClick={() => navigate('/my-courses')}
                className="rounded-full text-xs font-semibold"
              >
                Курстарға оралу
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in pb-12">
        {/* Navigation Breadcrumb & Back */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/my-courses"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Курстарға оралу
          </Link>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="rounded-full text-xs font-semibold shadow-xs"
            >
              <Link to={`/courses/${activeCourse.id}`} target="_blank" rel="noopener noreferrer">
                <Eye size={13} className="mr-1.5" />
                Курсты көру
                <ExternalLink size={11} className="ml-1 opacity-60" />
              </Link>
            </Button>

            <StatusBadge tone={getCourseStatusTone(courseEdit.status)}>
              {courseStatusLabels[courseEdit.status]}
            </StatusBadge>

            <StatusBadge tone="primary">
              {getAccessTypeLabel(courseEdit.accessType)}
            </StatusBadge>
          </div>
        </div>

        {/* Page Header */}
        <PageHeader
          eyebrow={
            <>
              <GraduationCap size={13} />
              Курсты өңдеу
            </>
          }
          icon={<LayoutDashboard size={20} />}
          title={activeCourse.title}
          actions={
            <Button
              type="button"
              variant="ai"
              size="sm"
              onClick={() => {
                const nextStatus: CourseStatus =
                  courseEdit.status === 'published' ? 'draft' : 'published';
                quickStatusMutation.mutate({
                  courseId: activeCourse.id,
                  status: nextStatus,
                });
              }}
              disabled={quickStatusMutation.isPending}
              className="rounded-full shadow-xs text-xs font-semibold"
            >
              {courseEdit.status === 'published' ? 'Жобаға қайтару' : 'Курсты жариялау'}
            </Button>
          }
        />

        {/* Quick Stats Summary */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BuilderStatCard
            label="Модульдер"
            value={activeCourseModules.length}
            icon={<Layers size={17} />}
          />

          <BuilderStatCard
            label="Сабақтар"
            value={activeCourseLessonCount}
            icon={<CheckCircle2 size={17} />}
          />

          <BuilderStatCard
            label="Оқушылар"
            value={activeCourse.students || 0}
            icon={<BookOpen size={17} />}
          />

          <BuilderStatCard
            label="Қолжетімділік"
            value={selectedCoursePrice}
            icon={<KeyRound size={17} />}
          />
        </div>

        {/* Main Workspace with Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as typeof activeTab)}
          className="space-y-6"
        >
          <TabsList className="h-11 rounded-2xl bg-muted/30 p-1 shadow-xs">
            <TabsTrigger value="lessons" className="rounded-xl px-4 text-xs font-semibold gap-1.5">
              <Layers size={14} />
              Сабақтар мен құрылым
            </TabsTrigger>

            <TabsTrigger value="settings" className="rounded-xl px-4 text-xs font-semibold gap-1.5">
              <Settings size={14} />
              Баптаулар
            </TabsTrigger>

            <TabsTrigger value="materials" className="rounded-xl px-4 text-xs font-semibold gap-1.5">
              <FileText size={14} />
              Материалдар
            </TabsTrigger>

            <TabsTrigger value="analytics" className="rounded-xl px-4 text-xs font-semibold gap-1.5">
              <LayoutDashboard size={14} />
              Аналитика
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Lessons & Structure */}
          <TabsContent value="lessons" className="space-y-6 outline-none">
            {lessonEditorOpen ? (
              <section id="lesson-editor-block" className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/20 p-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background">
                      <FileText size={15} />
                    </span>
                    <h2 className="text-sm font-bold text-foreground">
                      {editingLessonId ? 'Сабақты өңдеу' : 'Жаңа сабақ қосу'}
                    </h2>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCloseLessonEditor}
                    className="rounded-full text-xs font-semibold"
                  >
                    <X size={14} className="mr-1.5" />
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
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Modules and Lessons Overview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">Сабақ құрылымы</h2>
                  <StatusBadge tone="secondary">
                    {activeCourseModules.length} модуль • {activeCourseLessonCount} сабақ
                  </StatusBadge>
                </div>

                <Button
                  type="button"
                  onClick={handleOpenNewLesson}
                  disabled={activeCourseModules.length === 0}
                  className="rounded-full shadow-xs text-xs font-semibold px-4 h-9 gap-1.5"
                >
                  <Plus size={14} />
                  Сабақ қосу
                </Button>
              </div>

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
            </div>
          </TabsContent>

          {/* Tab 2: Settings & Details */}
          <TabsContent value="settings" className="space-y-6 outline-none">
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
                <CoursePublishPanel
                  courseId={activeCourse.id}
                  status={courseEdit.status}
                  pending={quickStatusMutation.isPending}
                  onChangeStatus={(input) => quickStatusMutation.mutate(input)}
                />

                <CourseDangerZone
                  deleting={deleteCourseMutation.isPending}
                  onDeleteCourse={() => setDeleteConfirmOpen(true)}
                />

                {deleteConfirmOpen ? (
                  <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 sm:p-5 space-y-4 shadow-xs">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-destructive">
                          Курсты өшіру
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Растау үшін курс атауын енгізіңіз:
                        </p>
                        <p className="text-xs font-bold text-foreground mt-0.5">
                          {selectedCourseTitle}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setDeleteConfirmOpen(false);
                          setDeleteConfirmText('');
                        }}
                        aria-label="Жабу"
                      >
                        <X size={15} />
                      </Button>
                    </div>

                    <input
                      value={deleteConfirmText}
                      onChange={(event) => setDeleteConfirmText(event.target.value)}
                      placeholder="Курс атауы"
                      className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none transition focus:ring-2 focus:ring-destructive/20"
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteConfirmOpen(false);
                          setDeleteConfirmText('');
                        }}
                        className="rounded-full text-xs font-semibold"
                      >
                        Болдырмау
                      </Button>

                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteCourse}
                        disabled={!deleteConfirmMatches || deleteCourseMutation.isPending}
                        className="rounded-full text-xs font-semibold"
                      >
                        {deleteCourseMutation.isPending ? 'Өшірілуде...' : 'Толық өшіру'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </TabsContent>

          {/* Tab 3: Materials & Announcements */}
          <TabsContent value="materials" className="space-y-6 outline-none">
            <div className="grid gap-6 xl:grid-cols-2">
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

              <div className="xl:col-span-2">
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
              </div>
            </div>
          </TabsContent>

          {/* Tab 4: Analytics */}
          <TabsContent value="analytics" className="space-y-6 outline-none">
            <CourseAnalyticsPanel
              courseId={activeCourse.id}
              teacherId={user?.id || ''}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
