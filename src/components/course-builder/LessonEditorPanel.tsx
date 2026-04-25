import type { Dispatch, SetStateAction } from 'react';

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
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">
          {editingLessonId
            ? t('page.teacher_course_builder.section.edit_lesson')
            : t('page.teacher_course_builder.section.new_lesson')}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.module')}</Label>
          <select
            value={lessonForm.moduleId}
            onChange={(event) =>
              setLessonForm((previous) => ({
                ...previous,
                moduleId: event.target.value,
                sortOrder: getNextLessonSortOrder(event.target.value),
              }))
            }
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.lesson_title')}</Label>
            <Input
              value={lessonForm.title}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  title: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.sort_order')}</Label>
            <Input
              type="number"
              value={lessonForm.sortOrder}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  sortOrder: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.theory')}</Label>
          <Textarea
            rows={5}
            value={lessonForm.contentBody}
            onChange={(event) =>
              setLessonForm((previous) => ({
                ...previous,
                contentBody: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.practice')}</Label>
          <Textarea
            rows={4}
            value={lessonForm.practiceContent}
            onChange={(event) =>
              setLessonForm((previous) => ({
                ...previous,
                practiceContent: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.video_url')}</Label>
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
        </div>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <Label htmlFor="lesson-published">
            {t('page.teacher_course_builder.field.lesson_published')}
          </Label>
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

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onSaveLesson} disabled={!canSaveLesson}>
            {editingLessonId
              ? t('page.teacher_course_builder.action.update_lesson')
              : t('page.teacher_course_builder.action.add_lesson')}
          </Button>

          {editingLessonId ? (
            <Button variant="outline" onClick={onResetLessonForm}>
              {t('page.teacher_course_builder.action.clear_form')}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
