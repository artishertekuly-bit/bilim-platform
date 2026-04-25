import { useMutation, type QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import t from '@/lib/i18n';
import {
  createCourse,
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  reorderLessons,
  reorderModules,
  updateCourse,
  updateLesson,
  updateModule,
} from '@/lib/app-data';
import { normalizeMediaUrl } from '@/lib/media-url';
import {
  getNextSortOrder,
  getSortedBySortOrder,
  moveItem,
  normalizeCurrency,
  parseMaxStudents,
  parsePrice,
  resolveVisibilityFromAccessType,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';

type ToastFn = (input: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

type MutationUser = {
  id: string;
} | null | undefined;

type CourseBuilderCourseMutationsInput = {
  user: MutationUser;
  workspace: any;
  selectedCourse: any;

  newCourse: any;
  courseEdit: any;
  moduleForm: any;
  lessonForm: any;
  editingLessonId: string | null;

  setSelectedCourseId: Dispatch<SetStateAction<string>>;
  setModuleForm: Dispatch<SetStateAction<any>>;
  setLessonForm: Dispatch<SetStateAction<any>>;
  setEditingLessonId: Dispatch<SetStateAction<string | null>>;

  queryClient: QueryClient;
  syncCourseParam: (courseId?: string) => void;
  selectCourse: (courseId: string) => void;
  resetNewCourse: () => void;
  resetLessonForm: () => void;
  refetchWorkspace: () => Promise<void>;
  toast: ToastFn;
};

export function useCourseBuilderCourseMutations({
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
  syncCourseParam,
  selectCourse,
  resetNewCourse,
  resetLessonForm,
  refetchWorkspace,
  toast,
}: CourseBuilderCourseMutationsInput) {
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not found');

      const accessType = newCourse.accessType;
      const isPaidCourse = shouldShowCoursePricing(accessType);

      const price = isPaidCourse ? parsePrice(newCourse.price) : 0;
      const maxStudents = parseMaxStudents(newCourse.maxStudents);
      const currency = isPaidCourse ? normalizeCurrency(newCourse.currency) : 'KZT';

      if (isPaidCourse && price <= 0) {
        throw new Error('Ақылы курс үшін баға 0-ден жоғары болуы керек.');
      }

      const course = await createCourse({
        title: newCourse.title.trim(),
        description: newCourse.description.trim(),
        subjectId: newCourse.subjectId,
        teacherId: user.id,
        status: 'draft',
        accessType,
        visibility: resolveVisibilityFromAccessType(accessType),
        price,
        currency,
        enrollmentOpen: true,
        maxStudents,
      });

      if (!course) {
        throw new Error('Course creation failed');
      }

      const module = await createModule({
        courseId: course.id,
        title:
          newCourse.moduleTitle.trim() ||
          t('page.teacher_course_builder.defaults.module_short'),
        sortOrder: 1,
      });

      if (!module) {
        throw new Error('Module creation failed');
      }

      await createLesson({
        moduleId: module.id,
        subjectId: newCourse.subjectId,
        title:
          newCourse.lessonTitle.trim() ||
          t('page.teacher_course_builder.defaults.lesson_short'),
        contentBody: newCourse.lessonBody,
        practiceContent: newCourse.lessonPractice,
        mediaUrl: normalizeMediaUrl(newCourse.lessonVideo),
        sortOrder: 1,
        isPublished: false,
      });

      return course;
    },
    onSuccess: async (course) => {
      resetNewCourse();
      await refetchWorkspace();
      selectCourse(course.id);

      toast({
        title: t('page.teacher_course_builder.toast.create_course_title'),
        description: t('page.teacher_course_builder.toast.create_course_text'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const updateCourseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourse) throw new Error('Course not selected');

      const accessType = courseEdit.accessType;
      const isPaidCourse = shouldShowCoursePricing(accessType);

      const price = isPaidCourse ? parsePrice(courseEdit.price) : 0;
      const maxStudents = parseMaxStudents(courseEdit.maxStudents);
      const currency = isPaidCourse ? normalizeCurrency(courseEdit.currency) : 'KZT';

      if (isPaidCourse && price <= 0) {
        throw new Error('Ақылы курс үшін баға 0-ден жоғары болуы керек.');
      }

      await updateCourse({
        courseId: selectedCourse.id,
        title: courseEdit.title.trim(),
        description: courseEdit.description.trim(),
        subjectId: courseEdit.subjectId || null,
        thumbnailUrl: courseEdit.thumbnailUrl.trim() || null,
        status: courseEdit.status,
        accessType,
        visibility: resolveVisibilityFromAccessType(accessType),
        price,
        currency,
        enrollmentOpen: true,
        maxStudents,
      });
    },
    onSuccess: async () => {
      await refetchWorkspace();
      toast({ title: t('page.teacher_course_builder.toast.update_course_title') });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (courseId: string) => {
      await deleteCourse(courseId);
    },
    onSuccess: async (_data, courseId) => {
      const nextCourseId =
        workspace?.courses.find((course: any) => course.id !== courseId)?.id || '';

      setEditingLessonId(null);

      if (nextCourseId) {
        setSelectedCourseId(nextCourseId);
        syncCourseParam(nextCourseId);
      } else {
        setSelectedCourseId('');
        syncCourseParam();
      }

      await refetchWorkspace();

      toast({ title: t('page.teacher_course_builder.toast.delete_course_title') });
    },
    onError: (error) => {
      console.error('[deleteCourseMutation error]', error);

      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description:
          error instanceof Error
            ? error.message
            : t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      });
    },
  });

  const addModuleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourse) throw new Error('Course not selected');

      await createModule({
        courseId: selectedCourse.id,
        title: moduleForm.title.trim(),
        sortOrder: Number(getNextSortOrder(selectedCourse.modules || [])),
      });
    },
    onSuccess: async () => {
      setModuleForm({ title: '' });
      await refetchWorkspace();
      toast({ title: t('page.teacher_course_builder.toast.add_module_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      if (!selectedCourse) throw new Error('Course not selected');

      const remainingIds = getSortedBySortOrder(selectedCourse.modules)
        .filter((module: any) => module.id !== moduleId)
        .map((module: any) => module.id);

      await deleteModule(moduleId);

      if (remainingIds.length > 0) {
        await reorderModules(selectedCourse.id, remainingIds);
      }
    },
    onSuccess: async () => {
      await refetchWorkspace();
      resetLessonForm();
      toast({ title: t('page.teacher_course_builder.toast.delete_module_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const reorderModulesMutation = useMutation({
    mutationFn: async ({
      moduleId,
      direction,
    }: {
      moduleId: string;
      direction: 'up' | 'down';
    }) => {
      if (!selectedCourse) throw new Error('Course not selected');

      const sortedModules = getSortedBySortOrder(selectedCourse.modules || []);
      const currentIndex = sortedModules.findIndex((module: any) => module.id === moduleId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedModules.length) {
        return;
      }

      const nextOrder = moveItem(sortedModules, currentIndex, nextIndex).map(
        (module: any) => module.id
      );

      await reorderModules(selectedCourse.id, nextOrder);
    },
    onSuccess: async () => {
      await refetchWorkspace();
      toast({ title: t('page.teacher_course_builder.toast.reorder_modules_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const addOrUpdateLessonMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourse) throw new Error('Course not selected');
      if (!lessonForm.moduleId) throw new Error('Module not selected');

      if (editingLessonId) {
        await updateLesson({
          lessonId: editingLessonId,
          title: lessonForm.title.trim(),
          contentBody: lessonForm.contentBody,
          practiceContent: lessonForm.practiceContent,
          mediaUrl: normalizeMediaUrl(lessonForm.mediaUrl),
          sortOrder: Number(lessonForm.sortOrder) || 1,
          isPublished: lessonForm.isPublished,
        });
      } else {
        await createLesson({
          moduleId: lessonForm.moduleId,
          subjectId: selectedCourse.subjectId || undefined,
          title: lessonForm.title.trim(),
          contentBody: lessonForm.contentBody,
          practiceContent: lessonForm.practiceContent,
          mediaUrl: normalizeMediaUrl(lessonForm.mediaUrl),
          sortOrder: Number(lessonForm.sortOrder) || 1,
          isPublished: lessonForm.isPublished,
        });
      }
    },
    onSuccess: async () => {
      resetLessonForm();
      await refetchWorkspace();
      toast({
        title: editingLessonId
          ? t('page.teacher_course_builder.toast.update_lesson_title')
          : t('page.teacher_course_builder.toast.add_lesson_title'),
      });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const deleteLessonMutation = useMutation({
    mutationFn: async ({
      lessonId,
      moduleId,
      remainingIds,
    }: {
      lessonId: string;
      moduleId: string;
      remainingIds: string[];
    }) => {
      await deleteLesson(lessonId);

      if (remainingIds.length > 0) {
        await reorderLessons(moduleId, remainingIds);
      }
    },
    onSuccess: async () => {
      await refetchWorkspace();
      resetLessonForm();
      toast({ title: t('page.teacher_course_builder.toast.delete_lesson_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const reorderLessonsMutation = useMutation({
    mutationFn: async ({
      moduleId,
      lessonId,
      direction,
    }: {
      moduleId: string;
      lessonId: string;
      direction: 'up' | 'down';
    }) => {
      const module = selectedCourse?.modules.find((item: any) => item.id === moduleId);
      if (!module) throw new Error('Module not found');

      const sortedLessons = getSortedBySortOrder(module.lessons || []);
      const currentIndex = sortedLessons.findIndex((lesson: any) => lesson.id === lessonId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedLessons.length) {
        return;
      }

      const nextOrder = moveItem(sortedLessons, currentIndex, nextIndex).map(
        (lesson: any) => lesson.id
      );

      await reorderLessons(moduleId, nextOrder);
    },
    onSuccess: async () => {
      await refetchWorkspace();
      toast({ title: t('page.teacher_course_builder.toast.reorder_lessons_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const quickStatusMutation = useMutation({
    mutationFn: async ({ courseId, status }: { courseId: string; status: CourseStatus }) =>
      updateCourse({ courseId, status }),
    onSuccess: async () => {
      await refetchWorkspace();
      toast({ title: t('page.teacher_course_builder.toast.update_status_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const updateModuleTitleMutation = useMutation({
    mutationFn: async ({ moduleId, title }: { moduleId: string; title: string }) =>
      updateModule({ moduleId, title }),
    onSuccess: async () => {
      await refetchWorkspace();
      toast({ title: t('page.teacher_course_builder.toast.update_module_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const startEditLesson = (lessonId: string) => {
    const lesson = selectedCourse?.modules
      .flatMap((module: any) => module.lessons)
      .find((item: any) => item.id === lessonId);

    if (!lesson) return;

    setEditingLessonId(lesson.id);
    setLessonForm({
      moduleId: lesson.moduleId,
      title: lesson.title,
      contentBody: lesson.contentBody || '',
      practiceContent: lesson.practiceContent || '',
      mediaUrl: lesson.mediaUrl || '',
      sortOrder: String(lesson.sortOrder),
      isPublished: lesson.isPublished,
    });
  };

  const canCreateCourse =
    !!newCourse.title.trim() &&
    !!newCourse.subjectId &&
    !createMutation.isPending;

  const canAddModule =
    !!selectedCourse &&
    !!moduleForm.title.trim() &&
    !addModuleMutation.isPending;

  const canSaveLesson =
    !!lessonForm.moduleId &&
    !!lessonForm.title.trim() &&
    !addOrUpdateLessonMutation.isPending;

  return {
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
  };
}
