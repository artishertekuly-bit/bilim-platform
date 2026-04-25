import { useState } from 'react';

import t from '@/lib/i18n';
import type {
  CourseAccessType,
  CourseAnnouncementPriority,
  CourseVisibility,
  LessonMiniQuizQuestionType,
} from '@/lib/app-data-types';
import type { CourseStatus } from '@/lib/course-creator/course-builder-utils';

export function useCourseBuilderForms() {
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

  const [editingMiniQuizQuestionId, setEditingMiniQuizQuestionId] =
    useState<string | null>(null);

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    priority: 'normal' as CourseAnnouncementPriority,
    isPinned: false,
    expiresAt: '',
  });

  const [editingAnnouncementId, setEditingAnnouncementId] =
    useState<string | null>(null);

  return {
    newCourse,
    setNewCourse,

    courseEdit,
    setCourseEdit,

    moduleForm,
    setModuleForm,

    lessonForm,
    setLessonForm,
    editingLessonId,
    setEditingLessonId,

    inviteForm,
    setInviteForm,

    courseAssetForm,
    setCourseAssetForm,

    lessonAttachmentForm,
    setLessonAttachmentForm,

    miniQuizForm,
    setMiniQuizForm,
    miniQuizQuestionForm,
    setMiniQuizQuestionForm,
    editingMiniQuizQuestionId,
    setEditingMiniQuizQuestionId,

    announcementForm,
    setAnnouncementForm,
    editingAnnouncementId,
    setEditingAnnouncementId,
  };
}
