import type { Dispatch, SetStateAction } from 'react';

import t from '@/lib/i18n';
import type { CourseAnnouncementView } from '@/lib/app-data-types';
import {
  useCourseInvites,
  useCreateCourseAnnouncementMutation,
  useCreateCourseExternalAssetMutation,
  useCreateCourseInviteMutation,
  useCreateLessonExternalAttachmentMutation,
  useDeactivateCourseInviteMutation,
  useDeleteCourseAnnouncementMutation,
  useDeleteCourseAssetMutation,
  useDeleteLessonAttachmentMutation,
  useUpdateCourseAnnouncementMutation,
} from '@/hooks/use-platform-data';
import {
  formatAssetTitle,
  getFilenameFromUrl,
  normalizeExternalUrlInput,
  scrollToBuilderSection,
  toDateTimeLocalValue,
} from '@/lib/course-creator/course-builder-utils';

type ToastFn = (input: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

type SidePanelUser = {
  id: string;
} | null | undefined;

type UseCourseBuilderSidePanelsInput = {
  user: SidePanelUser;
  selectedCourse: any;
  selectedEditingLesson: any;

  courseAssets: any[] | undefined;
  lessonAttachments: any[] | undefined;

  inviteForm: any;
  setInviteForm: Dispatch<SetStateAction<any>>;

  courseAssetForm: any;
  setCourseAssetForm: Dispatch<SetStateAction<any>>;

  lessonAttachmentForm: any;
  setLessonAttachmentForm: Dispatch<SetStateAction<any>>;

  announcementForm: any;
  setAnnouncementForm: Dispatch<SetStateAction<any>>;
  editingAnnouncementId: string | null;
  setEditingAnnouncementId: Dispatch<SetStateAction<string | null>>;

  refetchWorkspace: () => Promise<void>;
  toast: ToastFn;
};

export function useCourseBuilderSidePanels({
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
}: UseCourseBuilderSidePanelsInput) {
  const {
    data: courseInvites,
    isLoading: courseInvitesLoading,
  } = useCourseInvites(selectedCourse?.id || '', !!selectedCourse?.id);

  const createInviteMutation = useCreateCourseInviteMutation(user?.id);
  const deactivateInviteMutation = useDeactivateCourseInviteMutation(user?.id);
  const createAnnouncementMutation = useCreateCourseAnnouncementMutation(user?.id);
  const updateAnnouncementMutation = useUpdateCourseAnnouncementMutation(user?.id);
  const deleteAnnouncementMutation = useDeleteCourseAnnouncementMutation(user?.id);
  const createCourseAssetMutation = useCreateCourseExternalAssetMutation(user?.id);
  const deleteCourseAssetMutation = useDeleteCourseAssetMutation(user?.id);
  const createLessonAttachmentMutation = useCreateLessonExternalAttachmentMutation(user?.id);
  const deleteLessonAttachmentMutation = useDeleteLessonAttachmentMutation(user?.id);

  const handleCreateInvite = async () => {
    if (!selectedCourse) return;

    const maxUses = inviteForm.maxUses.trim()
      ? Number(inviteForm.maxUses)
      : null;

    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      toast({
        title: 'Invite лимиті қате',
        description: 'Қолдану лимиті бос немесе 1-ден жоғары бүтін сан болуы керек.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createInviteMutation.mutateAsync({
        courseId: selectedCourse.id,
        teacherId: user?.id,
        maxUses,
        expiresAt: inviteForm.expiresAt
          ? new Date(inviteForm.expiresAt).toISOString()
          : null,
      });

      setInviteForm({ maxUses: '', expiresAt: '' });
      await refetchWorkspace();

      toast({
        title: 'Invite code жасалды',
        description: 'Оқушылар осы code арқылы курсқа кіре алады.',
      });
    } catch (error) {
      toast({
        title: 'Invite code жасау мүмкін болмады',
        description:
          error instanceof Error ? error.message : t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      });
    }
  };

  const handleDeactivateInvite = async (inviteId: string) => {
    try {
      await deactivateInviteMutation.mutateAsync(inviteId);
      await refetchWorkspace();

      toast({
        title: 'Invite өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Invite өшіру мүмкін болмады',
        description:
          error instanceof Error ? error.message : t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      });
    }
  };

  const copyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);

      toast({
        title: 'Invite code көшірілді',
        description: code,
      });
    } catch {
      toast({
        title: 'Көшіру мүмкін болмады',
        description: code,
        variant: 'destructive',
      });
    }
  };

  const handleCreateCourseAsset = async () => {
    if (!selectedCourse || !user?.id) return;

    try {
      const externalUrl = normalizeExternalUrlInput(courseAssetForm.externalUrl);
      const filename = getFilenameFromUrl(externalUrl, courseAssetForm.title || 'Курс материалы');

      await createCourseAssetMutation.mutateAsync({
        ownerId: user.id,
        courseId: selectedCourse.id,
        filename,
        externalUrl,
        title: formatAssetTitle(courseAssetForm.title, filename),
        description: courseAssetForm.description.trim() || null,
        sortOrder: (courseAssets?.length || 0) + 1,
        teacherId: user.id,
      });

      setCourseAssetForm({ title: '', description: '', externalUrl: '' });
      await refetchWorkspace();

      toast({
        title: 'Курс материалы қосылды',
      });
    } catch (error) {
      toast({
        title: 'Курс материалын қосу мүмкін болмады',
        description:
          error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCourseAsset = async (assetId: string) => {
    if (!selectedCourse) return;

    try {
      await deleteCourseAssetMutation.mutateAsync({
        assetId,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      await refetchWorkspace();

      toast({
        title: 'Курс материалы өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Курс материалын өшіру мүмкін болмады',
        description:
          error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const resetAnnouncementForm = () => {
    setAnnouncementForm({
      title: '',
      body: '',
      priority: 'normal',
      isPinned: false,
      expiresAt: '',
    });
    setEditingAnnouncementId(null);
  };

  const handleEditAnnouncement = (announcement: CourseAnnouncementView) => {
    setEditingAnnouncementId(announcement.id);

    setAnnouncementForm({
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
      isPinned: announcement.isPinned,
      expiresAt: toDateTimeLocalValue(announcement.expiresAt),
    });

    scrollToBuilderSection('announcements');
  };

  const handleSaveAnnouncement = async () => {
    if (!selectedCourse || !user?.id) return;

    const title = announcementForm.title.trim();
    const body = announcementForm.body.trim();

    if (!title || !body) {
      toast({
        title: 'Хабарландыру толық емес',
        description: 'Тақырып пен мәтінді толтырыңыз.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const expiresAt = announcementForm.expiresAt
        ? new Date(announcementForm.expiresAt).toISOString()
        : null;

      if (editingAnnouncementId) {
        await updateAnnouncementMutation.mutateAsync({
          announcementId: editingAnnouncementId,
          courseId: selectedCourse.id,
          teacherId: user.id,
          title,
          body,
          priority: announcementForm.priority,
          isPinned: announcementForm.isPinned,
          expiresAt,
        });

        toast({
          title: 'Хабарландыру жаңартылды',
        });
      } else {
        await createAnnouncementMutation.mutateAsync({
          courseId: selectedCourse.id,
          authorId: user.id,
          teacherId: user.id,
          title,
          body,
          priority: announcementForm.priority,
          isPinned: announcementForm.isPinned,
          expiresAt,
        });

        toast({
          title: 'Хабарландыру жарияланды',
        });
      }

      resetAnnouncementForm();
      await refetchWorkspace();
    } catch (error) {
      toast({
        title: 'Хабарландыруды сақтау мүмкін болмады',
        description:
          error instanceof Error
            ? error.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAnnouncement = async (announcement: CourseAnnouncementView) => {
    if (!selectedCourse) return;

    if (!window.confirm('Бұл хабарландыруды өшіргіңіз келе ме?')) {
      return;
    }

    try {
      await deleteAnnouncementMutation.mutateAsync({
        announcementId: announcement.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      if (editingAnnouncementId === announcement.id) {
        resetAnnouncementForm();
      }

      await refetchWorkspace();

      toast({
        title: 'Хабарландыру өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Хабарландыруды өшіру мүмкін болмады',
        description:
          error instanceof Error
            ? error.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateLessonAttachment = async () => {
    if (!selectedCourse || !selectedEditingLesson || !user?.id) return;

    try {
      const externalUrl = normalizeExternalUrlInput(lessonAttachmentForm.externalUrl);
      const filename = getFilenameFromUrl(externalUrl, lessonAttachmentForm.title || 'Сабақ материалы');

      await createLessonAttachmentMutation.mutateAsync({
        ownerId: user.id,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        filename,
        externalUrl,
        title: formatAssetTitle(lessonAttachmentForm.title, filename),
        description: lessonAttachmentForm.description.trim() || null,
        sortOrder: (lessonAttachments?.length || 0) + 1,
        teacherId: user.id,
      });

      setLessonAttachmentForm({ title: '', description: '', externalUrl: '' });
      await refetchWorkspace();

      toast({
        title: 'Сабақ файлы қосылды',
      });
    } catch (error) {
      toast({
        title: 'Сабақ файлын қосу мүмкін болмады',
        description:
          error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLessonAttachment = async (attachmentId: string) => {
    if (!selectedCourse || !selectedEditingLesson) return;

    try {
      await deleteLessonAttachmentMutation.mutateAsync({
        attachmentId,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      await refetchWorkspace();

      toast({
        title: 'Сабақ файлы өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Сабақ файлын өшіру мүмкін болмады',
        description:
          error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const canCreateCourseAsset =
    !!selectedCourse &&
    !!courseAssetForm.externalUrl.trim() &&
    !createCourseAssetMutation.isPending;

  const canSaveAnnouncement =
    !!selectedCourse &&
    !!user?.id &&
    !!announcementForm.title.trim() &&
    !!announcementForm.body.trim() &&
    !createAnnouncementMutation.isPending &&
    !updateAnnouncementMutation.isPending;

  const canCreateLessonAttachment =
    !!selectedCourse &&
    !!selectedEditingLesson &&
    !!lessonAttachmentForm.externalUrl.trim() &&
    !createLessonAttachmentMutation.isPending;

  return {
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
  };
}
