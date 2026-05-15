import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Save, X } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import t from '@/lib/i18n';
import type { CourseBuilderModuleView } from '@/lib/app-data-types';
import { normalizeMediaUrl } from '@/lib/media-url';

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

  const handleModuleChange = (moduleId: string) => {
    setLessonForm((previous) => ({
      ...previous,
      moduleId,
      sortOrder: getNextLessonSortOrder(moduleId),
    }));
  };

  const handleTitleChange = (title: string) => {
    setLessonForm((previous) => ({
      ...previous,
      title,
    }));
  };

  const handleSortOrderChange = (sortOrder: string) => {
    setLessonForm((previous) => ({
      ...previous,
      sortOrder,
    }));
  };

  const handleContentChange = (contentBody: string) => {
    setLessonForm((previous) => ({
      ...previous,
      contentBody,
    }));
  };

  const handlePracticeChange = (practiceContent: string) => {
    setLessonForm((previous) => ({
      ...previous,
      practiceContent,
    }));
  };

  const handleMediaUrlChange = (mediaUrl: string) => {
    setLessonForm((previous) => ({
      ...previous,
      mediaUrl,
    }));
  };

  const handleMediaUrlBlur = (mediaUrl: string) => {
    setLessonForm((previous) => ({
      ...previous,
      mediaUrl: normalizeMediaUrl(mediaUrl),
    }));
  };

  const handlePublishedChange = (isPublished: boolean) => {
    setLessonForm((previous) => ({
      ...previous,
      isPublished,
    }));
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {isEditing
              ? t('page.teacher_course_builder.section.edit_lesson')
              : t('page.teacher_course_builder.section.new_lesson')}
          </CardTitle>

          <div className="flex items-center gap-2">
            <StatusBadge tone={isEditing ? 'primary' : 'secondary'}>
              {isEditing ? 'Өңдеу' : 'Жаңа'}
            </StatusBadge>

            <StatusBadge tone={lessonForm.isPublished ? 'success' : 'muted'}>
              {lessonForm.isPublished
                ? t('page.teacher_course_builder.lesson_status.published')
                : t('page.teacher_course_builder.lesson_status.draft')}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
          <FieldBlock
            label={t('page.teacher_course_builder.field.module')}
            required
          >
            <select
              value={lessonForm.moduleId}
              onChange={(event) => handleModuleChange(event.target.value)}
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

          <FieldBlock
            label={t('page.teacher_course_builder.field.sort_order')}
            required
          >
            <Input
              type="number"
              min={1}
              value={lessonForm.sortOrder}
              onChange={(event) => handleSortOrderChange(event.target.value)}
            />
          </FieldBlock>
        </div>

        <FieldBlock
          label={t('page.teacher_course_builder.field.lesson_title')}
          required
        >
          <Input
            value={lessonForm.title}
            onChange={(event) => handleTitleChange(event.target.value)}
            placeholder="Сабақ атауы"
          />
        </FieldBlock>

        <FieldBlock label={t('page.teacher_course_builder.field.theory')}>
          <Textarea
            rows={7}
            value={lessonForm.contentBody}
            onChange={(event) => handleContentChange(event.target.value)}
            placeholder="Теория"
          />
        </FieldBlock>

        <FieldBlock label={t('page.teacher_course_builder.field.practice')}>
          <Textarea
            rows={4}
            value={lessonForm.practiceContent}
            onChange={(event) => handlePracticeChange(event.target.value)}
            placeholder="Практика"
          />
        </FieldBlock>

        <FieldBlock label={t('page.teacher_course_builder.field.video_url')}>
          <Input
            value={lessonForm.mediaUrl}
            onChange={(event) => handleMediaUrlChange(event.target.value)}
            onBlur={(event) => handleMediaUrlBlur(event.target.value)}
            placeholder="https://youtube.com/..."
          />
        </FieldBlock>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/30 px-4 py-3">
          <Label
            htmlFor="lesson-published"
            className="text-sm font-semibold text-foreground"
          >
            {t('page.teacher_course_builder.field.lesson_published')}
          </Label>

          <Switch
            id="lesson-published"
            checked={lessonForm.isPublished}
            onCheckedChange={handlePublishedChange}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
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