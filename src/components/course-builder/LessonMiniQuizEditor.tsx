import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';

import { EmptyState, LoadingState } from '@/components/common/DataState';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  CourseBuilderLessonView,
  LessonMiniQuizQuestionType,
  LessonMiniQuizQuestionView,
  LessonMiniQuizView,
} from '@/lib/app-data-types';
import {
  getMiniQuizQuestionTypeLabel,
} from '@/lib/course-creator/mini-quiz-utils';
import { LessonQuestionEditorOverlay } from '@/components/course-builder/LessonQuestionEditorOverlay';
import { cn, removeNullCharacters } from '@/lib/utils';

export type MiniQuizFormState = {
  title: string;
  description: string;
  passingScore: string;
  isPublished: boolean;
};

export type MiniQuizQuestionFormState = {
  questionText: string;
  questionType: LessonMiniQuizQuestionType;
  options: string[];
  correctAnswer: number[];
  explanation: string;
  sortOrder: string;
};

const MAX_QUIZ_TITLE_CHARS = 180;
const MAX_QUIZ_DESCRIPTION_CHARS = 700;

function sanitizeInputValue(value: string, limit: number): string {
  return removeNullCharacters(value).slice(0, limit);
}

function normalizePercentInput(value: string): string {
  const normalized = removeNullCharacters(value).replace(/[^\d]/g, '').slice(0, 3);

  if (!normalized) return '';

  return String(Math.min(100, Math.max(0, Number(normalized))));
}

function getVisibleQuizStatus(quiz: LessonMiniQuizView | null): string {
  if (!quiz) return 'Қосылмаған';
  if (quiz.isPublished) return 'Жарияланған';

  return 'Жоба';
}

function getQuestionCount(quiz: LessonMiniQuizView | null): number {
  return quiz?.questionsCount ?? quiz?.questions?.length ?? 0;
}

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
    <section className="rounded-3xl bg-card shadow-xs p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>

          <p className="min-w-0 text-sm font-semibold text-foreground">{title}</p>
        </div>

        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>

      <div className="space-y-4">{children}</div>
    </section>
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
    <div className="rounded-2xl bg-destructive/10 p-3 shadow-xs">
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

function MiniQuizQuestionCard({
  question,
  index,
  total,
  onEdit,
  onDelete,
  onMove,
  disabled,
  deleteConfirmOpen,
  onToggleDeleteConfirm,
  onCancelDeleteConfirm,
}: {
  question: LessonMiniQuizQuestionView;
  index: number;
  total: number;
  onEdit: (question: LessonMiniQuizQuestionView) => void;
  onDelete: (question: LessonMiniQuizQuestionView) => void;
  onMove: (questionId: string, direction: 'up' | 'down') => void;
  disabled: boolean;
  deleteConfirmOpen: boolean;
  onToggleDeleteConfirm: () => void;
  onCancelDeleteConfirm: () => void;
}) {
  return (
    <div className="rounded-2xl bg-muted/30 p-4 text-sm shadow-xs transition-colors hover:bg-muted/40">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="muted">#{question.sortOrder}</StatusBadge>

            <StatusBadge
              tone={question.questionType === 'multiple_choice' ? 'warning' : 'primary'}
            >
              {getMiniQuizQuestionTypeLabel(question.questionType)}
            </StatusBadge>
          </div>

          <p className="font-semibold leading-6 text-foreground">
            {question.questionText}
          </p>

          <div className="mt-3 space-y-2">
            {question.options.map((option, optionIndex) => {
              const isCorrect = question.correctAnswer.includes(optionIndex);

              return (
                <div
                  key={`${question.id}-${optionIndex}`}
                  className={cn(
                    'rounded-xl px-3 py-2 text-xs shadow-xs',
                    isCorrect
                      ? 'bg-success-soft text-success-foreground font-medium'
                      : 'bg-card text-muted-foreground',
                  )}
                >
                  <span className="font-semibold">
                    {String.fromCharCode(65 + optionIndex)}.
                  </span>{' '}
                  <span>{option}</span>
                  {isCorrect ? (
                    <span className="ml-2 inline-flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={11} />
                      Дұрыс
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {question.explanation ? (
            <p className="mt-3 whitespace-pre-line rounded-xl bg-card p-3 text-xs leading-5 text-muted-foreground shadow-xs">
              {question.explanation}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={index === 0 || disabled}
            onClick={() => onMove(question.id, 'up')}
            aria-label="Сұрақты жоғары жылжыту"
          >
            <ArrowUp size={13} />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={index === total - 1 || disabled}
            onClick={() => onMove(question.id, 'down')}
            aria-label="Сұрақты төмен жылжыту"
          >
            <ArrowDown size={13} />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={disabled}
            onClick={() => onEdit(question)}
            aria-label="Сұрақты өңдеу"
          >
            <Pencil size={13} />
          </Button>

          <Button
            type="button"
            variant={deleteConfirmOpen ? 'outline' : 'destructive'}
            size="icon-sm"
            disabled={disabled}
            onClick={onToggleDeleteConfirm}
            aria-label="Сұрақты өшіру"
          >
            {deleteConfirmOpen ? <X size={13} /> : <Trash2 size={13} />}
          </Button>
        </div>
      </div>

      {deleteConfirmOpen ? (
        <div className="mt-3">
          <InlineDeleteConfirm
            title="Сұрақ өшірілсін бе?"
            disabled={disabled}
            onConfirm={() => onDelete(question)}
            onCancel={onCancelDeleteConfirm}
          />
        </div>
      ) : null}
    </div>
  );
}

export function LessonMiniQuizEditor({
  editingLessonId,
  selectedEditingLesson,
  miniQuizLoading,
  miniQuizForm,
  setMiniQuizForm,
  selectedMiniQuiz,
  handleDeleteMiniQuiz,
  deleteMiniQuizPending,
  handleSaveMiniQuiz,
  canSaveMiniQuiz,
  upsertMiniQuizPending,
  miniQuizQuestionForm,
  setMiniQuizQuestionForm,
  editingMiniQuizQuestionId,
  resetMiniQuizQuestionForm,
  handleSaveMiniQuizQuestion,
  canSaveMiniQuizQuestion,
  updateMiniQuizQuestionPending,
  createMiniQuizQuestionPending,
  handleToggleMiniQuizCorrectAnswer,
  handleEditMiniQuizQuestion,
  handleDeleteMiniQuizQuestion,
  handleMoveMiniQuizQuestion,
  deleteMiniQuizQuestionPending,
  reorderMiniQuizQuestionsPending,
}: {
  editingLessonId: string | null;
  selectedEditingLesson: CourseBuilderLessonView | null;
  miniQuizLoading: boolean;
  miniQuizForm: MiniQuizFormState;
  setMiniQuizForm: Dispatch<SetStateAction<MiniQuizFormState>>;
  selectedMiniQuiz: LessonMiniQuizView | null;
  handleDeleteMiniQuiz: () => void;
  deleteMiniQuizPending: boolean;
  handleSaveMiniQuiz: () => void;
  canSaveMiniQuiz: boolean;
  upsertMiniQuizPending: boolean;
  miniQuizQuestionForm: MiniQuizQuestionFormState;
  setMiniQuizQuestionForm: Dispatch<SetStateAction<MiniQuizQuestionFormState>>;
  editingMiniQuizQuestionId: string | null;
  resetMiniQuizQuestionForm: () => void;
  handleSaveMiniQuizQuestion: () => Promise<boolean | void> | void;
  canSaveMiniQuizQuestion: boolean;
  updateMiniQuizQuestionPending: boolean;
  createMiniQuizQuestionPending: boolean;
  handleToggleMiniQuizCorrectAnswer: (optionIndex: number) => void;
  handleEditMiniQuizQuestion: (question: LessonMiniQuizQuestionView) => void;
  handleDeleteMiniQuizQuestion: (question: LessonMiniQuizQuestionView) => void;
  handleMoveMiniQuizQuestion: (questionId: string, direction: 'up' | 'down') => void;
  deleteMiniQuizQuestionPending: boolean;
  reorderMiniQuizQuestionsPending: boolean;
}) {
  const [quizDeleteConfirmOpen, setQuizDeleteConfirmOpen] = useState(false);
  const [questionDeleteId, setQuestionDeleteId] = useState<string | null>(null);
  const [isQuestionOverlayOpen, setIsQuestionOverlayOpen] = useState(false);

  const hasSelectedLesson = Boolean(editingLessonId && selectedEditingLesson);
  const isEditingQuestion = Boolean(editingMiniQuizQuestionId);
  const savingQuestion = updateMiniQuizQuestionPending || createMiniQuizQuestionPending;
  const questionCount = getQuestionCount(selectedMiniQuiz);

  const miniQuizComplete =
    miniQuizForm.title.trim().length > 0 &&
    miniQuizForm.passingScore.trim().length > 0;

  const questionActionLabel = isEditingQuestion
    ? updateMiniQuizQuestionPending
      ? 'Жаңартылуда...'
      : 'Жаңарту'
    : createMiniQuizQuestionPending
      ? 'Қосылуда...'
      : 'Қосу';

  const updateQuizForm = <K extends keyof MiniQuizFormState>(
    key: K,
    value: MiniQuizFormState[K],
  ) => {
    setMiniQuizForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleConfirmedDeleteMiniQuiz = () => {
    handleDeleteMiniQuiz();
    setQuizDeleteConfirmOpen(false);
  };

  const handleConfirmedDeleteQuestion = (question: LessonMiniQuizQuestionView) => {
    handleDeleteMiniQuizQuestion(question);
    setQuestionDeleteId(null);
  };

  const handleOpenAddQuestion = () => {
    resetMiniQuizQuestionForm();
    setIsQuestionOverlayOpen(true);
  };

  const handleOpenEditQuestion = (question: LessonMiniQuizQuestionView) => {
    handleEditMiniQuizQuestion(question);
    setIsQuestionOverlayOpen(true);
  };

  const handleCloseQuestionOverlay = () => {
    resetMiniQuizQuestionForm();
    setIsQuestionOverlayOpen(false);
  };

  const handleSaveQuestionFromOverlay = async () => {
    const result = await handleSaveMiniQuizQuestion();
    if (result !== false) {
      setIsQuestionOverlayOpen(false);
    }
  };

  return (
    <Card id="lesson-mini-quiz" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-ai-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ListChecks size={16} />
            Шағын тест
          </CardTitle>

          <StatusBadge
            tone={
              selectedMiniQuiz
                ? selectedMiniQuiz.isPublished
                  ? 'success'
                  : 'muted'
                : 'muted'
            }
          >
            {getVisibleQuizStatus(selectedMiniQuiz)}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!hasSelectedLesson ? (
          <EmptyState
            title="Сабақ таңдалмаған"
            text="Сабақты сақтаңыз."
            compact
            tone="ai"
          />
        ) : (
          <>
            {miniQuizLoading ? (
              <LoadingState text="Жүктелуде..." compact />
            ) : null}

            <EditorSection
              title="Баптаулар"
              icon={<ListChecks size={17} />}
              aside={
                <StatusBadge tone={miniQuizComplete ? 'success' : 'muted'}>
                  {miniQuizComplete ? 'Дайын' : 'Толтырыңыз'}
                </StatusBadge>
              }
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <FieldBlock label="Тест атауы" required>
                  <Input
                    value={miniQuizForm.title}
                    maxLength={MAX_QUIZ_TITLE_CHARS}
                    onChange={(event) =>
                      updateQuizForm(
                        'title',
                        sanitizeInputValue(event.target.value, MAX_QUIZ_TITLE_CHARS),
                      )
                    }
                    placeholder="Қысқа тест"
                  />
                </FieldBlock>

                <FieldBlock label="Өту пайызы" required>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={miniQuizForm.passingScore}
                    onChange={(event) =>
                      updateQuizForm(
                        'passingScore',
                        normalizePercentInput(event.target.value),
                      )
                    }
                    placeholder="60"
                  />
                </FieldBlock>
              </div>

              <FieldBlock label="Сипаттама">
                <Textarea
                  rows={2}
                  value={miniQuizForm.description}
                  maxLength={MAX_QUIZ_DESCRIPTION_CHARS}
                  onChange={(event) =>
                    updateQuizForm(
                      'description',
                      sanitizeInputValue(
                        event.target.value,
                        MAX_QUIZ_DESCRIPTION_CHARS,
                      ),
                    )
                  }
                  placeholder="Сипаттама"
                />
              </FieldBlock>

              <div
                className={cn(
                  'rounded-3xl border p-4 transition-colors',
                  miniQuizForm.isPublished
                    ? 'border-success-muted bg-success-soft/70'
                    : 'border-border bg-muted/30',
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <Label
                    htmlFor="mini-quiz-published"
                    className="text-sm font-semibold text-foreground"
                  >
                    Оқушыға көрсету
                  </Label>

                  <Switch
                    id="mini-quiz-published"
                    checked={miniQuizForm.isPublished}
                    onCheckedChange={(checked) =>
                      updateQuizForm('isPublished', checked)
                    }
                  />
                </div>
              </div>

              {quizDeleteConfirmOpen ? (
                <InlineDeleteConfirm
                  title="Шағын тест өшірілсін бе?"
                  text="Сұрақтары бірге өшеді."
                  disabled={deleteMiniQuizPending}
                  onConfirm={handleConfirmedDeleteMiniQuiz}
                  onCancel={() => setQuizDeleteConfirmOpen(false)}
                />
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {selectedMiniQuiz ? (
                  <Button
                    type="button"
                    variant={quizDeleteConfirmOpen ? 'outline' : 'destructive'}
                    onClick={() =>
                      setQuizDeleteConfirmOpen((previous) => !previous)
                    }
                    disabled={deleteMiniQuizPending}
                  >
                    {quizDeleteConfirmOpen ? (
                      <X size={14} className="mr-1.5" />
                    ) : (
                      <Trash2 size={14} className="mr-1.5" />
                    )}
                    {quizDeleteConfirmOpen ? 'Жабу' : 'Өшіру'}
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="ai"
                  onClick={handleSaveMiniQuiz}
                  disabled={!canSaveMiniQuiz || upsertMiniQuizPending}
                >
                  <Save size={14} className="mr-1.5" />
                  {upsertMiniQuizPending ? 'Сақталуда...' : 'Сақтау'}
                </Button>
              </div>
            </EditorSection>

            {selectedMiniQuiz ? (
              <>
                <section className="space-y-3.5">
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/30 p-3 shadow-xs">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">Сұрақтар</p>
                      <StatusBadge tone="secondary">{questionCount}</StatusBadge>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={handleOpenAddQuestion}
                      className="rounded-full shadow-xs text-xs font-semibold px-3.5 h-8 gap-1.5"
                    >
                      <Plus size={14} />
                      Сұрақ қосу
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 px-1">
                    <StatusBadge
                      tone={selectedMiniQuiz.isPublished ? 'success' : 'muted'}
                    >
                      {selectedMiniQuiz.isPublished ? 'Жарияланған' : 'Жоба'}
                    </StatusBadge>

                    <StatusBadge tone="muted">
                      Өту балы: {selectedMiniQuiz.passingScore}%
                    </StatusBadge>
                  </div>

                  {selectedMiniQuiz.questions.length === 0 ? (
                    <div className="rounded-2xl bg-muted/20 p-6 text-center space-y-2.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Сұрақтар жоқ
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleOpenAddQuestion}
                        className="rounded-full shadow-xs text-xs font-semibold px-4"
                      >
                        <Plus size={14} className="mr-1.5" />
                        Сұрақ қосу
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedMiniQuiz.questions.map((question, index) => (
                        <MiniQuizQuestionCard
                          key={question.id}
                          question={question}
                          index={index}
                          total={selectedMiniQuiz.questions.length}
                          onEdit={handleOpenEditQuestion}
                          onDelete={handleConfirmedDeleteQuestion}
                          onMove={handleMoveMiniQuizQuestion}
                          disabled={
                            deleteMiniQuizQuestionPending ||
                            reorderMiniQuizQuestionsPending
                          }
                          deleteConfirmOpen={questionDeleteId === question.id}
                          onToggleDeleteConfirm={() =>
                            setQuestionDeleteId((current) =>
                              current === question.id ? null : question.id,
                            )
                          }
                          onCancelDeleteConfirm={() => setQuestionDeleteId(null)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <LessonQuestionEditorOverlay
                  isOpen={isQuestionOverlayOpen}
                  onClose={handleCloseQuestionOverlay}
                  lessonTitle={selectedEditingLesson?.title}
                  isEditing={isEditingQuestion}
                  questionForm={miniQuizQuestionForm}
                  setQuestionForm={setMiniQuizQuestionForm}
                  onToggleCorrectAnswer={handleToggleMiniQuizCorrectAnswer}
                  onSave={handleSaveQuestionFromOverlay}
                  canSave={canSaveMiniQuizQuestion}
                  isSaving={savingQuestion}
                  saveActionLabel={questionActionLabel}
                />
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default LessonMiniQuizEditor;