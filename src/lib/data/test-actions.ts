import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { execOrThrow, localizedText, queryOrThrow } from './common';

/* ================= HELPERS ================= */

function normalizeIndexes(value: number[]): number[] {
  return [...new Set(value.map(Number))]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user?.id) {
    throw new Error('Авторизация қажет.');
  }

  return user.id;
}

async function assertCourseOwner(courseId: string) {
  const trimmedCourseId = courseId.trim();

  if (!trimmedCourseId) {
    throw new Error('Course ID бос болмауы керек.');
  }

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('courses')
    .select('id, teacher_id')
    .eq('id', trimmedCourseId)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Бұл курсқа тест құруға немесе өңдеуге рұқсатыңыз жоқ.');
  }

  return {
    userId,
    courseId: data.id,
  };
}

async function assertTestOwner(testId: string) {
  const trimmedTestId = testId.trim();

  if (!trimmedTestId) {
    throw new Error('Test ID бос болмауы керек.');
  }

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('tests')
    .select('id, course_id, created_by, courses!inner(id, teacher_id)')
    .eq('id', trimmedTestId)
    .eq('courses.teacher_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Бұл тестті өңдеуге рұқсатыңыз жоқ.');
  }

  const row = data as unknown as {
    id: string;
    course_id: string | null;
    created_by: string | null;
  };

  if (!row.course_id) {
    throw new Error('Бұл тест курсқа байланбаған. Алдымен тестті курсқа тіркеу керек.');
  }

  return {
    userId,
    testId: row.id,
    courseId: row.course_id,
  };
}

async function assertTestQuestionOwner(questionId: string) {
  const trimmedQuestionId = questionId.trim();

  if (!trimmedQuestionId) {
    throw new Error('Question ID бос болмауы керек.');
  }

  const { data, error } = await supabase
    .from('test_questions')
    .select('id, test_id')
    .eq('id', trimmedQuestionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Тест сұрағы табылмады.');
  }

  const row = data as {
    id: string;
    test_id: string;
  };

  await assertTestOwner(row.test_id);

  return row;
}

function assertQuestionPayload(input: {
  options?: string[];
  correctAnswer?: number[];
}) {
  if (input.options !== undefined && input.options.length < 2) {
    throw new Error('Кемінде 2 жауап нұсқасы болуы керек.');
  }

  if (input.correctAnswer !== undefined) {
    const normalized = normalizeIndexes(input.correctAnswer);

    if (!normalized.length) {
      throw new Error('Дұрыс жауап таңдалуы керек.');
    }

    if (input.options !== undefined) {
      const invalidIndex = normalized.some(
        (index) => index < 0 || index >= input.options!.length
      );

      if (invalidIndex) {
        throw new Error('Дұрыс жауап индексі жауап нұсқаларына сәйкес емес.');
      }
    }
  }
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
  await assertTestOwner(input.testId);

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
  await assertTestQuestionOwner(input.questionId);

  assertQuestionPayload({
    options: input.options,
    correctAnswer: input.correctAnswer,
  });

  const patch: Partial<Tables<'test_questions'>> = {};

  if (input.questionText !== undefined) patch.question_text = input.questionText;

  if (input.options !== undefined) {
    patch.options = input.options;
  }

  if (input.correctAnswer !== undefined) {
    patch.correct_answer = normalizeIndexes(input.correctAnswer);
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
  courseId: string;
  subjectId?: string;
  topic?: string;
  durationMinutes?: number;
  createdBy?: string;
  status?: Tables<'tests'>['status'];
}) {
  const { userId, courseId } = await assertCourseOwner(input.courseId);

  return queryOrThrow(
    supabase
      .from('tests')
      .insert({
        title: input.title,
        course_id: courseId,
        subject_id: input.subjectId || null,
        topic: input.topic || null,
        duration_minutes:
          input.durationMinutes === undefined
            ? null
            : Number(input.durationMinutes),
        created_by: userId,
        status: input.status || 'draft',
      } as never)
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
  await assertTestOwner(input.testId);

  assertQuestionPayload({
    options: input.options,
    correctAnswer: input.correctAnswer,
  });

  const normalizedAnswer = normalizeIndexes(input.correctAnswer);

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
  await assertTestOwner(testId);

  const { error } = await supabase
    .from('tests')
    .update({ status })
    .eq('id', testId);

  if (error) throw new Error(error.message);
}

/* ================= DELETE ================= */

export async function deleteTestQuestion(questionId: string) {
  await assertTestQuestionOwner(questionId);

  await execOrThrow(
    supabase.rpc('delete_test_question_deep' as never, {
      p_question_id: questionId,
    } as never)
  );
}

export async function deleteTest(testId: string) {
  await assertTestOwner(testId);

  const result = await supabase.rpc('delete_test_deep' as never, {
    p_test_id: testId,
  } as never);

  await execOrThrow(Promise.resolve(result));
}

/* ================= REORDER ================= */

export async function reorderTestQuestions(
  testId: string,
  orderedQuestionIds: string[]
) {
  await assertTestOwner(testId);

  const questions = await queryOrThrow(
    supabase
      .from('test_questions')
      .select('id, test_id')
      .in('id', orderedQuestionIds)
  );

  const validIds = new Set(
    questions
      .filter((question) => question.test_id === testId)
      .map((question) => question.id)
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