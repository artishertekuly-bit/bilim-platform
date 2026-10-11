import { useMutation, type QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

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
import type {
  CourseAccessType,
  CourseVisibility,
  TeacherCourseWorkspace,
} from '@/lib/app-data-types';
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
import t from '@/lib/i18n';
import { removeCourseThumbnailStorageObject } from '@/lib/course-thumbnail-storage';
import { normalizeMediaUrl } from '@/lib/media-url';
import { removeNullCharacters } from '@/lib/utils';

type ToastFn = (input: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

type MutationUser = {
  id: string;
} | null | undefined;

type CourseBuilderCourse = TeacherCourseWorkspace['courses'][number];
type CourseBuilderModule = CourseBuilderCourse['modules'][number];
type CourseBuilderLesson = CourseBuilderModule['lessons'][number];

type NewCourseForm = {
  title: string;
  description: string;
  subjectId: string;
  thumbnailUrl: string;
  accessType: CourseAccessType;
  visibility: CourseVisibility;
  price: string;
  currency: string;
  enrollmentOpen: boolean;
  maxStudents: string;
  moduleTitle: string;
  lessonTitle: string;
  lessonBody: string;
  lessonPractice: string;
  lessonVideo: string;
};

type CourseEditForm = {
  title: string;
  description: string;
  subjectId: string;
  thumbnailUrl: string;
  status: CourseStatus;
  accessType: CourseAccessType;
  visibility: CourseVisibility;
  price: string;
  currency: string;
  enrollmentOpen: boolean;
  maxStudents: string;
};

type ModuleForm = {
  title: string;
};

type LessonForm = {
  moduleId: string;
  title: string;
  contentBody: string;
  practiceContent: string;
  mediaUrl: string;
  sortOrder: string;
  isPublished: boolean;
};

type CourseBuilderCourseMutationsInput = {
  user: MutationUser;
  workspace?: TeacherCourseWorkspace | null;
  selectedCourse?: CourseBuilderCourse | null;

  newCourse: NewCourseForm;
  courseEdit: CourseEditForm;
  moduleForm: ModuleForm;
  lessonForm: LessonForm;
  editingLessonId: string | null;

  setSelectedCourseId: Dispatch<SetStateAction<string>>;
  setModuleForm: Dispatch<SetStateAction<ModuleForm>>;
  setLessonForm: Dispatch<SetStateAction<LessonForm>>;
  setEditingLessonId: Dispatch<SetStateAction<string | null>>;

  queryClient: QueryClient;
  syncCourseParam: (courseId?: string) => void;
  selectCourse: (courseId: string) => void;
  resetNewCourse: () => void;
  resetLessonForm: () => void;
  refetchWorkspace: () => Promise<void>;
  toast: ToastFn;
  onCourseCreated?: (course: CourseBuilderCourse) => void;
  onCourseDeleted?: (courseId: string) => void;
};

const DEFAULT_CURRENCY = 'KZT';

function cleanText(value: string): string {
  return removeNullCharacters(value).trim();
}

function cleanLooseText(value: string | null | undefined): string {
  return removeNullCharacters(value ?? '').trim();
}

function cleanContent(value: string | null | undefined): string {
  return removeNullCharacters(value ?? '').trim();
}

function normalizeAccessType(value: unknown): CourseAccessType {
  if (
    value === 'public_free' ||
    value === 'private_invite' ||
    value === 'paid' ||
    value === 'subscription_only' ||
    value === 'school_only'
  ) {
    return value;
  }

  if (value === 'open' || value === 'free') return 'public_free';
  if (value === 'closed' || value === 'invite_only') return 'private_invite';

  return 'public_free';
}

function normalizeSortOrder(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = cleanLooseText(value);

  return normalized || null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? cleanLooseText(error.message)
    : fallback;
}

function getPaidCourseMeta(input: {
  accessType: CourseAccessType;
  price: string;
  currency: string;
}) {
  const isPaidCourse = shouldShowCoursePricing(input.accessType);
  const price = isPaidCourse ? parsePrice(cleanLooseText(input.price)) : 0;
  const currency = isPaidCourse
    ? normalizeCurrency(cleanLooseText(input.currency) || DEFAULT_CURRENCY)
    : DEFAULT_CURRENCY;

  if (isPaidCourse && price <= 0) {
    throw new Error('Ақылы курс үшін баға 0-ден жоғары болуы керек.');
  }

  return {
    isPaidCourse,
    price,
    currency,
  };
}

function requireUser(user: MutationUser) {
  if (!user?.id) {
    throw new Error('Пайдаланушы табылмады.');
  }

  return user;
}

function requireSelectedCourse(
  selectedCourse: CourseBuilderCourse | null | undefined,
) {
  if (!selectedCourse?.id) {
    throw new Error('Курс таңдалмаған.');
  }

  return selectedCourse;
}

function requireCourseTitle(title: string): string {
  const normalized = cleanText(title);

  if (!normalized) {
    throw new Error('Курс атауын енгізіңіз.');
  }

  return normalized;
}

function requireCourseDescription(description: string): string {
  const normalized = cleanText(description);

  if (!normalized) {
    throw new Error('Курс сипаттамасын енгізіңіз.');
  }

  return normalized;
}

function requireSubjectId(subjectId: string): string {
  const normalized = cleanText(subjectId);

  if (!normalized) {
    throw new Error('Пән таңдаңыз.');
  }

  return normalized;
}

function requireModuleTitle(title: string): string {
  const normalized = cleanText(title);

  if (!normalized) {
    throw new Error('Модуль атауын енгізіңіз.');
  }

  return normalized;
}

function requireLessonTitle(title: string): string {
  const normalized = cleanText(title);

  if (!normalized) {
    throw new Error('Сабақ атауын енгізіңіз.');
  }

  return normalized;
}

function findLessonInCourse(
  selectedCourse: CourseBuilderCourse | null | undefined,
  lessonId: string,
): {
  lesson: CourseBuilderLesson;
  module: CourseBuilderModule;
} | null {
  if (!selectedCourse) return null;

  for (const module of selectedCourse.modules) {
    const lesson = module.lessons.find((item) => item.id === lessonId);

    if (lesson) {
      return {
        lesson,
        module,
      };
    }
  }

  return null;
}

function getRemainingCourseId(
  workspace: TeacherCourseWorkspace | null | undefined,
  deletedCourseId: string,
): string {
  return (
    workspace?.courses.find((course) => course.id !== deletedCourseId)?.id || ''
  );
}

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
  onCourseCreated,
  onCourseDeleted,
}: CourseBuilderCourseMutationsInput) {
  const createMutation = useMutation({
    mutationFn: async () => {
      const activeUser = requireUser(user);
      const accessType = normalizeAccessType(newCourse.accessType);
      const { price, currency } = getPaidCourseMeta({
        accessType,
        price: newCourse.price,
        currency: newCourse.currency,
      });

      const title = requireCourseTitle(newCourse.title);
      const description = requireCourseDescription(newCourse.description);
      const subjectId = requireSubjectId(newCourse.subjectId);

      const course = await createCourse({
        title,
        description,
        subjectId,
        thumbnailUrl: normalizeNullableText(
          normalizeMediaUrl(cleanLooseText(newCourse.thumbnailUrl)),
        ),
        teacherId: activeUser.id,
        status: 'draft',
        accessType,
        visibility: resolveVisibilityFromAccessType(accessType),
        price,
        currency,
        enrollmentOpen: Boolean(newCourse.enrollmentOpen),
        maxStudents: parseMaxStudents(cleanLooseText(newCourse.maxStudents)),
      });

      if (!course?.id) {
        throw new Error('Курс құру мүмкін болмады.');
      }

      const module = await createModule({
        courseId: course.id,
        title:
          cleanText(newCourse.moduleTitle) ||
          t('page.teacher_course_builder.defaults.module_short'),
        sortOrder: 1,
      });

      if (!module?.id) {
        throw new Error('Модуль құру мүмкін болмады.');
      }

      await createLesson({
        moduleId: module.id,
        subjectId,
        title:
          cleanText(newCourse.lessonTitle) ||
          t('page.teacher_course_builder.defaults.lesson_short'),
        contentBody: cleanContent(newCourse.lessonBody),
        practiceContent: cleanContent(newCourse.lessonPractice),
        mediaUrl: normalizeMediaUrl(cleanLooseText(newCourse.lessonVideo)),
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

      onCourseCreated?.(course);
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const updateCourseMutation = useMutation({
    mutationFn: async () => {
      const course = requireSelectedCourse(selectedCourse);
      const accessType = normalizeAccessType(courseEdit.accessType);
      const { price, currency } = getPaidCourseMeta({
        accessType,
        price: courseEdit.price,
        currency: courseEdit.currency,
      });

      const previousThumbnailUrl = cleanLooseText(course.thumbnailUrl);
      const nextThumbnailUrl = normalizeNullableText(
        normalizeMediaUrl(cleanLooseText(courseEdit.thumbnailUrl)),
      );

      await updateCourse({
        courseId: course.id,
        title: requireCourseTitle(courseEdit.title),
        description: requireCourseDescription(courseEdit.description),
        subjectId: normalizeNullableText(courseEdit.subjectId),
        thumbnailUrl: nextThumbnailUrl,
        status: courseEdit.status,
        accessType,
        visibility: resolveVisibilityFromAccessType(accessType),
        price,
        currency,
        enrollmentOpen: Boolean(courseEdit.enrollmentOpen),
        maxStudents: parseMaxStudents(cleanLooseText(courseEdit.maxStudents)),
      });

      return {
        previousThumbnailUrl,
        nextThumbnailUrl: nextThumbnailUrl || '',
      };
    },
    onSuccess: async ({ previousThumbnailUrl, nextThumbnailUrl }) => {
      if (
        previousThumbnailUrl &&
        previousThumbnailUrl !== nextThumbnailUrl
      ) {
        try {
          await removeCourseThumbnailStorageObject(previousThumbnailUrl);
        } catch {
          // The course is already updated. Old-file cleanup must not block UI.
        }
      }

      await refetchWorkspace();

      toast({
        title: t('page.teacher_course_builder.toast.update_course_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (courseId: string) => {
      if (!courseId) {
        throw new Error('Курс ID табылмады.');
      }

      await deleteCourse(courseId);

      return courseId;
    },
    onSuccess: async (deletedCourseId) => {
      const nextCourseId = getRemainingCourseId(workspace, deletedCourseId);

      setEditingLessonId(null);

      if (nextCourseId) {
        setSelectedCourseId(nextCourseId);
        syncCourseParam(nextCourseId);
      } else {
        setSelectedCourseId('');
        syncCourseParam();
      }

      await refetchWorkspace();

      toast({
        title: t('page.teacher_course_builder.toast.delete_course_title'),
      });

      onCourseDeleted?.(deletedCourseId);
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const addModuleMutation = useMutation({
    mutationFn: async () => {
      const course = requireSelectedCourse(selectedCourse);
      const title = requireModuleTitle(moduleForm.title);

      await createModule({
        courseId: course.id,
        title,
        sortOrder: Number(getNextSortOrder(course.modules || [])),
      });
    },
    onSuccess: async () => {
      setModuleForm({ title: '' });
      await refetchWorkspace();

      toast({
        title: t('page.teacher_course_builder.toast.add_module_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      const course = requireSelectedCourse(selectedCourse);

      if (!moduleId) {
        throw new Error('Модуль ID табылмады.');
      }

      const remainingIds = getSortedBySortOrder(course.modules)
        .filter((module) => module.id !== moduleId)
        .map((module) => module.id);

      await deleteModule(moduleId);

      if (remainingIds.length > 0) {
        await reorderModules(course.id, remainingIds);
      }
    },
    onSuccess: async () => {
      await refetchWorkspace();
      resetLessonForm();

      toast({
        title: t('page.teacher_course_builder.toast.delete_module_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
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
      const course = requireSelectedCourse(selectedCourse);
      const sortedModules = getSortedBySortOrder(course.modules || []);
      const currentIndex = sortedModules.findIndex((module) => module.id === moduleId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedModules.length) {
        return;
      }

      const nextOrder = moveItem(sortedModules, currentIndex, nextIndex).map(
        (module) => module.id,
      );

      await reorderModules(course.id, nextOrder);
    },
    onSuccess: async () => {
      await refetchWorkspace();

      toast({
        title: t('page.teacher_course_builder.toast.reorder_modules_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const addOrUpdateLessonMutation = useMutation({
    mutationFn: async () => {
      const course = requireSelectedCourse(selectedCourse);
      const title = requireLessonTitle(lessonForm.title);
      const sortOrder = normalizeSortOrder(cleanLooseText(lessonForm.sortOrder));
      const mediaUrl = normalizeMediaUrl(cleanLooseText(lessonForm.mediaUrl));

      if (!lessonForm.moduleId) {
        throw new Error('Модуль таңдалмаған.');
      }

      const moduleExists = course.modules.some(
        (module) => module.id === lessonForm.moduleId,
      );

      if (!moduleExists) {
        throw new Error('Таңдалған модуль бұл курсқа тиесілі емес.');
      }

      if (editingLessonId) {
        await updateLesson({
          lessonId: editingLessonId,
          title,
          contentBody: cleanContent(lessonForm.contentBody),
          practiceContent: cleanContent(lessonForm.practiceContent),
          mediaUrl,
          sortOrder,
          isPublished: lessonForm.isPublished,
        });

        return;
      }

      await createLesson({
        moduleId: lessonForm.moduleId,
        subjectId: course.subjectId || undefined,
        title,
        contentBody: cleanContent(lessonForm.contentBody),
        practiceContent: cleanContent(lessonForm.practiceContent),
        mediaUrl,
        sortOrder,
        isPublished: lessonForm.isPublished,
      });
    },
    onSuccess: async () => {
      const wasEditing = Boolean(editingLessonId);

      resetLessonForm();
      await refetchWorkspace();

      toast({
        title: wasEditing
          ? t('page.teacher_course_builder.toast.update_lesson_title')
          : t('page.teacher_course_builder.toast.add_lesson_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
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
      if (!lessonId) {
        throw new Error('Сабақ ID табылмады.');
      }

      if (!moduleId) {
        throw new Error('Модуль ID табылмады.');
      }

      await deleteLesson(lessonId);

      if (remainingIds.length > 0) {
        await reorderLessons(moduleId, remainingIds);
      }
    },
    onSuccess: async () => {
      await refetchWorkspace();
      resetLessonForm();

      toast({
        title: t('page.teacher_course_builder.toast.delete_lesson_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
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
      const course = requireSelectedCourse(selectedCourse);
      const module = course.modules.find((item) => item.id === moduleId);

      if (!module) {
        throw new Error('Модуль табылмады.');
      }

      const sortedLessons = getSortedBySortOrder(module.lessons || []);
      const currentIndex = sortedLessons.findIndex((lesson) => lesson.id === lessonId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedLessons.length) {
        return;
      }

      const nextOrder = moveItem(sortedLessons, currentIndex, nextIndex).map(
        (lesson) => lesson.id,
      );

      await reorderLessons(moduleId, nextOrder);
    },
    onSuccess: async () => {
      await refetchWorkspace();

      toast({
        title: t('page.teacher_course_builder.toast.reorder_lessons_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const quickStatusMutation = useMutation({
    mutationFn: async ({
      courseId,
      status,
    }: {
      courseId: string;
      status: CourseStatus;
    }) => {
      if (!courseId) {
        throw new Error('Курс ID табылмады.');
      }

      await updateCourse({
        courseId,
        status,
      });
    },
    onSuccess: async () => {
      await refetchWorkspace();

      toast({
        title: t('page.teacher_course_builder.toast.update_status_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const updateModuleTitleMutation = useMutation({
    mutationFn: async ({
      moduleId,
      title,
    }: {
      moduleId: string;
      title: string;
    }) => {
      if (!moduleId) {
        throw new Error('Модуль ID табылмады.');
      }

      await updateModule({
        moduleId,
        title: requireModuleTitle(title),
      });
    },
    onSuccess: async () => {
      await refetchWorkspace();

      toast({
        title: t('page.teacher_course_builder.toast.update_module_title'),
      });
    },
    onError: (error) =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.teacher_course_builder.toast.error_text'),
        ),
        variant: 'destructive',
      }),
  });

  const startEditLesson = (lessonId: string) => {
    const found = findLessonInCourse(selectedCourse, lessonId);

    if (!found) {
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: 'Сабақ табылмады.',
        variant: 'destructive',
      });
      return;
    }

    const { lesson, module } = found;

    setEditingLessonId(lesson.id);
    setLessonForm({
      moduleId: module.id,
      title: lesson.title,
      contentBody: lesson.contentBody || '',
      practiceContent: lesson.practiceContent || '',
      mediaUrl: lesson.mediaUrl || '',
      sortOrder: String(lesson.sortOrder || 1),
      isPublished: Boolean(lesson.isPublished),
    });
  };

  const createAccessType = normalizeAccessType(newCourse.accessType);
  const editAccessType = normalizeAccessType(courseEdit.accessType);

  const canCreateCourse =
    Boolean(user?.id) &&
    Boolean(cleanText(newCourse.title)) &&
    Boolean(cleanText(newCourse.description)) &&
    Boolean(cleanText(newCourse.subjectId)) &&
    (!shouldShowCoursePricing(createAccessType) ||
      parsePrice(cleanLooseText(newCourse.price)) > 0) &&
    !createMutation.isPending;

  const canAddModule =
    Boolean(selectedCourse) &&
    Boolean(cleanText(moduleForm.title)) &&
    !addModuleMutation.isPending;

  const canSaveLesson =
    Boolean(selectedCourse) &&
    Boolean(cleanText(lessonForm.moduleId)) &&
    Boolean(cleanText(lessonForm.title)) &&
    !addOrUpdateLessonMutation.isPending;

  const canSaveCourse =
    Boolean(selectedCourse) &&
    Boolean(cleanText(courseEdit.title)) &&
    Boolean(cleanText(courseEdit.description)) &&
    Boolean(cleanText(courseEdit.subjectId)) &&
    (!shouldShowCoursePricing(editAccessType) ||
      parsePrice(cleanLooseText(courseEdit.price)) > 0) &&
    !updateCourseMutation.isPending;

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
    canSaveCourse,
  };
}