import type { GeneratedQuestion } from '@/lib/ai-api';

const PENDING_AI_QUESTION_IMPORT_KEY = 'pending-ai-question-import';

const MAX_TITLE_CHARS = 180;
const MAX_TOPIC_CHARS = 180;
const MAX_SUBJECT_CHARS = 180;
const MAX_QUESTION_TEXT_CHARS = 2_000;
const MAX_OPTION_TEXT_CHARS = 500;
const MAX_EXPLANATION_CHARS = 2_000;
const MAX_DIFFICULTY_CHARS = 80;
const MAX_IMPORTED_QUESTIONS = 100;

export type PendingAiImportQuestion = {
  questionText: string;
  options: string[];
  correctAnswer: number[];
  explanation?: string | null;
  questionType: 'single_choice' | 'multiple_choice';
  difficulty?: string;
  topic?: string;
};

export type PendingAiQuestionImport = {
  source: 'ai-question-builder';
  titleSuggestion: string;
  topic?: string;
  subject?: string;
  createdAt: string;
  questions: PendingAiImportQuestion[];
  skippedCount: number;
};

type NormalizedOption = {
  originalIndex: number;
  text: string;
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, limit?: number) {
  const normalized = String(value ?? '')
    .replace(/\x00/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return typeof limit === 'number'
    ? normalized.slice(0, limit).trim()
    : normalized;
}

function toOptionalString(value: unknown, limit?: number): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = cleanText(value, limit);

  return normalized || undefined;
}

function normalizeOptions(question: GeneratedQuestion): NormalizedOption[] {
  if (!Array.isArray(question.options)) return [];

  return question.options
    .map((option, index) => ({
      originalIndex: index,
      text: cleanText(option?.text, MAX_OPTION_TEXT_CHARS),
    }))
    .filter((option) => option.text.length > 0);
}

function getCorrectIndexesByFlags(question: GeneratedQuestion) {
  if (!Array.isArray(question.options)) return [];

  return question.options
    .map((option, index) => (option?.isCorrect ? index : -1))
    .filter((index) => index >= 0);
}

function getCorrectIndexesByText(
  question: GeneratedQuestion,
  normalizedOptions: NormalizedOption[],
) {
  const correctAnswer = cleanText(question.correctAnswer);

  if (!correctAnswer) return [];

  const lowerCorrectAnswer = correctAnswer.toLowerCase();

  return normalizedOptions
    .map((option) =>
      option.text.toLowerCase() === lowerCorrectAnswer ? option.originalIndex : -1,
    )
    .filter((index) => index >= 0);
}

function getCorrectIndexesByNumericAnswer(
  question: GeneratedQuestion,
  optionCount: number,
) {
  const correctAnswer = cleanText(question.correctAnswer);

  if (!correctAnswer) return [];

  return correctAnswer
    .split(',')
    .map((item) => Number(item.trim()) - 1)
    .filter(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < optionCount,
    );
}

function remapCorrectIndexesToNormalizedOptions(
  originalCorrectIndexes: number[],
  normalizedOptions: NormalizedOption[],
) {
  const indexMap = new Map(
    normalizedOptions.map((option, normalizedIndex) => [
      option.originalIndex,
      normalizedIndex,
    ]),
  );

  return Array.from(
    new Set(
      originalCorrectIndexes
        .map((originalIndex) => indexMap.get(originalIndex))
        .filter(
          (index): index is number =>
            typeof index === 'number' &&
            Number.isInteger(index) &&
            index >= 0 &&
            index < normalizedOptions.length,
        ),
    ),
  ).sort((a, b) => a - b);
}

function parseCorrectAnswerIndexes(
  question: GeneratedQuestion,
  normalizedOptions: NormalizedOption[],
): number[] {
  const originalOptionCount = Array.isArray(question.options)
    ? question.options.length
    : 0;

  const byFlags = getCorrectIndexesByFlags(question);
  if (byFlags.length > 0) {
    return remapCorrectIndexesToNormalizedOptions(byFlags, normalizedOptions);
  }

  const byText = getCorrectIndexesByText(question, normalizedOptions);
  if (byText.length > 0) {
    return remapCorrectIndexesToNormalizedOptions(byText, normalizedOptions);
  }

  const byNumericAnswer = getCorrectIndexesByNumericAnswer(
    question,
    originalOptionCount,
  );

  return remapCorrectIndexesToNormalizedOptions(
    byNumericAnswer,
    normalizedOptions,
  );
}

function normalizeImportableQuestions(
  questions: GeneratedQuestion[],
): {
  normalized: PendingAiImportQuestion[];
  skippedCount: number;
} {
  const normalized: PendingAiImportQuestion[] = [];
  let skippedCount = 0;

  for (const question of questions.slice(0, MAX_IMPORTED_QUESTIONS)) {
    if (question.type !== 'multiple_choice') {
      skippedCount += 1;
      continue;
    }

    const questionText = cleanText(question.question, MAX_QUESTION_TEXT_CHARS);

    if (!questionText) {
      skippedCount += 1;
      continue;
    }

    const normalizedOptions = normalizeOptions(question);

    if (normalizedOptions.length < 2) {
      skippedCount += 1;
      continue;
    }

    const correctAnswer = parseCorrectAnswerIndexes(question, normalizedOptions);

    if (correctAnswer.length === 0) {
      skippedCount += 1;
      continue;
    }

    normalized.push({
      questionText,
      options: normalizedOptions.map((option) => option.text),
      correctAnswer,
      explanation: toOptionalString(question.explanation, MAX_EXPLANATION_CHARS) || null,
      questionType: correctAnswer.length > 1 ? 'multiple_choice' : 'single_choice',
      difficulty: toOptionalString(question.difficulty, MAX_DIFFICULTY_CHARS),
      topic: toOptionalString(question.topic, MAX_TOPIC_CHARS),
    });
  }

  if (questions.length > MAX_IMPORTED_QUESTIONS) {
    skippedCount += questions.length - MAX_IMPORTED_QUESTIONS;
  }

  return {
    normalized,
    skippedCount,
  };
}

function isValidCorrectAnswerIndexes(value: unknown, optionsLength: number) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === 'number' &&
        Number.isInteger(item) &&
        item >= 0 &&
        item < optionsLength,
    )
  );
}

function isPendingAiImportQuestion(
  value: unknown,
): value is PendingAiImportQuestion {
  if (!value || typeof value !== 'object') return false;

  const row = value as Record<string, unknown>;

  if (typeof row.questionText !== 'string' || !row.questionText.trim()) {
    return false;
  }

  if (
    !Array.isArray(row.options) ||
    row.options.length < 2 ||
    !row.options.every((item) => typeof item === 'string' && item.trim().length > 0)
  ) {
    return false;
  }

  if (!isValidCorrectAnswerIndexes(row.correctAnswer, row.options.length)) {
    return false;
  }

  if (row.questionType !== 'single_choice' && row.questionType !== 'multiple_choice') {
    return false;
  }

  if (
    row.questionType === 'single_choice' &&
    Array.isArray(row.correctAnswer) &&
    row.correctAnswer.length !== 1
  ) {
    return false;
  }

  return true;
}

function isValidIsoDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp);
}

function isPendingAiQuestionImport(value: unknown): value is PendingAiQuestionImport {
  if (!value || typeof value !== 'object') return false;

  const row = value as Record<string, unknown>;

  return (
    row.source === 'ai-question-builder' &&
    typeof row.titleSuggestion === 'string' &&
    row.titleSuggestion.trim().length > 0 &&
    isValidIsoDate(row.createdAt) &&
    typeof row.skippedCount === 'number' &&
    Number.isInteger(row.skippedCount) &&
    row.skippedCount >= 0 &&
    Array.isArray(row.questions) &&
    row.questions.length <= MAX_IMPORTED_QUESTIONS &&
    row.questions.every(isPendingAiImportQuestion)
  );
}

function safeWriteToStorage(payload: PendingAiQuestionImport) {
  const storage = getStorage();

  if (!storage) return;

  try {
    storage.setItem(PENDING_AI_QUESTION_IMPORT_KEY, JSON.stringify(payload));
  } catch {
    storage.removeItem(PENDING_AI_QUESTION_IMPORT_KEY);
  }
}

function safeRemoveFromStorage() {
  const storage = getStorage();

  try {
    storage?.removeItem(PENDING_AI_QUESTION_IMPORT_KEY);
  } catch {
    // Session storage cleanup failure should not block UI flow.
  }
}

export function savePendingAiQuestionImport(input: {
  titleSuggestion: string;
  topic?: string;
  subject?: string;
  questions: GeneratedQuestion[];
}): PendingAiQuestionImport {
  const { normalized, skippedCount } = normalizeImportableQuestions(input.questions);

  const payload: PendingAiQuestionImport = {
    source: 'ai-question-builder',
    titleSuggestion: cleanText(input.titleSuggestion, MAX_TITLE_CHARS) || 'AI тест',
    topic: toOptionalString(input.topic, MAX_TOPIC_CHARS),
    subject: toOptionalString(input.subject, MAX_SUBJECT_CHARS),
    createdAt: new Date().toISOString(),
    questions: normalized,
    skippedCount,
  };

  safeWriteToStorage(payload);

  return payload;
}

export function getPendingAiQuestionImport(): PendingAiQuestionImport | null {
  const storage = getStorage();

  if (!storage) return null;

  const raw = storage.getItem(PENDING_AI_QUESTION_IMPORT_KEY);

  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isPendingAiQuestionImport(parsed)) {
      safeRemoveFromStorage();
      return null;
    }

    return parsed;
  } catch {
    safeRemoveFromStorage();
    return null;
  }
}

export function clearPendingAiQuestionImport() {
  safeRemoveFromStorage();
}