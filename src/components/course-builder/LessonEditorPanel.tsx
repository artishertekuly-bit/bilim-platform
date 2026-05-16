import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { CourseBuilderModuleView } from '@/lib/app-data-types';
import t from '@/lib/i18n';
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

const MAX_TITLE_CHARS = 180;
const MAX_THEORY_CHARS = 20_000;
const MAX_PRACTICE_CHARS = 10_000;
const MAX_MEDIA_URL_CHARS = 700;
const MAX_SORT_ORDER_CHARS = 4;

function cleanText(value: string, limit: number) {
  return value.replace(/\x00/g, ' ').slice(0, limit);
}

function normalizeSortOrderInput(value: string) {
  return value.replace(/[^\d]/g, '').slice(0, MAX_SORT_ORDER_CHARS);
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
  const hasModules = selectedCourseModules.length > 0;
  const titleReady = lessonForm.title.trim().length > 0;
  const moduleReady = lessonForm.moduleId.trim().length > 0;

  const updateLessonField = <K extends keyof LessonFormState>(
    key: K,
    value: LessonFormState[K],
  ) => {
    setLessonForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleModuleChange = (moduleId: string) => {
    setLessonForm((previous) => ({
      ...previous,
      moduleId,
      sortOrder: getNextLessonSortOrder(moduleId),
    }));
  };

  const handleMediaUrlBlur = (mediaUrl: string) => {
    updateLessonField(
      'mediaUrl',
      cleanText(normalizeMediaUrl(mediaUrl) || '', MAX_MEDIA_URL_CHARS),
    );
  };

  return (
    <Card id="lesson-editor" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {isEditing
              ? t('page.teacher_course_builder.section.edit_lesson')
              : t('page.teacher_course_builder.section.new_lesson')}
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
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
        {!hasModules ? (
          <EmptyState
            title="Модуль жоқ"
            text="Сабақ қосу үшін алдымен курсқа кемінде бір модуль қосыңыз."
            compact
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
          <FieldBlock
            label={t('page.teacher_course_builder.field.module')}
            required
          >
            <select
              value={lessonForm.moduleId}
              onChange={(event) => handleModuleChange(event.target.value)}
              disabled={!hasModules}
              className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
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
              type="text"
              inputMode="numeric"
              value={lessonForm.sortOrder}
              onChange={(event) =>
                updateLessonField(
                  'sortOrder',
                  normalizeSortOrderInput(event.target.value),
                )
              }
              placeholder="1"
            />
          </FieldBlock>
        </div>

        <FieldBlock
          label={t('page.teacher_course_builder.field.lesson_title')}
          required
        >
          <Input
            value={lessonForm.title}
            maxLength={MAX_TITLE_CHARS}
            onChange={(event) =>
              updateLessonField(
                'title',
                cleanText(event.target.value, MAX_TITLE_CHARS),
              )
            }
            placeholder="Сабақ атауы"
          />
        </FieldBlock>

        <FieldBlock label={t('page.teacher_course_builder.field.theory')}>
          <Textarea
            rows={7}
            value={lessonForm.contentBody}
            maxLength={MAX_THEORY_CHARS}
            onChange={(event) =>
              updateLessonField(
                'contentBody',
                cleanText(event.target.value, MAX_THEORY_CHARS),
              )
            }
            placeholder="Теория"
          />

          <p className="text-[11px] text-muted-foreground">
            {lessonForm.contentBody.length}/{MAX_THEORY_CHARS}
          </p>
        </FieldBlock>

        <FieldBlock label={t('page.teacher_course_builder.field.practice')}>
          <Textarea
            rows={4}
            value={lessonForm.practiceContent}
            maxLength={MAX_PRACTICE_CHARS}
            onChange={(event) =>
              updateLessonField(
                'practiceContent',
                cleanText(event.target.value, MAX_PRACTICE_CHARS),
              )
            }
            placeholder="Практика"
          />

          <p className="text-[11px] text-muted-foreground">
            {lessonForm.practiceContent.length}/{MAX_PRACTICE_CHARS}
          </p>
        </FieldBlock>

        <FieldBlock label={t('page.teacher_course_builder.field.video_url')}>
          <Input
            value={lessonForm.mediaUrl}
            maxLength={MAX_MEDIA_URL_CHARS}
            onChange={(event) =>
              updateLessonField(
                'mediaUrl',
                cleanText(event.target.value, MAX_MEDIA_URL_CHARS),
              )
            }
            onBlur={(event) => handleMediaUrlBlur(event.target.value)}
            placeholder="https://youtube.com/..."
          />
        </FieldBlock>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/30 px-4 py-3">
          <div>
            <Label
              htmlFor="lesson-published"
              className="text-sm font-semibold text-foreground"
            >
              {t('page.teacher_course_builder.field.lesson_published')}
            </Label>

            {!titleReady || !moduleReady ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle size={12} />
                Жариялау үшін модуль мен сабақ атауы қажет.
              </p>
            ) : null}
          </div>

          <Switch
            id="lesson-published"
            checked={lessonForm.isPublished}
            onCheckedChange={(checked) => updateLessonField('isPublished', checked)}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={onSaveLesson}
            disabled={!canSaveLesson || !hasModules}
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