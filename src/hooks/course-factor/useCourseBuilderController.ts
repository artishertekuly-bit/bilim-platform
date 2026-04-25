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

import t from '@/lib/i18n';
import { platformKeys } from '@/hooks/use-platform-data';
import type {
  CourseAccessType,
  CourseAnnouncementPriority,
  CourseVisibility,
  LessonMiniQuizQuestionType,
} from '@/lib/app-data-types';
import {
  getNextSortOrder,
  getSortedBySortOrder,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';

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

type CourseBuilderControllerInput = {
  userId?: string;
  workspace: any;
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

  const selectedCourse = useMemo(
    () =>
      workspace?.courses.find((course: any) => course.id === selectedCourseId) ||
      workspace?.courses.find((course: any) => course.id === requestedCourseId) ||
      workspace?.courses[0] ||
      null,
    [workspace, selectedCourseId, requestedCourseId]
  );

  const selectedCourseModules = useMemo(
    () => getSortedBySortOrder(selectedCourse?.modules || []),
    [selectedCourse]
  );

  const selectedEditingLesson = useMemo(
    () =>
      selectedCourse?.modules
        .flatMap((module: any) => module.lessons)
        .find((lesson: any) => lesson.id === editingLessonId) || null,
    [editingLessonId, selectedCourse]
  );

  const selectedCourseModuleSignature =
    selectedCourseModules.map((module: any) => module.id).join('|') || '';

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
    [searchParams, setSearchParams]
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
    ]
  );

  const getNextLessonSortOrder = useCallback(
    (moduleId?: string) => {
      if (!selectedCourse || !moduleId) return '1';

      const module = selectedCourse.modules.find((item: any) => item.id === moduleId);
      if (!module) return '1';

      return getNextSortOrder(module.lessons || []);
    },
    [selectedCourse]
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
      const course = workspace?.courses.find((item: any) => item.id === courseId);
      if (!course) return;

      const sortedModules = getSortedBySortOrder(course.modules || []);
      const firstModuleId = sortedModules[0]?.id || '';

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
      setLessonForm((prev) => ({
        ...prev,
        moduleId: firstModuleId,
        sortOrder: firstModuleId
          ? getNextSortOrder(sortedModules[0]?.lessons || [])
          : '1',
      }));
      setEditingLessonId(null);
    },
    [selectCourse, setCourseEdit, setEditingLessonId, setLessonForm, workspace]
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
    if (!workspace?.courses?.length) {
      if (selectedCourseId) {
        setSelectedCourseId('');
      }
      if (requestedCourseId) {
        syncCourseParam();
      }
      return;
    }

    const course =
      workspace.courses.find((item: any) => item.id === requestedCourseId) ||
      workspace.courses.find((item: any) => item.id === selectedCourseId) ||
      workspace.courses[0];

    if (!course) return;

    if (course.id !== selectedCourseId) {
      setSelectedCourseId(course.id);
    }

    if (requestedCourseId !== course.id) {
      syncCourseParam(course.id);
    }
  }, [workspace, requestedCourseId, selectedCourseId, syncCourseParam]);

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

    setLessonForm((prev) => {
      const hasCurrentModule =
        !!prev.moduleId &&
        selectedCourse.modules.some((module: any) => module.id === prev.moduleId);

      const nextModuleId = hasCurrentModule ? prev.moduleId : defaultModuleId;

      return {
        ...prev,
        moduleId: nextModuleId,
        sortOrder:
          prev.moduleId === nextModuleId
            ? prev.sortOrder
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

    const lessonStillExists = selectedCourse.modules.some((module: any) =>
      module.lessons.some((lesson: any) => lesson.id === editingLessonId)
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
