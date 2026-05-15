import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';

import { platformKeys } from '@/hooks/use-platform-data';
import type {
  CourseAccessType,
  CourseAnnouncementPriority,
  CourseBuilderModuleView,
  CourseVisibility,
  LessonMiniQuizQuestionType,
  TeacherCourseWorkspace,
} from '@/lib/app-data-types';
import {
  getNextSortOrder,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import t from '@/lib/i18n';

type NewCourseForm = {
  title: string;
  description: string;
  subjectId: string;
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

type LessonForm = {
  moduleId: string;
  title: string;
  contentBody: string;
  practiceContent: string;
  mediaUrl: string;
  sortOrder: string;
  isPublished: boolean;
};

type LessonAttachmentForm = {
  title: string;
  description: string;
  externalUrl: string;
};

type MiniQuizQuestionForm = {
  questionText: string;
  questionType: LessonMiniQuizQuestionType;
  options: string[];
  correctAnswer: number[];
  explanation: string;
  sortOrder: string;
};

type AnnouncementForm = {
  title: string;
  body: string;
  priority: CourseAnnouncementPriority;
  isPinned: boolean;
  expiresAt: string;
};

type CourseBuilderCourse = TeacherCourseWorkspace['courses'][number];

type CourseBuilderControllerInput = {
  userId?: string;
  workspace?: TeacherCourseWorkspace | null;
  queryClient: QueryClient;

  setNewCourse: Dispatch<SetStateAction<NewCourseForm>>;
  setCourseEdit: Dispatch<SetStateAction<CourseEditForm>>;

  setLessonForm: Dispatch<SetStateAction<LessonForm>>;
  editingLessonId: string | null;
  setEditingLessonId: Dispatch<SetStateAction<string | null>>;

  setEditingMiniQuizQuestionId: Dispatch<SetStateAction<string | null>>;
  setLessonAttachmentForm: Dispatch<SetStateAction<LessonAttachmentForm>>;
  setMiniQuizQuestionForm: Dispatch<SetStateAction<MiniQuizQuestionForm>>;
  setAnnouncementForm: Dispatch<SetStateAction<AnnouncementForm>>;
  setEditingAnnouncementId: Dispatch<SetStateAction<string | null>>;
};

const initialMiniQuizQuestionForm: MiniQuizQuestionForm = {
  questionText: '',
  questionType: 'single_choice',
  options: ['', '', '', ''],
  correctAnswer: [],
  explanation: '',
  sortOrder: '1',
};

const initialLessonAttachmentForm: LessonAttachmentForm = {
  title: '',
  description: '',
  externalUrl: '',
};

const initialAnnouncementForm: AnnouncementForm = {
  title: '',
  body: '',
  priority: 'normal',
  isPinned: false,
  expiresAt: '',
};

function normalizeCourseStatus(status: unknown): CourseStatus {
  if (status === 'archived') return 'archived';
  if (status === 'published') return 'published';

  return 'draft';
}

function sortBySortOrder<T extends { sortOrder: number }>(
  items: readonly T[] | null | undefined,
): T[] {
  return [...(items ?? [])].sort((first, second) => first.sortOrder - second.sortOrder);
}

function getWorkspaceCourses(
  workspace?: TeacherCourseWorkspace | null,
): CourseBuilderCourse[] {
  return workspace?.courses ?? [];
}

export function useCourseBuilderController({
  userId,
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
}: CourseBuilderControllerInput) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCourseId = searchParams.get('courseId') || '';

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const lastSeededCourseId = useRef('');

  const courses = useMemo(() => getWorkspaceCourses(workspace), [workspace]);

  const selectedCourse = useMemo<CourseBuilderCourse | null>(
    () =>
      courses.find((course) => course.id === selectedCourseId) ??
      courses.find((course) => course.id === requestedCourseId) ??
      courses[0] ??
      null,
    [courses, selectedCourseId, requestedCourseId],
  );

  const selectedCourseModules = useMemo<CourseBuilderModuleView[]>(
    () => sortBySortOrder<CourseBuilderModuleView>(selectedCourse?.modules),
    [selectedCourse],
  );

  const selectedEditingLesson = useMemo(
    () =>
      selectedCourseModules
        .flatMap((module) => module.lessons)
        .find((lesson) => lesson.id === editingLessonId) ?? null,
    [editingLessonId, selectedCourseModules],
  );

  const selectedCourseModuleSignature =
    selectedCourseModules.map((module) => module.id).join('|') || '';

  const defaultModuleId = selectedCourseModules[0]?.id || '';

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
    [searchParams, setSearchParams],
  );

  const resetMiniQuizQuestionForm = useCallback(() => {
    setEditingMiniQuizQuestionId(null);
    setMiniQuizQuestionForm(initialMiniQuizQuestionForm);
  }, [setEditingMiniQuizQuestionId, setMiniQuizQuestionForm]);

  const resetLessonSideForms = useCallback(() => {
    setLessonAttachmentForm(initialLessonAttachmentForm);
    resetMiniQuizQuestionForm();
  }, [resetMiniQuizQuestionForm, setLessonAttachmentForm]);

  const resetAnnouncementForm = useCallback(() => {
    setEditingAnnouncementId(null);
    setAnnouncementForm(initialAnnouncementForm);
  }, [setAnnouncementForm, setEditingAnnouncementId]);

  const selectCourse = useCallback(
    (courseId: string) => {
      setSelectedCourseId(courseId);
      syncCourseParam(courseId);
      setEditingLessonId(null);
      resetLessonSideForms();
      resetAnnouncementForm();
    },
    [
      resetAnnouncementForm,
      resetLessonSideForms,
      setEditingLessonId,
      syncCourseParam,
    ],
  );

  const getNextLessonSortOrder = useCallback(
    (moduleId?: string) => {
      if (!selectedCourse || !moduleId) return '1';

      const module = selectedCourse.modules.find((item) => item.id === moduleId);
      if (!module) return '1';

      return getNextSortOrder(module.lessons);
    },
    [selectedCourse],
  );

  const resetNewCourse = useCallback(() => {
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
  }, [setNewCourse]);

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
    resetLessonSideForms();
  }, [
    defaultModuleId,
    getNextLessonSortOrder,
    resetLessonSideForms,
    setEditingLessonId,
    setLessonForm,
  ]);

  const seedEditFromCourse = useCallback(
    (courseId: string) => {
      const course = courses.find((item) => item.id === courseId);
      if (!course) return;

      const sortedModules = sortBySortOrder<CourseBuilderModuleView>(course.modules);
      const firstModule = sortedModules[0] ?? null;
      const firstModuleId = firstModule?.id ?? '';

      selectCourse(courseId);

      setCourseEdit({
        title: course.title,
        description: course.description || '',
        subjectId: course.subjectId || '',
        thumbnailUrl: course.thumbnailUrl || '',
        status: normalizeCourseStatus(course.status),
        accessType: course.accessType || 'public_free',
        visibility: course.visibility || 'public',
        price: String(course.price ?? 0),
        currency: course.currency || 'KZT',
        enrollmentOpen: course.enrollmentOpen ?? true,
        maxStudents: course.maxStudents ? String(course.maxStudents) : '',
      });

      setLessonForm((previous) => ({
        ...previous,
        moduleId: firstModuleId,
        sortOrder: firstModule ? getNextSortOrder(firstModule.lessons) : '1',
      }));

      setEditingLessonId(null);
    },
    [
      courses,
      selectCourse,
      setCourseEdit,
      setEditingLessonId,
      setLessonForm,
    ],
  );

  const refetchWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherCourseWorkspace(userId || ''),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherDashboard(userId || ''),
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
  }, [queryClient, userId]);

  useEffect(() => {
    if (!courses.length) {
      if (selectedCourseId) {
        setSelectedCourseId('');
      }

      if (requestedCourseId) {
        syncCourseParam();
      }

      return;
    }

    const course =
      courses.find((item) => item.id === requestedCourseId) ??
      courses.find((item) => item.id === selectedCourseId) ??
      courses[0];

    if (!course) return;

    if (course.id !== selectedCourseId) {
      setSelectedCourseId(course.id);
    }

    if (requestedCourseId !== course.id) {
      syncCourseParam(course.id);
    }
  }, [courses, requestedCourseId, selectedCourseId, syncCourseParam]);

  useEffect(() => {
    if (!selectedCourse) return;
    if (lastSeededCourseId.current === selectedCourse.id) return;

    lastSeededCourseId.current = selectedCourse.id;

    setCourseEdit({
      title: selectedCourse.title,
      description: selectedCourse.description || '',
      subjectId: selectedCourse.subjectId || '',
      thumbnailUrl: selectedCourse.thumbnailUrl || '',
      status: normalizeCourseStatus(selectedCourse.status),
      accessType: selectedCourse.accessType || 'public_free',
      visibility: selectedCourse.visibility || 'public',
      price: String(selectedCourse.price ?? 0),
      currency: selectedCourse.currency || 'KZT',
      enrollmentOpen: selectedCourse.enrollmentOpen ?? true,
      maxStudents: selectedCourse.maxStudents ? String(selectedCourse.maxStudents) : '',
    });
  }, [selectedCourse, setCourseEdit]);

  useEffect(() => {
    if (!selectedCourse) return;

    setLessonForm((previous) => {
      const hasCurrentModule =
        Boolean(previous.moduleId) &&
        selectedCourse.modules.some((module) => module.id === previous.moduleId);

      const nextModuleId = hasCurrentModule ? previous.moduleId : defaultModuleId;

      return {
        ...previous,
        moduleId: nextModuleId,
        sortOrder:
          previous.moduleId === nextModuleId
            ? previous.sortOrder
            : getNextLessonSortOrder(nextModuleId),
      };
    });
  }, [
    defaultModuleId,
    getNextLessonSortOrder,
    selectedCourse,
    selectedCourseModuleSignature,
    setLessonForm,
  ]);

  useEffect(() => {
    if (!selectedCourse || !editingLessonId) return;

    const lessonStillExists = selectedCourse.modules.some((module) =>
      module.lessons.some((lesson) => lesson.id === editingLessonId),
    );

    if (!lessonStillExists) {
      setEditingLessonId(null);
      resetLessonSideForms();
    }
  }, [
    editingLessonId,
    resetLessonSideForms,
    selectedCourse,
    setEditingLessonId,
  ]);

  return {
    requestedCourseId,
    selectedCourseId,
    setSelectedCourseId,
    selectedCourse,
    selectedCourseModules,
    selectedEditingLesson,
    selectedCourseModuleSignature,
    defaultModuleId,
    syncCourseParam,
    selectCourse,
    getNextLessonSortOrder,
    resetNewCourse,
    resetLessonForm,
    seedEditFromCourse,
    refetchWorkspace,
  };
}