import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { deleteContentReviewsSafe, localizedText, queryOrThrow } from './common';

/* ================= HELPERS ================= */

function normalizeIndexes(value: number[]): number[] {
  return [...new Set(value.map(Number))]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/* ================= UPDATE ================= */

export async function updateTest(input: {
  testId: string;
  title?: string;
  topic?: string | null;
  subjectId?: string | null;
  durationMinutes?: number | null;
  status?: Tables<'tests'>['status'];
}) {
  const patch: Partial<Tables<'tests'>> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.topic !== undefined) patch.topic = input.topic;
  if (input.subjectId !== undefined) patch.subject_id = input.subjectId;

  if (input.durationMinutes !== undefined) {
    patch.duration_minutes =
      input.durationMinutes === null ? null : Number(input.durationMinutes);
  }

  if (input.status !== undefined) patch.status = input.status;

  const { error } = await supabase
    .from('tests')
    .update(patch)
    .eq('id', input.testId);

  if (error) throw new Error(error.message);
}

export async function updateTestQuestion(input: {
  questionId: string;
  questionText?: string;
  options?: string[];
  correctAnswer?: number[];
  explanation?: string | null;
  sortOrder?: number;
  questionType?: Tables<'test_questions'>['question_type'];
}) {
  const patch: Partial<Tables<'test_questions'>> = {};

  if (input.questionText !== undefined) patch.question_text = input.questionText;

  if (input.options !== undefined) {
    if (!input.options.length) {
      throw new Error('Options cannot be empty');
    }
    patch.options = input.options;
  }

  if (input.correctAnswer !== undefined) {
    const normalized = normalizeIndexes(input.correctAnswer);
    if (!normalized.length) {
      throw new Error('Correct answer cannot be empty');
    }
    patch.correct_answer = normalized;
  }

  if (input.explanation !== undefined) patch.explanation = input.explanation;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.questionType !== undefined) patch.question_type = input.questionType;

  const { error } = await supabase
    .from('test_questions')
    .update(patch)
    .eq('id', input.questionId);

  if (error) throw new Error(error.message);
}

/* ================= CREATE ================= */

export async function createTest(input: {
  title: string;
  subjectId?: string;
  topic?: string;
  durationMinutes?: number;
  createdBy: string;
  status?: Tables<'tests'>['status'];
}) {
  return queryOrThrow(
    supabase
      .from('tests')
      .insert({
        title: input.title,
        subject_id: input.subjectId || null,
        topic: input.topic || null,
        duration_minutes:
          input.durationMinutes === undefined
            ? null
            : Number(input.durationMinutes),
        created_by: input.createdBy,
        status: input.status || 'draft',
      })
      .select('*')
      .single()
  );
}

export async function createTestQuestion(input: {
  testId: string;
  questionText: string;
  options: string[];
  correctAnswer: number[];
  explanation?: string;
  sortOrder?: number;
  questionType?: Tables<'test_questions'>['question_type'];
}) {
  if (!input.options.length) {
    throw new Error('Options required');
  }

  const normalizedAnswer = normalizeIndexes(input.correctAnswer);

  if (!normalizedAnswer.length) {
    throw new Error('Correct answer required');
  }

  return queryOrThrow(
    supabase
      .from('test_questions')
      .insert({
        test_id: input.testId,
        question_text: input.questionText,
        options: input.options,
        correct_answer: normalizedAnswer,
        explanation: input.explanation || null,
        sort_order: input.sortOrder || 1,
        question_type:
          input.questionType ||
          (normalizedAnswer.length > 1 ? 'multiple_choice' : 'single_choice'),
      })
      .select('*')
      .single()
  );
}

/* ================= STATUS ================= */

export async function updateTestStatus(
  testId: string,
  status: Tables<'tests'>['status']
) {
  const { error } = await supabase
    .from('tests')
    .update({ status })
    .eq('id', testId);

  if (error) throw new Error(error.message);
}

/* ================= DELETE ================= */

export async function deleteTestQuestion(questionId: string) {
  await queryOrThrow(
    supabase.from('test_attempt_answers').delete().eq('question_id', questionId)
  );

  const { error } = await supabase
    .from('test_questions')
    .delete()
    .eq('id', questionId);

  if (error) throw new Error(error.message);
}

export async function deleteTest(testId: string) {
  const [questions, attempts] = await Promise.all([
    queryOrThrow(
      supabase.from('test_questions').select('id').eq('test_id', testId)
    ),
    queryOrThrow(
      supabase.from('test_attempts').select('id').eq('test_id', testId)
    ),
  ]);

  const questionIds = questions.map((q) => q.id);
  const attemptIds = attempts.map((a) => a.id);

  // 🔥 delete answers FIRST (both cases)
  if (questionIds.length) {
    await queryOrThrow(
      supabase.from('test_attempt_answers').delete().in('question_id', questionIds)
    );
  }

  if (attemptIds.length) {
    await queryOrThrow(
      supabase.from('test_attempt_answers').delete().in('attempt_id', attemptIds)
    );
  }

  if (questionIds.length) {
    await queryOrThrow(
      supabase.from('test_questions').delete().in('id', questionIds)
    );
  }

  if (attemptIds.length) {
    await queryOrThrow(
      supabase.from('test_attempts').delete().in('id', attemptIds)
    );
  }

  await deleteContentReviewsSafe(testId);

  const { error } = await supabase
    .from('tests')
    .delete()
    .eq('id', testId);

  if (error) throw new Error(error.message);
}

/* ================= REORDER ================= */

export async function reorderTestQuestions(
  testId: string,
  orderedQuestionIds: string[]
) {
  const questions = await queryOrThrow(
    supabase
      .from('test_questions')
      .select('id, test_id')
      .in('id', orderedQuestionIds)
  );

  const validIds = new Set(
    questions
      .filter((q) => q.test_id === testId)
      .map((q) => q.id)
  );

  if (validIds.size !== orderedQuestionIds.length) {
    throw new Error(
      localizedText(
        'kk',
        'Сұрақтар тізімі жарамсыз',
        'Некорректный список вопросов'
      )
    );
  }

  await Promise.all(
    orderedQuestionIds.map((id, index) =>
      updateTestQuestion({
        questionId: id,
        sortOrder: index + 1,
      })
    )
  );
}