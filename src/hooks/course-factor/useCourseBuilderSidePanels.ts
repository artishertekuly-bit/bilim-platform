import type { Dispatch, SetStateAction } from 'react';

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
import type {
  CourseAnnouncementPriority,
  CourseAnnouncementView,
  TeacherCourseWorkspace,
} from '@/lib/app-data-types';
import {
  formatAssetTitle,
  getFilenameFromUrl,
  normalizeExternalUrlInput,
  scrollToBuilderSection,
  toDateTimeLocalValue,
} from '@/lib/course-creator/course-builder-utils';
import t from '@/lib/i18n';
import { removeNullCharacters } from '@/lib/utils';

type ToastFn = (input: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

type SidePanelUser = {
  id: string;
} | null | undefined;

type CourseBuilderCourse = TeacherCourseWorkspace['courses'][number];
type CourseBuilderLesson = CourseBuilderCourse['modules'][number]['lessons'][number];

type InviteForm = {
  maxUses: string;
  expiresAt: string;
};

type ExternalAssetForm = {
  title: string;
  description: string;
  externalUrl: string;
};

type LessonAttachmentForm = {
  title: string;
  description: string;
  externalUrl: string;
};

type AnnouncementForm = {
  title: string;
  body: string;
  priority: CourseAnnouncementPriority;
  isPinned: boolean;
  expiresAt: string;
};

type UseCourseBuilderSidePanelsInput = {
  user: SidePanelUser;
  selectedCourse?: CourseBuilderCourse | null;
  selectedEditingLesson?: CourseBuilderLesson | null;

  courseAssets: unknown[] | undefined;
  lessonAttachments: unknown[] | undefined;

  inviteForm: InviteForm;
  setInviteForm: Dispatch<SetStateAction<InviteForm>>;

  courseAssetForm: ExternalAssetForm;
  setCourseAssetForm: Dispatch<SetStateAction<ExternalAssetForm>>;

  lessonAttachmentForm: LessonAttachmentForm;
  setLessonAttachmentForm: Dispatch<SetStateAction<LessonAttachmentForm>>;

  announcementForm: AnnouncementForm;
  setAnnouncementForm: Dispatch<SetStateAction<AnnouncementForm>>;
  editingAnnouncementId: string | null;
  setEditingAnnouncementId: Dispatch<SetStateAction<string | null>>;

  refetchWorkspace: () => Promise<void>;
  toast: ToastFn;
};

const emptyInviteForm: InviteForm = {
  maxUses: '',
  expiresAt: '',
};

const emptyExternalAssetForm: ExternalAssetForm = {
  title: '',
  description: '',
  externalUrl: '',
};

const emptyLessonAttachmentForm: LessonAttachmentForm = {
  title: '',
  description: '',
  externalUrl: '',
};

const emptyAnnouncementForm: AnnouncementForm = {
  title: '',
  body: '',
  priority: 'normal',
  isPinned: false,
  expiresAt: '',
};

function cleanText(value: string | null | undefined): string {
  return removeNullCharacters(value ?? '').trim();
}

function getErrorMessage(error: unknown, fallback = 'Қате пайда болды.'): string {
  return error instanceof Error && error.message.trim()
    ? cleanText(error.message)
    : fallback;
}

function requireUserId(user: SidePanelUser): string {
  if (!user?.id) {
    throw new Error('Пайдаланушы табылмады.');
  }

  return user.id;
}

function requireCourse(course?: CourseBuilderCourse | null): CourseBuilderCourse {
  if (!course?.id) {
    throw new Error('Курс таңдалмаған.');
  }

  return course;
}

function requireLesson(lesson?: CourseBuilderLesson | null): CourseBuilderLesson {
  if (!lesson?.id) {
    throw new Error('Сабақ таңдалмаған.');
  }

  return lesson;
}

function parseInviteMaxUses(value: string): number | null {
  const trimmed = cleanText(value);

  if (!trimmed) return null;

  const maxUses = Number(trimmed);

  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    throw new Error('Лимит 1-ден жоғары бүтін сан болуы керек.');
  }

  return maxUses;
}

function parseOptionalDateTime(value: string): string | null {
  const trimmed = cleanText(value);

  if (!trimmed) return null;

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Мерзім форматы қате.');
  }

  return date.toISOString();
}

function normalizeRequiredExternalUrl(value: string): string {
  const normalized = normalizeExternalUrlInput(cleanText(value));

  if (!normalized) {
    throw new Error('Сілтеме енгізіңіз.');
  }

  return normalized;
}

function normalizeTitle(value: string, fallback: string): string {
  return cleanText(value) || fallback;
}

function normalizeDescription(value: string): string | null {
  return cleanText(value) || null;
}

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
  const { data: courseInvites, isLoading: courseInvitesLoading } =
    useCourseInvites(selectedCourse?.id || '', Boolean(selectedCourse?.id));

  const createInviteMutation = useCreateCourseInviteMutation(user?.id);
  const deactivateInviteMutation = useDeactivateCourseInviteMutation(user?.id);
  const createAnnouncementMutation = useCreateCourseAnnouncementMutation(user?.id);
  const updateAnnouncementMutation = useUpdateCourseAnnouncementMutation(user?.id);
  const deleteAnnouncementMutation = useDeleteCourseAnnouncementMutation(user?.id);
  const createCourseAssetMutation = useCreateCourseExternalAssetMutation(user?.id);
  const deleteCourseAssetMutation = useDeleteCourseAssetMutation(user?.id);
  const createLessonAttachmentMutation =
    useCreateLessonExternalAttachmentMutation(user?.id);
  const deleteLessonAttachmentMutation = useDeleteLessonAttachmentMutation(user?.id);

  const resetAnnouncementForm = () => {
    setAnnouncementForm(emptyAnnouncementForm);
    setEditingAnnouncementId(null);
  };

  const handleCreateInvite = async () => {
    try {
      const course = requireCourse(selectedCourse);
      const teacherId = requireUserId(user);

      const maxUses = parseInviteMaxUses(inviteForm.maxUses);
      const expiresAt = parseOptionalDateTime(inviteForm.expiresAt);

      await createInviteMutation.mutateAsync({
        courseId: course.id,
        teacherId,
        maxUses,
        expiresAt,
      });

      setInviteForm(emptyInviteForm);
      await refetchWorkspace();

      toast({
        title: 'Шақыру коды жасалды',
      });
    } catch (error) {
      toast({
        title: 'Шақыру кодын жасау мүмкін болмады',
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      });
    }
  };

  const handleDeactivateInvite = async (inviteId: string) => {
    try {
      const cleanInviteId = cleanText(inviteId);

      if (!cleanInviteId) {
        throw new Error('Шақыру коды табылмады.');
      }

      await deactivateInviteMutation.mutateAsync(cleanInviteId);
      await refetchWorkspace();

      toast({
        title: 'Шақыру коды өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Шақыру кодын өшіру мүмкін болмады',
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      });
    }
  };

  const copyInviteCode = async (code: string) => {
    const cleanCode = cleanText(code);

    if (!cleanCode) {
      toast({
        title: 'Код табылмады',
        variant: 'destructive',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(cleanCode);

      toast({
        title: 'Код көшірілді',
      });
    } catch {
      toast({
        title: 'Көшіру мүмкін болмады',
        description: cleanCode,
        variant: 'destructive',
      });
    }
  };

  const handleCreateCourseAsset = async () => {
    try {
      const course = requireCourse(selectedCourse);
      const teacherId = requireUserId(user);

      const externalUrl = normalizeRequiredExternalUrl(courseAssetForm.externalUrl);
      const fallbackTitle = normalizeTitle(courseAssetForm.title, 'Курс материалы');
      const filename = getFilenameFromUrl(externalUrl, fallbackTitle);

      await createCourseAssetMutation.mutateAsync({
        ownerId: teacherId,
        courseId: course.id,
        filename,
        externalUrl,
        title: formatAssetTitle(cleanText(courseAssetForm.title), filename),
        description: normalizeDescription(courseAssetForm.description),
        sortOrder: (courseAssets?.length || 0) + 1,
        teacherId,
      });

      setCourseAssetForm(emptyExternalAssetForm);
      await refetchWorkspace();

      toast({
        title: 'Материал қосылды',
      });
    } catch (error) {
      toast({
        title: 'Материал қосу мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCourseAsset = async (assetId: string) => {
    try {
      const course = requireCourse(selectedCourse);
      const teacherId = requireUserId(user);
      const cleanAssetId = cleanText(assetId);

      if (!cleanAssetId) {
        throw new Error('Материал ID табылмады.');
      }

      await deleteCourseAssetMutation.mutateAsync({
        assetId: cleanAssetId,
        courseId: course.id,
        teacherId,
      });

      await refetchWorkspace();

      toast({
        title: 'Материал өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Материалды өшіру мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleEditAnnouncement = (announcement: CourseAnnouncementView) => {
    setEditingAnnouncementId(announcement.id);

    setAnnouncementForm({
      title: cleanText(announcement.title),
      body: cleanText(announcement.body),
      priority: announcement.priority,
      isPinned: announcement.isPinned,
      expiresAt: toDateTimeLocalValue(announcement.expiresAt),
    });

    scrollToBuilderSection('announcements');
  };

  const handleSaveAnnouncement = async () => {
    try {
      const course = requireCourse(selectedCourse);
      const teacherId = requireUserId(user);

      const title = cleanText(announcementForm.title);
      const body = cleanText(announcementForm.body);

      if (!title || !body) {
        throw new Error('Тақырып пен мәтінді толтырыңыз.');
      }

      const expiresAt = parseOptionalDateTime(announcementForm.expiresAt);

      if (editingAnnouncementId) {
        await updateAnnouncementMutation.mutateAsync({
          announcementId: editingAnnouncementId,
          courseId: course.id,
          teacherId,
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
          courseId: course.id,
          authorId: teacherId,
          teacherId,
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
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAnnouncement = async (announcement: CourseAnnouncementView) => {
    try {
      const course = requireCourse(selectedCourse);
      const teacherId = requireUserId(user);

      if (!window.confirm('Хабарландыру өшірілсін бе?')) {
        return;
      }

      await deleteAnnouncementMutation.mutateAsync({
        announcementId: announcement.id,
        courseId: course.id,
        teacherId,
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
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleCreateLessonAttachment = async () => {
    try {
      const course = requireCourse(selectedCourse);
      const lesson = requireLesson(selectedEditingLesson);
      const teacherId = requireUserId(user);

      const externalUrl = normalizeRequiredExternalUrl(
        lessonAttachmentForm.externalUrl,
      );
      const fallbackTitle = normalizeTitle(
        lessonAttachmentForm.title,
        'Сабақ материалы',
      );
      const filename = getFilenameFromUrl(externalUrl, fallbackTitle);

      await createLessonAttachmentMutation.mutateAsync({
        ownerId: teacherId,
        lessonId: lesson.id,
        courseId: course.id,
        filename,
        externalUrl,
        title: formatAssetTitle(cleanText(lessonAttachmentForm.title), filename),
        description: normalizeDescription(lessonAttachmentForm.description),
        sortOrder: (lessonAttachments?.length || 0) + 1,
        teacherId,
      });

      setLessonAttachmentForm(emptyLessonAttachmentForm);
      await refetchWorkspace();

      toast({
        title: 'Сабақ материалы қосылды',
      });
    } catch (error) {
      toast({
        title: 'Сабақ материалын қосу мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLessonAttachment = async (attachmentId: string) => {
    try {
      const course = requireCourse(selectedCourse);
      const lesson = requireLesson(selectedEditingLesson);
      const teacherId = requireUserId(user);
      const cleanAttachmentId = cleanText(attachmentId);

      if (!cleanAttachmentId) {
        throw new Error('Материал ID табылмады.');
      }

      await deleteLessonAttachmentMutation.mutateAsync({
        attachmentId: cleanAttachmentId,
        lessonId: lesson.id,
        courseId: course.id,
        teacherId,
      });

      await refetchWorkspace();

      toast({
        title: 'Сабақ материалы өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Сабақ материалын өшіру мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const canCreateCourseAsset =
    Boolean(selectedCourse?.id) &&
    Boolean(user?.id) &&
    Boolean(cleanText(courseAssetForm.externalUrl)) &&
    !createCourseAssetMutation.isPending;

  const canSaveAnnouncement =
    Boolean(selectedCourse?.id) &&
    Boolean(user?.id) &&
    Boolean(cleanText(announcementForm.title)) &&
    Boolean(cleanText(announcementForm.body)) &&
    !createAnnouncementMutation.isPending &&
    !updateAnnouncementMutation.isPending;

  const canCreateLessonAttachment =
    Boolean(selectedCourse?.id) &&
    Boolean(selectedEditingLesson?.id) &&
    Boolean(user?.id) &&
    Boolean(cleanText(lessonAttachmentForm.externalUrl)) &&
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