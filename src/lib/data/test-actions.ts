import { supabase } from '@/integrations/supabase/client';
import type {
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/integrations/supabase/types';
import { execOrThrow, localizedText, queryOrThrow } from './common';

/* ================= TYPES ================= */

type TestRow = Tables<'tests'>;
type TestStatus = Tables<'tests'>['status'];
type TestInsert = TablesInsert<'tests'>;
type TestPatch = TablesUpdate<'tests'>;

type TestQuestionRow = Tables<'test_questions'>;
type QuestionType = Tables<'test_questions'>['question_type'];
type TestQuestionInsert = TablesInsert<'test_questions'>;
type TestQuestionPatch = TablesUpdate<'test_questions'>;

type CurrentUserContext = {
  userId: string;
  isAdmin: boolean;
};

/* ================= NORMALIZE ================= */

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeMultilineText(value: unknown) {
  return String(value ?? '')
    .replace(/\x00/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeNullableMultilineText(value: unknown) {
  const normalized = normalizeMultilineText(value);

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

function normalizeSortOrder(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.round(parsed);
}

function normalizeIndexes(value: readonly number[]) {
  return [...new Set(value.map(Number))]
    .filter((item) => Number.isInteger(item) && item >= 0)
    .sort((a, b) => a - b);
}

function normalizeUnknownIndexes(value: unknown) {
  if (!Array.isArray(value)) return [];

  return normalizeIndexes(value.map(Number));
}

function normalizeQuestionOptions(options: readonly string[]) {
  return options.map((option) => normalizeText(option)).filter(Boolean);
}

function normalizeUnknownStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeQuestionType(
  value: unknown,
  correctAnswer: number[],
): QuestionType {
  if (value === 'single_choice' || value === 'multiple_choice') {
    return value as QuestionType;
  }

  return (correctAnswer.length > 1 ? 'multiple_choice' : 'single_choice') as QuestionType;
}

function toJson(value: unknown): Json {
  return value as Json;
}

/* ================= ASSERTIONS ================= */

function assertNonEmptyId(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} бос болмауы керек.`);
  }
}

function assertTestTitle(title: string) {
  if (!title) {
    throw new Error('Тест атауы міндетті.');
  }
}

function assertQuestionPayload(input: {
  questionText: string;
  options: string[];
  correctAnswer: number[];
  questionType: QuestionType;
}) {
  if (!input.questionText) {
    throw new Error('Сұрақ мәтіні міндетті.');
  }

  if (input.options.length < 2) {
    throw new Error('Кемінде 2 жауап нұсқасы болуы керек.');
  }

  if (input.correctAnswer.length === 0) {
    throw new Error('Дұрыс жауап таңдалуы керек.');
  }

  const invalidIndex = input.correctAnswer.some(
    (index) => index < 0 || index >= input.options.length,
  );

  if (invalidIndex) {
    throw new Error('Дұрыс жауап индексі жауап нұсқаларына сәйкес емес.');
  }

  if (input.questionType === 'single_choice' && input.correctAnswer.length !== 1) {
    throw new Error('Бір дұрыс жауапты сұрақта бір ғана дұрыс жауап болуы керек.');
  }
}

function assertOrderedQuestionIds(ids: string[]) {
  const normalizedIds = [
    ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
  ];

  if (normalizedIds.length !== ids.length) {
    throw new Error(
      localizedText(
        'kk',
        'Сұрақтар тізімінде бос немесе қайталанған ID бар.',
        'В списке вопросов есть пустые или повторяющиеся ID.',
      ),
    );
  }

  return normalizedIds;
}

/* ================= AUTH / OWNERSHIP ================= */

async function getCurrentUserContext(): Promise<CurrentUserContext> {
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

  const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  });

  if (roleError) {
    throw new Error(roleError.message);
  }

  return {
    userId: user.id,
    isAdmin: Boolean(isAdmin),
  };
}

async function assertCourseOwner(courseId: string) {
  const trimmedCourseId = courseId.trim();

  assertNonEmptyId(trimmedCourseId, 'Course ID');

  const { userId, isAdmin } = await getCurrentUserContext();

  const { data, error } = await supabase
    .from('courses')
    .select('id, teacher_id, subject_id')
    .eq('id', trimmedCourseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Курс табылмады.');
  }

  if (!isAdmin && data.teacher_id !== userId) {
    throw new Error('Бұл курсқа тест құруға немесе өңдеуге рұқсатыңыз жоқ.');
  }

  return {
    userId,
    isAdmin,
    courseId: data.id,
    subjectId: data.subject_id,
    teacherId: data.teacher_id,
  };
}

async function assertTestOwner(testId: string) {
  const trimmedTestId = testId.trim();

  assertNonEmptyId(trimmedTestId, 'Test ID');

  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .eq('id', trimmedTestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Тест табылмады.');
  }

  if (!data.course_id) {
    throw new Error(
      'Бұл тест курсқа байланбаған. Курсқа арналған test builder үшін әр тестте course_id болуы керек.',
    );
  }

  const owner = await assertCourseOwner(data.course_id);

  return {
    userId: owner.userId,
    isAdmin: owner.isAdmin,
    testId: data.id,
    courseId: data.course_id,
    test: data,
  };
}

async function assertTestQuestionOwner(questionId: string) {
  const trimmedQuestionId = questionId.trim();

  assertNonEmptyId(trimmedQuestionId, 'Question ID');

  const { data, error } = await supabase
    .from('test_questions')
    .select('*')
    .eq('id', trimmedQuestionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Тест сұрағы табылмады.');
  }

  await assertTestOwner(data.test_id);

  return data;
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

  const patch: TestPatch = {};

  if (input.title !== undefined) {
    const title = normalizeText(input.title);
    assertTestTitle(title);
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
  const currentQuestion = await assertTestQuestionOwner(input.questionId);

  const questionText =
    input.questionText !== undefined
      ? normalizeText(input.questionText)
      : currentQuestion.question_text;

  const options =
    input.options !== undefined
      ? normalizeQuestionOptions(input.options)
      : normalizeUnknownStringArray(currentQuestion.options);

  const correctAnswer =
    input.correctAnswer !== undefined
      ? normalizeIndexes(input.correctAnswer)
      : normalizeUnknownIndexes(currentQuestion.correct_answer);

  const questionType = normalizeQuestionType(
    input.questionType ?? currentQuestion.question_type,
    correctAnswer,
  );

  assertQuestionPayload({
    questionText,
    options,
    correctAnswer,
    questionType,
  });

  const patch: TestQuestionPatch = {};

  if (input.questionText !== undefined) {
    patch.question_text = questionText;
  }

  if (input.options !== undefined) {
    patch.options = toJson(options);
  }

  if (input.correctAnswer !== undefined) {
    patch.correct_answer = toJson(correctAnswer);
  }

  if (input.explanation !== undefined) {
    patch.explanation = normalizeNullableMultilineText(input.explanation);
  }

  if (input.sortOrder !== undefined) {
    patch.sort_order = normalizeSortOrder(input.sortOrder);
  }

  if (input.questionType !== undefined) {
    patch.question_type = questionType;
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
  assertTestTitle(title);

  const { userId, courseId, subjectId: courseSubjectId } = await assertCourseOwner(
    input.courseId,
  );

  const payload: TestInsert = {
    title,
    course_id: courseId,
    subject_id: input.subjectId || courseSubjectId || null,
    topic: normalizeNullableText(input.topic),
    duration_minutes: normalizeDuration(input.durationMinutes ?? null),
    created_by: userId,
    status: input.status || 'draft',
  };

  return queryOrThrow(
    supabase
      .from('tests')
      .insert(payload)
      .select('*')
      .single(),
  ) as Promise<TestRow>;
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
  const correctAnswer = normalizeIndexes(input.correctAnswer);
  const questionType = normalizeQuestionType(input.questionType, correctAnswer);

  assertQuestionPayload({
    questionText,
    options,
    correctAnswer,
    questionType,
  });

  const payload: TestQuestionInsert = {
    test_id: input.testId,
    question_text: questionText,
    options: toJson(options),
    correct_answer: toJson(correctAnswer),
    explanation: normalizeNullableMultilineText(input.explanation),
    sort_order: normalizeSortOrder(input.sortOrder),
    question_type: questionType,
  };

  return queryOrThrow(
    supabase
      .from('test_questions')
      .insert(payload)
      .select('*')
      .single(),
  ) as Promise<TestQuestionRow>;
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
    supabase.rpc('delete_test_question_deep', {
      p_question_id: questionId,
    }),
  );
}

export async function deleteTest(testId: string) {
  await assertTestOwner(testId);

  await execOrThrow(
    supabase.rpc('delete_test_deep', {
      p_test_id: testId,
    }),
  );
}

/* ================= REORDER ================= */

export async function reorderTestQuestions(
  testId: string,
  orderedQuestionIds: string[],
) {
  await assertTestOwner(testId);

  const normalizedIds = assertOrderedQuestionIds(orderedQuestionIds);

  if (normalizedIds.length === 0) {
    return;
  }

  const rows = (await queryOrThrow(
    supabase
      .from('test_questions')
      .select('id, test_id')
      .in('id', normalizedIds),
  )) as Array<Pick<Tables<'test_questions'>, 'id' | 'test_id'>>;

  const validIds = new Set(
    rows.filter((row) => row.test_id === testId).map((row) => row.id),
  );

  if (validIds.size !== normalizedIds.length) {
    throw new Error('Сұрақтардың бір бөлігі бұл тестке тиесілі емес.');
  }

  await execOrThrow(
    supabase.rpc('reorder_test_questions', {
      p_test_id: testId,
      p_question_ids: normalizedIds,
    }),
  );
}