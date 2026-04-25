import type { Dispatch, SetStateAction } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/common/DataState';
import t from '@/lib/i18n';
import type { CourseBuilderModuleView } from '@/lib/app-data-types';
import { getSortedBySortOrder } from '@/lib/course-creator/course-builder-utils';

type ModuleFormState = {
  title: string;
};

type LessonReorderDirection = 'up' | 'down';

type ModuleListPanelProps = {
  selectedCourseModules: CourseBuilderModuleView[];
  moduleForm: ModuleFormState;
  setModuleForm: Dispatch<SetStateAction<ModuleFormState>>;
  canAddModule: boolean;

  reorderModulesPending: boolean;
  deleteModulePending: boolean;
  reorderLessonsPending: boolean;
  deleteLessonPending: boolean;

  onAddModule: () => void;
  onUpdateModuleTitle: (moduleId: string, title: string) => void;
  onReorderModule: (moduleId: string, direction: LessonReorderDirection) => void;
  onDeleteModule: (moduleId: string) => void;
  onStartEditLesson: (lessonId: string) => void;
  onReorderLesson: (
    moduleId: string,
    lessonId: string,
    direction: LessonReorderDirection
  ) => void;
  onDeleteLesson: (input: {
    lessonId: string;
    moduleId: string;
    remainingIds: string[];
  }) => void;
};

export function ModuleListPanel({
  selectedCourseModules,
  moduleForm,
  setModuleForm,
  canAddModule,
  reorderModulesPending,
  deleteModulePending,
  reorderLessonsPending,
  deleteLessonPending,
  onAddModule,
  onUpdateModuleTitle,
  onReorderModule,
  onDeleteModule,
  onStartEditLesson,
  onReorderLesson,
  onDeleteLesson,
}: ModuleListPanelProps) {
  return (
    <Card id="modules-lessons" className="scroll-mt-24">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              {t('page.teacher_course_builder.section.modules_lessons')}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Модульдер мен сабақтарды осы жерден басқарыңыз.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {selectedCourseModules.length === 0 ? (
          <EmptyState
            title={t('page.teacher_course_builder.empty.modules_title')}
            text={t('page.teacher_course_builder.empty.modules_text')}
          />
        ) : (
          selectedCourseModules.map((module, moduleIndex) => {
            const sortedLessons = getSortedBySortOrder(module.lessons || []);

            return (
              <div key={module.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <Input
                      key={`${module.id}:${module.title}`}
                      defaultValue={module.title}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value && value !== module.title) {
                          onUpdateModuleTitle(module.id, value);
                        }
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border px-2 py-1 text-[10px] text-muted-foreground">
                      #{module.sortOrder}
                    </span>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={moduleIndex === 0 || reorderModulesPending}
                      onClick={() => onReorderModule(module.id, 'up')}
                    >
                      <ArrowUp size={14} />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={
                        moduleIndex === selectedCourseModules.length - 1 ||
                        reorderModulesPending
                      }
                      onClick={() => onReorderModule(module.id, 'down')}
                    >
                      <ArrowDown size={14} />
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      disabled={deleteModulePending}
                      onClick={() => {
                        if (
                          window.confirm(
                            t('page.teacher_course_builder.confirm.delete_module')
                          )
                        ) {
                          onDeleteModule(module.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {sortedLessons.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('page.teacher_course_builder.empty.lessons_inline')}
                    </p>
                  ) : (
                    sortedLessons.map((lesson, lessonIndex) => (
                      <div
                        key={lesson.id}
                        className="rounded-lg border bg-muted/10 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => onStartEditLesson(lesson.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="text-sm font-medium">{lesson.title}</p>
                            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                              #{lesson.sortOrder} ·{' '}
                              {lesson.isPublished
                                ? t(
                                    'page.teacher_course_builder.lesson_status.published'
                                  )
                                : t('page.teacher_course_builder.lesson_status.draft')}
                              {lesson.mediaUrl
                                ? ` · ${t(
                                    'page.teacher_course_builder.lesson_has_video'
                                  )}`
                                : ''}
                              {lesson.attachmentsCount
                                ? ` · ${lesson.attachmentsCount} файл`
                                : ''}
                              {lesson.hasMiniQuiz ? ' · Mini quiz' : ''}
                            </p>
                          </button>

                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              disabled={lessonIndex === 0 || reorderLessonsPending}
                              onClick={() =>
                                onReorderLesson(module.id, lesson.id, 'up')
                              }
                            >
                              <ArrowUp size={14} />
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              disabled={
                                lessonIndex === sortedLessons.length - 1 ||
                                reorderLessonsPending
                              }
                              onClick={() =>
                                onReorderLesson(module.id, lesson.id, 'down')
                              }
                            >
                              <ArrowDown size={14} />
                            </Button>

                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              disabled={deleteLessonPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    t(
                                      'page.teacher_course_builder.confirm.delete_lesson'
                                    )
                                  )
                                ) {
                                  onDeleteLesson({
                                    lessonId: lesson.id,
                                    moduleId: module.id,
                                    remainingIds: sortedLessons
                                      .filter((item) => item.id !== lesson.id)
                                      .map((item) => item.id),
                                  });
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className="space-y-3 rounded-xl border border-dashed p-4">
          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.new_module_title')}</Label>
            <Input
              value={moduleForm.title}
              onChange={(event) =>
                setModuleForm({ title: event.target.value })
              }
              placeholder={t('page.teacher_course_builder.placeholder.module_title')}
            />
          </div>

          <Button size="sm" onClick={onAddModule} disabled={!canAddModule}>
            {t('page.teacher_course_builder.action.add_module')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
