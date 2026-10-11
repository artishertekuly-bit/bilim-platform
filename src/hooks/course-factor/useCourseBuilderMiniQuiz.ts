import { useEffect, type Dispatch, type SetStateAction } from 'react';

import {
  useCreateLessonMiniQuizQuestionMutation,
  useDeleteLessonMiniQuizMutation,
  useDeleteLessonMiniQuizQuestionMutation,
  useReorderLessonMiniQuizQuestionsMutation,
  useUpdateLessonMiniQuizQuestionMutation,
  useUpsertLessonMiniQuizMutation,
} from '@/hooks/use-platform-data';
import type {
  LessonMiniQuizQuestionType,
  LessonMiniQuizQuestionView,
} from '@/lib/app-data-types';
import {
  moveItem,
  scrollToBuilderSection,
} from '@/lib/course-creator/course-builder-utils';
import {
  getNextMiniQuizQuestionSortOrder,
  normalizeQuestionOptions,
} from '@/lib/course-creator/mini-quiz-utils';

type ToastFn = (input: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => void;

type MiniQuizUser = {
  id: string;
} | null | undefined;

type CourseLike = {
  id: string;
} | null | undefined;

type LessonLike = {
  id: string;
} | null | undefined;

type MiniQuizLike = {
  id: string;
  title: string;
  description: string | null;
  passingScore: number;
  isPublished: boolean;
  questions: LessonMiniQuizQuestionView[];
  updatedAt?: string | null;
  questionsCount?: number | null;
} | null | undefined;

type MiniQuizForm = {
  title: string;
  description: string;
  passingScore: string;
  isPublished: boolean;
};

type MiniQuizQuestionForm = {
  questionText: string;
  questionType: LessonMiniQuizQuestionType;
  options: string[];
  correctAnswer: number[];
  explanation: string;
  sortOrder: string;
};

type UseCourseBuilderMiniQuizInput = {
  user: MiniQuizUser;
  selectedCourse: CourseLike;
  selectedEditingLesson: LessonLike;
  selectedMiniQuiz: MiniQuizLike;

  miniQuizForm: MiniQuizForm;
  setMiniQuizForm: Dispatch<SetStateAction<MiniQuizForm>>;

  miniQuizQuestionForm: MiniQuizQuestionForm;
  setMiniQuizQuestionForm: Dispatch<SetStateAction<MiniQuizQuestionForm>>;

  editingMiniQuizQuestionId: string | null;
  setEditingMiniQuizQuestionId: Dispatch<SetStateAction<string | null>>;

  refetchWorkspace: () => Promise<void>;
  toast: ToastFn;
};

const DEFAULT_MINI_QUIZ_TITLE = 'Сабақ соңындағы қысқа тест';
const DEFAULT_PASSING_SCORE = '60';

function getErrorMessage(error: unknown, fallback = 'Белгісіз қате пайда болды.') {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function requireUserId(user: MiniQuizUser) {
  if (!user?.id) {
    throw new Error('Пайдаланушы табылмады.');
  }

  return user.id;
}

function requireCourse(course: CourseLike) {
  if (!course?.id) {
    throw new Error('Курс таңдалмаған.');
  }

  return course;
}

function requireLesson(lesson: LessonLike) {
  if (!lesson?.id) {
    throw new Error('Сабақ таңдалмаған.');
  }

  return lesson;
}

function getQuestions(quiz: MiniQuizLike) {
  return Array.isArray(quiz?.questions) ? quiz.questions : [];
}

function getInitialQuestionForm(sortOrder: string): MiniQuizQuestionForm {
  return {
    questionText: '',
    questionType: 'single_choice',
    options: ['', '', '', ''],
    correctAnswer: [],
    explanation: '',
    sortOrder,
  };
}

function parsePassingScore(value: string) {
  const passingScore = Number(value || 0);

  if (!Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
    throw new Error('Өту пайызы 0 мен 100 аралығындағы бүтін сан болуы керек.');
  }

  return passingScore;
}

function parseSortOrder(value: string) {
  const sortOrder = Number(value || 1);

  if (!Number.isInteger(sortOrder) || sortOrder <= 0) {
    throw new Error('Сұрақ реті 1 немесе одан жоғары бүтін сан болуы керек.');
  }

  return sortOrder;
}

function normalizeCorrectAnswer({
  questionType,
  correctAnswer,
  optionsLength,
}: {
  questionType: LessonMiniQuizQuestionType;
  correctAnswer: number[];
  optionsLength: number;
}) {
  const normalized = Array.from(
    new Set(
      correctAnswer
        .map((item) => Number(item))
        .filter(
          (item) =>
            Number.isInteger(item) &&
            item >= 0 &&
            item < optionsLength,
        ),
    ),
  ).sort((a, b) => a - b);

  if (normalized.length === 0) {
    throw new Error('Дұрыс жауапты таңдаңыз.');
  }

  if (questionType === 'single_choice') {
    return [normalized[0]];
  }

  return normalized;
}

function normalizeQuestionPayload(form: MiniQuizQuestionForm) {
  const questionText = form.questionText.trim();

  if (!questionText) {
    throw new Error('Сұрақ мәтінін енгізіңіз.');
  }

  const options = normalizeQuestionOptions(form.options);

  if (options.length < 2) {
    throw new Error('Кемінде 2 жауап нұсқасын енгізіңіз.');
  }

  const correctAnswer = normalizeCorrectAnswer({
    questionType: form.questionType,
    correctAnswer: form.correctAnswer,
    optionsLength: options.length,
  });

  return {
    questionText,
    questionType: form.questionType,
    options,
    correctAnswer,
    explanation: form.explanation.trim() || null,
    sortOrder: parseSortOrder(form.sortOrder),
  };
}

function normalizeOptionsForEdit(question: LessonMiniQuizQuestionView) {
  const options = [...question.options];

  while (options.length < 4) {
    options.push('');
  }

  return options;
}

export function useCourseBuilderMiniQuiz({
  user,
  selectedCourse,
  selectedEditingLesson,
  selectedMiniQuiz,
  miniQuizForm,
  setMiniQuizForm,
  miniQuizQuestionForm,
  setMiniQuizQuestionForm,
  editingMiniQuizQuestionId,
  setEditingMiniQuizQuestionId,
  refetchWorkspace,
  toast,
}: UseCourseBuilderMiniQuizInput) {
  const upsertMiniQuizMutation = useUpsertLessonMiniQuizMutation(user?.id);
  const deleteMiniQuizMutation = useDeleteLessonMiniQuizMutation(user?.id);
  const createMiniQuizQuestionMutation =
    useCreateLessonMiniQuizQuestionMutation(user?.id);
  const updateMiniQuizQuestionMutation =
    useUpdateLessonMiniQuizQuestionMutation(user?.id);
  const deleteMiniQuizQuestionMutation =
    useDeleteLessonMiniQuizQuestionMutation(user?.id);
  const reorderMiniQuizQuestionsMutation =
    useReorderLessonMiniQuizQuestionsMutation(user?.id);

  useEffect(() => {
    if (!selectedEditingLesson) return;

    if (!selectedMiniQuiz) {
      setMiniQuizForm({
        title: DEFAULT_MINI_QUIZ_TITLE,
        description: '',
        passingScore: DEFAULT_PASSING_SCORE,
        isPublished: false,
      });

      setMiniQuizQuestionForm((previous) => ({
        ...previous,
        sortOrder: '1',
      }));

      return;
    }

    setMiniQuizForm({
      title: selectedMiniQuiz.title || DEFAULT_MINI_QUIZ_TITLE,
      description: selectedMiniQuiz.description || '',
      passingScore: String(selectedMiniQuiz.passingScore ?? DEFAULT_PASSING_SCORE),
      isPublished: Boolean(selectedMiniQuiz.isPublished),
    });

    setMiniQuizQuestionForm((previous) => ({
      ...previous,
      sortOrder: getNextMiniQuizQuestionSortOrder(getQuestions(selectedMiniQuiz)),
    }));
    // selectedEditingLesson/selectedMiniQuiz object references can change between renders.
    // The form should only be reseeded when the selected lesson or quiz content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedEditingLesson?.id,
    selectedMiniQuiz?.id,
    selectedMiniQuiz?.updatedAt,
    selectedMiniQuiz?.questionsCount,
    selectedMiniQuiz?.questions?.length,
    setMiniQuizForm,
    setMiniQuizQuestionForm,
  ]);

  const resetMiniQuizQuestionForm = () => {
    setMiniQuizQuestionForm(
      getInitialQuestionForm(
        selectedMiniQuiz
          ? getNextMiniQuizQuestionSortOrder(getQuestions(selectedMiniQuiz))
          : '1',
      ),
    );

    setEditingMiniQuizQuestionId(null);
  };

  const saveMiniQuizBase = async () => {
    const course = requireCourse(selectedCourse);
    const lesson = requireLesson(selectedEditingLesson);
    const teacherId = requireUserId(user);

    const title = miniQuizForm.title.trim();

    if (!title) {
      throw new Error('Шағын тест атауын енгізіңіз.');
    }

    return upsertMiniQuizMutation.mutateAsync({
      lessonId: lesson.id,
      courseId: course.id,
      createdBy: teacherId,
      teacherId,
      title,
      description: miniQuizForm.description.trim() || null,
      isPublished: Boolean(miniQuizForm.isPublished),
      passingScore: parsePassingScore(miniQuizForm.passingScore),
    });
  };

  const handleSaveMiniQuiz = async () => {
    try {
      await saveMiniQuizBase();
      await refetchWorkspace();

      toast({
        title: 'Шағын тест сақталды',
      });
    } catch (error) {
      toast({
        title: 'Шағын тестті сақтау мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMiniQuiz = async () => {
    try {
      const course = requireCourse(selectedCourse);
      const lesson = requireLesson(selectedEditingLesson);
      const teacherId = requireUserId(user);

      if (!selectedMiniQuiz?.id) {
        throw new Error('Шағын тест табылмады.');
      }

      if (!window.confirm('Бұл шағын тест толық өшіріледі. Жалғастырасыз ба?')) {
        return;
      }

      await deleteMiniQuizMutation.mutateAsync({
        quizId: selectedMiniQuiz.id,
        lessonId: lesson.id,
        courseId: course.id,
        teacherId,
      });

      resetMiniQuizQuestionForm();
      await refetchWorkspace();

      toast({
        title: 'Шағын тест өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Шағын тестті өшіру мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleToggleMiniQuizCorrectAnswer = (optionIndex: number) => {
    setMiniQuizQuestionForm((previous) => {
      const currentIndex = Number(optionIndex);

      if (!Number.isInteger(currentIndex) || currentIndex < 0) {
        return previous;
      }

      if (previous.questionType === 'single_choice') {
        return {
          ...previous,
          correctAnswer: [currentIndex],
        };
      }

      const exists = previous.correctAnswer.includes(currentIndex);

      return {
        ...previous,
        correctAnswer: exists
          ? previous.correctAnswer.filter((item) => item !== currentIndex)
          : [...previous.correctAnswer, currentIndex].sort((a, b) => a - b),
      };
    });
  };

  const handleEditMiniQuizQuestion = (question: LessonMiniQuizQuestionView) => {
    setEditingMiniQuizQuestionId(question.id);

    setMiniQuizQuestionForm({
      questionText: question.questionText,
      questionType: question.questionType,
      options: normalizeOptionsForEdit(question),
      correctAnswer: [...question.correctAnswer].sort((a, b) => a - b),
      explanation: question.explanation || '',
      sortOrder: String(question.sortOrder || 1),
    });

    scrollToBuilderSection('lesson-mini-quiz');
  };

  const handleSaveMiniQuizQuestion = async () => {
    try {
      const course = requireCourse(selectedCourse);
      const lesson = requireLesson(selectedEditingLesson);
      const teacherId = requireUserId(user);

      const quizRow = selectedMiniQuiz || (await saveMiniQuizBase());
      const quizId = selectedMiniQuiz?.id || quizRow.id;

      if (!quizId) {
        throw new Error('Шағын тест ID табылмады.');
      }

      const payload = {
        lessonId: lesson.id,
        courseId: course.id,
        teacherId,
        ...normalizeQuestionPayload(miniQuizQuestionForm),
      };

      if (editingMiniQuizQuestionId) {
        await updateMiniQuizQuestionMutation.mutateAsync({
          ...payload,
          questionId: editingMiniQuizQuestionId,
        });

        toast({
          title: 'Шағын тест сұрағы жаңартылды',
        });
      } else {
        await createMiniQuizQuestionMutation.mutateAsync({
          ...payload,
          quizId,
        });

        toast({
          title: 'Шағын тест сұрағы қосылды',
        });
      }

      resetMiniQuizQuestionForm();
      await refetchWorkspace();
      return true;
    } catch (error) {
      toast({
        title: 'Шағын тест сұрағын сақтау мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
      return false;
    }
  };

  const handleDeleteMiniQuizQuestion = async (
    question: LessonMiniQuizQuestionView,
  ) => {
    try {
      const course = requireCourse(selectedCourse);
      const lesson = requireLesson(selectedEditingLesson);
      const teacherId = requireUserId(user);

      if (!question?.id) {
        throw new Error('Сұрақ ID табылмады.');
      }

      if (!window.confirm('Бұл сұрақты өшіргіңіз келе ме?')) {
        return;
      }

      await deleteMiniQuizQuestionMutation.mutateAsync({
        questionId: question.id,
        lessonId: lesson.id,
        courseId: course.id,
        teacherId,
      });

      if (editingMiniQuizQuestionId === question.id) {
        resetMiniQuizQuestionForm();
      }

      await refetchWorkspace();

      toast({
        title: 'Шағын тест сұрағы өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Шағын тест сұрағын өшіру мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleMoveMiniQuizQuestion = async (
    questionId: string,
    direction: 'up' | 'down',
  ) => {
    try {
      const course = requireCourse(selectedCourse);
      const lesson = requireLesson(selectedEditingLesson);
      const teacherId = requireUserId(user);

      if (!selectedMiniQuiz?.id) {
        throw new Error('Шағын тест табылмады.');
      }

      const questions = getQuestions(selectedMiniQuiz);
      const currentIndex = questions.findIndex((question) => question.id === questionId);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= questions.length) {
        return;
      }

      const orderedQuestionIds = moveItem(questions, currentIndex, nextIndex).map(
        (question) => question.id,
      );

      await reorderMiniQuizQuestionsMutation.mutateAsync({
        quizId: selectedMiniQuiz.id,
        orderedQuestionIds,
        lessonId: lesson.id,
        courseId: course.id,
        teacherId,
      });

      await refetchWorkspace();

      toast({
        title: 'Шағын тест сұрақтарының реті жаңартылды',
      });
    } catch (error) {
      toast({
        title: 'Шағын тест сұрақтарын реттеу мүмкін болмады',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const normalizedQuestionOptions = normalizeQuestionOptions(
    miniQuizQuestionForm.options,
  );

  const normalizedCorrectAnswer = (() => {
    try {
      return normalizeCorrectAnswer({
        questionType: miniQuizQuestionForm.questionType,
        correctAnswer: miniQuizQuestionForm.correctAnswer,
        optionsLength: normalizedQuestionOptions.length,
      });
    } catch {
      return [];
    }
  })();

  const canSaveMiniQuiz =
    Boolean(selectedCourse?.id) &&
    Boolean(selectedEditingLesson?.id) &&
    Boolean(user?.id) &&
    Boolean(miniQuizForm.title.trim()) &&
    !upsertMiniQuizMutation.isPending;

  const canSaveMiniQuizQuestion =
    Boolean(selectedCourse?.id) &&
    Boolean(selectedEditingLesson?.id) &&
    Boolean(user?.id) &&
    Boolean(miniQuizQuestionForm.questionText.trim()) &&
    normalizedQuestionOptions.length >= 2 &&
    normalizedCorrectAnswer.length > 0 &&
    !createMiniQuizQuestionMutation.isPending &&
    !updateMiniQuizQuestionMutation.isPending;

  return {
    upsertMiniQuizMutation,
    deleteMiniQuizMutation,
    createMiniQuizQuestionMutation,
    updateMiniQuizQuestionMutation,
    deleteMiniQuizQuestionMutation,
    reorderMiniQuizQuestionsMutation,

    resetMiniQuizQuestionForm,
    handleSaveMiniQuiz,
    handleDeleteMiniQuiz,
    handleToggleMiniQuizCorrectAnswer,
    handleEditMiniQuizQuestion,
    handleSaveMiniQuizQuestion,
    handleDeleteMiniQuizQuestion,
    handleMoveMiniQuizQuestion,

    canSaveMiniQuiz,
    canSaveMiniQuizQuestion,
  };
}