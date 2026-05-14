import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  HelpCircle,
  ListChecks,
  Pencil,
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-inner-soft">
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

function MiniQuizQuestionCard({
  question,
  index,
  total,
  onEdit,
  onDelete,
  onMove,
  disabled,
}: {
  question: LessonMiniQuizQuestionView;
  index: number;
  total: number;
  onEdit: (question: LessonMiniQuizQuestionView) => void;
  onDelete: (question: LessonMiniQuizQuestionView) => void;
  onMove: (questionId: string, direction: 'up' | 'down') => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 text-sm shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:shadow-soft-md">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="muted">#{question.sortOrder}</StatusBadge>

            <StatusBadge
              tone={question.questionType === 'multiple_choice' ? 'warning' : 'primary'}
            >
              <HelpCircle size={12} />
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
                      : 'border-border bg-muted/45 text-muted-foreground'
                  }`}
                >
                  <span className="font-semibold">
                    {String.fromCharCode(65 + optionIndex)}.
                  </span>{' '}
                  <span>{option}</span>
                  {isCorrect ? (
                    <span className="ml-2 inline-flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={11} />
                      дұрыс
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {question.explanation ? (
            <div className="mt-3 rounded-2xl border border-border bg-surface-soft/60 p-3">
              <p className="text-xs font-semibold text-foreground">Түсіндірме</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted-foreground">
                {question.explanation}
              </p>
            </div>
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
            variant="destructive"
            size="icon-sm"
            disabled={disabled}
            onClick={() => onDelete(question)}
            aria-label="Сұрақты өшіру"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
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
  const hasSelectedLesson = Boolean(editingLessonId && selectedEditingLesson);
  const isEditingQuestion = Boolean(editingMiniQuizQuestionId);
  const savingQuestion = updateMiniQuizQuestionPending || createMiniQuizQuestionPending;
  const questionActionLabel = isEditingQuestion
    ? updateMiniQuizQuestionPending
      ? 'Жаңартылуда...'
      : 'Сұрақты жаңарту'
    : createMiniQuizQuestionPending
      ? 'Қосылуда...'
      : 'Сұрақ қосу';

  return (
    <Card id="lesson-mini-quiz" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-ai-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <ListChecks size={16} />
                Lesson Mini Quiz
              </CardTitle>

              <StatusBadge tone="ai">
                <HelpCircle size={12} />
                Қысқа тексеріс
              </StatusBadge>

              {selectedMiniQuiz ? (
                <StatusBadge tone={selectedMiniQuiz.isPublished ? 'success' : 'completed'}>
                  {selectedMiniQuiz.isPublished ? 'Жарияланған' : 'Draft'}
                </StatusBadge>
              ) : null}
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Сабақ соңында оқушыға қысқа тексеру тестін көрсетіңіз. Бір сабаққа
              бір mini quiz беріледі.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!hasSelectedLesson ? (
          <div className="rounded-3xl border border-dashed border-ai-border bg-ai-soft/65 p-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-card text-primary shadow-inner-soft">
                <ListChecks size={17} />
              </div>

              <div>
                <p className="font-semibold text-foreground">
                  Сабақ таңдалмаған
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Қысқа тест қосу үшін алдымен бар сабақты таңдаңыз немесе жаңа
                  сабақты сақтаңыз.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {miniQuizLoading ? (
              <LoadingState text="Қысқа тест жүктелуде..." compact />
            ) : null}

            <EditorSection
              title="Қысқа тест баптаулары"
              description="Quiz атауы, өту пайызы және оқушыға көріну күйі."
              icon={<ListChecks size={17} />}
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <FieldBlock label="Қысқа тест атауы">
                  <Input
                    value={miniQuizForm.title}
                    onChange={(e) =>
                      setMiniQuizForm((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder="Мысалы: Сабақ бойынша қысқа тексеру"
                  />
                </FieldBlock>

                <FieldBlock label="Өту пайызы" hint="0–100 аралығында көрсетіңіз.">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={miniQuizForm.passingScore}
                    onChange={(e) =>
                      setMiniQuizForm((p) => ({
                        ...p,
                        passingScore: e.target.value,
                      }))
                    }
                  />
                </FieldBlock>
              </div>

              <FieldBlock label="Сипаттама">
                <Textarea
                  rows={2}
                  value={miniQuizForm.description}
                  onChange={(e) =>
                    setMiniQuizForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Қысқаша нұсқаулық немесе түсіндірме"
                />
              </FieldBlock>

              <div
                className={`rounded-3xl border p-4 transition-all duration-200 ease-soft ${
                  miniQuizForm.isPublished
                    ? 'border-success-muted bg-success-soft/70'
                    : 'border-border bg-card/75'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label
                      htmlFor="mini-quiz-published"
                      className="text-sm font-semibold text-foreground"
                    >
                      Оқушыға көрсету
                    </Label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Publish қосылса, quiz сабақ detail бетінде көрінеді.
                    </p>
                  </div>

                  <Switch
                    id="mini-quiz-published"
                    checked={miniQuizForm.isPublished}
                    onCheckedChange={(checked) =>
                      setMiniQuizForm((p) => ({ ...p, isPublished: checked }))
                    }
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {selectedMiniQuiz ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteMiniQuiz}
                    disabled={deleteMiniQuizPending}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    Қысқа тест өшіру
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="ai"
                  onClick={handleSaveMiniQuiz}
                  disabled={!canSaveMiniQuiz || upsertMiniQuizPending}
                >
                  <Save size={14} className="mr-1.5" />
                  {upsertMiniQuizPending ? 'Сақталуда...' : 'Қысқа тест сақтау'}
                </Button>
              </div>
            </EditorSection>

            <EditorSection
              title={isEditingQuestion ? 'Сұрақты өңдеу' : 'Жаңа сұрақ'}
              description="Дұрыс жауап индекс арқылы емес, checkbox/radio арқылы таңдалады."
              icon={<HelpCircle size={17} />}
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_120px]">
                <FieldBlock label="Сұрақ мәтіні">
                  <Input
                    value={miniQuizQuestionForm.questionText}
                    onChange={(e) =>
                      setMiniQuizQuestionForm((p) => ({
                        ...p,
                        questionText: e.target.value,
                      }))
                    }
                    placeholder="Мысалы: Бұл тақырыптың негізгі ұғымы қандай?"
                  />
                </FieldBlock>

                <FieldBlock label="Сұрақ түрі">
                  <select
                    value={miniQuizQuestionForm.questionType}
                    onChange={(e) =>
                      setMiniQuizQuestionForm((p) => ({
                        ...p,
                        questionType: e.target.value as LessonMiniQuizQuestionType,
                        correctAnswer: [],
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
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
                    onChange={(e) =>
                      setMiniQuizQuestionForm((p) => ({
                        ...p,
                        sortOrder: e.target.value,
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
                        className={`flex items-center gap-3 rounded-2xl border p-2 transition-all duration-200 ease-soft ${
                          checked
                            ? 'border-success-muted bg-success-soft/70'
                            : 'border-border bg-card/75'
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
                          onChange={(e) =>
                            setMiniQuizQuestionForm((p) => {
                              const nextOptions = [...p.options];
                              nextOptions[optionIndex] = e.target.value;

                              return {
                                ...p,
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
                      </div>
                    );
                  })}
                </div>
              </div>

              <FieldBlock label="Түсіндірме">
                <Textarea
                  rows={2}
                  value={miniQuizQuestionForm.explanation}
                  onChange={(e) =>
                    setMiniQuizQuestionForm((p) => ({
                      ...p,
                      explanation: e.target.value,
                    }))
                  }
                  placeholder="Оқушы жауап бергеннен кейін көретін қысқаша түсіндірме"
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

            {!miniQuizLoading && !selectedMiniQuiz ? (
              <EmptyState
                title="Қысқа тест әлі сақталмаған"
                text="Алдымен quiz баптауларын сақтаңыз. Содан кейін сұрақтарды толық басқаруға болады."
                compact
                tone="ai"
              />
            ) : null}

            {selectedMiniQuiz ? (
              <section className="space-y-3">
                <div className="rounded-3xl border border-border bg-surface-soft/60 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Quiz сұрақтары
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Сұрақтарды реттеңіз, өңдеңіз немесе өшіріңіз.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={selectedMiniQuiz.isPublished ? 'success' : 'completed'}
                      >
                        {selectedMiniQuiz.isPublished ? 'Жарияланған' : 'Draft'}
                      </StatusBadge>

                      <StatusBadge tone="secondary">
                        {selectedMiniQuiz.questionsCount} сұрақ
                      </StatusBadge>

                      <StatusBadge tone="muted">
                        Өту: {selectedMiniQuiz.passingScore}%
                      </StatusBadge>
                    </div>
                  </div>
                </div>

                {selectedMiniQuiz.questions.length === 0 ? (
                  <EmptyState
                    title="Сұрақ жоқ"
                    text="Қысқа тест оқушыға пайдалы болуы үшін кемінде бір сұрақ қосыңыз."
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
                        onDelete={handleDeleteMiniQuizQuestion}
                        onMove={handleMoveMiniQuizQuestion}
                        disabled={
                          deleteMiniQuizQuestionPending ||
                          reorderMiniQuizQuestionsPending
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}