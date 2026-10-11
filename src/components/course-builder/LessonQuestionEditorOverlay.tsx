import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  HelpCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  LessonMiniQuizQuestionType,
} from '@/lib/app-data-types';
import type { MiniQuizQuestionFormState } from '@/components/course-builder/LessonMiniQuizEditor';
import { cn, removeNullCharacters } from '@/lib/utils';

const MAX_QUESTION_TEXT_CHARS = 700;
const MAX_OPTION_CHARS = 300;
const MAX_EXPLANATION_CHARS = 1_000;
const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

function sanitizeInputValue(value: string, limit: number): string {
  return removeNullCharacters(value).slice(0, limit);
}

function normalizeSortOrderInput(value: string): string {
  return removeNullCharacters(value).replace(/[^\d]/g, '').slice(0, 4);
}

function normalizeCorrectAnswerAfterOptionChange({
  correctAnswer,
  options,
  questionType,
}: {
  correctAnswer: number[];
  options: string[];
  questionType: LessonMiniQuizQuestionType;
}): number[] {
  const validIndexes = new Set(
    options
      .map((option, index) => (option.trim() ? index : -1))
      .filter((index) => index >= 0),
  );

  const normalized = correctAnswer
    .filter((index) => validIndexes.has(index))
    .sort((a, b) => a - b);

  if (questionType === 'single_choice') {
    return normalized.slice(0, 1);
  }

  return normalized;
}

export type LessonQuestionEditorOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  lessonTitle?: string;
  isEditing: boolean;
  questionForm: MiniQuizQuestionFormState;
  setQuestionForm: Dispatch<SetStateAction<MiniQuizQuestionFormState>>;
  onToggleCorrectAnswer: (optionIndex: number) => void;
  onSave: () => Promise<void> | void;
  canSave: boolean;
  isSaving: boolean;
  saveActionLabel: string;
};

export function LessonQuestionEditorOverlay({
  isOpen,
  onClose,
  lessonTitle,
  isEditing,
  questionForm,
  setQuestionForm,
  onToggleCorrectAnswer,
  onSave,
  canSave,
  isSaving,
  saveActionLabel,
}: LessonQuestionEditorOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateField = <K extends keyof MiniQuizQuestionFormState>(
    key: K,
    value: MiniQuizQuestionFormState[K],
  ) => {
    setQuestionForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleAddOption = () => {
    setQuestionForm((previous) => {
      if (previous.options.length >= MAX_OPTIONS) return previous;

      return {
        ...previous,
        options: [...previous.options, ''],
      };
    });
  };

  const handleOptionChange = (optionIndex: number, value: string) => {
    setQuestionForm((previous) => {
      const nextOptions = [...previous.options];
      nextOptions[optionIndex] = sanitizeInputValue(value, MAX_OPTION_CHARS);

      return {
        ...previous,
        options: nextOptions,
        correctAnswer: normalizeCorrectAnswerAfterOptionChange({
          correctAnswer: previous.correctAnswer,
          options: nextOptions,
          questionType: previous.questionType,
        }),
      };
    });
  };

  const handleRemoveOption = (optionIndex: number) => {
    setQuestionForm((previous) => {
      if (previous.options.length <= MIN_OPTIONS) return previous;

      const nextOptions = previous.options.filter((_, index) => index !== optionIndex);
      const nextCorrectAnswer = previous.correctAnswer.flatMap((index) => {
        if (index === optionIndex) return [];
        if (index > optionIndex) return [index - 1];

        return [index];
      });

      return {
        ...previous,
        options: nextOptions,
        correctAnswer: normalizeCorrectAnswerAfterOptionChange({
          correctAnswer: nextCorrectAnswer,
          options: nextOptions,
          questionType: previous.questionType,
        }),
      };
    });
  };

  const handleQuestionTypeChange = (questionType: LessonMiniQuizQuestionType) => {
    setQuestionForm((previous) => ({
      ...previous,
      questionType,
      correctAnswer:
        questionType === 'single_choice'
          ? previous.correctAnswer.slice(0, 1)
          : previous.correctAnswer,
    }));
  };

  const validOptionsCount = questionForm.options.filter((opt) => opt.trim().length > 0).length;
  const correctCount = questionForm.correctAnswer.length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Сұрақты өңдеу' : 'Жаңа сұрақ қосу'}
      className="fixed inset-0 z-[150] flex flex-col bg-background/98 backdrop-blur-2xl animate-fade-in overflow-hidden"
    >
      {/* Top Header Bar */}
      <header className="h-16 sm:h-20 shrink-0 border-b border-border/40 bg-card/60 backdrop-blur-md px-4 sm:px-10 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-xs">
            <HelpCircle size={20} />
          </span>

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
              {isEditing ? 'Сұрақты өңдеу' : 'Жаңа сұрақ'}
            </h1>
            {lessonTitle ? (
              <p className="text-xs text-muted-foreground truncate">
                Сабақ: {lessonTitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="rounded-full text-xs font-semibold"
            disabled={isSaving}
          >
            <X size={15} className="mr-1.5" />
            Жабу
          </Button>

          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave || isSaving}
            className="rounded-full shadow-xs px-5 sm:px-7 text-xs font-semibold"
          >
            <Check size={15} className="mr-1.5" />
            {isSaving ? 'Сақталуда...' : saveActionLabel}
          </Button>
        </div>
      </header>

      {/* Main Spacious Canvas */}
      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Section 1: Сұрақ мәтіні */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight text-foreground">
                Сұрақ мәтіні
              </h2>

              <span className="text-[11px] text-muted-foreground">
                {questionForm.questionText.length}/{MAX_QUESTION_TEXT_CHARS}
              </span>
            </div>

            <Textarea
              rows={3}
              value={questionForm.questionText}
              maxLength={MAX_QUESTION_TEXT_CHARS}
              onChange={(event) =>
                updateField(
                  'questionText',
                  sanitizeInputValue(event.target.value, MAX_QUESTION_TEXT_CHARS),
                )
              }
              placeholder="Сұрақ мәтіні"
              className="resize-none rounded-2xl bg-muted/40 p-5 text-base sm:text-lg font-medium border-0 shadow-xs focus:bg-card focus:ring-2 focus:ring-primary/20"
            />

            <div className="grid gap-4 sm:grid-cols-2 pt-1">
              {/* Question Type Cards */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  Сұрақ түрі
                </Label>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleQuestionTypeChange('single_choice')}
                    className={cn(
                      'flex items-center justify-center p-3 rounded-2xl text-center transition-all shadow-xs text-xs font-bold',
                      questionForm.questionType === 'single_choice'
                        ? 'bg-foreground text-background'
                        : 'bg-muted/40 text-foreground hover:bg-muted/60',
                    )}
                  >
                    Жалғыз таңдау
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuestionTypeChange('multiple_choice')}
                    className={cn(
                      'flex items-center justify-center p-3 rounded-2xl text-center transition-all shadow-xs text-xs font-bold',
                      questionForm.questionType === 'multiple_choice'
                        ? 'bg-foreground text-background'
                        : 'bg-muted/40 text-foreground hover:bg-muted/60',
                    )}
                  >
                    Көптік таңдау
                  </button>
                </div>
              </div>

              {/* Sort Order */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  Реті
                </Label>

                <Input
                  type="text"
                  inputMode="numeric"
                  value={questionForm.sortOrder}
                  onChange={(event) =>
                    updateField(
                      'sortOrder',
                      normalizeSortOrderInput(event.target.value),
                    )
                  }
                  placeholder="1"
                  className="h-11 rounded-2xl bg-muted/40 border-0 px-4 text-sm shadow-xs focus:bg-card focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Жауап нұсқалары */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold tracking-tight text-foreground">
              Жауап нұсқалары
            </h2>

            <div className="space-y-2.5">
              {questionForm.options.map((option, optionIndex) => {
                const checked = questionForm.correctAnswer.includes(optionIndex);
                const canMarkCorrect = option.trim().length > 0;

                return (
                  <div
                    key={optionIndex}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl p-2.5 sm:p-3 transition-all shadow-xs',
                      checked
                        ? 'bg-success-soft/40'
                        : 'bg-muted/30 hover:bg-muted/50',
                    )}
                  >
                    {/* Select toggle */}
                    <button
                      type="button"
                      disabled={!canMarkCorrect}
                      onClick={() => onToggleCorrectAnswer(optionIndex)}
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
                        checked
                          ? 'bg-success text-success-foreground shadow-xs'
                          : 'bg-card text-muted-foreground hover:text-foreground shadow-xs',
                        !canMarkCorrect && 'opacity-40 cursor-not-allowed',
                      )}
                      aria-label="Дұрыс жауапты белгілеу"
                    >
                      {checked ? (
                        <Check size={15} strokeWidth={2.5} />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                      )}
                    </button>

                    {/* Letter badge */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-xs font-bold text-foreground shadow-xs">
                      {String.fromCharCode(65 + optionIndex)}
                    </div>

                    {/* Option Text Input */}
                    <Input
                      value={option}
                      maxLength={MAX_OPTION_CHARS}
                      onChange={(event) =>
                        handleOptionChange(optionIndex, event.target.value)
                      }
                      placeholder={`Жауап ${optionIndex + 1}`}
                      className="h-10 flex-1 rounded-xl bg-card border-0 px-3.5 text-sm shadow-xs focus:ring-2 focus:ring-primary/20"
                    />

                    {checked ? (
                      <StatusBadge tone="success" className="shrink-0 hidden sm:inline-flex">
                        <CheckCircle2 size={12} />
                        Дұрыс
                      </StatusBadge>
                    ) : null}

                    {/* Delete button */}
                    {questionForm.options.length > MIN_OPTIONS ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveOption(optionIndex)}
                        className="rounded-xl text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                        aria-label="Өшіру"
                      >
                        <Trash2 size={15} />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {questionForm.options.length < MAX_OPTIONS ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleAddOption}
                className="w-full rounded-2xl border-0 bg-muted/40 hover:bg-muted/65 py-3 h-auto text-xs font-semibold shadow-xs"
              >
                <Plus size={15} className="mr-1.5" />
                Нұсқа қосу
              </Button>
            ) : null}
          </section>

          {/* Section 3: Түсіндірме */}
          <section className="space-y-2">
            <h2 className="text-sm font-bold tracking-tight text-foreground">
              Түсіндірме
            </h2>

            <Textarea
              rows={2}
              value={questionForm.explanation}
              maxLength={MAX_EXPLANATION_CHARS}
              onChange={(event) =>
                updateField(
                  'explanation',
                  sanitizeInputValue(event.target.value, MAX_EXPLANATION_CHARS),
                )
              }
              placeholder="Түсіндірме"
              className="resize-none rounded-2xl bg-muted/40 p-4 text-sm border-0 shadow-xs focus:bg-card focus:ring-2 focus:ring-primary/20"
            />
          </section>
        </div>
      </main>

      {/* Sticky Bottom Action Bar */}
      <footer className="h-16 sm:h-20 shrink-0 border-t border-border/40 bg-card/85 backdrop-blur-md px-4 sm:px-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!questionForm.questionText.trim() ? (
            <span className="text-xs text-muted-foreground">
              Сұрақ мәтінін жазыңыз
            </span>
          ) : validOptionsCount < 2 ? (
            <span className="text-xs text-muted-foreground">
              Кемінде 2 нұсқа
            </span>
          ) : correctCount === 0 ? (
            <span className="text-xs text-warning-foreground font-medium">
              Дұрыс жауапты таңдаңыз
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
              <CheckCircle2 size={14} />
              Дайын
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="rounded-full text-xs font-semibold"
            disabled={isSaving}
          >
            Болдырмау
          </Button>

          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave || isSaving}
            className="rounded-full shadow-xs px-6 sm:px-8 text-xs font-semibold"
          >
            <Check size={15} className="mr-1.5" />
            {isSaving ? 'Сақталуда...' : saveActionLabel}
          </Button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
