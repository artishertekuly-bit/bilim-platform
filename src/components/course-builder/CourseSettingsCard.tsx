import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  KeyRound,
  Save,
  Settings,
  Tag,
  Users,
} from 'lucide-react';

import { CourseAccessTypeCards } from '@/components/course-builder/CourseAccessTypeCards';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CourseAccessType, CourseVisibility, SubjectRow } from '@/lib/app-data-types';
import t from '@/lib/i18n';
import { normalizeMediaUrl } from '@/lib/media-url';
import {
  getAccessTypeLabel,
  resolveVisibilityFromAccessType,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';

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

function FormSection({
  title,
  icon,
  children,
  aside,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
            {icon}
          </div>

          <p className="min-w-0 text-sm font-semibold text-foreground">
            {title}
          </p>
        </div>

        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldBlock({
  label,
  children,
  required,
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

export function CourseSettingsCard({
  courseEdit,
  setCourseEdit,
  subjectOptions,
  selectedCoursePrice,
  updating,
  onSaveCourse,
}: {
  courseEdit: CourseEditForm;
  setCourseEdit: Dispatch<SetStateAction<CourseEditForm>>;
  subjectOptions: SubjectRow[];
  selectedCoursePrice: string;
  updating: boolean;
  onSaveCourse: () => void;
}) {
  const [thumbnailError, setThumbnailError] = useState(false);

  const pricingVisible = shouldShowCoursePricing(courseEdit.accessType);
  const thumbnailUrl = courseEdit.thumbnailUrl.trim();

  const basicsComplete = useMemo(
    () =>
      courseEdit.title.trim().length > 0 &&
      courseEdit.description.trim().length > 0 &&
      courseEdit.subjectId.trim().length > 0,
    [courseEdit.description, courseEdit.subjectId, courseEdit.title]
  );

  useEffect(() => {
    setThumbnailError(false);
  }, [thumbnailUrl]);

  return (
    <Card id="course-settings" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold">
              Курс баптаулары
            </CardTitle>

            <StatusBadge tone={getStatusTone(courseEdit.status)}>
              {getStatusLabel(courseEdit.status)}
            </StatusBadge>

            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? (
                <CheckCircle2 size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              {basicsComplete ? 'Дайын' : 'Толық емес'}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <FormSection
          title="Негізгі ақпарат"
          icon={<Settings size={17} />}
          aside={
            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? 'Толды' : 'Міндетті'}
            </StatusBadge>
          }
        >
          <FieldBlock
            label={t('page.teacher_course_builder.field.course_title')}
            required
          >
            <Input
              value={courseEdit.title}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
              placeholder={t('page.teacher_course_builder.placeholder.course_title')}
            />
          </FieldBlock>

          <FieldBlock
            label={t('page.teacher_course_builder.field.description')}
            required
          >
            <Textarea
              rows={4}
              value={courseEdit.description}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              placeholder={t('page.teacher_course_builder.placeholder.description')}
            />
          </FieldBlock>

          <FieldBlock
            label={t('page.teacher_course_builder.field.subject')}
            required
          >
            <select
              value={courseEdit.subjectId}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  subjectId: event.target.value,
                }))
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

          <FieldBlock label={t('page.teacher_course_builder.field.thumbnail')}>
            <Input
              value={courseEdit.thumbnailUrl}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  thumbnailUrl: event.target.value,
                }))
              }
              onBlur={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  thumbnailUrl: normalizeMediaUrl(event.target.value),
                }))
              }
              placeholder="https://..."
            />
          </FieldBlock>

          {thumbnailUrl || thumbnailError ? (
            <div className="rounded-3xl border border-border bg-muted/25 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <ImageIcon size={13} />
                  Сурет
                </div>

                {thumbnailError ? (
                  <StatusBadge tone="muted">
                    <AlertCircle size={12} />
                    Қате URL
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="success">
                    <CheckCircle2 size={12} />
                    Көрініс
                  </StatusBadge>
                )}
              </div>

              {thumbnailUrl && !thumbnailError ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <img
                    src={thumbnailUrl}
                    alt="Курс суреті"
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                    onError={() => setThumbnailError(true)}
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-border bg-card px-4 text-center">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Сурет жүктелмеді
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </FormSection>

        <FormSection
          title="Қолжетімділік"
          icon={<KeyRound size={17} />}
          aside={
            <StatusBadge tone={pricingVisible ? 'important' : 'primary'}>
              {getAccessTypeLabel(courseEdit.accessType)}
            </StatusBadge>
          }
        >
          <FieldBlock label="Курсқа кіру түрі">
            <CourseAccessTypeCards
              value={courseEdit.accessType}
              onChange={(nextAccessType) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  accessType: nextAccessType,
                  visibility: resolveVisibilityFromAccessType(nextAccessType),
                  price:
                    nextAccessType === 'paid'
                      ? Number(previous.price || 0) > 0
                        ? previous.price
                        : '5000'
                      : '0',
                  currency: nextAccessType === 'paid' ? previous.currency || 'KZT' : 'KZT',
                }))
              }
            />
          </FieldBlock>

          {pricingVisible ? (
            <div className="rounded-3xl border border-accent-muted bg-accent-soft/70 p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone="important">
                  <Tag size={12} />
                  Ақылы курс
                </StatusBadge>

                <StatusBadge tone="muted">{selectedCoursePrice}</StatusBadge>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="Баға" required>
                  <Input
                    type="number"
                    min={0}
                    value={courseEdit.price}
                    onChange={(event) =>
                      setCourseEdit((previous) => ({
                        ...previous,
                        price: event.target.value,
                      }))
                    }
                    placeholder="5000"
                  />
                </FieldBlock>

                <FieldBlock label="Валюта">
                  <Input
                    value={courseEdit.currency}
                    onChange={(event) =>
                      setCourseEdit((previous) => ({
                        ...previous,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={3}
                    placeholder="KZT"
                  />
                </FieldBlock>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock label="Оқушы лимиті">
              <Input
                type="number"
                min={1}
                value={courseEdit.maxStudents}
                onChange={(event) =>
                  setCourseEdit((previous) => ({
                    ...previous,
                    maxStudents: event.target.value,
                  }))
                }
                placeholder="Шектеусіз"
              />
            </FieldBlock>

            <FieldBlock label="Оқушы қабылдау">
              <button
                type="button"
                onClick={() =>
                  setCourseEdit((previous) => ({
                    ...previous,
                    enrollmentOpen: !previous.enrollmentOpen,
                  }))
                }
                aria-pressed={courseEdit.enrollmentOpen}
                className={`flex h-11 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm transition-all duration-200 ease-soft active:scale-[0.99] ${
                  courseEdit.enrollmentOpen
                    ? 'border-success-muted bg-success-soft text-success-foreground'
                    : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Users size={15} />
                  {courseEdit.enrollmentOpen ? 'Қабылдау ашық' : 'Қабылдау жабық'}
                </span>

                <span
                  className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
                    courseEdit.enrollmentOpen ? 'bg-success' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-card transition-transform ${
                      courseEdit.enrollmentOpen ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </FieldBlock>
          </div>
        </FormSection>

        <div className="flex justify-end rounded-3xl border border-primary-muted bg-primary-soft/60 p-4">
          <Button
            type="button"
            onClick={onSaveCourse}
            disabled={updating || !basicsComplete}
            className="w-full sm:w-auto"
          >
            <Save size={15} className="mr-2" />
            {updating
              ? t('page.teacher_course_builder.action.saving')
              : t('page.teacher_course_builder.action.save_course')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}