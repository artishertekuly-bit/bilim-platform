import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Save,
  Settings,
  Tag,
  Users,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { CourseAccessTypeCards } from '@/components/course-builder/CourseAccessTypeCards';
import { CourseThumbnailUploader } from '@/components/course-builder/CourseThumbnailUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  CourseAccessType,
  CourseVisibility,
  SubjectRow,
} from '@/lib/app-data-types';
import {
  getAccessTypeLabel,
  resolveVisibilityFromAccessType,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import t from '@/lib/i18n';
import { cn, removeNullCharacters } from '@/lib/utils';

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

type CourseSettingsCardProps = {
  userId: string;
  courseEdit: CourseEditForm;
  setCourseEdit: Dispatch<SetStateAction<CourseEditForm>>;
  subjectOptions: SubjectRow[];
  selectedCoursePrice: string;
  updating: boolean;
  onSaveCourse: () => void;
};

const MAX_TITLE_CHARS = 180;
const MAX_DESCRIPTION_CHARS = 1_200;
const MAX_CURRENCY_CHARS = 3;
const MAX_MAX_STUDENTS_CHARS = 6;
const DEFAULT_PAID_PRICE = '5000';
const DEFAULT_CURRENCY = 'KZT';

function getStatusTone(status: CourseStatus) {
  if (status === 'published') return 'active' as const;
  if (status === 'archived') return 'muted' as const;

  return 'completed' as const;
}

function getStatusLabel(status: CourseStatus) {
  if (status === 'published') return t('course.status.published');
  if (status === 'archived') return t('course.status.archived');

  return t('course.status.draft');
}

function sanitizeInputValue(value: string, limit: number): string {
  return removeNullCharacters(value).slice(0, limit);
}

function normalizeCurrencyInput(value: string): string {
  return removeNullCharacters(value)
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, MAX_CURRENCY_CHARS);
}

function normalizePositiveIntegerInput(value: string): string {
  return removeNullCharacters(value)
    .replace(/[^\d]/g, '')
    .slice(0, MAX_MAX_STUDENTS_CHARS);
}

function normalizePriceInput(value: string): string {
  return removeNullCharacters(value).replace(/[^\d.]/g, '').slice(0, 12);
}

function getAccessTone(accessType: CourseAccessType) {
  if (accessType === 'paid' || accessType === 'subscription_only') {
    return 'warning' as const;
  }

  if (accessType === 'private_invite' || accessType === 'school_only') {
    return 'primary' as const;
  }

  return 'success' as const;
}

function FieldBlock({
  label,
  children,
  required = false,
}: {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>

      {children}
    </div>
  );
}

function CompactSection({
  title,
  icon,
  aside,
  children,
}: {
  title: string;
  icon: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface-soft/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
            {icon}
          </span>

          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>

        {aside}
      </div>

      {children}
    </section>
  );
}

export function CourseSettingsCard({
  userId,
  courseEdit,
  setCourseEdit,
  subjectOptions,
  selectedCoursePrice,
  updating,
  onSaveCourse,
}: CourseSettingsCardProps) {
  const [thumbnailUploading, setThumbnailUploading] = useState(false);

  const pricingVisible = shouldShowCoursePricing(courseEdit.accessType);
  const basicsComplete = useMemo(
    () =>
      courseEdit.title.trim().length > 0 &&
      courseEdit.description.trim().length > 0 &&
      courseEdit.subjectId.trim().length > 0,
    [courseEdit.description, courseEdit.subjectId, courseEdit.title],
  );


  const updateCourseField = <K extends keyof CourseEditForm>(
    key: K,
    value: CourseEditForm[K],
  ) => {
    setCourseEdit((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleAccessTypeChange = (nextAccessType: CourseAccessType) => {
    setCourseEdit((previous) => ({
      ...previous,
      accessType: nextAccessType,
      visibility: resolveVisibilityFromAccessType(nextAccessType),
      price:
        nextAccessType === 'paid'
          ? Number(previous.price || 0) > 0
            ? previous.price
            : DEFAULT_PAID_PRICE
          : '0',
      currency:
        nextAccessType === 'paid'
          ? normalizeCurrencyInput(previous.currency || DEFAULT_CURRENCY) ||
            DEFAULT_CURRENCY
          : DEFAULT_CURRENCY,
    }));
  };


  return (
    <Card id="course-settings" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Курс баптаулары</CardTitle>

          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={getStatusTone(courseEdit.status)}>
              {getStatusLabel(courseEdit.status)}
            </StatusBadge>

            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? (
                <CheckCircle2 size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              {basicsComplete ? 'Дайын' : 'Толтырыңыз'}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <CompactSection
          title="Негізгі ақпарат"
          icon={<Settings size={16} />}
          aside={
            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? 'Дайын' : 'Толтырыңыз'}
            </StatusBadge>
          }
        >
          <div className="space-y-4">
            <FieldBlock
              label={t('page.teacher_course_builder.field.course_title')}
              required
            >
              <Input
                value={courseEdit.title}
                maxLength={MAX_TITLE_CHARS}
                onChange={(event) =>
                  updateCourseField(
                    'title',
                    sanitizeInputValue(event.target.value, MAX_TITLE_CHARS),
                  )
                }
                placeholder={t(
                  'page.teacher_course_builder.placeholder.course_title',
                )}
              />
            </FieldBlock>

            <FieldBlock
              label={t('page.teacher_course_builder.field.description')}
              required
            >
              <Textarea
                rows={4}
                value={courseEdit.description}
                maxLength={MAX_DESCRIPTION_CHARS}
                onChange={(event) =>
                  updateCourseField(
                    'description',
                    sanitizeInputValue(
                      event.target.value,
                      MAX_DESCRIPTION_CHARS,
                    ),
                  )
                }
                placeholder={t(
                  'page.teacher_course_builder.placeholder.description',
                )}
              />

              <p className="text-[11px] text-muted-foreground">
                {courseEdit.description.length}/{MAX_DESCRIPTION_CHARS}
              </p>
            </FieldBlock>

            <FieldBlock
              label={t('page.teacher_course_builder.field.subject')}
              required
            >
              <select
                value={courseEdit.subjectId}
                onChange={(event) =>
                  updateCourseField('subjectId', event.target.value)
                }
                className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
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
            </FieldBlock>

            <FieldBlock label="Курс мұқабасы">
              <CourseThumbnailUploader
                userId={userId}
                value={courseEdit.thumbnailUrl}
                onChange={(url) => updateCourseField('thumbnailUrl', url)}
                disabled={updating}
                onUploadingChange={setThumbnailUploading}
              />
            </FieldBlock>
          </div>
        </CompactSection>

        <CompactSection
          title="Қолжетімділік"
          icon={<KeyRound size={16} />}
          aside={
            <StatusBadge tone={getAccessTone(courseEdit.accessType)}>
              {getAccessTypeLabel(courseEdit.accessType)}
            </StatusBadge>
          }
        >
          <div className="space-y-4">
            <FieldBlock label="Курсқа кіру түрі">
              <CourseAccessTypeCards
                value={courseEdit.accessType}
                onChange={handleAccessTypeChange}
              />
            </FieldBlock>

            {pricingVisible ? (
              <div className="rounded-3xl border border-warning-muted bg-warning-soft/60 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge tone="warning">
                    <Tag size={12} />
                    Ақылы курс
                  </StatusBadge>

                  <StatusBadge tone="muted">{selectedCoursePrice}</StatusBadge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldBlock label="Баға" required>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={courseEdit.price}
                      onChange={(event) =>
                        updateCourseField(
                          'price',
                          normalizePriceInput(event.target.value),
                        )
                      }
                      placeholder={DEFAULT_PAID_PRICE}
                    />
                  </FieldBlock>

                  <FieldBlock label="Валюта">
                    <Input
                      value={courseEdit.currency}
                      maxLength={MAX_CURRENCY_CHARS}
                      onChange={(event) =>
                        updateCourseField(
                          'currency',
                          normalizeCurrencyInput(event.target.value),
                        )
                      }
                      placeholder={DEFAULT_CURRENCY}
                    />
                  </FieldBlock>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <FieldBlock label="Оқушы лимиті">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={courseEdit.maxStudents}
                  onChange={(event) =>
                    updateCourseField(
                      'maxStudents',
                      normalizePositiveIntegerInput(event.target.value),
                    )
                  }
                  placeholder="Шектеусіз"
                />
              </FieldBlock>

              <FieldBlock label="Оқушы қабылдау">
                <button
                  type="button"
                  onClick={() =>
                    updateCourseField('enrollmentOpen', !courseEdit.enrollmentOpen)
                  }
                  aria-pressed={courseEdit.enrollmentOpen}
                  className={cn(
                    'flex h-11 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm transition-all duration-200 ease-soft active:scale-[0.99]',
                    courseEdit.enrollmentOpen
                      ? 'border-success-muted bg-success-soft text-success-foreground'
                      : 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <Users size={15} />
                    {courseEdit.enrollmentOpen ? 'Ашық' : 'Жабық'}
                  </span>

                  <span
                    className={cn(
                      'h-5 w-9 rounded-full p-0.5 transition-colors',
                      courseEdit.enrollmentOpen
                        ? 'bg-success'
                        : 'bg-muted-foreground/30',
                    )}
                  >
                    <span
                      className={cn(
                        'block h-4 w-4 rounded-full bg-card transition-transform',
                        courseEdit.enrollmentOpen
                          ? 'translate-x-4'
                          : 'translate-x-0',
                      )}
                    />
                  </span>
                </button>
              </FieldBlock>
            </div>
          </div>
        </CompactSection>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onSaveCourse}
            disabled={updating || thumbnailUploading || !basicsComplete}
            className="w-full sm:w-auto"
          >
            <Save size={15} className="mr-2" />
            {thumbnailUploading
              ? 'Сурет жүктелуде...'
              : updating
                ? t('page.teacher_course_builder.action.saving')
                : t('page.teacher_course_builder.action.save_course')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}