import type { Dispatch, SetStateAction } from 'react';
import {
  ArrowDown,
  ArrowUp,
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
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">#{question.sortOrder}</StatusBadge>
            <StatusBadge tone={question.questionType === 'multiple_choice' ? 'warning' : 'primary'}>
              {getMiniQuizQuestionTypeLabel(question.questionType)}
            </StatusBadge>
          </div>

          <p className="font-semibold">{question.questionText}</p>

          <div className="mt-3 space-y-1.5">
            {question.options.map((option, optionIndex) => {
              const isCorrect = question.correctAnswer.includes(optionIndex);

              return (
                <div
                  key={`${question.id}-${optionIndex}`}
                  className={`rounded-md border px-2.5 py-1.5 text-xs ${
                    isCorrect ? 'border-emerald-500/30 bg-emerald-500/10' : 'bg-muted/20'
                  }`}
                >
                  <span className="font-medium">{optionIndex + 1}.</span>{' '}
                  <span>{option}</span>
                  {isCorrect ? <span className="ml-2 text-emerald-700">дұрыс</span> : null}
                </div>
              );
            })}
          </div>

          {question.explanation ? (
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
              Түсіндірме: {question.explanation}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={index === 0 || disabled}
            onClick={() => onMove(question.id, 'up')}
          >
            <ArrowUp size={13} />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={index === total - 1 || disabled}
            onClick={() => onMove(question.id, 'down')}
          >
            <ArrowDown size={13} />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={disabled}
            onClick={() => onEdit(question)}
          >
            <Pencil size={13} />
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            disabled={disabled}
            onClick={() => onDelete(question)}
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
  return (
    <Card id="lesson-mini-quiz" className="scroll-mt-24">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ListChecks size={16} />
          Lesson Mini Quiz
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Сабақ соңында оқушыға қысқа тексеру тестін көрсетіңіз. Бір сабаққа бір mini quiz беріледі.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {!editingLessonId || !selectedEditingLesson ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Mini quiz қосу үшін алдымен бар сабақты таңдаңыз немесе жаңа сабақты сақтаңыз.
          </div>
        ) : (
          <>
            {miniQuizLoading ? (
              <LoadingState text="Mini quiz жүктелуде..." />
            ) : null}

            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <div className="space-y-1.5">
                  <Label>Mini quiz атауы</Label>
                  <Input
                    value={miniQuizForm.title}
                    onChange={(e) =>
                      setMiniQuizForm((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder="Мысалы: Сабақ бойынша қысқа тексеру"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Өту пайызы</Label>
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
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Сипаттама</Label>
                <Textarea
                  rows={2}
                  value={miniQuizForm.description}
                  onChange={(e) =>
                    setMiniQuizForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Қысқаша нұсқаулық немесе түсіндірме"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <Label htmlFor="mini-quiz-published">Оқушыға көрсету</Label>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
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

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {selectedMiniQuiz ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteMiniQuiz}
                    disabled={deleteMiniQuizPending}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    Mini quiz өшіру
                  </Button>
                ) : null}

                <Button
                  type="button"
                  onClick={handleSaveMiniQuiz}
                  disabled={!canSaveMiniQuiz}
                >
                  <Save size={14} className="mr-1.5" />
                  {upsertMiniQuizPending ? 'Сақталуда...' : 'Mini quiz сақтау'}
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">
                  {editingMiniQuizQuestionId ? 'Сұрақты өңдеу' : 'Жаңа сұрақ'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Дұрыс жауап индекс арқылы емес, checkbox/radio арқылы таңдалады.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_120px]">
                <div className="space-y-1.5">
                  <Label>Сұрақ мәтіні</Label>
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
                </div>

                <div className="space-y-1.5">
                  <Label>Сұрақ түрі</Label>
                  <select
                    value={miniQuizQuestionForm.questionType}
                    onChange={(e) =>
                      setMiniQuizQuestionForm((p) => ({
                        ...p,
                        questionType: e.target.value as LessonMiniQuizQuestionType,
                        correctAnswer: [],
                      }))
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {miniQuizQuestionTypes.map((type) => (
                      <option key={type} value={type}>
                        {getMiniQuizQuestionTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label>Реті</Label>
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
                </div>
              </div>

              <div className="space-y-2">
                <Label>Жауап нұсқалары</Label>
                {miniQuizQuestionForm.options.map((option, optionIndex) => {
                  const checked = miniQuizQuestionForm.correctAnswer.includes(optionIndex);
                  const inputType =
                    miniQuizQuestionForm.questionType === 'single_choice'
                      ? 'radio'
                      : 'checkbox';

                  return (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <input
                        type={inputType}
                        name="mini-quiz-correct-answer"
                        checked={checked}
                        onChange={() => handleToggleMiniQuizCorrectAnswer(optionIndex)}
                        className="h-4 w-4"
                      />
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
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label>Түсіндірме</Label>
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
              </div>

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
                  disabled={!canSaveMiniQuizQuestion}
                >
                  <HelpCircle size={14} className="mr-1.5" />
                  {editingMiniQuizQuestionId
                    ? updateMiniQuizQuestionPending
                      ? 'Жаңартылуда...'
                      : 'Сұрақты жаңарту'
                    : createMiniQuizQuestionPending
                      ? 'Қосылуда...'
                      : 'Сұрақ қосу'}
                </Button>
              </div>
            </div>

            {!miniQuizLoading && !selectedMiniQuiz ? (
              <EmptyState
                title="Mini quiz әлі сақталмаған"
                text="Алдымен quiz баптауларын сақтаңыз немесе бірден сұрақ қосыңыз."
              />
            ) : null}

            {selectedMiniQuiz ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={selectedMiniQuiz.isPublished ? 'success' : 'warning'}>
                      {selectedMiniQuiz.isPublished ? 'Жарияланған' : 'Draft'}
                    </StatusBadge>
                    <StatusBadge tone="info">
                      {selectedMiniQuiz.questionsCount} сұрақ
                    </StatusBadge>
                    <StatusBadge tone="muted">
                      Өту: {selectedMiniQuiz.passingScore}%
                    </StatusBadge>
                  </div>
                </div>

                {selectedMiniQuiz.questions.length === 0 ? (
                  <EmptyState
                    title="Сұрақ жоқ"
                    text="Mini quiz оқушыға пайдалы болуы үшін кемінде бір сұрақ қосыңыз."
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
                        disabled={deleteMiniQuizQuestionPending || reorderMiniQuizQuestionsPending}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
