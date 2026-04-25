import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { useAuth } from '@/lib/auth-context';
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
import type {
  CourseAccessType,
  CourseAnnouncementPriority,
  CourseAnnouncementView,
  CourseVisibility,
  LessonMiniQuizQuestionType,
  LessonMiniQuizQuestionView,
} from '@/lib/app-data-types';
import {
  platformKeys,
  useCourseAnnouncements,
  useCourseAssets,
  useCourseInvites,
  useCreateCourseAnnouncementMutation,
  useCreateCourseExternalAssetMutation,
  useCreateCourseInviteMutation,
  useCreateLessonExternalAttachmentMutation,
  useDeactivateCourseInviteMutation,
  useDeleteCourseAnnouncementMutation,
  useDeleteCourseAssetMutation,
  useDeleteLessonAttachmentMutation,
  useDeleteLessonMiniQuizMutation,
  useDeleteLessonMiniQuizQuestionMutation,
  useLessonAttachments,
  useLessonMiniQuiz,
  useReorderLessonMiniQuizQuestionsMutation,
  useSubjects,
  useUpsertLessonMiniQuizMutation,
  useTeacherCourseWorkspace,
  useUpdateCourseAnnouncementMutation,
  useCreateLessonMiniQuizQuestionMutation,
  useUpdateLessonMiniQuizQuestionMutation,
} from '@/hooks/use-platform-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
} from '@/components/common/DataState';
import { useToast } from '@/hooks/use-toast';
import { normalizeMediaUrl } from '@/lib/media-url';
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
import {
  formatAssetTitle,
  formatPrice,
  getAccessTypeLabel,
  getCourseStatusTone,
  getFilenameFromUrl,
  getNextSortOrder,
  getSortedBySortOrder,
  moveItem,
  normalizeCurrency,
  normalizeExternalUrlInput,
  parseMaxStudents,
  parsePrice,
  resolveVisibilityFromAccessType,
  scrollToBuilderSection,
  shouldShowCoursePricing,
  toDateTimeLocalValue,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import {
  getNextMiniQuizQuestionSortOrder,
  normalizeQuestionOptions,
} from '@/lib/course-creator/mini-quiz-utils';
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
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedCourseId = searchParams.get('courseId') || '';

  const { data: subjects } = useSubjects();
  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
  } = useTeacherCourseWorkspace(user?.id || '', !!user?.id);

  const [newCourse, setNewCourse] = useState({
    title: '',
    description: '',
    subjectId: '',
    accessType: 'public_free' as CourseAccessType,
    visibility: 'public' as CourseVisibility,
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

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const lastSeededCourseId = useRef('');

  const [courseEdit, setCourseEdit] = useState<{
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
  }>({
    title: '',
    description: '',
    subjectId: '',
    thumbnailUrl: '',
    status: 'draft',
    accessType: 'public_free',
    visibility: 'public',
    price: '0',
    currency: 'KZT',
    enrollmentOpen: true,
    maxStudents: '',
  });

  const [moduleForm, setModuleForm] = useState({ title: '' });
  const [lessonForm, setLessonForm] = useState({
    moduleId: '',
    title: '',
    contentBody: '',
    practiceContent: '',
    mediaUrl: '',
    sortOrder: '1',
    isPublished: false,
  });
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    maxUses: '',
    expiresAt: '',
  });

  const [courseAssetForm, setCourseAssetForm] = useState({
    title: '',
    description: '',
    externalUrl: '',
  });

  const [lessonAttachmentForm, setLessonAttachmentForm] = useState({
    title: '',
    description: '',
    externalUrl: '',
  });

  const [miniQuizForm, setMiniQuizForm] = useState({
    title: 'Сабақ соңындағы қысқа тест',
    description: '',
    passingScore: '60',
    isPublished: false,
  });

  const [miniQuizQuestionForm, setMiniQuizQuestionForm] = useState({
    questionText: '',
    questionType: 'single_choice' as LessonMiniQuizQuestionType,
    options: ['', '', '', ''],
    correctAnswer: [] as number[],
    explanation: '',
    sortOrder: '1',
  });

  const [editingMiniQuizQuestionId, setEditingMiniQuizQuestionId] = useState<string | null>(null);

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    priority: 'normal' as CourseAnnouncementPriority,
    isPinned: false,
    expiresAt: '',
  });

  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);

  const selectedCourse = useMemo(
    () =>
      workspace?.courses.find((course) => course.id === selectedCourseId) ||
      workspace?.courses.find((course) => course.id === requestedCourseId) ||
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
        .flatMap((module) => module.lessons)
        .find((lesson) => lesson.id === editingLessonId) || null,
    [editingLessonId, selectedCourse]
  );

  const {
    data: courseInvites,
    isLoading: courseInvitesLoading,
  } = useCourseInvites(selectedCourse?.id || '', !!selectedCourse?.id);

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

  const createInviteMutation = useCreateCourseInviteMutation(user?.id);
  const deactivateInviteMutation = useDeactivateCourseInviteMutation(user?.id);
  const createAnnouncementMutation = useCreateCourseAnnouncementMutation(user?.id);
  const updateAnnouncementMutation = useUpdateCourseAnnouncementMutation(user?.id);
  const deleteAnnouncementMutation = useDeleteCourseAnnouncementMutation(user?.id);
  const createCourseAssetMutation = useCreateCourseExternalAssetMutation(user?.id);
  const deleteCourseAssetMutation = useDeleteCourseAssetMutation(user?.id);
  const createLessonAttachmentMutation = useCreateLessonExternalAttachmentMutation(user?.id);
  const deleteLessonAttachmentMutation = useDeleteLessonAttachmentMutation(user?.id);
  const upsertMiniQuizMutation = useUpsertLessonMiniQuizMutation(user?.id);
  const deleteMiniQuizMutation = useDeleteLessonMiniQuizMutation(user?.id);
  const createMiniQuizQuestionMutation = useCreateLessonMiniQuizQuestionMutation(user?.id);
  const updateMiniQuizQuestionMutation = useUpdateLessonMiniQuizQuestionMutation(user?.id);
  const deleteMiniQuizQuestionMutation = useDeleteLessonMiniQuizQuestionMutation(user?.id);
  const reorderMiniQuizQuestionsMutation = useReorderLessonMiniQuizQuestionsMutation(user?.id);

  const selectedCourseModuleSignature =
    selectedCourseModules.map((module) => module.id).join('|') || '';

  const subjectOptions = subjects || [];

  const defaultModuleId = selectedCourseModules[0]?.id || '';

  const courseStatusLabels: Record<CourseStatus, string> = {
    draft: t('course.status.draft'),
    published: t('course.status.published'),
    archived: t('course.status.archived'),
  };

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

  const selectCourse = (courseId: string) => {
    setSelectedCourseId(courseId);
    syncCourseParam(courseId);
    setEditingLessonId(null);
    setEditingMiniQuizQuestionId(null);
    setEditingAnnouncementId(null);
    setLessonAttachmentForm({ title: '', description: '', externalUrl: '' });
    setMiniQuizQuestionForm({
      questionText: '',
      questionType: 'single_choice',
      options: ['', '', '', ''],
      correctAnswer: [],
      explanation: '',
      sortOrder: '1',
    });
    setAnnouncementForm({
      title: '',
      body: '',
      priority: 'normal',
      isPinned: false,
      expiresAt: '',
    });
  };

  const getNextLessonSortOrder = useCallback(
    (moduleId?: string) => {
      if (!selectedCourse || !moduleId) return '1';

      const module = selectedCourse.modules.find((item) => item.id === moduleId);
      if (!module) return '1';

      return getNextSortOrder(module.lessons || []);
    },
    [selectedCourse]
  );

  const resetNewCourse = () => {
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
  };

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
    setEditingMiniQuizQuestionId(null);
    setLessonAttachmentForm({ title: '', description: '', externalUrl: '' });
    setMiniQuizQuestionForm({
      questionText: '',
      questionType: 'single_choice',
      options: ['', '', '', ''],
      correctAnswer: [],
      explanation: '',
      sortOrder: '1',
    });
  }, [defaultModuleId, getNextLessonSortOrder]);

  const seedEditFromCourse = (courseId: string) => {
    const course = workspace?.courses.find((item) => item.id === courseId);
    if (!course) return;

    const sortedModules = getSortedBySortOrder(course.modules || []);
    const firstModuleId = sortedModules[0]?.id || '';

    selectCourse(courseId);
    setCourseEdit({
      title: course.title,
      description: course.description || '',
      subjectId: course.subjectId || '',
      thumbnailUrl: course.thumbnailUrl || '',
      status: course.status === 'archived' ? 'archived' : course.status === 'published' ? 'published' : 'draft',
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
  };

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
      workspace.courses.find((item) => item.id === requestedCourseId) ||
      workspace.courses.find((item) => item.id === selectedCourseId) ||
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
      status: selectedCourse.status === 'archived' ? 'archived' : selectedCourse.status === 'published' ? 'published' : 'draft',
      accessType: selectedCourse.accessType || 'public_free',
      visibility: selectedCourse.visibility || 'public',
      price: String(selectedCourse.price ?? 0),
      currency: selectedCourse.currency || 'KZT',
      enrollmentOpen: selectedCourse.enrollmentOpen ?? true,
      maxStudents: selectedCourse.maxStudents ? String(selectedCourse.maxStudents) : '',
    });
  }, [selectedCourse]);

  useEffect(() => {
    if (!selectedCourse) return;

    setLessonForm((prev) => {
      const hasCurrentModule =
        !!prev.moduleId &&
        selectedCourse.modules.some((module) => module.id === prev.moduleId);

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
  }, [selectedCourse, defaultModuleId, getNextLessonSortOrder, selectedCourseModuleSignature]);

  useEffect(() => {
    if (!selectedCourse || !editingLessonId) return;

    const lessonStillExists = selectedCourse.modules.some((module) =>
      module.lessons.some((lesson) => lesson.id === editingLessonId)
    );

    if (!lessonStillExists) {
      setEditingLessonId(null);
      setEditingMiniQuizQuestionId(null);
      setLessonAttachmentForm({ title: '', description: '', externalUrl: '' });
      setMiniQuizQuestionForm({
        questionText: '',
        questionType: 'single_choice',
        options: ['', '', '', ''],
        correctAnswer: [],
        explanation: '',
        sortOrder: '1',
      });
    }
  }, [selectedCourse, editingLessonId]);

  useEffect(() => {
    if (!selectedMiniQuiz) {
      setMiniQuizForm((prev) => ({
        ...prev,
        title: 'Сабақ соңындағы қысқа тест',
        description: '',
        passingScore: '60',
        isPublished: false,
      }));
      setMiniQuizQuestionForm((prev) => ({
        ...prev,
        sortOrder: '1',
      }));
      return;
    }

    setMiniQuizForm({
      title: selectedMiniQuiz.title,
      description: selectedMiniQuiz.description || '',
      passingScore: String(selectedMiniQuiz.passingScore),
      isPublished: selectedMiniQuiz.isPublished,
    });

    setMiniQuizQuestionForm((prev) => ({
      ...prev,
      sortOrder: getNextMiniQuizQuestionSortOrder(selectedMiniQuiz.questions),
    }));
  }, [selectedMiniQuiz?.id, selectedMiniQuiz?.updatedAt, selectedMiniQuiz?.questionsCount]);

  const refetchWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherCourseWorkspace(user?.id || ''),
      }),
      queryClient.invalidateQueries({
        queryKey: platformKeys.teacherDashboard(user?.id || ''),
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
  };

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
        workspace?.courses.find((course) => course.id !== courseId)?.id || '';

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
        .filter((module) => module.id !== moduleId)
        .map((module) => module.id);

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
      const currentIndex = sortedModules.findIndex((module) => module.id === moduleId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedModules.length) {
        return;
      }

      const nextOrder = moveItem(sortedModules, currentIndex, nextIndex).map(
        (module) => module.id
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
      const module = selectedCourse?.modules.find((item) => item.id === moduleId);
      if (!module) throw new Error('Module not found');

      const sortedLessons = getSortedBySortOrder(module.lessons || []);
      const currentIndex = sortedLessons.findIndex((lesson) => lesson.id === lessonId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedLessons.length) {
        return;
      }

      const nextOrder = moveItem(sortedLessons, currentIndex, nextIndex).map(
        (lesson) => lesson.id
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
      .flatMap((module) => module.lessons)
      .find((item) => item.id === lessonId);

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

  const resetMiniQuizQuestionForm = () => {
    setMiniQuizQuestionForm({
      questionText: '',
      questionType: 'single_choice',
      options: ['', '', '', ''],
      correctAnswer: [],
      explanation: '',
      sortOrder: selectedMiniQuiz
        ? getNextMiniQuizQuestionSortOrder(selectedMiniQuiz.questions)
        : '1',
    });
    setEditingMiniQuizQuestionId(null);
  };

  const parseMiniQuizPassingScore = () => {
    const passingScore = Number(miniQuizForm.passingScore || 0);

    if (!Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
      throw new Error('Өту пайызы 0 мен 100 аралығындағы бүтін сан болуы керек.');
    }

    return passingScore;
  };

  const saveMiniQuizBase = async () => {
    if (!selectedCourse || !selectedEditingLesson || !user?.id) {
      throw new Error('Mini quiz сақтау үшін алдымен сабақты таңдаңыз.');
    }

    const title = miniQuizForm.title.trim();

    if (!title) {
      throw new Error('Mini quiz атауын енгізіңіз.');
    }

    const passingScore = parseMiniQuizPassingScore();

    return upsertMiniQuizMutation.mutateAsync({
      lessonId: selectedEditingLesson.id,
      courseId: selectedCourse.id,
      createdBy: user.id,
      teacherId: user.id,
      title,
      description: miniQuizForm.description.trim() || null,
      isPublished: miniQuizForm.isPublished,
      passingScore,
    });
  };

  const handleSaveMiniQuiz = async () => {
    try {
      await saveMiniQuizBase();
      await refetchWorkspace();

      toast({
        title: 'Mini quiz сақталды',
      });
    } catch (error) {
      toast({
        title: 'Mini quiz сақтау мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMiniQuiz = async () => {
    if (!selectedCourse || !selectedEditingLesson || !selectedMiniQuiz) return;

    if (!window.confirm('Бұл mini quiz толық өшіріледі. Жалғастырасыз ба?')) {
      return;
    }

    try {
      await deleteMiniQuizMutation.mutateAsync({
        quizId: selectedMiniQuiz.id,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      resetMiniQuizQuestionForm();
      await refetchWorkspace();

      toast({
        title: 'Mini quiz өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Mini quiz өшіру мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleMiniQuizCorrectAnswer = (optionIndex: number) => {
    setMiniQuizQuestionForm((prev) => {
      if (prev.questionType === 'single_choice') {
        return {
          ...prev,
          correctAnswer: [optionIndex],
        };
      }

      const exists = prev.correctAnswer.includes(optionIndex);

      return {
        ...prev,
        correctAnswer: exists
          ? prev.correctAnswer.filter((item) => item !== optionIndex)
          : [...prev.correctAnswer, optionIndex].sort((a, b) => a - b),
      };
    });
  };

  const handleEditMiniQuizQuestion = (question: LessonMiniQuizQuestionView) => {
    const options = [...question.options];

    while (options.length < 4) {
      options.push('');
    }

    setEditingMiniQuizQuestionId(question.id);
    setMiniQuizQuestionForm({
      questionText: question.questionText,
      questionType: question.questionType,
      options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation || '',
      sortOrder: String(question.sortOrder),
    });

    scrollToBuilderSection('lesson-mini-quiz');
  };

  const handleSaveMiniQuizQuestion = async () => {
    if (!selectedCourse || !selectedEditingLesson || !user?.id) return;

    try {
      const options = normalizeQuestionOptions(miniQuizQuestionForm.options);
      const sortOrder = Number(miniQuizQuestionForm.sortOrder || 1);

      if (!Number.isInteger(sortOrder) || sortOrder <= 0) {
        throw new Error('Сұрақ реті 1 немесе одан жоғары бүтін сан болуы керек.');
      }

      const quizRow = selectedMiniQuiz || (await saveMiniQuizBase());
      const quizId = selectedMiniQuiz?.id || quizRow.id;

      const payload = {
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user.id,
        questionText: miniQuizQuestionForm.questionText.trim(),
        questionType: miniQuizQuestionForm.questionType,
        options,
        correctAnswer: miniQuizQuestionForm.correctAnswer,
        explanation: miniQuizQuestionForm.explanation.trim() || null,
        sortOrder,
      };

      if (editingMiniQuizQuestionId) {
        await updateMiniQuizQuestionMutation.mutateAsync({
          ...payload,
          questionId: editingMiniQuizQuestionId,
        });

        toast({ title: 'Mini quiz сұрағы жаңартылды' });
      } else {
        await createMiniQuizQuestionMutation.mutateAsync({
          ...payload,
          quizId,
        });

        toast({ title: 'Mini quiz сұрағы қосылды' });
      }

      resetMiniQuizQuestionForm();
      await refetchWorkspace();
    } catch (error) {
      toast({
        title: 'Mini quiz сұрағын сақтау мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMiniQuizQuestion = async (question: LessonMiniQuizQuestionView) => {
    if (!selectedCourse || !selectedEditingLesson) return;

    if (!window.confirm('Бұл сұрақты өшіргіңіз келе ме?')) {
      return;
    }

    try {
      await deleteMiniQuizQuestionMutation.mutateAsync({
        questionId: question.id,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      if (editingMiniQuizQuestionId === question.id) {
        resetMiniQuizQuestionForm();
      }

      await refetchWorkspace();

      toast({ title: 'Mini quiz сұрағы өшірілді' });
    } catch (error) {
      toast({
        title: 'Mini quiz сұрағын өшіру мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleMoveMiniQuizQuestion = async (
    questionId: string,
    direction: 'up' | 'down'
  ) => {
    if (!selectedCourse || !selectedEditingLesson || !selectedMiniQuiz) return;

    const questions = selectedMiniQuiz.questions;
    const currentIndex = questions.findIndex((question) => question.id === questionId);
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= questions.length) {
      return;
    }

    const orderedQuestionIds = moveItem(questions, currentIndex, nextIndex).map(
      (question) => question.id
    );

    try {
      await reorderMiniQuizQuestionsMutation.mutateAsync({
        quizId: selectedMiniQuiz.id,
        orderedQuestionIds,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      await refetchWorkspace();
      toast({ title: 'Mini quiz сұрақтарының реті жаңартылды' });
    } catch (error) {
      toast({
        title: 'Mini quiz сұрақтарын реттеу мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
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

  const canSaveMiniQuiz =
    !!selectedCourse &&
    !!selectedEditingLesson &&
    !!user?.id &&
    !!miniQuizForm.title.trim() &&
    !upsertMiniQuizMutation.isPending;

  const canSaveMiniQuizQuestion =
    !!selectedCourse &&
    !!selectedEditingLesson &&
    !!user?.id &&
    !!miniQuizQuestionForm.questionText.trim() &&
    normalizeQuestionOptions(miniQuizQuestionForm.options).length >= 2 &&
    miniQuizQuestionForm.correctAnswer.length > 0 &&
    !createMiniQuizQuestionMutation.isPending &&
    !updateMiniQuizQuestionMutation.isPending;

  const canCreateLessonAttachment =
    !!selectedCourse &&
    !!selectedEditingLesson &&
    !!lessonAttachmentForm.externalUrl.trim() &&
    !createLessonAttachmentMutation.isPending;

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
          <div className="space-y-6">
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

          {selectedCourse ? (
            <div className="space-y-6">
              <div className="space-y-6">
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

                  <CourseDangerZone
                    deleting={deleteCourseMutation.isPending}
                    onDeleteCourse={() => {
                      if (window.confirm(t('page.teacher_course_builder.confirm.delete_course'))) {
                        deleteCourseMutation.mutate(selectedCourse.id);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-6">
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
          ) : (
            <Card>
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
