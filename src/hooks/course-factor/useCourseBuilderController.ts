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

const DEFAULT_CURRENCY = 'KZT';

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

function normalizeCourseAccessType(value: unknown): CourseAccessType {
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

function normalizeCourseVisibility(value: unknown): CourseVisibility {
  if (value === 'private') return 'private';
  if (value === 'unlisted') return 'unlisted';

  // Legacy DB value. CourseVisibility type does not support "school".
  if (value === 'school') return 'private';

  return 'public';
}

function normalizeCurrency(value: unknown) {
  const normalized = String(value || DEFAULT_CURRENCY)
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 3);

  return normalized || DEFAULT_CURRENCY;
}

function normalizeOptionalNumberString(value: unknown) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) return '';

  return String(Math.trunc(numeric));
}

function sortBySortOrder<T extends { sortOrder: number }>(
  items: readonly T[] | null | undefined,
): T[] {
  return [...(items ?? [])].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
}

function getWorkspaceCourses(
  workspace?: TeacherCourseWorkspace | null,
): CourseBuilderCourse[] {
  return Array.isArray(workspace?.courses) ? workspace.courses : [];
}

function buildCourseEditForm(course: CourseBuilderCourse): CourseEditForm {
  return {
    title: course.title || '',
    description: course.description || '',
    subjectId: course.subjectId || '',
    thumbnailUrl: course.thumbnailUrl || '',
    status: normalizeCourseStatus(course.status),
    accessType: normalizeCourseAccessType(course.accessType),
    visibility: normalizeCourseVisibility(course.visibility),
    price: String(course.price ?? 0),
    currency: normalizeCurrency(course.currency),
    enrollmentOpen: course.enrollmentOpen ?? true,
    maxStudents: normalizeOptionalNumberString(course.maxStudents),
  };
}

function getFirstModule(course: CourseBuilderCourse | null) {
  if (!course) return null;

  return sortBySortOrder<CourseBuilderModuleView>(course.modules)[0] ?? null;
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

  const selectedCourse = useMemo<CourseBuilderCourse | null>(() => {
    return (
      courses.find((course) => course.id === selectedCourseId) ??
      courses.find((course) => course.id === requestedCourseId) ??
      courses[0] ??
      null
    );
  }, [courses, requestedCourseId, selectedCourseId]);

  const selectedCourseModules = useMemo<CourseBuilderModuleView[]>(
    () => sortBySortOrder<CourseBuilderModuleView>(selectedCourse?.modules),
    [selectedCourse],
  );

  const selectedEditingLesson = useMemo(() => {
    return (
      selectedCourseModules
        .flatMap((module) => module.lessons)
        .find((lesson) => lesson.id === editingLessonId) ?? null
    );
  }, [editingLessonId, selectedCourseModules]);

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
      if (!courseId) return;

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
      currency: DEFAULT_CURRENCY,
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

      const firstModule = getFirstModule(course);
      const firstModuleId = firstModule?.id ?? '';

      selectCourse(courseId);
      setCourseEdit(buildCourseEditForm(course));

      setLessonForm((previous) => ({
        ...previous,
        moduleId: firstModuleId,
        sortOrder: firstModule ? getNextSortOrder(firstModule.lessons) : '1',
      }));

      setEditingLessonId(null);
      resetLessonSideForms();
      resetAnnouncementForm();
    },
    [
      courses,
      resetAnnouncementForm,
      resetLessonSideForms,
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
      queryClient.invalidateQueries({ queryKey: ['course-progress'] }),
      queryClient.invalidateQueries({ queryKey: ['course-invites'] }),
      queryClient.invalidateQueries({ queryKey: ['course-assets'] }),
      queryClient.invalidateQueries({ queryKey: ['course-announcements'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-attachments'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-mini-quiz'] }),
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: platformKeys.adminDashboard }),
      queryClient.invalidateQueries({ queryKey: platformKeys.moderationQueue }),
    ]);
  }, [queryClient, userId]);

  useEffect(() => {
    if (!workspace) return;

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
  }, [
    courses,
    requestedCourseId,
    selectedCourseId,
    syncCourseParam,
    workspace,
  ]);

  useEffect(() => {
    if (!selectedCourse) return;
    if (lastSeededCourseId.current === selectedCourse.id) return;

    lastSeededCourseId.current = selectedCourse.id;
    setCourseEdit(buildCourseEditForm(selectedCourse));
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