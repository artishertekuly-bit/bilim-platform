import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Eye,
  Image,
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
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface-soft/55 p-4 shadow-soft">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldBlock({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? (
        <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
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
  const pricingVisible = shouldShowCoursePricing(courseEdit.accessType);

  return (
    <Card id="course-settings" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-semibold">
                Курс параметрлері
              </CardTitle>

              <StatusBadge tone={getStatusTone(courseEdit.status)}>
                {getStatusLabel(courseEdit.status)}
              </StatusBadge>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Курс атауын, сипаттамасын, access түрін, баға параметрін және
              оқушы қабылдау күйін реттеңіз.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onSaveCourse}
            disabled={updating}
          >
            <Save size={15} className="mr-2" />
            {updating
              ? t('page.teacher_course_builder.action.saving')
              : t('page.teacher_course_builder.action.save_course')}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <FormSection
          title="Негізгі ақпарат"
          description="Бұл мәліметтер курс каталогында және курс бетінде көрінеді."
          icon={<Settings size={17} />}
        >
          <FieldBlock label={t('page.teacher_course_builder.field.course_title')}>
            <Input
              value={courseEdit.title}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
            />
          </FieldBlock>

          <FieldBlock label={t('page.teacher_course_builder.field.description')}>
            <Textarea
              rows={4}
              value={courseEdit.description}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
            />
          </FieldBlock>

          <FieldBlock label={t('page.teacher_course_builder.field.subject')}>
            <select
              value={courseEdit.subjectId}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  subjectId: event.target.value,
                }))
              }
              className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
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

          <FieldBlock
            label={t('page.teacher_course_builder.field.thumbnail')}
            hint="Thumbnail URL курс карточкасын визуалды тануға көмектеседі. Бос қалса, default soft icon көрсетіледі."
          >
            <Input
              value={courseEdit.thumbnailUrl}
              onChange={(event) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  thumbnailUrl: event.target.value,
                }))
              }
              placeholder="https://..."
            />
          </FieldBlock>

          {courseEdit.thumbnailUrl ? (
            <div className="rounded-3xl border border-border bg-card/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Image size={13} />
                Thumbnail preview
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-muted">
                <img
                  src={courseEdit.thumbnailUrl}
                  alt="Course thumbnail preview"
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </div>
          ) : null}
        </FormSection>

        <FormSection
          title="Access және монетизация"
          description="Курс ашық, жабық немесе ақылы режимде жұмыс істейді. Ақылы курс таңдағанда ғана баға өрісі көрсетіледі."
          icon={<KeyRound size={17} />}
        >
          <FieldBlock label="Курс түрі">
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

                <p className="text-[11px] leading-5 text-muted-foreground">
                  Қазіргі баға:{' '}
                  <span className="font-semibold text-foreground">
                    {selectedCoursePrice}
                  </span>
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock label="Баға">
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
                  />
                </FieldBlock>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Бұл курс түрінде баға өрісі қолданылмайды. Қазіргі режим:{' '}
              <span className="font-semibold text-foreground">
                {getAccessTypeLabel(courseEdit.accessType)}
              </span>
              .
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <FieldBlock
              label="Оқушы лимиті"
              hint="Бос қалдырсаңыз, оқушы санына шектеу қойылмайды."
            >
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

            <FieldBlock
              label="Оқушы қабылдау"
              hint="Жабық болса, оқушы жаңа жазыла алмайды, бірақ бұрынғы access логикасы бөлек сақталады."
            >
              <button
                type="button"
                onClick={() =>
                  setCourseEdit((previous) => ({
                    ...previous,
                    enrollmentOpen: !previous.enrollmentOpen,
                  }))
                }
                className={`flex h-11 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm transition-all duration-200 ease-soft hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] ${
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

          <div className="rounded-3xl border border-border bg-card/75 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Eye size={13} />
                Қазіргі режим
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={pricingVisible ? 'important' : 'primary'}>
                  {getAccessTypeLabel(courseEdit.accessType)}
                </StatusBadge>

                {pricingVisible ? (
                  <StatusBadge tone="muted">
                    {selectedCoursePrice}
                  </StatusBadge>
                ) : null}

                <StatusBadge tone={courseEdit.enrollmentOpen ? 'success' : 'muted'}>
                  {courseEdit.enrollmentOpen ? 'Enrollment open' : 'Enrollment closed'}
                </StatusBadge>
              </div>
            </div>
          </div>
        </FormSection>

        <div className="flex flex-col gap-3 rounded-3xl border border-primary-muted bg-primary-soft/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Өзгерістерді сақтау
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Курс параметрлері тек “Сақтау” батырмасын басқаннан кейін жаңарады.
            </p>
          </div>

          <Button
            type="button"
            onClick={onSaveCourse}
            disabled={updating}
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