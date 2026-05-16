import {
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { BookOpen, KeyRound, Plus, Tag } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { CourseAccessTypeCards } from '@/components/course-builder/CourseAccessTypeCards';
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
  resolveVisibilityFromAccessType,
  shouldShowCoursePricing,
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

type CourseBasicCreateCardProps = {
  newCourse: NewCourseForm;
  setNewCourse: Dispatch<SetStateAction<NewCourseForm>>;
  subjectOptions: SubjectRow[];
  canCreateCourse: boolean;
  creating: boolean;
  onCreateCourse: () => void;
};

const MAX_TITLE_CHARS = 180;
const MAX_DESCRIPTION_CHARS = 1200;
const MAX_CURRENCY_CHARS = 3;
const MAX_MAX_STUDENTS_CHARS = 6;
const DEFAULT_MODULE_TITLE = 'Кіріспе';
const DEFAULT_LESSON_TITLE = 'Курсқа кіріспе';
const DEFAULT_PAID_PRICE = '5000';
const DEFAULT_CURRENCY = 'KZT';

function cleanText(value: string, limit: number) {
  return value.replace(/\x00/g, ' ').slice(0, limit);
}

function normalizeCurrencyInput(value: string) {
  return value
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, MAX_CURRENCY_CHARS);
}

function normalizePositiveIntegerInput(value: string) {
  return value.replace(/[^\d]/g, '').slice(0, MAX_MAX_STUDENTS_CHARS);
}

function normalizePriceInput(value: string) {
  return value.replace(/[^\d.]/g, '').slice(0, 12);
}

function ensureInitialCourseStructure(course: NewCourseForm): NewCourseForm {
  return {
    ...course,
    moduleTitle: course.moduleTitle.trim() || DEFAULT_MODULE_TITLE,
    lessonTitle: course.lessonTitle.trim() || DEFAULT_LESSON_TITLE,
  };
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

export function CourseBasicCreateCard({
  newCourse,
  setNewCourse,
  subjectOptions,
  canCreateCourse,
  creating,
  onCreateCourse,
}: CourseBasicCreateCardProps) {
  const pricingVisible = shouldShowCoursePricing(newCourse.accessType);

  const basicsComplete =
    newCourse.title.trim().length > 0 &&
    newCourse.description.trim().length > 0 &&
    newCourse.subjectId.trim().length > 0;

  const createButtonDisabled = creating || !basicsComplete;

  useEffect(() => {
    if (!newCourse.title.trim()) return;
    if (newCourse.moduleTitle.trim() && newCourse.lessonTitle.trim()) return;

    setNewCourse((previous) => ensureInitialCourseStructure(previous));
  }, [newCourse.lessonTitle, newCourse.moduleTitle, newCourse.title, setNewCourse]);

  const updateCourseField = <K extends keyof NewCourseForm>(
    key: K,
    value: NewCourseForm[K],
  ) => {
    setNewCourse((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleAccessTypeChange = (nextAccessType: CourseAccessType) => {
    setNewCourse((previous) => ({
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

  const handleCreateClick = () => {
    if (createButtonDisabled) return;

    const normalizedCourse = ensureInitialCourseStructure(newCourse);

    setNewCourse((previous) => ensureInitialCourseStructure(previous));

    if (!canCreateCourse && (!normalizedCourse.moduleTitle || !normalizedCourse.lessonTitle)) {
      return;
    }

    onCreateCourse();
  };

  return (
    <Card id="new-course" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {t('page.teacher_course_builder.section.new_course')}
          </CardTitle>

          <StatusBadge tone={canCreateCourse ? 'success' : 'muted'}>
            {canCreateCourse ? 'Дайын' : 'Міндетті өрістер'}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <CompactSection
          title="Негізгі ақпарат"
          icon={<BookOpen size={16} />}
          aside={
            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? 'Толды' : 'Міндетті'}
            </StatusBadge>
          }
        >
          <div className="space-y-4">
            <FieldBlock
              label={t('page.teacher_course_builder.field.course_title')}
              required
            >
              <Input
                value={newCourse.title}
                maxLength={MAX_TITLE_CHARS}
                onChange={(event) =>
                  updateCourseField(
                    'title',
                    cleanText(event.target.value, MAX_TITLE_CHARS),
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
                value={newCourse.description}
                maxLength={MAX_DESCRIPTION_CHARS}
                onChange={(event) =>
                  updateCourseField(
                    'description',
                    cleanText(event.target.value, MAX_DESCRIPTION_CHARS),
                  )
                }
                placeholder={t(
                  'page.teacher_course_builder.placeholder.description',
                )}
              />

              <p className="text-[11px] text-muted-foreground">
                {newCourse.description.length}/{MAX_DESCRIPTION_CHARS}
              </p>
            </FieldBlock>

            <FieldBlock
              label={t('page.teacher_course_builder.field.subject')}
              required
            >
              <select
                value={newCourse.subjectId}
                onChange={(event) => updateCourseField('subjectId', event.target.value)}
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
          </div>
        </CompactSection>

        <CompactSection title="Қолжетімділік" icon={<KeyRound size={16} />}>
          <div className="space-y-4">
            <FieldBlock label="Курсқа кіру түрі">
              <CourseAccessTypeCards
                value={newCourse.accessType}
                onChange={handleAccessTypeChange}
              />
            </FieldBlock>

            {pricingVisible ? (
              <div className="rounded-3xl border border-warning-muted bg-warning-soft/60 p-4">
                <div className="mb-3">
                  <StatusBadge tone="warning">
                    <Tag size={12} />
                    Ақылы курс
                  </StatusBadge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldBlock label="Баға" required>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={newCourse.price}
                      onChange={(event) =>
                        updateCourseField('price', normalizePriceInput(event.target.value))
                      }
                      placeholder={DEFAULT_PAID_PRICE}
                    />
                  </FieldBlock>

                  <FieldBlock label="Валюта">
                    <Input
                      value={newCourse.currency}
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

            <FieldBlock label="Оқушы лимиті">
              <Input
                type="text"
                inputMode="numeric"
                value={newCourse.maxStudents}
                onChange={(event) =>
                  updateCourseField(
                    'maxStudents',
                    normalizePositiveIntegerInput(event.target.value),
                  )
                }
                placeholder="Шектеусіз"
              />
            </FieldBlock>
          </div>
        </CompactSection>

        <div className="flex flex-col gap-3 rounded-3xl border border-primary-muted bg-primary-soft/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            Курс құрылғаннан кейін модуль, сабақ, материал және жариялау баптаулары ашылады.
          </p>

          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleCreateClick}
            disabled={createButtonDisabled}
          >
            <Plus size={15} className="mr-2" />
            {creating
              ? t('page.teacher_course_builder.action.saving')
              : t('page.teacher_course_builder.action.create_course')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}