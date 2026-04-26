import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  BookOpen,
  FileText,
  ListOrdered,
  PlayCircle,
  Save,
  Sparkles,
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

function EditorSection({
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

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base font-semibold">
                {isEditing
                  ? t('page.teacher_course_builder.section.edit_lesson')
                  : t('page.teacher_course_builder.section.new_lesson')}
              </CardTitle>

              <StatusBadge tone={isEditing ? 'primary' : 'secondary'}>
                {isEditing ? <Save size={12} /> : <Sparkles size={12} />}
                {isEditing ? 'Өңдеу режимі' : 'Жаңа сабақ'}
              </StatusBadge>

              <StatusBadge tone={lessonForm.isPublished ? 'success' : 'completed'}>
                <ToggleRight size={12} />
                {lessonForm.isPublished
                  ? t('page.teacher_course_builder.lesson_status.published')
                  : t('page.teacher_course_builder.lesson_status.draft')}
              </StatusBadge>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Сабақтың теориясын, практикалық тапсырмасын, видео URL және
              жариялану күйін осы жерден басқарыңыз.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <EditorSection
          title="Сабақ орны"
          description="Сабақты қай модульге қосатыныңызды және ретін таңдаңыз."
          icon={<ListOrdered size={17} />}
        >
          <FieldBlock label={t('page.teacher_course_builder.field.module')}>
            <select
              value={lessonForm.moduleId}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  moduleId: event.target.value,
                  sortOrder: getNextLessonSortOrder(event.target.value),
                }))
              }
              className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
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
            <FieldBlock label={t('page.teacher_course_builder.field.lesson_title')}>
              <Input
                value={lessonForm.title}
                onChange={(event) =>
                  setLessonForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
              />
            </FieldBlock>

            <FieldBlock
              label={t('page.teacher_course_builder.field.sort_order')}
              hint="Рет саны roadmap ішінде қолданылады."
            >
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
            </FieldBlock>
          </div>
        </EditorSection>

        <EditorSection
          title="Оқу материалы"
          description="Теория және практика оқушының сабақ оқу бетінде көрсетіледі."
          icon={<BookOpen size={17} />}
        >
          <FieldBlock label={t('page.teacher_course_builder.field.theory')}>
            <Textarea
              rows={6}
              value={lessonForm.contentBody}
              onChange={(event) =>
                setLessonForm((previous) => ({
                  ...previous,
                  contentBody: event.target.value,
                }))
              }
              placeholder="Сабақтың негізгі түсіндірмесін жазыңыз..."
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
              placeholder="Оқушы орындайтын тапсырма немесе бекіту сұрақтарын жазыңыз..."
            />
          </FieldBlock>
        </EditorSection>

        <EditorSection
          title="Медиа және жариялау"
          description="Видео URL қосып, сабақ оқушыға көріне ме — соны белгілеңіз."
          icon={<PlayCircle size={17} />}
        >
          <FieldBlock
            label={t('page.teacher_course_builder.field.video_url')}
            hint="YouTube немесе сыртқы video URL енгізуге болады. Blur кезінде URL normalize болады."
          >
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
            className={`rounded-3xl border p-4 transition-all duration-200 ease-soft ${
              lessonForm.isPublished
                ? 'border-success-muted bg-success-soft/70'
                : 'border-border bg-card/75'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${
                    lessonForm.isPublished
                      ? 'border-success-muted bg-card text-success-foreground'
                      : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  <FileText size={17} />
                </div>

                <div className="min-w-0">
                  <Label
                    htmlFor="lesson-published"
                    className="text-sm font-semibold text-foreground"
                  >
                    {t('page.teacher_course_builder.field.lesson_published')}
                  </Label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Жарияланған сабақ оқушыға course roadmap ішінде көрінеді.
                    Draft сабақ мұғалімге ғана өңдеу үшін қалады.
                  </p>
                </div>
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

        <div className="rounded-3xl border border-primary-muted bg-primary-soft/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isEditing ? 'Сабақты жаңарту' : 'Сабақты қосу'}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Міндетті өрістер толтырылғаннан кейін сабақ курс құрылымына
                сақталады.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
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

              {isEditing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onResetLessonForm}
                  className="w-full sm:w-auto"
                >
                  <X size={15} className="mr-2" />
                  {t('page.teacher_course_builder.action.clear_form')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}