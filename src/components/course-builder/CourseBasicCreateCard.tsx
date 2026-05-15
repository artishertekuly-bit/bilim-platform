import {
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  BookOpen,
  KeyRound,
  Plus,
  Tag,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/common/StatusBadge';
import { CourseAccessTypeCards } from '@/components/course-builder/CourseAccessTypeCards';
import type { CourseAccessType, CourseVisibility, SubjectRow } from '@/lib/app-data-types';
import t from '@/lib/i18n';
import {
  resolveVisibilityFromAccessType,
  shouldShowCoursePricing,
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

export function CourseBasicCreateCard({
  newCourse,
  setNewCourse,
  subjectOptions,
  canCreateCourse,
  creating,
  onCreateCourse,
}: {
  newCourse: NewCourseForm;
  setNewCourse: Dispatch<SetStateAction<NewCourseForm>>;
  subjectOptions: SubjectRow[];
  canCreateCourse: boolean;
  creating: boolean;
  onCreateCourse: () => void;
}) {
  const pricingVisible = shouldShowCoursePricing(newCourse.accessType);

  const basicsComplete =
    newCourse.title.trim().length > 0 &&
    newCourse.description.trim().length > 0 &&
    newCourse.subjectId.trim().length > 0;

  const createButtonDisabled = creating || !basicsComplete;

  useEffect(() => {
    if (!newCourse.title.trim()) return;
    if (newCourse.moduleTitle.trim() && newCourse.lessonTitle.trim()) return;

    setNewCourse((previous) => ({
      ...previous,
      moduleTitle: previous.moduleTitle.trim() || 'Кіріспе',
      lessonTitle: previous.lessonTitle.trim() || 'Курсқа кіріспе',
    }));
  }, [newCourse.lessonTitle, newCourse.moduleTitle, newCourse.title, setNewCourse]);

  const handleCreateClick = () => {
    if (createButtonDisabled) return;

    if (!canCreateCourse) {
      setNewCourse((previous) => ({
        ...previous,
        moduleTitle: previous.moduleTitle.trim() || 'Кіріспе',
        lessonTitle: previous.lessonTitle.trim() || 'Курсқа кіріспе',
      }));
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
            {canCreateCourse ? 'Дайын' : 'Міндетті'}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <FormSection
          title="Негізгі ақпарат"
          icon={<BookOpen size={17} />}
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
              value={newCourse.title}
              onChange={(event) =>
                setNewCourse((previous) => ({
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
              value={newCourse.description}
              onChange={(event) =>
                setNewCourse((previous) => ({
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
              value={newCourse.subjectId}
              onChange={(event) =>
                setNewCourse((previous) => ({
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
        </FormSection>

        <FormSection
          title="Қолжетімділік"
          icon={<KeyRound size={17} />}
        >
          <FieldBlock label="Курсқа кіру түрі">
            <CourseAccessTypeCards
              value={newCourse.accessType}
              onChange={(nextAccessType) =>
                setNewCourse((previous) => ({
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
              <div className="mb-3">
                <StatusBadge tone="important">
                  <Tag size={12} />
                  Ақылы курс
                </StatusBadge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FieldBlock label="Баға" required>
                  <Input
                    type="number"
                    min={0}
                    value={newCourse.price}
                    onChange={(event) =>
                      setNewCourse((previous) => ({
                        ...previous,
                        price: event.target.value,
                      }))
                    }
                    placeholder="5000"
                  />
                </FieldBlock>

                <FieldBlock label="Валюта">
                  <Input
                    value={newCourse.currency}
                    onChange={(event) =>
                      setNewCourse((previous) => ({
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

          <FieldBlock label="Оқушы лимиті">
            <Input
              type="number"
              min={1}
              value={newCourse.maxStudents}
              onChange={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  maxStudents: event.target.value,
                }))
              }
              placeholder="Шектеусіз"
            />
          </FieldBlock>
        </FormSection>

        <div className="flex justify-end rounded-3xl border border-primary-muted bg-primary-soft/60 p-4">
          <Button
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