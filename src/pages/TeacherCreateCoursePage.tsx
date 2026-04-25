import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
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
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  ListChecks,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  X,
} from 'lucide-react';

const courseStatuses = ['draft', 'published', 'archived'] as const;
type CourseStatus = (typeof courseStatuses)[number];

const courseAccessTypes: CourseAccessType[] = [
  'public_free',
  'private_invite',
  'paid',
];

function resolveVisibilityFromAccessType(accessType: CourseAccessType): CourseVisibility {
  if (accessType === 'private_invite') return 'unlisted';
  return 'public';
}

function shouldShowCoursePricing(accessType: CourseAccessType) {
  return accessType === 'paid';
}

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
    public_free: 'Ашық курс',
    private_invite: 'Жабық курс',
    paid: 'Ақылы курс',
    subscription_only: 'Ақылы курс',
    school_only: 'Жабық курс',
  };

  return map[type] || type;
}

function getAccessTypeHint(type: CourseAccessType) {
  const map: Record<CourseAccessType, string> = {
    public_free: 'Каталогта көрінеді. Оқушы тегін жазыла алады.',
    private_invite: 'Каталогта көрінбейді. Оқушы тек invite code арқылы кіреді.',
    paid: 'Каталогта көрінеді. Оқушы access сұрайды, кейін payment немесе subscription арқылы ашылады.',
    subscription_only: 'Ақылы курс ретінде өңделеді.',
    school_only: 'Жабық курс ретінде өңделеді.',
  };

  return map[type] || '';
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

function normalizeExternalUrlInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('Материал сілтемесін енгізіңіз.');
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Сілтеме форматы дұрыс емес.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Сілтеме http немесе https болуы керек.');
  }

  return parsed.toString();
}

function getFilenameFromUrl(value: string, fallback: string) {
  try {
    const parsed = new URL(value);
    const lastPart = parsed.pathname.split('/').filter(Boolean).at(-1);
    if (lastPart) return decodeURIComponent(lastPart);
  } catch {
    // noop
  }

  return fallback;
}

function formatAssetTitle(value: string | null | undefined, filename: string) {
  return value?.trim() || filename || 'Материал';
}

function TeacherCourseBuilderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-6 w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-40" />
            <div className="mt-5 space-y-3">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-24 w-full rounded-lg" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-32 w-full rounded-lg" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-44" />
            <div className="mt-5 space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-40" />
            <div className="mt-5 space-y-3">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-24 w-full rounded-lg" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-32 w-full rounded-lg" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-52" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuilderStatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function getCourseStatusTone(status: CourseStatus) {
  if (status === 'published') return 'success';
  if (status === 'archived') return 'muted';
  return 'warning';
}

function CourseAccessTypeCards({
  value,
  onChange,
}: {
  value: CourseAccessType;
  onChange: (nextAccessType: CourseAccessType) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {courseAccessTypes.map((type) => {
        const active = value === type;

        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`rounded-xl border p-4 text-left transition-all ${
              active
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:bg-accent'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{getAccessTypeLabel(type)}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {getAccessTypeHint(type)}
                </p>
              </div>

              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                }`}
              >
                {active ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                ) : null}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}


function scrollToBuilderSection(id: string) {
  const element = document.getElementById(id);

  if (!element) return;

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function CourseBuilderStepper({
  hasSelectedCourse,
}: {
  hasSelectedCourse: boolean;
}) {
  const steps = [
    {
      id: 'new-course',
      number: '1',
      title: 'Жаңа курс',
      description: 'Курстың бастапқы атауы, пәні және алғашқы сабағы.',
      icon: <Plus size={16} />,
      disabled: false,
    },
    {
      id: 'course-settings',
      number: '2',
      title: 'Параметрлер',
      description: 'Курс түрі, баға, thumbnail және негізгі ақпарат.',
      icon: <Settings size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'modules-lessons',
      number: '3',
      title: 'Модульдер',
      description: 'Модульдер, сабақтар, реттілік және жариялау күйі.',
      icon: <FileText size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'announcements',
      number: '4',
      title: 'Хабарландырулар',
      description: 'Маңызды ақпарат, pin және мерзімді ескерту.',
      icon: <Megaphone size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'materials',
      number: '5',
      title: 'Материалдар',
      description: 'Силлабус, PDF, формулалар, lesson attachments.',
      icon: <LinkIcon size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'publish',
      number: '6',
      title: 'Жариялау',
      description: 'Publish, archive және invite code басқару.',
      icon: <CheckCircle2 size={16} />,
      disabled: !hasSelectedCourse,
    },
  ];

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 flex flex-col gap-1">
          <p className="text-sm font-semibold">Course builder қадамдары</p>
          <p className="text-xs text-muted-foreground">
            Үлкен форманы бөлімдерге бөліп, керек жерге тез өтіңіз.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              disabled={step.disabled}
              onClick={() => scrollToBuilderSection(step.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                step.disabled
                  ? 'cursor-not-allowed bg-muted/40 opacity-60'
                  : 'hover:-translate-y-0.5 hover:bg-accent hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
                  {step.icon}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    {step.number}. {step.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const announcementPriorities: CourseAnnouncementPriority[] = [
  'normal',
  'important',
  'urgent',
];

function getAnnouncementPriorityLabel(priority: CourseAnnouncementPriority) {
  const map: Record<CourseAnnouncementPriority, string> = {
    normal: 'Қалыпты',
    important: 'Маңызды',
    urgent: 'Шұғыл',
  };

  return map[priority] || priority;
}

function getAnnouncementPriorityTone(priority: CourseAnnouncementPriority) {
  if (priority === 'urgent') return 'danger';
  if (priority === 'important') return 'warning';
  return 'info';
}

function isExpiredDate(value: string | null | undefined) {
  if (!value) return false;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() <= Date.now();
}

function CourseAnnouncementCard({
  announcement,
  onEdit,
  onDelete,
  deleting,
}: {
  announcement: CourseAnnouncementView;
  onEdit: (announcement: CourseAnnouncementView) => void;
  onDelete: (announcement: CourseAnnouncementView) => void;
  deleting: boolean;
}) {
  const expired = announcement.isExpired || isExpiredDate(announcement.expiresAt);

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        expired ? 'bg-muted/40 opacity-75' : 'bg-card'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={getAnnouncementPriorityTone(announcement.priority)}>
              {getAnnouncementPriorityLabel(announcement.priority)}
            </StatusBadge>

            {announcement.isPinned ? (
              <StatusBadge tone="primary" icon={<Pin size={12} />}>
                Бекітілген
              </StatusBadge>
            ) : null}

            {expired ? (
              <StatusBadge tone="muted" icon={<CalendarClock size={12} />}>
                Мерзімі өткен
              </StatusBadge>
            ) : null}
          </div>

          <p className="font-semibold">{announcement.title}</p>

          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">
            {announcement.body}
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>Жарияланды: {formatDateTime(announcement.publishedAt)}</span>
            <span>Мерзімі: {formatDateTime(announcement.expiresAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(announcement)}
          >
            <Pencil size={13} />
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            disabled={deleting}
            onClick={() => onDelete(announcement)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}


const miniQuizQuestionTypes: LessonMiniQuizQuestionType[] = [
  'single_choice',
  'multiple_choice',
];

function getMiniQuizQuestionTypeLabel(type: LessonMiniQuizQuestionType) {
  const map: Record<LessonMiniQuizQuestionType, string> = {
    single_choice: 'Бір дұрыс жауап',
    multiple_choice: 'Бірнеше дұрыс жауап',
  };

  return map[type] || type;
}

function normalizeQuestionOptions(options: string[]) {
  return options.map((option) => option.trim()).filter(Boolean);
}

function getNextMiniQuizQuestionSortOrder(questions: LessonMiniQuizQuestionView[] = []) {
  const maxSortOrder = questions.reduce(
    (max, question) => Math.max(max, Number(question.sortOrder) || 0),
    0
  );

  return String(maxSortOrder + 1);
}

function MiniQuizQuestionCard({
  question,
  index,
  total,
  onEdit,
  onDelete,
  onMove,
  disabled,
}: {
  question: LessonMiniQuizQuestionView;
  index: number;
  total: number;
  onEdit: (question: LessonMiniQuizQuestionView) => void;
  onDelete: (question: LessonMiniQuizQuestionView) => void;
  onMove: (questionId: string, direction: 'up' | 'down') => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">#{question.sortOrder}</StatusBadge>
            <StatusBadge tone={question.questionType === 'multiple_choice' ? 'warning' : 'primary'}>
              {getMiniQuizQuestionTypeLabel(question.questionType)}
            </StatusBadge>
          </div>

          <p className="font-semibold">{question.questionText}</p>

          <div className="mt-3 space-y-1.5">
            {question.options.map((option, optionIndex) => {
              const isCorrect = question.correctAnswer.includes(optionIndex);

              return (
                <div
                  key={`${question.id}-${optionIndex}`}
                  className={`rounded-md border px-2.5 py-1.5 text-xs ${
                    isCorrect ? 'border-emerald-500/30 bg-emerald-500/10' : 'bg-muted/20'
                  }`}
                >
                  <span className="font-medium">{optionIndex + 1}.</span>{' '}
                  <span>{option}</span>
                  {isCorrect ? <span className="ml-2 text-emerald-700">дұрыс</span> : null}
                </div>
              );
            })}
          </div>

          {question.explanation ? (
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
              Түсіндірме: {question.explanation}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={index === 0 || disabled}
            onClick={() => onMove(question.id, 'up')}
          >
            <ArrowUp size={13} />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={index === total - 1 || disabled}
            onClick={() => onMove(question.id, 'down')}
          >
            <ArrowDown size={13} />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={disabled}
            onClick={() => onEdit(question)}
          >
            <Pencil size={13} />
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            disabled={disabled}
            onClick={() => onDelete(question)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
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
            <Card id="new-course" className="scroll-mt-24">
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

                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Access параметрлері
                  </p>

                  <div className="space-y-2">
  <Label>Курс түрі</Label>

  <CourseAccessTypeCards
    value={newCourse.accessType}
    onChange={(nextAccessType) =>
      setNewCourse((p) => ({
        ...p,
        accessType: nextAccessType,
        visibility: resolveVisibilityFromAccessType(nextAccessType),
        price:
          nextAccessType === 'paid'
            ? Number(p.price || 0) > 0
              ? p.price
              : '5000'
            : '0',
        currency: nextAccessType === 'paid' ? p.currency || 'KZT' : 'KZT',
      }))
    }
  />
</div>

                  {shouldShowCoursePricing(newCourse.accessType) ? (
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
                  ) : null}

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
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
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
                                shouldShowCoursePricing(course.accessType || 'public_free')
                                  ? formatPrice(Number(course.price || 0), course.currency || 'KZT')
                                  : 'Тегін',
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
              <div className="space-y-6">
                <Card id="course-settings" className="scroll-mt-24">
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
                      <Label>{t('page.teacher_course_builder.field.thumbnail')}</Label>
                      <Input
                        value={courseEdit.thumbnailUrl}
                        onChange={(e) =>
                          setCourseEdit((p) => ({ ...p, thumbnailUrl: e.target.value }))
                        }
                        placeholder="https://..."
                      />
                    </div>

                    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                      <div>
                        <p className="text-sm font-semibold">Access және монетизация</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Курс ашық, жабық немесе ақылы режимде жұмыс істейді.
                        </p>
                      </div>

                      <div className="space-y-2">
  <Label>Курс түрі</Label>

  <CourseAccessTypeCards
    value={courseEdit.accessType}
    onChange={(nextAccessType) =>
      setCourseEdit((p) => ({
        ...p,
        accessType: nextAccessType,
        visibility: resolveVisibilityFromAccessType(nextAccessType),
        price:
          nextAccessType === 'paid'
            ? Number(p.price || 0) > 0
              ? p.price
              : '5000'
            : '0',
        currency: nextAccessType === 'paid' ? p.currency || 'KZT' : 'KZT',
      }))
    }
  />
</div>

                      {shouldShowCoursePricing(courseEdit.accessType) ? (
                        <div className="grid gap-4 md:grid-cols-2">
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
                        </div>
                      ) : null}

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

                      <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                        Қазіргі режим:{' '}
                        <span className="font-medium text-foreground">
                          {getAccessTypeLabel(courseEdit.accessType)}
                        </span>
                        {shouldShowCoursePricing(courseEdit.accessType) ? (
                          <>
                            {' '}· Баға:{' '}
                            <span className="font-medium text-foreground">
                              {selectedCoursePrice}
                            </span>
                          </>
                        ) : null}
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
                      {shouldShowCoursePricing(courseEdit.accessType) ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                          <span className="text-muted-foreground">Баға</span>
                          <span className="font-medium">{selectedCoursePrice}</span>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card id="announcements" className="scroll-mt-24">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <Megaphone size={14} />
                          Хабарландырулар
                        </span>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Бұл бөлім арқылы курсқа қатысты маңызды ақпаратты оқушыларға жариялайсыз.
                        Pin қойылған хабарландырулар жоғарыда тұрады.
                      </p>

                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="space-y-1.5">
                          <Label>Тақырып</Label>
                          <Input
                            value={announcementForm.title}
                            onChange={(e) =>
                              setAnnouncementForm((p) => ({ ...p, title: e.target.value }))
                            }
                            placeholder="Мысалы: Ертең бақылау тесті болады"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Мәтін</Label>
                          <Textarea
                            rows={4}
                            value={announcementForm.body}
                            onChange={(e) =>
                              setAnnouncementForm((p) => ({ ...p, body: e.target.value }))
                            }
                            placeholder="Оқушыларға көрсетілетін хабарлама мәтіні..."
                          />
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Маңыздылығы</Label>
                            <select
                              value={announcementForm.priority}
                              onChange={(e) =>
                                setAnnouncementForm((p) => ({
                                  ...p,
                                  priority: e.target.value as CourseAnnouncementPriority,
                                }))
                              }
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                              {announcementPriorities.map((priority) => (
                                <option key={priority} value={priority}>
                                  {getAnnouncementPriorityLabel(priority)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Мерзімі</Label>
                            <Input
                              type="datetime-local"
                              value={announcementForm.expiresAt}
                              onChange={(e) =>
                                setAnnouncementForm((p) => ({
                                  ...p,
                                  expiresAt: e.target.value,
                                }))
                              }
                              min={toDateTimeLocalValue(new Date().toISOString())}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                          <div>
                            <Label htmlFor="announcement-pinned">Жоғарыға бекіту</Label>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Pin қойылса, хабарландыру тізімнің басында тұрады.
                            </p>
                          </div>

                          <Switch
                            id="announcement-pinned"
                            checked={announcementForm.isPinned}
                            onCheckedChange={(checked) =>
                              setAnnouncementForm((p) => ({
                                ...p,
                                isPinned: checked,
                              }))
                            }
                          />
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                          {editingAnnouncementId ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={resetAnnouncementForm}
                            >
                              Болдырмау
                            </Button>
                          ) : null}

                          <Button
                            type="button"
                            onClick={handleSaveAnnouncement}
                            disabled={!canSaveAnnouncement}
                          >
                            <Megaphone size={14} className="mr-1.5" />
                            {editingAnnouncementId
                              ? updateAnnouncementMutation.isPending
                                ? 'Жаңартылуда...'
                                : 'Хабарландыруды жаңарту'
                              : createAnnouncementMutation.isPending
                                ? 'Жариялануда...'
                                : 'Хабарландыру жариялау'}
                          </Button>
                        </div>
                      </div>

                      {courseAnnouncementsLoading ? (
                        <LoadingState text="Хабарландырулар жүктелуде..." />
                      ) : null}

                      {!courseAnnouncementsLoading &&
                      (!courseAnnouncements || courseAnnouncements.length === 0) ? (
                        <EmptyState
                          title="Хабарландыру жоқ"
                          text="Курсқа хабарландыру жарияланғаннан кейін осы жерде көрінеді."
                        />
                      ) : null}

                      {!courseAnnouncementsLoading && courseAnnouncements?.length ? (
                        <div className="space-y-2">
                          {courseAnnouncements.map((announcement) => (
                            <CourseAnnouncementCard
                              key={announcement.id}
                              announcement={announcement}
                              onEdit={handleEditAnnouncement}
                              onDelete={handleDeleteAnnouncement}
                              deleting={deleteAnnouncementMutation.isPending}
                            />
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card id="materials" className="scroll-mt-24">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText size={14} />
                          Курс материалдары
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Бұл бөлім міндетті емес. Мұғалім курсқа силлабус, бағалау критерийі,
                        формулалар жинағы немесе кіріспе PDF сияқты қосымша материал сілтемесін қоса алады.
                      </p>

                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="space-y-1.5">
                          <Label>Материал атауы</Label>
                          <Input
                            value={courseAssetForm.title}
                            onChange={(e) =>
                              setCourseAssetForm((p) => ({ ...p, title: e.target.value }))
                            }
                            placeholder="Мысалы: Курс силлабусы"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Сілтеме</Label>
                          <Input
                            value={courseAssetForm.externalUrl}
                            onChange={(e) =>
                              setCourseAssetForm((p) => ({ ...p, externalUrl: e.target.value }))
                            }
                            placeholder="https://..."
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Сипаттама</Label>
                          <Textarea
                            rows={2}
                            value={courseAssetForm.description}
                            onChange={(e) =>
                              setCourseAssetForm((p) => ({ ...p, description: e.target.value }))
                            }
                            placeholder="Қысқаша түсіндірме"
                          />
                        </div>

                        <Button
                          size="sm"
                          className="w-full"
                          onClick={handleCreateCourseAsset}
                          disabled={!canCreateCourseAsset}
                        >
                          <LinkIcon size={14} className="mr-1.5" />
                          Курс материалын қосу
                        </Button>
                      </div>

                      {courseAssetsLoading ? (
                        <p className="text-xs text-muted-foreground">Материалдар жүктелуде...</p>
                      ) : null}

                      {!courseAssetsLoading && (!courseAssets || courseAssets.length === 0) ? (
                        <p className="text-xs text-muted-foreground">
                          Әзірге курс материалы қосылмаған.
                        </p>
                      ) : null}

                      <div className="space-y-2">
                        {(courseAssets || []).map((asset) => (
                          <div key={asset.id} className="rounded-lg border p-3 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{asset.title}</p>
                                {asset.description ? (
                                  <p className="mt-1 text-muted-foreground">{asset.description}</p>
                                ) : null}
                                <p className="mt-1 truncate text-muted-foreground">
                                  {asset.file.externalUrl || asset.file.filename}
                                </p>
                              </div>

                              <div className="flex shrink-0 gap-1">
                                {asset.file.externalUrl ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    asChild
                                  >
                                    <a href={asset.file.externalUrl} target="_blank" rel="noreferrer">
                                      <ExternalLink size={13} />
                                    </a>
                                  </Button>
                                ) : null}

                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={deleteCourseAssetMutation.isPending}
                                  onClick={() => handleDeleteCourseAsset(asset.id)}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
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
                          Бұл бөлім толық қолданылуы үшін курс түрін “Жабық курс” етіп қойыңыз.
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

                  <Card id="publish" className="scroll-mt-24">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Жариялау</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Жарияланған курс каталогта көрінеді. Жабық курс жарияланса да,
                        тек invite арқылы ашылады.
                      </p>

                      {courseEdit.status === 'archived' ? (
                        <div className="rounded-lg border bg-muted px-3 py-2 text-xs text-muted-foreground">
                          Курс архивте тұр. Алдымен архивтен қайтарыңыз.
                        </div>
                      ) : courseEdit.status === 'published' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            quickStatusMutation.mutate({
                              courseId: selectedCourse.id,
                              status: 'draft',
                            })
                          }
                          disabled={quickStatusMutation.isPending}
                        >
                          Жариялаудан алу
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            quickStatusMutation.mutate({
                              courseId: selectedCourse.id,
                              status: 'published',
                            })
                          }
                          disabled={quickStatusMutation.isPending}
                        >
                          Жариялау
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Архив</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Архивке түскен курс оқушыларға белсенді курс ретінде көрсетілмейді.
                        Кейін оны қайта draft күйіне қайтаруға болады.
                      </p>

                      {courseEdit.status === 'archived' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            quickStatusMutation.mutate({
                              courseId: selectedCourse.id,
                              status: 'draft',
                            })
                          }
                          disabled={quickStatusMutation.isPending}
                        >
                          Архивтен қайтару
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            quickStatusMutation.mutate({
                              courseId: selectedCourse.id,
                              status: 'archived',
                            })
                          }
                          disabled={quickStatusMutation.isPending}
                        >
                          Архивке жіберу
                        </Button>
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

              <div className="space-y-6">
                <Card id="modules-lessons" className="scroll-mt-24">
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
                                          {lesson.attachmentsCount
                                            ? ` · ${lesson.attachmentsCount} файл`
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

                <Card id="lesson-mini-quiz" className="scroll-mt-24">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <ListChecks size={16} />
                      Lesson Mini Quiz
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Сабақ соңында оқушыға қысқа тексеру тестін көрсетіңіз. Бір сабаққа бір mini quiz беріледі.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {!editingLessonId || !selectedEditingLesson ? (
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                        Mini quiz қосу үшін алдымен бар сабақты таңдаңыз немесе жаңа сабақты сақтаңыз.
                      </div>
                    ) : (
                      <>
                        {miniQuizLoading ? (
                          <LoadingState text="Mini quiz жүктелуде..." />
                        ) : null}

                        <div className="space-y-3 rounded-lg border p-3">
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                            <div className="space-y-1.5">
                              <Label>Mini quiz атауы</Label>
                              <Input
                                value={miniQuizForm.title}
                                onChange={(e) =>
                                  setMiniQuizForm((p) => ({ ...p, title: e.target.value }))
                                }
                                placeholder="Мысалы: Сабақ бойынша қысқа тексеру"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label>Өту пайызы</Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={miniQuizForm.passingScore}
                                onChange={(e) =>
                                  setMiniQuizForm((p) => ({
                                    ...p,
                                    passingScore: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Сипаттама</Label>
                            <Textarea
                              rows={2}
                              value={miniQuizForm.description}
                              onChange={(e) =>
                                setMiniQuizForm((p) => ({ ...p, description: e.target.value }))
                              }
                              placeholder="Қысқаша нұсқаулық немесе түсіндірме"
                            />
                          </div>

                          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                            <div>
                              <Label htmlFor="mini-quiz-published">Оқушыға көрсету</Label>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                Publish қосылса, quiz сабақ detail бетінде көрінеді.
                              </p>
                            </div>

                            <Switch
                              id="mini-quiz-published"
                              checked={miniQuizForm.isPublished}
                              onCheckedChange={(checked) =>
                                setMiniQuizForm((p) => ({ ...p, isPublished: checked }))
                              }
                            />
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            {selectedMiniQuiz ? (
                              <Button
                                type="button"
                                variant="destructive"
                                onClick={handleDeleteMiniQuiz}
                                disabled={deleteMiniQuizMutation.isPending}
                              >
                                <Trash2 size={14} className="mr-1.5" />
                                Mini quiz өшіру
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              onClick={handleSaveMiniQuiz}
                              disabled={!canSaveMiniQuiz}
                            >
                              <Save size={14} className="mr-1.5" />
                              {upsertMiniQuizMutation.isPending ? 'Сақталуда...' : 'Mini quiz сақтау'}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border p-3">
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold">
                              {editingMiniQuizQuestionId ? 'Сұрақты өңдеу' : 'Жаңа сұрақ'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Дұрыс жауап индекс арқылы емес, checkbox/radio арқылы таңдалады.
                            </p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_120px]">
                            <div className="space-y-1.5">
                              <Label>Сұрақ мәтіні</Label>
                              <Input
                                value={miniQuizQuestionForm.questionText}
                                onChange={(e) =>
                                  setMiniQuizQuestionForm((p) => ({
                                    ...p,
                                    questionText: e.target.value,
                                  }))
                                }
                                placeholder="Мысалы: Бұл тақырыптың негізгі ұғымы қандай?"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label>Сұрақ түрі</Label>
                              <select
                                value={miniQuizQuestionForm.questionType}
                                onChange={(e) =>
                                  setMiniQuizQuestionForm((p) => ({
                                    ...p,
                                    questionType: e.target.value as LessonMiniQuizQuestionType,
                                    correctAnswer: [],
                                  }))
                                }
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                {miniQuizQuestionTypes.map((type) => (
                                  <option key={type} value={type}>
                                    {getMiniQuizQuestionTypeLabel(type)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <Label>Реті</Label>
                              <Input
                                type="number"
                                min={1}
                                value={miniQuizQuestionForm.sortOrder}
                                onChange={(e) =>
                                  setMiniQuizQuestionForm((p) => ({
                                    ...p,
                                    sortOrder: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Жауап нұсқалары</Label>
                            {miniQuizQuestionForm.options.map((option, optionIndex) => {
                              const checked = miniQuizQuestionForm.correctAnswer.includes(optionIndex);
                              const inputType =
                                miniQuizQuestionForm.questionType === 'single_choice'
                                  ? 'radio'
                                  : 'checkbox';

                              return (
                                <div key={optionIndex} className="flex items-center gap-2">
                                  <input
                                    type={inputType}
                                    name="mini-quiz-correct-answer"
                                    checked={checked}
                                    onChange={() => handleToggleMiniQuizCorrectAnswer(optionIndex)}
                                    className="h-4 w-4"
                                  />
                                  <Input
                                    value={option}
                                    onChange={(e) =>
                                      setMiniQuizQuestionForm((p) => {
                                        const nextOptions = [...p.options];
                                        nextOptions[optionIndex] = e.target.value;

                                        return {
                                          ...p,
                                          options: nextOptions,
                                        };
                                      })
                                    }
                                    placeholder={`Жауап ${optionIndex + 1}`}
                                  />
                                </div>
                              );
                            })}
                          </div>

                          <div className="space-y-1.5">
                            <Label>Түсіндірме</Label>
                            <Textarea
                              rows={2}
                              value={miniQuizQuestionForm.explanation}
                              onChange={(e) =>
                                setMiniQuizQuestionForm((p) => ({
                                  ...p,
                                  explanation: e.target.value,
                                }))
                              }
                              placeholder="Оқушы жауап бергеннен кейін көретін қысқаша түсіндірме"
                            />
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            {editingMiniQuizQuestionId ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={resetMiniQuizQuestionForm}
                              >
                                <X size={14} className="mr-1.5" />
                                Болдырмау
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              onClick={handleSaveMiniQuizQuestion}
                              disabled={!canSaveMiniQuizQuestion}
                            >
                              <HelpCircle size={14} className="mr-1.5" />
                              {editingMiniQuizQuestionId
                                ? updateMiniQuizQuestionMutation.isPending
                                  ? 'Жаңартылуда...'
                                  : 'Сұрақты жаңарту'
                                : createMiniQuizQuestionMutation.isPending
                                  ? 'Қосылуда...'
                                  : 'Сұрақ қосу'}
                            </Button>
                          </div>
                        </div>

                        {!miniQuizLoading && !selectedMiniQuiz ? (
                          <EmptyState
                            title="Mini quiz әлі сақталмаған"
                            text="Алдымен quiz баптауларын сақтаңыз немесе бірден сұрақ қосыңыз."
                          />
                        ) : null}

                        {selectedMiniQuiz ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone={selectedMiniQuiz.isPublished ? 'success' : 'warning'}>
                                  {selectedMiniQuiz.isPublished ? 'Жарияланған' : 'Draft'}
                                </StatusBadge>
                                <StatusBadge tone="info">
                                  {selectedMiniQuiz.questionsCount} сұрақ
                                </StatusBadge>
                                <StatusBadge tone="muted">
                                  Өту: {selectedMiniQuiz.passingScore}%
                                </StatusBadge>
                              </div>
                            </div>

                            {selectedMiniQuiz.questions.length === 0 ? (
                              <EmptyState
                                title="Сұрақ жоқ"
                                text="Mini quiz оқушыға пайдалы болуы үшін кемінде бір сұрақ қосыңыз."
                              />
                            ) : (
                              <div className="space-y-2">
                                {selectedMiniQuiz.questions.map((question, index) => (
                                  <MiniQuizQuestionCard
                                    key={question.id}
                                    question={question}
                                    index={index}
                                    total={selectedMiniQuiz.questions.length}
                                    onEdit={handleEditMiniQuizQuestion}
                                    onDelete={handleDeleteMiniQuizQuestion}
                                    onMove={handleMoveMiniQuizQuestion}
                                    disabled={
                                      deleteMiniQuizQuestionMutation.isPending ||
                                      reorderMiniQuizQuestionsMutation.isPending
                                    }
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base font-semibold">Сабақ файлдары</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Сабаққа PDF, Google Drive, презентация немесе басқа external материал сілтемесін қосыңыз.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {!editingLessonId || !selectedEditingLesson ? (
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                        Файл қосу үшін алдымен бар сабақты таңдаңыз немесе жаңа сабақты сақтаңыз.
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3 rounded-lg border p-3">
                          <div className="space-y-1.5">
                            <Label>Материал атауы</Label>
                            <Input
                              value={lessonAttachmentForm.title}
                              onChange={(e) =>
                                setLessonAttachmentForm((p) => ({ ...p, title: e.target.value }))
                              }
                              placeholder="Мысалы: Үй жұмысы PDF"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Сілтеме</Label>
                            <Input
                              value={lessonAttachmentForm.externalUrl}
                              onChange={(e) =>
                                setLessonAttachmentForm((p) => ({ ...p, externalUrl: e.target.value }))
                              }
                              placeholder="https://..."
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Сипаттама</Label>
                            <Textarea
                              rows={2}
                              value={lessonAttachmentForm.description}
                              onChange={(e) =>
                                setLessonAttachmentForm((p) => ({ ...p, description: e.target.value }))
                              }
                              placeholder="Қысқаша түсіндірме"
                            />
                          </div>

                          <Button
                            size="sm"
                            className="w-full"
                            onClick={handleCreateLessonAttachment}
                            disabled={!canCreateLessonAttachment}
                          >
                            <LinkIcon size={14} className="mr-1.5" />
                            Сабақ файлын қосу
                          </Button>
                        </div>

                        {lessonAttachmentsLoading ? (
                          <p className="text-xs text-muted-foreground">Сабақ файлдары жүктелуде...</p>
                        ) : null}

                        {!lessonAttachmentsLoading && (!lessonAttachments || lessonAttachments.length === 0) ? (
                          <p className="text-xs text-muted-foreground">
                            Бұл сабаққа әлі файл қосылмаған.
                          </p>
                        ) : null}

                        <div className="space-y-2">
                          {(lessonAttachments || []).map((attachment) => (
                            <div key={attachment.id} className="rounded-lg border p-3 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{attachment.title}</p>
                                  {attachment.description ? (
                                    <p className="mt-1 text-muted-foreground">{attachment.description}</p>
                                  ) : null}
                                  <p className="mt-1 truncate text-muted-foreground">
                                    {attachment.file.externalUrl || attachment.file.filename}
                                  </p>
                                </div>

                                <div className="flex shrink-0 gap-1">
                                  {attachment.file.externalUrl ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8"
                                      asChild
                                    >
                                      <a href={attachment.file.externalUrl} target="_blank" rel="noreferrer">
                                        <ExternalLink size={13} />
                                      </a>
                                    </Button>
                                  ) : null}

                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={deleteLessonAttachmentMutation.isPending}
                                    onClick={() => handleDeleteLessonAttachment(attachment.id)}
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
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
      </>
    ) : null}
  </div>
</DashboardLayout>
  );
}
