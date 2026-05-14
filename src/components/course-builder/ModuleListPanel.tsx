import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  Layers3,
  Pencil,
  Plus,
  Trash2,
  Video,
  X,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
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

function LessonMetaPill({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/70 px-2.5 py-1 text-[11px] text-muted-foreground">
      {icon}
      <span>{children}</span>
    </span>
  );
}

function InlineDeleteConfirm({
  title,
  disabled,
  onConfirm,
  onCancel,
}: {
  title: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={disabled}
          onClick={onConfirm}
        >
          <Trash2 size={13} className="mr-2" />
          Өшіру
        </Button>

        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Болдырмау
        </Button>
      </div>
    </div>
  );
}

function ModuleTitleEditor({
  module,
  disabled,
  onUpdateModuleTitle,
}: {
  module: CourseBuilderModuleView;
  disabled: boolean;
  onUpdateModuleTitle: (moduleId: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(module.title);

  useEffect(() => {
    setTitle(module.title);
    setEditing(false);
  }, [module.id, module.title]);

  const trimmedTitle = title.trim();
  const changed = trimmedTitle.length > 0 && trimmedTitle !== module.title;

  const handleSave = () => {
    if (!changed) {
      setEditing(false);
      setTitle(module.title);
      return;
    }

    onUpdateModuleTitle(module.id, trimmedTitle);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {module.title}
        </p>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditing(true)}
          aria-label="Модуль атауын өзгерту"
        >
          <Pencil size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 gap-2">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') handleSave();
          if (event.key === 'Escape') {
            setTitle(module.title);
            setEditing(false);
          }
        }}
        className="font-semibold"
        autoFocus
      />

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={disabled || !changed}
        onClick={handleSave}
        aria-label="Модуль атауын сақтау"
      >
        <Check size={14} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          setTitle(module.title);
          setEditing(false);
        }}
        aria-label="Өзгертуді болдырмау"
      >
        <X size={14} />
      </Button>
    </div>
  );
}

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
  const [moduleDeleteId, setModuleDeleteId] = useState<string | null>(null);
  const [lessonDeleteId, setLessonDeleteId] = useState<string | null>(null);

  return (
    <Card id="modules-lessons" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold">
              {t('page.teacher_course_builder.section.modules_lessons')}
            </CardTitle>

            <StatusBadge tone="primary">
              <Layers3 size={12} />
              {selectedCourseModules.length} модуль
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {selectedCourseModules.length === 0 ? (
          <EmptyState
            title={t('page.teacher_course_builder.empty.modules_title')}
            text={t('page.teacher_course_builder.empty.modules_text')}
            compact
          />
        ) : (
          <div className="space-y-4">
            {selectedCourseModules.map((module, moduleIndex) => {
              const sortedLessons = getSortedBySortOrder(module.lessons || []);
              const moduleDeleteOpen = moduleDeleteId === module.id;

              return (
                <section
                  key={module.id}
                  className="overflow-hidden rounded-3xl border border-border bg-card"
                >
                  <div className="border-b border-border/70 bg-muted/25 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                          <Layers3 size={16} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <ModuleTitleEditor
                            module={module}
                            disabled={reorderModulesPending}
                            onUpdateModuleTitle={onUpdateModuleTitle}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="muted">#{module.sortOrder}</StatusBadge>

                        <StatusBadge tone="secondary">
                          <BookOpen size={12} />
                          {sortedLessons.length} сабақ
                        </StatusBadge>

                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={moduleIndex === 0 || reorderModulesPending}
                          onClick={() => onReorderModule(module.id, 'up')}
                          aria-label="Модульді жоғары жылжыту"
                        >
                          <ArrowUp size={14} />
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={
                            moduleIndex === selectedCourseModules.length - 1 ||
                            reorderModulesPending
                          }
                          onClick={() => onReorderModule(module.id, 'down')}
                          aria-label="Модульді төмен жылжыту"
                        >
                          <ArrowDown size={14} />
                        </Button>

                        <Button
                          type="button"
                          variant={moduleDeleteOpen ? 'outline' : 'destructive'}
                          size="icon-sm"
                          disabled={deleteModulePending}
                          onClick={() =>
                            setModuleDeleteId((current) =>
                              current === module.id ? null : module.id
                            )
                          }
                          aria-label="Модульді өшіру"
                        >
                          {moduleDeleteOpen ? <X size={14} /> : <Trash2 size={14} />}
                        </Button>
                      </div>
                    </div>

                    {moduleDeleteOpen ? (
                      <div className="mt-3">
                        <InlineDeleteConfirm
                          title="Модуль өшірілсін бе?"
                          disabled={deleteModulePending}
                          onConfirm={() => {
                            onDeleteModule(module.id);
                            setModuleDeleteId(null);
                          }}
                          onCancel={() => setModuleDeleteId(null)}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2 p-4">
                    {sortedLessons.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                        {t('page.teacher_course_builder.empty.lessons_inline')}
                      </div>
                    ) : (
                      sortedLessons.map((lesson, lessonIndex) => {
                        const lessonDeleteOpen = lessonDeleteId === lesson.id;

                        return (
                          <div
                            key={lesson.id}
                            className="rounded-3xl border border-border bg-card p-3 transition-colors hover:border-primary-muted hover:bg-primary-soft/30"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <button
                                type="button"
                                onClick={() => onStartEditLesson(lesson.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
                                    <FileText size={15} />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 text-sm font-semibold text-foreground">
                                      {lesson.title}
                                    </p>

                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      <StatusBadge
                                        tone={lesson.isPublished ? 'success' : 'completed'}
                                      >
                                        {lesson.isPublished ? (
                                          <CheckCircle2 size={12} />
                                        ) : (
                                          <FileText size={12} />
                                        )}
                                        {lesson.isPublished
                                          ? t(
                                              'page.teacher_course_builder.lesson_status.published'
                                            )
                                          : t(
                                              'page.teacher_course_builder.lesson_status.draft'
                                            )}
                                      </StatusBadge>

                                      <LessonMetaPill icon={<Layers3 size={11} />}>
                                        #{lesson.sortOrder}
                                      </LessonMetaPill>

                                      {lesson.mediaUrl ? (
                                        <LessonMetaPill icon={<Video size={11} />}>
                                          {t('page.teacher_course_builder.lesson_has_video')}
                                        </LessonMetaPill>
                                      ) : null}

                                      {lesson.attachmentsCount ? (
                                        <LessonMetaPill icon={<FileText size={11} />}>
                                          {lesson.attachmentsCount} файл
                                        </LessonMetaPill>
                                      ) : null}

                                      {lesson.hasMiniQuiz ? (
                                        <LessonMetaPill icon={<CheckCircle2 size={11} />}>
                                          Mini quiz
                                        </LessonMetaPill>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </button>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={lessonIndex === 0 || reorderLessonsPending}
                                  onClick={() =>
                                    onReorderLesson(module.id, lesson.id, 'up')
                                  }
                                  aria-label="Сабақты жоғары жылжыту"
                                >
                                  <ArrowUp size={14} />
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={
                                    lessonIndex === sortedLessons.length - 1 ||
                                    reorderLessonsPending
                                  }
                                  onClick={() =>
                                    onReorderLesson(module.id, lesson.id, 'down')
                                  }
                                  aria-label="Сабақты төмен жылжыту"
                                >
                                  <ArrowDown size={14} />
                                </Button>

                                <Button
                                  type="button"
                                  variant={lessonDeleteOpen ? 'outline' : 'destructive'}
                                  size="icon-sm"
                                  disabled={deleteLessonPending}
                                  onClick={() =>
                                    setLessonDeleteId((current) =>
                                      current === lesson.id ? null : lesson.id
                                    )
                                  }
                                  aria-label="Сабақты өшіру"
                                >
                                  {lessonDeleteOpen ? (
                                    <X size={14} />
                                  ) : (
                                    <Trash2 size={14} />
                                  )}
                                </Button>
                              </div>
                            </div>

                            {lessonDeleteOpen ? (
                              <div className="mt-3">
                                <InlineDeleteConfirm
                                  title="Сабақ өшірілсін бе?"
                                  disabled={deleteLessonPending}
                                  onConfirm={() => {
                                    onDeleteLesson({
                                      lessonId: lesson.id,
                                      moduleId: module.id,
                                      remainingIds: sortedLessons
                                        .filter((item) => item.id !== lesson.id)
                                        .map((item) => item.id),
                                    });
                                    setLessonDeleteId(null);
                                  }}
                                  onCancel={() => setLessonDeleteId(null)}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="rounded-3xl border border-dashed border-primary-muted bg-primary-soft/40 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-card text-primary">
              <Plus size={17} />
            </div>

            <p className="text-sm font-semibold text-foreground">
              Жаңа модуль
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {t('page.teacher_course_builder.field.new_module_title')}
              </Label>
              <Input
                value={moduleForm.title}
                onChange={(event) =>
                  setModuleForm({ title: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAddModule) {
                    onAddModule();
                  }
                }}
                placeholder={t('page.teacher_course_builder.placeholder.module_title')}
              />
            </div>

            <Button size="sm" onClick={onAddModule} disabled={!canAddModule}>
              <Plus size={14} className="mr-2" />
              {t('page.teacher_course_builder.action.add_module')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}