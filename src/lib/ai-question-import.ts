import type { GeneratedQuestion } from '@/lib/ai-api';

const PENDING_AI_QUESTION_IMPORT_KEY = 'pending-ai-question-import';

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

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function parseCorrectAnswerIndexes(question: GeneratedQuestion): number[] {
  if (question.options?.length) {
    const byFlags = question.options
      .map((option, index) => (option.isCorrect ? index : -1))
      .filter((value) => value >= 0);

    if (byFlags.length > 0) {
      return Array.from(new Set(byFlags)).sort((a, b) => a - b);
    }
  }

  if (!question.correctAnswer || !question.options?.length) return [];

  const trimmed = question.correctAnswer.trim();

  const matchedByText = question.options
    .map((option, index) =>
      option.text.trim().toLowerCase() === trimmed.toLowerCase() ? index : -1
    )
    .filter((value) => value >= 0);

  if (matchedByText.length > 0) {
    return Array.from(new Set(matchedByText)).sort((a, b) => a - b);
  }

  return Array.from(
    new Set(
      trimmed
        .split(',')
        .map((item) => Number(item.trim()) - 1)
        .filter(
          (value) =>
            Number.isFinite(value) &&
            value >= 0 &&
            value < (question.options?.length || 0)
        )
    )
  ).sort((a, b) => a - b);
}

function normalizeImportableQuestions(
  questions: GeneratedQuestion[]
): { normalized: PendingAiImportQuestion[]; skippedCount: number } {
  const normalized: PendingAiImportQuestion[] = [];
  let skippedCount = 0;

  for (const question of questions) {
    if (question.type !== 'multiple_choice') {
      skippedCount += 1;
      continue;
    }

    const questionText = question.question.trim();
    if (!questionText) {
      skippedCount += 1;
      continue;
    }

    const options =
      question.options?.map((option) => option.text.trim()).filter(Boolean) || [];

    if (options.length < 2) {
      skippedCount += 1;
      continue;
    }

    const correctAnswer = parseCorrectAnswerIndexes(question);

    if (correctAnswer.length === 0) {
      skippedCount += 1;
      continue;
    }

    normalized.push({
      questionText,
      options,
      correctAnswer,
      explanation: question.explanation?.trim() || null,
      questionType: correctAnswer.length > 1 ? 'multiple_choice' : 'single_choice',
      difficulty: toTrimmedString(question.difficulty),
      topic: toTrimmedString(question.topic),
    });
  }

  return { normalized, skippedCount };
}

function isPendingAiImportQuestion(value: unknown): value is PendingAiImportQuestion {
  if (!value || typeof value !== 'object') return false;

  const row = value as Record<string, unknown>;

  return (
    typeof row.questionText === 'string' &&
    Array.isArray(row.options) &&
    row.options.every((item) => typeof item === 'string') &&
    Array.isArray(row.correctAnswer) &&
    row.correctAnswer.every((item) => typeof item === 'number') &&
    (row.questionType === 'single_choice' || row.questionType === 'multiple_choice')
  );
}

function isPendingAiQuestionImport(value: unknown): value is PendingAiQuestionImport {
  if (!value || typeof value !== 'object') return false;

  const row = value as Record<string, unknown>;

  return (
    row.source === 'ai-question-builder' &&
    typeof row.titleSuggestion === 'string' &&
    typeof row.createdAt === 'string' &&
    typeof row.skippedCount === 'number' &&
    Array.isArray(row.questions) &&
    row.questions.every(isPendingAiImportQuestion)
  );
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
    titleSuggestion: input.titleSuggestion.trim() || 'AI generated test',
    topic: toTrimmedString(input.topic),
    subject: toTrimmedString(input.subject),
    createdAt: new Date().toISOString(),
    questions: normalized,
    skippedCount,
  };

  const storage = getStorage();
  storage?.setItem(PENDING_AI_QUESTION_IMPORT_KEY, JSON.stringify(payload));

  return payload;
}

export function getPendingAiQuestionImport(): PendingAiQuestionImport | null {
  const storage = getStorage();
  const raw = storage?.getItem(PENDING_AI_QUESTION_IMPORT_KEY);

  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isPendingAiQuestionImport(parsed)) {
      storage?.removeItem(PENDING_AI_QUESTION_IMPORT_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage?.removeItem(PENDING_AI_QUESTION_IMPORT_KEY);
    return null;
  }
}

export function clearPendingAiQuestionImport() {
  const storage = getStorage();
  storage?.removeItem(PENDING_AI_QUESTION_IMPORT_KEY);
}