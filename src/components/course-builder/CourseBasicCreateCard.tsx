import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { BookOpen, Plus } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
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
import t from '@/lib/i18n';
import { removeNullCharacters } from '@/lib/utils';

type NewCourseForm = {
  title: string;
  description: string;
  subjectId: string;
  thumbnailUrl: string;
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
  userId: string;
  newCourse: NewCourseForm;
  setNewCourse: Dispatch<SetStateAction<NewCourseForm>>;
  subjectOptions: SubjectRow[];
  canCreateCourse: boolean;
  creating: boolean;
  onCreateCourse: () => void;
};

const MAX_TITLE_CHARS = 180;
const MAX_DESCRIPTION_CHARS = 1_200;
const DEFAULT_MODULE_TITLE = 'Кіріспе';
const DEFAULT_LESSON_TITLE = 'Курсқа кіріспе';

function sanitizeInputValue(value: string, limit: number): string {
  return removeNullCharacters(value).slice(0, limit);
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
  userId,
  newCourse,
  setNewCourse,
  subjectOptions,
  canCreateCourse,
  creating,
  onCreateCourse,
}: CourseBasicCreateCardProps) {
  const [thumbnailUploading, setThumbnailUploading] = useState(false);

  const basicsComplete =
    newCourse.title.trim().length > 0 &&
    newCourse.description.trim().length > 0 &&
    newCourse.subjectId.trim().length > 0;

  const createButtonDisabled =
    creating || thumbnailUploading || !basicsComplete || !canCreateCourse;

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

  const handleCreateClick = () => {
    if (createButtonDisabled) return;

    setNewCourse((previous) => ensureInitialCourseStructure(previous));
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
            {canCreateCourse ? 'Дайын' : 'Толтырыңыз'}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <CompactSection
          title="Негізгі ақпарат"
          icon={<BookOpen size={16} />}
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
                value={newCourse.title}
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

            <FieldBlock label="Курс сипаттамасы" required>
              <Textarea
                rows={3}
                value={newCourse.description}
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
                placeholder="Курстың қысқаша мазмұны мен мақсаты"
              />
            </FieldBlock>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldBlock
                label={t('page.teacher_course_builder.field.subject')}
                required
              >
                <select
                  value={newCourse.subjectId}
                  onChange={(event) =>
                    updateCourseField('subjectId', event.target.value)
                  }
                  className="input-shell"
                >
                  <option value="">Пәнді таңдаңыз</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name_kk}
                    </option>
                  ))}
                </select>
              </FieldBlock>

              <FieldBlock
                label={t('page.teacher_course_builder.field.thumbnail')}
              >
                <CourseThumbnailUploader
                  userId={userId}
                  value={newCourse.thumbnailUrl}
                  onChange={(url) => updateCourseField('thumbnailUrl', url)}
                  onUploadingChange={setThumbnailUploading}
                  disabled={creating}
                />
              </FieldBlock>
            </div>
          </div>
        </CompactSection>

        <Button
          type="button"
          className="w-full"
          disabled={createButtonDisabled}
          onClick={handleCreateClick}
        >
          <Plus size={15} className="mr-2" />
          {creating
            ? 'Құрылуда...'
            : thumbnailUploading
              ? 'Сурет жүктелуде...'
              : t('page.teacher_course_builder.action.create_course')}
        </Button>
      </CardContent>
    </Card>
  );
}
