import type {
  LessonMiniQuizQuestionType,
  LessonMiniQuizQuestionView,
} from '@/lib/app-data-types';

export const miniQuizQuestionTypes: LessonMiniQuizQuestionType[] = [
  'single_choice',
  'multiple_choice',
];

export function getMiniQuizQuestionTypeLabel(type: LessonMiniQuizQuestionType) {
  const map: Record<LessonMiniQuizQuestionType, string> = {
    single_choice: 'Бір дұрыс жауап',
    multiple_choice: 'Бірнеше дұрыс жауап',
  };

  return map[type] || type;
}

export function normalizeQuestionOptions(options: string[]) {
  return options.map((option) => option.trim()).filter(Boolean);
}

export function getNextMiniQuizQuestionSortOrder(
  questions: LessonMiniQuizQuestionView[] = []
) {
  const maxSortOrder = questions.reduce(
    (max, question) => Math.max(max, Number(question.sortOrder) || 0),
    0
  );

  return String(maxSortOrder + 1);
}
