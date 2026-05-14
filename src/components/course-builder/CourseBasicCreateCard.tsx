import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  BookOpen,
  FileText,
  KeyRound,
  Plus,
  Sparkles,
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
import { normalizeMediaUrl } from '@/lib/media-url';
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

  return (
    <Card id="new-course" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-semibold">
                {t('page.teacher_course_builder.section.new_course')}
              </CardTitle>

              <StatusBadge tone="primary">
                <Plus size={12} />
                Жаңа курс
              </StatusBadge>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Курстың негізгі мәліметін енгізіп, алғашқы модуль мен кіріспе
              сабақты бірден құрыңыз.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <FormSection
          title="Негізгі ақпарат"
          description="Курс атауы, сипаттамасы және пәні. Бұл мәліметтер каталогта көрінеді."
          icon={<BookOpen size={17} />}
        >
          <FieldBlock label={t('page.teacher_course_builder.field.course_title')}>
            <Input
              value={newCourse.title}
              onChange={(event) =>
                setNewCourse((previous) => ({ ...previous, title: event.target.value }))
              }
              placeholder={t('page.teacher_course_builder.placeholder.course_title')}
            />
          </FieldBlock>

          <FieldBlock label={t('page.teacher_course_builder.field.description')}>
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

          <FieldBlock label={t('page.teacher_course_builder.field.subject')}>
            <select
              value={newCourse.subjectId}
              onChange={(event) =>
                setNewCourse((previous) => ({
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
        </FormSection>

        <FormSection
          title="Access параметрлері"
          description="Курс кімге ашық болатынын таңдаңыз. Ақылы курс таңдағанда ғана баға өрісі шығады."
          icon={<KeyRound size={17} />}
        >
          <FieldBlock label="Курс түрі">
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
              <div className="mb-3 flex items-center gap-2">
                <StatusBadge tone="important">
                  <KeyRound size={12} />
                  Ақылы курс
                </StatusBadge>
                <p className="text-[11px] text-muted-foreground">
                  Баға мен валюта тек ақылы курс үшін қолданылады.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FieldBlock label="Баға">
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
                  />
                </FieldBlock>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Бұл курс түрінде баға өрісі қолданылмайды. Каталогта курс тегін
              немесе invite арқылы көрсетіледі.
            </div>
          )}

          <FieldBlock
            label="Оқушы лимиті"
            hint="Бос қалдырсаңыз, курсқа оқушы саны бойынша шектеу қойылмайды."
          >
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
              placeholder="Бос қалса — шектеусіз"
            />
          </FieldBlock>
        </FormSection>

        <FormSection
          title="Алғашқы құрылым"
          description="Курс құрылғанда бір бастапқы модуль және кіріспе сабақ бірге жасалады."
          icon={<FileText size={17} />}
        >
          <FieldBlock label={t('page.teacher_course_builder.field.initial_module')}>
            <Input
              value={newCourse.moduleTitle}
              onChange={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  moduleTitle: event.target.value,
                }))
              }
            />
          </FieldBlock>

          <FieldBlock label={t('page.teacher_course_builder.field.intro_lesson')}>
            <Input
              value={newCourse.lessonTitle}
              onChange={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  lessonTitle: event.target.value,
                }))
              }
            />
          </FieldBlock>

          <FieldBlock label={t('page.teacher_course_builder.field.theory')}>
            <Textarea
              rows={4}
              value={newCourse.lessonBody}
              onChange={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  lessonBody: event.target.value,
                }))
              }
            />
          </FieldBlock>

          <FieldBlock label={t('page.teacher_course_builder.field.practice')}>
            <Textarea
              rows={3}
              value={newCourse.lessonPractice}
              onChange={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  lessonPractice: event.target.value,
                }))
              }
            />
          </FieldBlock>

          <FieldBlock
            label={t('page.teacher_course_builder.field.video_url')}
            hint="YouTube немесе сыртқы video URL енгізуге болады. URL blur кезінде normalize болады."
          >
            <Input
              value={newCourse.lessonVideo}
              onChange={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  lessonVideo: event.target.value,
                }))
              }
              onBlur={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  lessonVideo: normalizeMediaUrl(event.target.value),
                }))
              }
              placeholder="https://youtube.com/..."
            />
          </FieldBlock>
        </FormSection>

        <div className="rounded-3xl border border-primary-muted bg-primary-soft/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-card text-primary shadow-inner-soft">
                <Sparkles size={17} />
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">
                  Курс жасауға дайын
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Міндетті өрістер толтырылғаннан кейін курс, модуль және алғашқы
                  сабақ бірге сақталады.
                </p>
              </div>
            </div>

            <Button
              className="w-full sm:w-auto"
              onClick={onCreateCourse}
              disabled={!canCreateCourse || creating}
            >
              <Plus size={15} className="mr-2" />
              {creating
                ? t('page.teacher_course_builder.action.saving')
                : t('page.teacher_course_builder.action.create_course')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}