import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  BookOpen,
  FileText,
  ListOrdered,
  PlayCircle,
  Save,
  ToggleRight,
  X,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import t from '@/lib/i18n';
import { normalizeMediaUrl } from '@/lib/media-url';
import type { CourseBuilderModuleView } from '@/lib/app-data-types';

type LessonFormState = {
  moduleId: string;
  title: string;
  contentBody: string;
  practiceContent: string;
  mediaUrl: string;
  sortOrder: string;
  isPublished: boolean;
};

type LessonEditorPanelProps = {
  editingLessonId: string | null;
  lessonForm: LessonFormState;
  setLessonForm: Dispatch<SetStateAction<LessonFormState>>;
  selectedCourseModules: CourseBuilderModuleView[];
  getNextLessonSortOrder: (moduleId?: string) => string;
  canSaveLesson: boolean;
  onSaveLesson: () => void;
  onResetLessonForm: () => void;
};

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

function EditorSection({
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

export function LessonEditorPanel({
  editingLessonId,
  lessonForm,
  setLessonForm,
  selectedCourseModules,
  getNextLessonSortOrder,
  canSaveLesson,
  onSaveLesson,
  onResetLessonForm,
}: LessonEditorPanelProps) {
  const isEditing = Boolean(editingLessonId);

  const basicsComplete =
    lessonForm.moduleId.trim().length > 0 &&
    lessonForm.title.trim().length > 0 &&
    lessonForm.sortOrder.trim().length > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold">
              {isEditing
                ? t('page.teacher_course_builder.section.edit_lesson')
                : t('page.teacher_course_builder.section.new_lesson')}
            </CardTitle>

            <StatusBadge tone={isEditing ? 'primary' : 'secondary'}>
              {isEditing ? 'Өңдеу' : 'Жаңа'}
            </StatusBadge>

            <StatusBadge tone={lessonForm.isPublished ? 'success' : 'completed'}>
              <ToggleRight size={12} />
              {lessonForm.isPublished
                ? t('page.teacher_course_builder.lesson_status.published')
                : t('page.teacher_course_builder.lesson_status.draft')}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <EditorSection
          title="Сабақ орны"
          icon={<ListOrdered size={17} />}
          aside={
            <StatusBadge tone={basicsComplete ? 'success' : 'muted'}>
              {basicsComplete ? 'Толды' : 'Міндетті'}
            </StatusBadge>
          }
        >
          <FieldBlock
            label={t('page.teacher_course_builder.field.module')}
            required
          >
            <select
              value={lessonForm.moduleId}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  moduleId: event.target.value,
                  sortOrder: getNextLessonSortOrder(event.target.value),
                }))
              }
              className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
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
          </FieldBlock>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
            <FieldBlock
              label={t('page.teacher_course_builder.field.lesson_title')}
              required
            >
              <Input
                value={lessonForm.title}
                onChange={(event) =>
                  setLessonForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                placeholder={t('page.teacher_course_builder.placeholder.lesson_title')}
              />
            </FieldBlock>

            <FieldBlock
              label={t('page.teacher_course_builder.field.sort_order')}
              required
            >
              <Input
                type="number"
                min={1}
                value={lessonForm.sortOrder}
                onChange={(event) =>
                  setLessonForm((previous) => ({
                    ...previous,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </FieldBlock>
          </div>
        </EditorSection>

        <EditorSection
          title="Оқу материалы"
          icon={<BookOpen size={17} />}
        >
          <FieldBlock label={t('page.teacher_course_builder.field.theory')}>
            <Textarea
              rows={7}
              value={lessonForm.contentBody}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  contentBody: event.target.value,
                }))
              }
              placeholder="Теория"
            />
          </FieldBlock>

          <FieldBlock label={t('page.teacher_course_builder.field.practice')}>
            <Textarea
              rows={4}
              value={lessonForm.practiceContent}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  practiceContent: event.target.value,
                }))
              }
              placeholder="Практика"
            />
          </FieldBlock>
        </EditorSection>

        <EditorSection
          title="Медиа және күй"
          icon={<PlayCircle size={17} />}
        >
          <FieldBlock label={t('page.teacher_course_builder.field.video_url')}>
            <Input
              value={lessonForm.mediaUrl}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  mediaUrl: event.target.value,
                }))
              }
              onBlur={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  mediaUrl: normalizeMediaUrl(event.target.value),
                }))
              }
              placeholder="https://youtube.com/..."
            />
          </FieldBlock>

          <div
            className={`rounded-3xl border p-4 transition-colors ${
              lessonForm.isPublished
                ? 'border-success-muted bg-success-soft/70'
                : 'border-border bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                    lessonForm.isPublished
                      ? 'border-success-muted bg-card text-success-foreground'
                      : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  <FileText size={17} />
                </div>

                <Label
                  htmlFor="lesson-published"
                  className="text-sm font-semibold text-foreground"
                >
                  {t('page.teacher_course_builder.field.lesson_published')}
                </Label>
              </div>

              <Switch
                id="lesson-published"
                checked={lessonForm.isPublished}
                onCheckedChange={(checked) =>
                  setLessonForm((previous) => ({
                    ...previous,
                    isPublished: checked,
                  }))
                }
              />
            </div>
          </div>
        </EditorSection>

        <div className="flex flex-col gap-2 rounded-3xl border border-primary-muted bg-primary-soft/60 p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={onSaveLesson}
            disabled={!canSaveLesson}
            className="w-full sm:w-auto"
          >
            <Save size={15} className="mr-2" />
            {isEditing
              ? t('page.teacher_course_builder.action.update_lesson')
              : t('page.teacher_course_builder.action.add_lesson')}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onResetLessonForm}
            className="w-full sm:w-auto"
          >
            <X size={15} className="mr-2" />
            {isEditing
              ? t('page.teacher_course_builder.action.clear_form')
              : 'Болдырмау'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}