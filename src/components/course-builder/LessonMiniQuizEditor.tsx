import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  HelpCircle,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, LoadingState } from '@/components/common/DataState';
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
  miniQuizQuestionTypes,
} from '@/lib/course-creator/mini-quiz-utils';

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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary">
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
    <div className="rounded-3xl border border-border bg-card p-4 text-sm transition-colors hover:border-primary-muted hover:bg-primary-soft/20">
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
                  className={`rounded-2xl border px-3 py-2 text-xs ${
                    isCorrect
                      ? 'border-success-muted bg-success-soft text-success-foreground'
                      : 'border-border bg-muted/35 text-muted-foreground'
                  }`}
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
            <p className="mt-3 whitespace-pre-line rounded-2xl border border-border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
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
  handleSaveMiniQuizQuestion: () => void;
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

  const hasSelectedLesson = Boolean(editingLessonId && selectedEditingLesson);
  const isEditingQuestion = Boolean(editingMiniQuizQuestionId);
  const savingQuestion = updateMiniQuizQuestionPending || createMiniQuizQuestionPending;

  const miniQuizComplete =
    miniQuizForm.title.trim().length > 0 &&
    miniQuizForm.passingScore.trim().length > 0;

  const questionActionLabel = isEditingQuestion
    ? updateMiniQuizQuestionPending
      ? 'Жаңартылуда...'
      : 'Сұрақты жаңарту'
    : createMiniQuizQuestionPending
      ? 'Қосылуда...'
      : 'Сұрақ қосу';

  const handleConfirmedDeleteMiniQuiz = () => {
    handleDeleteMiniQuiz();
    setQuizDeleteConfirmOpen(false);
  };

  const handleConfirmedDeleteQuestion = (question: LessonMiniQuizQuestionView) => {
    handleDeleteMiniQuizQuestion(question);
    setQuestionDeleteId(null);
  };

  const handleAddOption = () => {
    setMiniQuizQuestionForm((previous) => ({
      ...previous,
      options: [...previous.options, ''],
    }));
  };

  const handleRemoveOption = (optionIndex: number) => {
    setMiniQuizQuestionForm((previous) => {
      if (previous.options.length <= 2) return previous;

      return {
        ...previous,
        options: previous.options.filter((_, index) => index !== optionIndex),
        correctAnswer: previous.correctAnswer
          .flatMap((index) => {
            if (index === optionIndex) return [];
            if (index > optionIndex) return [index - 1];
            return [index];
          }),
      };
    });
  };

  return (
    <Card id="lesson-mini-quiz" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-ai-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ListChecks size={16} />
            Mini quiz
          </CardTitle>

          <StatusBadge
            tone={
              selectedMiniQuiz
                ? selectedMiniQuiz.isPublished
                  ? 'success'
                  : 'completed'
                : 'muted'
            }
          >
            {selectedMiniQuiz
              ? selectedMiniQuiz.isPublished
                ? 'Жарияланған'
                : 'Черновик'
              : 'Қосылмаған'}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!hasSelectedLesson ? (
          <EmptyState
            title="Сабақ таңдалмаған"
            text="Алдымен сабақты сақтаңыз."
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
                  {miniQuizComplete ? 'Толды' : 'Міндетті'}
                </StatusBadge>
              }
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <FieldBlock label="Quiz атауы" required>
                  <Input
                    value={miniQuizForm.title}
                    onChange={(event) =>
                      setMiniQuizForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Mini quiz"
                  />
                </FieldBlock>

                <FieldBlock label="Өту пайызы" required>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={miniQuizForm.passingScore}
                    onChange={(event) =>
                      setMiniQuizForm((previous) => ({
                        ...previous,
                        passingScore: event.target.value,
                      }))
                    }
                  />
                </FieldBlock>
              </div>

              <FieldBlock label="Сипаттама">
                <Textarea
                  rows={2}
                  value={miniQuizForm.description}
                  onChange={(event) =>
                    setMiniQuizForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Сипаттама"
                />
              </FieldBlock>

              <div
                className={`rounded-3xl border p-4 transition-colors ${
                  miniQuizForm.isPublished
                    ? 'border-success-muted bg-success-soft/70'
                    : 'border-border bg-muted/30'
                }`}
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
                      setMiniQuizForm((previous) => ({
                        ...previous,
                        isPublished: checked,
                      }))
                    }
                  />
                </div>
              </div>

              {quizDeleteConfirmOpen ? (
                <InlineDeleteConfirm
                  title="Mini quiz өшірілсін бе?"
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
                    {quizDeleteConfirmOpen ? 'Жабу' : 'Mini quiz өшіру'}
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
                <EditorSection
                  title={isEditingQuestion ? 'Сұрақты өңдеу' : 'Жаңа сұрақ'}
                  icon={<HelpCircle size={17} />}
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_120px]">
                    <FieldBlock label="Сұрақ мәтіні" required>
                      <Input
                        value={miniQuizQuestionForm.questionText}
                        onChange={(event) =>
                          setMiniQuizQuestionForm((previous) => ({
                            ...previous,
                            questionText: event.target.value,
                          }))
                        }
                        placeholder="Сұрақ"
                      />
                    </FieldBlock>

                    <FieldBlock label="Сұрақ түрі">
                      <select
                        value={miniQuizQuestionForm.questionType}
                        onChange={(event) =>
                          setMiniQuizQuestionForm((previous) => ({
                            ...previous,
                            questionType: event.target.value as LessonMiniQuizQuestionType,
                            correctAnswer: [],
                          }))
                        }
                        className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
                      >
                        {miniQuizQuestionTypes.map((type) => (
                          <option key={type} value={type}>
                            {getMiniQuizQuestionTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>

                    <FieldBlock label="Реті">
                      <Input
                        type="number"
                        min={1}
                        value={miniQuizQuestionForm.sortOrder}
                        onChange={(event) =>
                          setMiniQuizQuestionForm((previous) => ({
                            ...previous,
                            sortOrder: event.target.value,
                          }))
                        }
                      />
                    </FieldBlock>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-foreground">
                      Жауап нұсқалары
                    </Label>

                    <div className="space-y-2">
                      {miniQuizQuestionForm.options.map((option, optionIndex) => {
                        const checked =
                          miniQuizQuestionForm.correctAnswer.includes(optionIndex);
                        const inputType =
                          miniQuizQuestionForm.questionType === 'single_choice'
                            ? 'radio'
                            : 'checkbox';

                        return (
                          <div
                            key={optionIndex}
                            className={`flex items-center gap-3 rounded-2xl border p-2 transition-colors ${
                              checked
                                ? 'border-success-muted bg-success-soft/70'
                                : 'border-border bg-card'
                            }`}
                          >
                            <input
                              type={inputType}
                              name="mini-quiz-correct-answer"
                              checked={checked}
                              onChange={() => handleToggleMiniQuizCorrectAnswer(optionIndex)}
                              className="h-4 w-4 accent-primary"
                            />

                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-xs font-semibold text-muted-foreground">
                              {String.fromCharCode(65 + optionIndex)}
                            </div>

                            <Input
                              value={option}
                              onChange={(event) =>
                                setMiniQuizQuestionForm((previous) => {
                                  const nextOptions = [...previous.options];
                                  nextOptions[optionIndex] = event.target.value;

                                  return {
                                    ...previous,
                                    options: nextOptions,
                                  };
                                })
                              }
                              placeholder={`Жауап ${optionIndex + 1}`}
                            />

                            {checked ? (
                              <StatusBadge tone="success">
                                <CheckCircle2 size={12} />
                                Дұрыс
                              </StatusBadge>
                            ) : null}

                            {miniQuizQuestionForm.options.length > 2 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRemoveOption(optionIndex)}
                                aria-label="Жауап нұсқасын өшіру"
                              >
                                <X size={13} />
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddOption}
                    >
                      <Plus size={14} className="mr-1.5" />
                      Нұсқа қосу
                    </Button>
                  </div>

                  <FieldBlock label="Түсіндірме">
                    <Textarea
                      rows={2}
                      value={miniQuizQuestionForm.explanation}
                      onChange={(event) =>
                        setMiniQuizQuestionForm((previous) => ({
                          ...previous,
                          explanation: event.target.value,
                        }))
                      }
                      placeholder="Түсіндірме"
                    />
                  </FieldBlock>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {editingMiniQuizQuestionId ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetMiniQuizQuestionForm}
                      >
                        <X size={14} className="mr-1.5" />
                        Болдырмау
                      </Button>
                    ) : null}

                    <Button
                      type="button"
                      onClick={handleSaveMiniQuizQuestion}
                      disabled={!canSaveMiniQuizQuestion || savingQuestion}
                    >
                      <HelpCircle size={14} className="mr-1.5" />
                      {questionActionLabel}
                    </Button>
                  </div>
                </EditorSection>

                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-muted/25 p-3">
                    <p className="text-sm font-semibold text-foreground">
                      Сұрақтар
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={selectedMiniQuiz.isPublished ? 'success' : 'completed'}
                      >
                        {selectedMiniQuiz.isPublished ? 'Жарияланған' : 'Черновик'}
                      </StatusBadge>

                      <StatusBadge tone="secondary">
                        {selectedMiniQuiz.questionsCount}
                      </StatusBadge>

                      <StatusBadge tone="muted">
                        {selectedMiniQuiz.passingScore}%
                      </StatusBadge>
                    </div>
                  </div>

                  {selectedMiniQuiz.questions.length === 0 ? (
                    <EmptyState
                      title="Сұрақ жоқ"
                      text="Сұрақ қосыңыз."
                      compact
                      tone="ai"
                    />
                  ) : (
                    <div className="space-y-2">
                      {selectedMiniQuiz.questions.map((question, index) => (
                        <MiniQuizQuestionCard
                          key={question.id}
                          question={question}
                          index={index}
                          total={selectedMiniQuiz.questions.length}
                          onEdit={handleEditMiniQuizQuestion}
                          onDelete={handleConfirmedDeleteQuestion}
                          onMove={handleMoveMiniQuizQuestion}
                          disabled={
                            deleteMiniQuizQuestionPending ||
                            reorderMiniQuizQuestionsPending
                          }
                          deleteConfirmOpen={questionDeleteId === question.id}
                          onToggleDeleteConfirm={() =>
                            setQuestionDeleteId((current) =>
                              current === question.id ? null : question.id
                            )
                          }
                          onCancelDeleteConfirm={() => setQuestionDeleteId(null)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}