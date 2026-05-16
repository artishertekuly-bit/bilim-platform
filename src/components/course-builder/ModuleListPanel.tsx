import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
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

import { EmptyState } from '@/components/common/DataState';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CourseBuilderModuleView } from '@/lib/app-data-types';
import { getSortedBySortOrder } from '@/lib/course-creator/course-builder-utils';
import t from '@/lib/i18n';
import { removeNullCharacters } from '@/lib/utils';

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
    direction: LessonReorderDirection,
  ) => void;
  onDeleteLesson: (input: {
    lessonId: string;
    moduleId: string;
    remainingIds: string[];
  }) => void;
};

const MAX_MODULE_TITLE_CHARS = 180;

function cleanTitle(value: string): string {
  return removeNullCharacters(value).slice(0, MAX_MODULE_TITLE_CHARS);
}

function getRemainingLessonIds(
  lessons: CourseBuilderModuleView['lessons'],
  deletedLessonId: string,
): string[] {
  return getSortedBySortOrder(lessons || [])
    .filter((lesson) => lesson.id !== deletedLessonId)
    .map((lesson) => lesson.id);
}

function LessonMetaPill({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-muted/55 px-2.5 py-1 text-[11px] text-muted-foreground">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

function InlineDeleteConfirm({
  title,
  text,
  disabled,
  onConfirm,
  onCancel,
}: {
  title: string;
  text?: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>

      {text ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
      ) : null}

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
          disabled={disabled}
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
        maxLength={MAX_MODULE_TITLE_CHARS}
        onChange={(event) => setTitle(cleanTitle(event.target.value))}
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

  const modulesPending = reorderModulesPending || deleteModulePending;
  const lessonsPending = reorderLessonsPending || deleteLessonPending;

  const handleModuleTitleChange = (value: string) => {
    setModuleForm({
      title: cleanTitle(value),
    });
  };

  const handleOpenModuleDelete = (moduleId: string) => {
    setLessonDeleteId(null);
    setModuleDeleteId((current) => (current === moduleId ? null : moduleId));
  };

  const handleOpenLessonDelete = (lessonId: string) => {
    setModuleDeleteId(null);
    setLessonDeleteId((current) => (current === lessonId ? null : lessonId));
  };

  return (
    <Card id="modules-lessons" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {t('page.teacher_course_builder.section.modules_lessons')}
          </CardTitle>

          <StatusBadge tone="primary">
            <Layers3 size={12} />
            {selectedCourseModules.length}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {selectedCourseModules.length === 0 ? (
          <EmptyState title="Модуль жоқ" text="Алдымен модуль қосыңыз." compact />
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
                  <div className="border-b border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                          <Layers3 size={16} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <ModuleTitleEditor
                            module={module}
                            disabled={modulesPending}
                            onUpdateModuleTitle={onUpdateModuleTitle}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="muted">#{module.sortOrder}</StatusBadge>

                        <StatusBadge tone="secondary">
                          <BookOpen size={12} />
                          {sortedLessons.length}
                        </StatusBadge>

                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={moduleIndex === 0 || modulesPending}
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
                            modulesPending
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
                          onClick={() => handleOpenModuleDelete(module.id)}
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
                          text={
                            sortedLessons.length > 0
                              ? 'Ішіндегі сабақтар да өшеді.'
                              : undefined
                          }
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
                      <div className="rounded-3xl border border-dashed border-border bg-muted/25 p-4 text-xs text-muted-foreground">
                        Сабақ жоқ.
                      </div>
                    ) : (
                      sortedLessons.map((lesson, lessonIndex) => {
                        const lessonDeleteOpen = lessonDeleteId === lesson.id;

                        return (
                          <div
                            key={lesson.id}
                            className="rounded-3xl border border-border bg-card p-3 transition-colors hover:border-primary-muted hover:bg-primary-soft/20"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/35 text-muted-foreground">
                                    <FileText size={15} />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 text-sm font-semibold text-foreground">
                                      {lesson.title}
                                    </p>

                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      <StatusBadge
                                        tone={lesson.isPublished ? 'success' : 'muted'}
                                      >
                                        {lesson.isPublished ? (
                                          <CheckCircle2 size={12} />
                                        ) : (
                                          <FileText size={12} />
                                        )}
                                        {lesson.isPublished
                                          ? t(
                                              'page.teacher_course_builder.lesson_status.published',
                                            )
                                          : t(
                                              'page.teacher_course_builder.lesson_status.draft',
                                            )}
                                      </StatusBadge>

                                      <LessonMetaPill icon={<Layers3 size={11} />}>
                                        #{lesson.sortOrder}
                                      </LessonMetaPill>

                                      {lesson.mediaUrl ? (
                                        <LessonMetaPill icon={<Video size={11} />}>
                                          Видео
                                        </LessonMetaPill>
                                      ) : null}

                                      {lesson.attachmentsCount ? (
                                        <LessonMetaPill icon={<FileText size={11} />}>
                                          {lesson.attachmentsCount} файл
                                        </LessonMetaPill>
                                      ) : null}

                                      {lesson.hasMiniQuiz ? (
                                        <LessonMetaPill icon={<CheckCircle2 size={11} />}>
                                          Тест
                                        </LessonMetaPill>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={lessonsPending}
                                  onClick={() => onStartEditLesson(lesson.id)}
                                  aria-label="Сабақты өңдеу"
                                >
                                  <Pencil size={14} />
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={lessonIndex === 0 || lessonsPending}
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
                                    lessonsPending
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
                                  onClick={() => handleOpenLessonDelete(lesson.id)}
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
                                      remainingIds: getRemainingLessonIds(
                                        sortedLessons,
                                        lesson.id,
                                      ),
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

        <div className="rounded-3xl border border-dashed border-primary-muted bg-primary-soft/35 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-card text-primary">
              <Plus size={17} />
            </div>

            <p className="text-sm font-semibold text-foreground">Жаңа модуль</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {t('page.teacher_course_builder.field.new_module_title')}
              </Label>

              <Input
                value={moduleForm.title}
                maxLength={MAX_MODULE_TITLE_CHARS}
                onChange={(event) => handleModuleTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAddModule) {
                    onAddModule();
                  }
                }}
                placeholder={t('page.teacher_course_builder.placeholder.module_title')}
              />
            </div>

            <Button type="button" size="sm" onClick={onAddModule} disabled={!canAddModule}>
              <Plus size={14} className="mr-2" />
              {t('page.teacher_course_builder.action.add_module')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}