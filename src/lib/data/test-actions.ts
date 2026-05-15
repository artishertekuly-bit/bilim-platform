import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { execOrThrow, localizedText, queryOrThrow } from './common';

/* ================= TYPES ================= */

type TestStatus = Tables<'tests'>['status'];
type QuestionType = Tables<'test_questions'>['question_type'];

type TestRowWithCourse = Tables<'tests'> & {
  course_id?: string | null;
};

type TestQuestionPatch = Partial<Tables<'test_questions'>>;

/* ================= HELPERS ================= */

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeDuration(value: unknown) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Тест ұзақтығы 1 минуттан жоғары болуы керек.');
  }

  return Math.round(parsed);
}

function normalizeIndexes(value: number[]): number[] {
  return [...new Set(value.map(Number))]
    .filter((item) => Number.isInteger(item) && item >= 0)
    .sort((a, b) => a - b);
}

function isMissingCourseIdSchemaError(message: string) {
  return (
    /course_id/i.test(message) &&
    (/does not exist/i.test(message) ||
      /schema cache/i.test(message) ||
      /column/i.test(message))
  );
}

function assertUuidLike(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} бос болмауы керек.`);
  }
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

  assertUuidLike(trimmedCourseId, 'Course ID');

  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('courses')
    .select('id, teacher_id, subject_id')
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
    subjectId: data.subject_id,
  };
}

async function getTestRowWithCourse(testId: string): Promise<TestRowWithCourse> {
  const trimmedTestId = testId.trim();

  assertUuidLike(trimmedTestId, 'Test ID');

  const { data, error } = await supabase
    .from('tests' as never)
    .select('*')
    .eq('id', trimmedTestId)
    .maybeSingle();

  if (error) {
    if (isMissingCourseIdSchemaError(error.message || '')) {
      throw new Error(
        'Supabase schema толық емес: tests.course_id бағаны жоқ. Course-based test builder үшін tests кестесіне course_id uuid references courses(id) қосу керек.',
      );
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Тест табылмады.');
  }

  return data as unknown as TestRowWithCourse;
}

async function assertTestOwner(testId: string) {
  const row = await getTestRowWithCourse(testId);
  const courseId = row.course_id;

  if (!courseId) {
    throw new Error(
      'Бұл тест курсқа байланбаған. Course-based test builder үшін әр тестте course_id болуы керек.',
    );
  }

  const owner = await assertCourseOwner(courseId);

  return {
    userId: owner.userId,
    testId: row.id,
    courseId,
    test: row,
  };
}

async function assertTestQuestionOwner(questionId: string) {
  const trimmedQuestionId = questionId.trim();

  assertUuidLike(trimmedQuestionId, 'Question ID');

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
  questionText?: string;
  options?: string[];
  correctAnswer?: number[];
  questionType?: QuestionType;
}) {
  if (input.questionText !== undefined && !normalizeText(input.questionText)) {
    throw new Error('Сұрақ мәтіні міндетті.');
  }

  const normalizedOptions =
    input.options?.map((option) => normalizeText(option)).filter(Boolean) ?? undefined;

  if (normalizedOptions !== undefined && normalizedOptions.length < 2) {
    throw new Error('Кемінде 2 жауап нұсқасы болуы керек.');
  }

  if (input.correctAnswer !== undefined) {
    const normalized = normalizeIndexes(input.correctAnswer);

    if (!normalized.length) {
      throw new Error('Дұрыс жауап таңдалуы керек.');
    }

    if (normalizedOptions !== undefined) {
      const invalidIndex = normalized.some(
        (index) => index < 0 || index >= normalizedOptions.length,
      );

      if (invalidIndex) {
        throw new Error('Дұрыс жауап индексі жауап нұсқаларына сәйкес емес.');
      }
    }

    if (input.questionType === 'single_choice' && normalized.length > 1) {
      throw new Error('Single choice сұрақта бір ғана дұрыс жауап болуы керек.');
    }
  }
}

function normalizeQuestionOptions(options: string[]) {
  return options.map((option) => normalizeText(option)).filter(Boolean);
}

/* ================= UPDATE ================= */

export async function updateTest(input: {
  testId: string;
  title?: string;
  topic?: string | null;
  subjectId?: string | null;
  durationMinutes?: number | null;
  status?: TestStatus;
}) {
  await assertTestOwner(input.testId);

  const patch: Partial<Tables<'tests'>> = {};

  if (input.title !== undefined) {
    const title = normalizeText(input.title);

    if (!title) {
      throw new Error('Тест атауы міндетті.');
    }

    patch.title = title;
  }

  if (input.topic !== undefined) {
    patch.topic = normalizeNullableText(input.topic);
  }

  if (input.subjectId !== undefined) {
    patch.subject_id = input.subjectId || null;
  }

  if (input.durationMinutes !== undefined) {
    patch.duration_minutes = normalizeDuration(input.durationMinutes);
  }

  if (input.status !== undefined) {
    patch.status = input.status;
  }

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
  questionType?: QuestionType;
}) {
  await assertTestQuestionOwner(input.questionId);

  const normalizedOptions =
    input.options !== undefined ? normalizeQuestionOptions(input.options) : undefined;

  assertQuestionPayload({
    questionText: input.questionText,
    options: normalizedOptions,
    correctAnswer: input.correctAnswer,
    questionType: input.questionType,
  });

  const patch: TestQuestionPatch = {};

  if (input.questionText !== undefined) {
    patch.question_text = normalizeText(input.questionText);
  }

  if (normalizedOptions !== undefined) {
    patch.options = normalizedOptions;
  }

  if (input.correctAnswer !== undefined) {
    patch.correct_answer = normalizeIndexes(input.correctAnswer);
  }

  if (input.explanation !== undefined) {
    patch.explanation = normalizeNullableText(input.explanation);
  }

  if (input.sortOrder !== undefined) {
    patch.sort_order = Math.max(1, Math.round(Number(input.sortOrder) || 1));
  }

  if (input.questionType !== undefined) {
    patch.question_type = input.questionType;
  }

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
  status?: TestStatus;
}) {
  const title = normalizeText(input.title);

  if (!title) {
    throw new Error('Тест атауы міндетті.');
  }

  const { userId, courseId, subjectId: courseSubjectId } = await assertCourseOwner(
    input.courseId,
  );

  const durationMinutes = normalizeDuration(input.durationMinutes ?? null);

  return queryOrThrow(
    supabase
      .from('tests' as never)
      .insert({
        title,
        course_id: courseId,
        subject_id: input.subjectId || courseSubjectId || null,
        topic: normalizeNullableText(input.topic),
        duration_minutes: durationMinutes,
        created_by: userId,
        status: input.status || 'draft',
      } as never)
      .select('*')
      .single(),
  ) as Promise<Tables<'tests'>>;
}

export async function createTestQuestion(input: {
  testId: string;
  questionText: string;
  options: string[];
  correctAnswer: number[];
  explanation?: string;
  sortOrder?: number;
  questionType?: QuestionType;
}) {
  await assertTestOwner(input.testId);

  const questionText = normalizeText(input.questionText);
  const options = normalizeQuestionOptions(input.options);
  const normalizedAnswer = normalizeIndexes(input.correctAnswer);
  const questionType =
    input.questionType ||
    (normalizedAnswer.length > 1 ? 'multiple_choice' : 'single_choice');

  assertQuestionPayload({
    questionText,
    options,
    correctAnswer: normalizedAnswer,
    questionType,
  });

  return queryOrThrow(
    supabase
      .from('test_questions')
      .insert({
        test_id: input.testId,
        question_text: questionText,
        options,
        correct_answer: normalizedAnswer,
        explanation: normalizeNullableText(input.explanation),
        sort_order: Math.max(1, Math.round(Number(input.sortOrder) || 1)),
        question_type: questionType,
      })
      .select('*')
      .single(),
  );
}

/* ================= STATUS ================= */

export async function updateTestStatus(testId: string, status: TestStatus) {
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
    } as never),
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
  orderedQuestionIds: string[],
) {
  const { testId: ownedTestId } = await assertTestOwner(testId);

  const normalizedIds = [...new Set(orderedQuestionIds.map((id) => id.trim()).filter(Boolean))];

  if (normalizedIds.length !== orderedQuestionIds.length) {
    throw new Error(
      localizedText(
        'kk',
        'Сұрақтар тізімінде бос немесе қайталанған ID бар.',
        'В списке вопросов есть пустые или повторяющиеся ID.',
      ),
    );
  }

  if (normalizedIds.length === 0) {
    return;
  }

  const questions = await queryOrThrow(
    supabase
      .from('test_questions')
      .select('id, test_id')
      .in('id', normalizedIds),
  );

  const validIds = new Set(
    questions
      .filter((question) => question.test_id === ownedTestId)
      .map((question) => question.id),
  );

  if (validIds.size !== normalizedIds.length) {
    throw new Error(
      localizedText(
        'kk',
        'Сұрақтар тізімі жарамсыз.',
        'Некорректный список вопросов.',
      ),
    );
  }

  await Promise.all(
    normalizedIds.map((questionId, index) =>
      updateTestQuestion({
        questionId,
        sortOrder: index + 1,
      }),
    ),
  );
}