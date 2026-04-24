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
import {
  platformKeys,
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
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

const courseStatuses = ['draft', 'under_review', 'published', 'archived'] as const;
type CourseStatus = (typeof courseStatuses)[number];

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
  }>({
    title: '',
    description: '',
    subjectId: '',
    thumbnailUrl: '',
    status: 'draft',
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

      const course = await createCourse({
        title: newCourse.title.trim(),
        description: newCourse.description.trim(),
        subjectId: newCourse.subjectId,
        teacherId: user.id,
        status: 'draft',
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
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
        variant: 'destructive',
      }),
  });

  const updateCourseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourse) throw new Error('Course not selected');

      await updateCourse({
        courseId: selectedCourse.id,
        title: courseEdit.title.trim(),
        description: courseEdit.description.trim(),
        subjectId: courseEdit.subjectId || null,
        thumbnailUrl: courseEdit.thumbnailUrl.trim() || null,
        status: courseEdit.status,
      });
    },
    onSuccess: async () => {
      await refetchWorkspace();
      toast({ title: t('page.teacher_course_builder.toast.update_course_title') });
    },
    onError: () =>
      toast({
        title: t('page.teacher_course_builder.toast.error_title'),
        description: t('page.teacher_course_builder.toast.error_text'),
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