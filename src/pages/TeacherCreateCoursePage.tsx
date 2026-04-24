import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
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
  CourseVisibility,
} from '@/lib/app-data-types';
import {
  platformKeys,
  useCourseInvites,
  useCreateCourseInviteMutation,
  useDeactivateCourseInviteMutation,
  useSubjects,
  useTeacherCourseWorkspace,
} from '@/hooks/use-platform-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { normalizeMediaUrl } from '@/lib/media-url';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  KeyRound,
  Trash2,
} from 'lucide-react';

const courseStatuses = ['draft', 'under_review', 'published', 'archived'] as const;
type CourseStatus = (typeof courseStatuses)[number];

const courseAccessTypes: CourseAccessType[] = [
  'public_free',
  'private_invite',
  'paid',
  'subscription_only',
  'school_only',
];

const courseVisibilityOptions: CourseVisibility[] = ['public', 'unlisted', 'private'];

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function getSortedBySortOrder<T extends { sortOrder: number }>(items: T[] = []) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

function getNextSortOrder<T extends { sortOrder: number }>(items: T[] = []) {
  const maxSortOrder = items.reduce(
    (max, item) => Math.max(max, Number(item.sortOrder) || 0),
    0
  );

  return String(maxSortOrder + 1);
}

function getAccessTypeLabel(type: CourseAccessType) {
  const map: Record<CourseAccessType, string> = {
    public_free: 'Тегін ашық курс',
    private_invite: 'Invite арқылы ашылады',
    paid: 'Ақылы курс',
    subscription_only: 'Subscription арқылы',
    school_only: 'Мектеп/ұйым курсы',
  };

  return map[type];
}

function getAccessTypeHint(type: CourseAccessType) {
  const map: Record<CourseAccessType, string> = {
    public_free: 'Оқушы курсты каталогтан көріп, бірден жазыла алады.',
    private_invite: 'Оқушы курсқа тек invite code арқылы кіре алады.',
    paid: 'Оқушы access сұранысын жібереді, admin manual approve жасайды.',
    subscription_only: 'Кейін subscription plan арқылы ашылады.',
    school_only: 'Кейін мектеп/organization access арқылы ашылады.',
  };

  return map[type];
}

function getVisibilityLabel(visibility: CourseVisibility) {
  const map: Record<CourseVisibility, string> = {
    public: 'Public',
    unlisted: 'Unlisted',
    private: 'Private',
  };

  return map[visibility];
}

function getVisibilityHint(visibility: CourseVisibility) {
  const map: Record<CourseVisibility, string> = {
    public: 'Каталогта көрінеді.',
    unlisted: 'Каталогта көрінбейді, бірақ link/invite арқылы ашылады.',
    private: 'Тек access бар қолданушыларға көрінеді.',
  };

  return map[visibility];
}

function normalizeCurrency(value: string) {
  return (value || 'KZT').trim().toUpperCase();
}

function parsePrice(value: string) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Баға 0 немесе одан жоғары болуы керек.');
  }

  return parsed;
}

function parseMaxStudents(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Оқушы лимиті бос немесе 1-ден жоғары бүтін сан болуы керек.');
  }

  return parsed;
}

function formatPrice(price: number, currency: string) {
  if (!price) return 'Тегін';
  return `${price.toLocaleString('kk-KZ')} ${currency}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Шектеусіз';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number) => String(part).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

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

  const {
    data: courseInvites,
    isLoading: courseInvitesLoading,
  } = useCourseInvites(selectedCourse?.id || '', !!selectedCourse?.id);

  const createInviteMutation = useCreateCourseInviteMutation(user?.id);
  const deactivateInviteMutation = useDeactivateCourseInviteMutation(user?.id);

  const selectedCourseModuleSignature =
    selectedCourseModules.map((module) => module.id).join('|') || '';

  const subjectOptions = subjects || [];

  const defaultModuleId = selectedCourseModules[0]?.id || '';

  const courseStatusLabels: Record<CourseStatus, string> = {
    draft: t('course.status.draft'),
    under_review: t('page.teacher_course_builder.status.under_review'),
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
      status: course.status as CourseStatus,
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
      status: selectedCourse.status as CourseStatus,
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
    }
  }, [selectedCourse, editingLessonId]);

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
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
      queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: platformKeys.adminDashboard }),
      queryClient.invalidateQueries({ queryKey: platformKeys.moderationQueue }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not found');

      const price = parsePrice(newCourse.price);
      const maxStudents = parseMaxStudents(newCourse.maxStudents);
      const currency = normalizeCurrency(newCourse.currency);

      if (newCourse.accessType === 'paid' && price <= 0) {
        throw new Error('Ақылы курс үшін баға 0-ден жоғары болуы керек.');
      }

      const course = await createCourse({
        title: newCourse.title.trim(),
        description: newCourse.description.trim(),
        subjectId: newCourse.subjectId,
        teacherId: user.id,
        status: 'draft',
        accessType: newCourse.accessType,
        visibility: newCourse.visibility,
        price,
        currency,
        enrollmentOpen: newCourse.enrollmentOpen,
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

      const price = parsePrice(courseEdit.price);
      const maxStudents = parseMaxStudents(courseEdit.maxStudents);
      const currency = normalizeCurrency(courseEdit.currency);

      if (courseEdit.accessType === 'paid' && price <= 0) {
        throw new Error('Ақылы курс үшін баға 0-ден жоғары болуы керек.');
      }

      await updateCourse({
        courseId: selectedCourse.id,
        title: courseEdit.title.trim(),
        description: courseEdit.description.trim(),
        subjectId: courseEdit.subjectId || null,
        thumbnailUrl: courseEdit.thumbnailUrl.trim() || null,
        status: courseEdit.status,
        accessType: courseEdit.accessType,
        visibility: courseEdit.visibility,
        price,
        currency,
        enrollmentOpen: courseEdit.enrollmentOpen,
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

  const courseCount = workspace?.courses?.length || 0;
  const selectedCourseLessonCount =
    selectedCourse?.modules.reduce(
      (sum, module) => sum + (module.lessons?.length || 0),
      0
    ) || 0;

  const selectedCoursePrice = formatPrice(
    parsePrice(courseEdit.price || '0'),
    normalizeCurrency(courseEdit.currency)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">{t('page.teacher_course_builder.title')}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t('page.teacher_course_builder.subtitle')}
          </p>
        </div>

        {workspaceLoading ? (
          <LoadingState text={t('page.teacher_course_builder.loading')} />
        ) : null}

        {workspaceError ? (
          <ErrorState text={t('page.teacher_course_builder.error')} />
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">
                  {t('page.teacher_course_builder.section.new_course')}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t('page.teacher_course_builder.field.course_title')}</Label>
                  <Input
                    value={newCourse.title}
                    onChange={(e) => setNewCourse((p) => ({ ...p, title: e.target.value }))}
                    placeholder={t('page.teacher_course_builder.placeholder.course_title')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t('page.teacher_course_builder.field.description')}</Label>
                  <Textarea
                    rows={4}
                    value={newCourse.description}
                    onChange={(e) =>
                      setNewCourse((p) => ({ ...p, description: e.target.value }))
                    }
                    placeholder={t('page.teacher_course_builder.placeholder.description')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t('page.teacher_course_builder.field.subject')}</Label>
                  <select
                    value={newCourse.subjectId}
                    onChange={(e) => setNewCourse((p) => ({ ...p, subjectId: e.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">
                      {t('page.teacher_course_builder.placeholder.select_subject')}
                    </option>
                    {subjectOptions.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name_kk}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Access параметрлері
                  </p>

                  <div className="space-y-1.5">
                    <Label>Курс түрі</Label>
                    <select
                      value={newCourse.accessType}
                      onChange={(e) =>
                        setNewCourse((p) => ({
                          ...p,
                          accessType: e.target.value as CourseAccessType,
                          price:
                            e.target.value === 'paid' && Number(p.price || 0) <= 0
                              ? '5000'
                              : p.price,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {courseAccessTypes.map((type) => (
                        <option key={type} value={type}>
                          {getAccessTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      {getAccessTypeHint(newCourse.accessType)}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Көріну режимі</Label>
                    <select
                      value={newCourse.visibility}
                      onChange={(e) =>
                        setNewCourse((p) => ({
                          ...p,
                          visibility: e.target.value as CourseVisibility,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {courseVisibilityOptions.map((visibility) => (
                        <option key={visibility} value={visibility}>
                          {getVisibilityLabel(visibility)}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      {getVisibilityHint(newCourse.visibility)}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Баға</Label>
                      <Input
                        type="number"
                        min={0}
                        value={newCourse.price}
                        onChange={(e) =>
                          setNewCourse((p) => ({ ...p, price: e.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Валюта</Label>
                      <Input
                        value={newCourse.currency}
                        onChange={(e) =>
                          setNewCourse((p) => ({
                            ...p,
                            currency: e.target.value.toUpperCase(),
                          }))
                        }
                        maxLength={3}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Оқушы лимиті</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newCourse.maxStudents}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, maxStudents: e.target.value }))
                      }
                      placeholder="Бос қалса — шектеусіз"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <Label htmlFor="new-course-enrollment-open">
                        Жазылу ашық
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Өшірулі болса, оқушы жаңа жазыла алмайды.
                      </p>
                    </div>
                    <Switch
                      id="new-course-enrollment-open"
                      checked={newCourse.enrollmentOpen}
                      onCheckedChange={(checked) =>
                        setNewCourse((p) => ({ ...p, enrollmentOpen: checked }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Алғашқы құрылым
                  </p>

                  <div className="space-y-1.5">
                    <Label>{t('page.teacher_course_builder.field.initial_module')}</Label>
                    <Input
                      value={newCourse.moduleTitle}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, moduleTitle: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('page.teacher_course_builder.field.intro_lesson')}</Label>
                    <Input
                      value={newCourse.lessonTitle}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, lessonTitle: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('page.teacher_course_builder.field.theory')}</Label>
                    <Textarea
                      rows={4}
                      value={newCourse.lessonBody}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, lessonBody: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('page.teacher_course_builder.field.practice')}</Label>
                    <Textarea
                      rows={3}
                      value={newCourse.lessonPractice}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, lessonPractice: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('page.teacher_course_builder.field.video_url')}</Label>
                    <Input
                      value={newCourse.lessonVideo}
                      onChange={(e) =>
                        setNewCourse((p) => ({ ...p, lessonVideo: e.target.value }))
                      }
                      onBlur={(e) =>
                        setNewCourse((p) => ({
                          ...p,
                          lessonVideo: normalizeMediaUrl(e.target.value),
                        }))
                      }
                      placeholder="https://youtube.com/..."
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={!canCreateCourse}
                >
                  {createMutation.isPending
                    ? t('page.teacher_course_builder.action.saving')
                    : t('page.teacher_course_builder.action.create_course')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold">
                    {t('page.teacher_course_builder.section.manage_courses')}
                  </CardTitle>
                  <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                    {courseCount}
                  </span>
                </div>
              </CardHeader>

              <CardContent>
                <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
                  {(workspace?.courses || []).length === 0 ? (
                    <EmptyState
                      title={t('page.teacher_course_builder.empty.courses_title')}
                      text={t('page.teacher_course_builder.empty.courses_text')}
                    />
                  ) : (
                    workspace?.courses.map((course) => (
                      <button
                        key={course.id}
                        onClick={() => seedEditFromCourse(course.id)}
                        className={`w-full rounded-xl border p-4 text-left transition-colors ${
                          selectedCourse?.id === course.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{course.title}</p>
                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                              {[
                                course.subjectName,
                                getAccessTypeLabel(course.accessType || 'public_free'),
                                formatPrice(Number(course.price || 0), course.currency || 'KZT'),
                                `${course.lessons} ${t('course.lessons_count')}`,
                                `${course.students} ${t(
                                  'page.teacher_course_builder.students_label'
                                )}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>

                          <span className="rounded-full border px-2 py-1 text-[10px] whitespace-nowrap">
                            {courseStatusLabels[course.status as CourseStatus] || course.status}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {selectedCourse ? (
            <div className="space-y-6">
              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base font-semibold">
                      Курс параметрлері
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_course_builder.field.course_title')}</Label>
                      <Input
                        value={courseEdit.title}
                        onChange={(e) => setCourseEdit((p) => ({ ...p, title: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_course_builder.field.description')}</Label>
                      <Textarea
                        rows={4}
                        value={courseEdit.description}
                        onChange={(e) =>
                          setCourseEdit((p) => ({ ...p, description: e.target.value }))
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_course_builder.field.subject')}</Label>
                        <select
                          value={courseEdit.subjectId}
                          onChange={(e) =>
                            setCourseEdit((p) => ({ ...p, subjectId: e.target.value }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">
                            {t('page.teacher_course_builder.placeholder.select_subject')}
                          </option>
                          {subjectOptions.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {subject.name_kk}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_course_builder.field.status')}</Label>
                        <select
                          value={courseEdit.status}
                          onChange={(e) =>
                            setCourseEdit((p) => ({
                              ...p,
                              status: e.target.value as CourseStatus,
                            }))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {courseStatuses.map((status) => (
                            <option key={status} value={status}>
                              {courseStatusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_course_builder.field.thumbnail')}</Label>
                      <Input
                        value={courseEdit.thumbnailUrl}
                        onChange={(e) =>
                          setCourseEdit((p) => ({ ...p, thumbnailUrl: e.target.value }))
                        }
                        placeholder="https://..."
                      />
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold">Access және монетизация</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Бұл бөлім курс тегін, invite-only, ақылы немесе жабық режимде
                          ашылатынын басқарады.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Курс түрі</Label>
                          <select
                            value={courseEdit.accessType}
                            onChange={(e) =>
                              setCourseEdit((p) => ({
                                ...p,
                                accessType: e.target.value as CourseAccessType,
                                price:
                                  e.target.value === 'paid' && Number(p.price || 0) <= 0
                                    ? '5000'
                                    : p.price,
                              }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {courseAccessTypes.map((type) => (
                              <option key={type} value={type}>
                                {getAccessTypeLabel(type)}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-muted-foreground">
                            {getAccessTypeHint(courseEdit.accessType)}
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Көріну режимі</Label>
                          <select
                            value={courseEdit.visibility}
                            onChange={(e) =>
                              setCourseEdit((p) => ({
                                ...p,
                                visibility: e.target.value as CourseVisibility,
                              }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {courseVisibilityOptions.map((visibility) => (
                              <option key={visibility} value={visibility}>
                                {getVisibilityLabel(visibility)}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-muted-foreground">
                            {getVisibilityHint(courseEdit.visibility)}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label>Баға</Label>
                          <Input
                            type="number"
                            min={0}
                            value={courseEdit.price}
                            onChange={(e) =>
                              setCourseEdit((p) => ({ ...p, price: e.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Валюта</Label>
                          <Input
                            value={courseEdit.currency}
                            onChange={(e) =>
                              setCourseEdit((p) => ({
                                ...p,
                                currency: e.target.value.toUpperCase(),
                              }))
                            }
                            maxLength={3}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Оқушы лимиті</Label>
                          <Input
                            type="number"
                            min={1}
                            value={courseEdit.maxStudents}
                            onChange={(e) =>
                              setCourseEdit((p) => ({
                                ...p,
                                maxStudents: e.target.value,
                              }))
                            }
                            placeholder="Шектеусіз"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border bg-background px-4 py-3">
                        <div>
                          <Label htmlFor="course-enrollment-open">
                            Жазылу ашық
                          </Label>
                          <p className="text-[11px] text-muted-foreground">
                            Өшірулі болса, жаңа оқушы курсқа жазыла алмайды.
                          </p>
                        </div>
                        <Switch
                          id="course-enrollment-open"
                          checked={courseEdit.enrollmentOpen}
                          onCheckedChange={(checked) =>
                            setCourseEdit((p) => ({
                              ...p,
                              enrollmentOpen: checked,
                            }))
                          }
                        />
                      </div>

                      <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                        Қазіргі баға: <span className="font-medium text-foreground">{selectedCoursePrice}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        onClick={() => updateCourseMutation.mutate()}
                        disabled={updateCourseMutation.isPending}
                      >
                        {t('page.teacher_course_builder.action.save_course')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Қысқаша мәлімет</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Модульдер</span>
                        <span className="font-medium">{selectedCourseModules.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Сабақтар</span>
                        <span className="font-medium">{selectedCourseLessonCount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Студенттер</span>
                        <span className="font-medium">{selectedCourse.students}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Access</span>
                        <span className="text-right text-xs font-medium">
                          {getAccessTypeLabel(courseEdit.accessType)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <span className="text-muted-foreground">Баға</span>
                        <span className="font-medium">{selectedCoursePrice}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <KeyRound size={14} />
                          Invite codes
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Invite code оқушыға course access береді және автоматты түрде
                        course enrollment жасайды.
                      </p>

                      {courseEdit.accessType !== 'private_invite' ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          Бұл бөлім толық қолданылуы үшін курс түрін “Invite арқылы
                          ашылады” етіп қойыңыз.
                        </div>
                      ) : null}

                      <div className="space-y-2 rounded-lg border p-3">
                        <div className="space-y-1.5">
                          <Label>Қолдану лимиті</Label>
                          <Input
                            type="number"
                            min={1}
                            value={inviteForm.maxUses}
                            onChange={(e) =>
                              setInviteForm((p) => ({
                                ...p,
                                maxUses: e.target.value,
                              }))
                            }
                            placeholder="Бос болса — шектеусіз"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Мерзімі</Label>
                          <Input
                            type="datetime-local"
                            value={inviteForm.expiresAt}
                            onChange={(e) =>
                              setInviteForm((p) => ({
                                ...p,
                                expiresAt: e.target.value,
                              }))
                            }
                            min={toDateTimeLocalValue(new Date().toISOString())}
                          />
                        </div>

                        <Button
                          size="sm"
                          className="w-full"
                          onClick={handleCreateInvite}
                          disabled={createInviteMutation.isPending}
                        >
                          Invite code жасау
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {courseInvitesLoading ? (
                          <p className="text-xs text-muted-foreground">Invite codes жүктелуде...</p>
                        ) : null}

                        {!courseInvitesLoading && (!courseInvites || courseInvites.length === 0) ? (
                          <p className="text-xs text-muted-foreground">
                            Әлі invite code жоқ.
                          </p>
                        ) : null}

                        {(courseInvites || []).map((invite) => {
                          const remaining =
                            invite.max_uses === null
                              ? null
                              : Math.max(invite.max_uses - invite.used_count, 0);

                          return (
                            <div
                              key={invite.id}
                              className={`rounded-lg border p-3 text-xs ${
                                invite.is_active ? 'bg-background' : 'bg-muted/50 opacity-70'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-mono text-sm font-semibold">
                                    {invite.code}
                                  </p>
                                  <p className="mt-1 text-muted-foreground">
                                    Қолданылды: {invite.used_count}
                                    {invite.max_uses === null
                                      ? ' / шектеусіз'
                                      : ` / ${invite.max_uses}`}
                                  </p>
                                  <p className="text-muted-foreground">
                                    Қалғаны:{' '}
                                    {remaining === null ? 'шектеусіз' : remaining}
                                  </p>
                                  <p className="text-muted-foreground">
                                    Мерзімі: {formatDateTime(invite.expires_at)}
                                  </p>
                                  <p className="text-muted-foreground">
                                    Статус: {invite.is_active ? 'Белсенді' : 'Өшірілген'}
                                  </p>
                                </div>

                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => copyInviteCode(invite.code)}
                                  >
                                    <Copy size={13} />
                                  </Button>

                                  {invite.is_active ? (
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={deactivateInviteMutation.isPending}
                                      onClick={() => handleDeactivateInvite(invite.id)}
                                    >
                                      <Trash2 size={13} />
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Жылдам статус</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {courseStatuses.map(
                        (status) =>
                          status !== courseEdit.status && (
                            <Button
                              key={status}
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                quickStatusMutation.mutate({
                                  courseId: selectedCourse.id,
                                  status,
                                })
                              }
                              disabled={quickStatusMutation.isPending}
                            >
                              {courseStatusLabels[status]}
                            </Button>
                          )
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-destructive/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-destructive">
                        Danger zone
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Бұл әрекет курсты толық өшіреді. Қайтару мүмкін болмауы мүмкін.
                      </p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          if (
                            window.confirm(
                              t('page.teacher_course_builder.confirm.delete_course')
                            )
                          ) {
                            deleteCourseMutation.mutate(selectedCourse.id);
                          }
                        }}
                        disabled={deleteCourseMutation.isPending}
                      >
                        <Trash2 size={14} className="mr-1.5" />
                        {t('page.teacher_course_builder.action.delete_course')}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          {t('page.teacher_course_builder.section.modules_lessons')}
                        </CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Модульдер мен сабақтарды осы жерден басқарыңыз.
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {selectedCourseModules.length === 0 ? (
                      <EmptyState
                        title={t('page.teacher_course_builder.empty.modules_title')}
                        text={t('page.teacher_course_builder.empty.modules_text')}
                      />
                    ) : (
                      selectedCourseModules.map((module, moduleIndex) => {
                        const sortedLessons = getSortedBySortOrder(module.lessons || []);

                        return (
                          <div key={module.id} className="space-y-3 rounded-xl border p-4">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                              <div className="min-w-0 flex-1">
                                <Input
                                  key={`${module.id}:${module.title}`}
                                  defaultValue={module.title}
                                  onBlur={(e) => {
                                    const value = e.target.value.trim();
                                    if (value && value !== module.title) {
                                      updateModuleTitleMutation.mutate({
                                        moduleId: module.id,
                                        title: value,
                                      });
                                    }
                                  }}
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border px-2 py-1 text-[10px] text-muted-foreground">
                                  #{module.sortOrder}
                                </span>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={moduleIndex === 0 || reorderModulesMutation.isPending}
                                  onClick={() =>
                                    reorderModulesMutation.mutate({
                                      moduleId: module.id,
                                      direction: 'up',
                                    })
                                  }
                                >
                                  <ArrowUp size={14} />
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={
                                    moduleIndex === selectedCourseModules.length - 1 ||
                                    reorderModulesMutation.isPending
                                  }
                                  onClick={() =>
                                    reorderModulesMutation.mutate({
                                      moduleId: module.id,
                                      direction: 'down',
                                    })
                                  }
                                >
                                  <ArrowDown size={14} />
                                </Button>

                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={deleteModuleMutation.isPending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        t('page.teacher_course_builder.confirm.delete_module')
                                      )
                                    ) {
                                      deleteModuleMutation.mutate(module.id);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {sortedLessons.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  {t('page.teacher_course_builder.empty.lessons_inline')}
                                </p>
                              ) : (
                                sortedLessons.map((lesson, lessonIndex) => (
                                  <div
                                    key={lesson.id}
                                    className="rounded-lg border bg-muted/10 px-3 py-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <button
                                        type="button"
                                        onClick={() => startEditLesson(lesson.id)}
                                        className="min-w-0 flex-1 text-left"
                                      >
                                        <p className="text-sm font-medium">{lesson.title}</p>
                                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                          #{lesson.sortOrder} ·{' '}
                                          {lesson.isPublished
                                            ? t(
                                                'page.teacher_course_builder.lesson_status.published'
                                              )
                                            : t(
                                                'page.teacher_course_builder.lesson_status.draft'
                                              )}
                                          {lesson.mediaUrl
                                            ? ` · ${t(
                                                'page.teacher_course_builder.lesson_has_video'
                                              )}`
                                            : ''}
                                        </p>
                                      </button>

                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-8 w-8"
                                          disabled={
                                            lessonIndex === 0 ||
                                            reorderLessonsMutation.isPending
                                          }
                                          onClick={() =>
                                            reorderLessonsMutation.mutate({
                                              moduleId: module.id,
                                              lessonId: lesson.id,
                                              direction: 'up',
                                            })
                                          }
                                        >
                                          <ArrowUp size={14} />
                                        </Button>

                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="h-8 w-8"
                                          disabled={
                                            lessonIndex === sortedLessons.length - 1 ||
                                            reorderLessonsMutation.isPending
                                          }
                                          onClick={() =>
                                            reorderLessonsMutation.mutate({
                                              moduleId: module.id,
                                              lessonId: lesson.id,
                                              direction: 'down',
                                            })
                                          }
                                        >
                                          <ArrowDown size={14} />
                                        </Button>

                                        <Button
                                          type="button"
                                          variant="destructive"
                                          size="icon"
                                          className="h-8 w-8"
                                          disabled={deleteLessonMutation.isPending}
                                          onClick={() => {
                                            if (
                                              window.confirm(
                                                t(
                                                  'page.teacher_course_builder.confirm.delete_lesson'
                                                )
                                              )
                                            ) {
                                              deleteLessonMutation.mutate({
                                                lessonId: lesson.id,
                                                moduleId: module.id,
                                                remainingIds: sortedLessons
                                                  .filter((item) => item.id !== lesson.id)
                                                  .map((item) => item.id),
                                              });
                                            }
                                          }}
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    <div className="space-y-3 rounded-xl border border-dashed p-4">
                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_course_builder.field.new_module_title')}</Label>
                        <Input
                          value={moduleForm.title}
                          onChange={(e) => setModuleForm({ title: e.target.value })}
                          placeholder={t('page.teacher_course_builder.placeholder.module_title')}
                        />
                      </div>

                      <Button
                        size="sm"
                        onClick={() => addModuleMutation.mutate()}
                        disabled={!canAddModule}
                      >
                        {t('page.teacher_course_builder.action.add_module')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base font-semibold">
                      {editingLessonId
                        ? t('page.teacher_course_builder.section.edit_lesson')
                        : t('page.teacher_course_builder.section.new_lesson')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_course_builder.field.module')}</Label>
                      <select
                        value={lessonForm.moduleId}
                        onChange={(e) =>
                          setLessonForm((p) => ({
                            ...p,
                            moduleId: e.target.value,
                            sortOrder: getNextLessonSortOrder(e.target.value),
                          }))
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">
                          {t('page.teacher_course_builder.placeholder.select_module')}
                        </option>
                        {selectedCourseModules.map((module) => (
                          <option key={module.id} value={module.id}>
                            {module.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_course_builder.field.lesson_title')}</Label>
                        <Input
                          value={lessonForm.title}
                          onChange={(e) =>
                            setLessonForm((p) => ({ ...p, title: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>{t('page.teacher_course_builder.field.sort_order')}</Label>
                        <Input
                          type="number"
                          value={lessonForm.sortOrder}
                          onChange={(e) =>
                            setLessonForm((p) => ({ ...p, sortOrder: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_course_builder.field.theory')}</Label>
                      <Textarea
                        rows={5}
                        value={lessonForm.contentBody}
                        onChange={(e) =>
                          setLessonForm((p) => ({ ...p, contentBody: e.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_course_builder.field.practice')}</Label>
                      <Textarea
                        rows={4}
                        value={lessonForm.practiceContent}
                        onChange={(e) =>
                          setLessonForm((p) => ({ ...p, practiceContent: e.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('page.teacher_course_builder.field.video_url')}</Label>
                      <Input
                        value={lessonForm.mediaUrl}
                        onChange={(e) =>
                          setLessonForm((p) => ({ ...p, mediaUrl: e.target.value }))
                        }
                        onBlur={(e) =>
                          setLessonForm((p) => ({
                            ...p,
                            mediaUrl: normalizeMediaUrl(e.target.value),
                          }))
                        }
                        placeholder="https://youtube.com/..."
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <Label htmlFor="lesson-published">
                        {t('page.teacher_course_builder.field.lesson_published')}
                      </Label>
                      <Switch
                        id="lesson-published"
                        checked={lessonForm.isPublished}
                        onCheckedChange={(checked) =>
                          setLessonForm((p) => ({ ...p, isPublished: checked }))
                        }
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        onClick={() => addOrUpdateLessonMutation.mutate()}
                        disabled={!canSaveLesson}
                      >
                        {editingLessonId
                          ? t('page.teacher_course_builder.action.update_lesson')
                          : t('page.teacher_course_builder.action.add_lesson')}
                      </Button>

                      {editingLessonId ? (
                        <Button variant="outline" onClick={resetLessonForm}>
                          {t('page.teacher_course_builder.action.clear_form')}
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
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
      </div>
    </DashboardLayout>
  );
}