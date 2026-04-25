import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { LessonMiniQuizQuestionView } from '@/lib/app-data-types';
import {
  useCreateLessonMiniQuizQuestionMutation,
  useDeleteLessonMiniQuizMutation,
  useDeleteLessonMiniQuizQuestionMutation,
  useReorderLessonMiniQuizQuestionsMutation,
  useUpdateLessonMiniQuizQuestionMutation,
  useUpsertLessonMiniQuizMutation,
} from '@/hooks/use-platform-data';
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

type UseCourseBuilderMiniQuizInput = {
  user: MiniQuizUser;
  selectedCourse: any;
  selectedEditingLesson: any;
  selectedMiniQuiz: any;

  miniQuizForm: any;
  setMiniQuizForm: Dispatch<SetStateAction<any>>;

  miniQuizQuestionForm: any;
  setMiniQuizQuestionForm: Dispatch<SetStateAction<any>>;

  editingMiniQuizQuestionId: string | null;
  setEditingMiniQuizQuestionId: Dispatch<SetStateAction<string | null>>;

  refetchWorkspace: () => Promise<void>;
  toast: ToastFn;
};

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
  const createMiniQuizQuestionMutation = useCreateLessonMiniQuizQuestionMutation(user?.id);
  const updateMiniQuizQuestionMutation = useUpdateLessonMiniQuizQuestionMutation(user?.id);
  const deleteMiniQuizQuestionMutation = useDeleteLessonMiniQuizQuestionMutation(user?.id);
  const reorderMiniQuizQuestionsMutation = useReorderLessonMiniQuizQuestionsMutation(user?.id);


  useEffect(() => {
    if (!selectedEditingLesson) {
      return;
    }

    if (!selectedMiniQuiz) {
      setMiniQuizForm((prev: any) => ({
        ...prev,
        title: 'Сабақ соңындағы қысқа тест',
        description: '',
        passingScore: '60',
        isPublished: false,
      }));

      setMiniQuizQuestionForm((prev: any) => ({
        ...prev,
        sortOrder: '1',
      }));
      return;
    }

    setMiniQuizForm({
      title: selectedMiniQuiz.title,
      description: selectedMiniQuiz.description || '',
      passingScore: String(selectedMiniQuiz.passingScore),
      isPublished: selectedMiniQuiz.isPublished,
    });

    setMiniQuizQuestionForm((prev: any) => ({
      ...prev,
      sortOrder: getNextMiniQuizQuestionSortOrder(selectedMiniQuiz.questions),
    }));
  }, [
    selectedEditingLesson?.id,
    selectedMiniQuiz?.id,
    selectedMiniQuiz?.updatedAt,
    selectedMiniQuiz?.questionsCount,
    setMiniQuizForm,
    setMiniQuizQuestionForm,
  ]);

  const resetMiniQuizQuestionForm = () => {
    setMiniQuizQuestionForm({
      questionText: '',
      questionType: 'single_choice',
      options: ['', '', '', ''],
      correctAnswer: [],
      explanation: '',
      sortOrder: selectedMiniQuiz
        ? getNextMiniQuizQuestionSortOrder(selectedMiniQuiz.questions)
        : '1',
    });
    setEditingMiniQuizQuestionId(null);
  };

  const parseMiniQuizPassingScore = () => {
    const passingScore = Number(miniQuizForm.passingScore || 0);

    if (!Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
      throw new Error('Өту пайызы 0 мен 100 аралығындағы бүтін сан болуы керек.');
    }

    return passingScore;
  };

  const saveMiniQuizBase = async () => {
    if (!selectedCourse || !selectedEditingLesson || !user?.id) {
      throw new Error('Mini quiz сақтау үшін алдымен сабақты таңдаңыз.');
    }

    const title = miniQuizForm.title.trim();

    if (!title) {
      throw new Error('Mini quiz атауын енгізіңіз.');
    }

    const passingScore = parseMiniQuizPassingScore();

    return upsertMiniQuizMutation.mutateAsync({
      lessonId: selectedEditingLesson.id,
      courseId: selectedCourse.id,
      createdBy: user.id,
      teacherId: user.id,
      title,
      description: miniQuizForm.description.trim() || null,
      isPublished: miniQuizForm.isPublished,
      passingScore,
    });
  };

  const handleSaveMiniQuiz = async () => {
    try {
      await saveMiniQuizBase();
      await refetchWorkspace();

      toast({
        title: 'Mini quiz сақталды',
      });
    } catch (error) {
      toast({
        title: 'Mini quiz сақтау мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMiniQuiz = async () => {
    if (!selectedCourse || !selectedEditingLesson || !selectedMiniQuiz) return;

    if (!window.confirm('Бұл mini quiz толық өшіріледі. Жалғастырасыз ба?')) {
      return;
    }

    try {
      await deleteMiniQuizMutation.mutateAsync({
        quizId: selectedMiniQuiz.id,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      resetMiniQuizQuestionForm();
      await refetchWorkspace();

      toast({
        title: 'Mini quiz өшірілді',
      });
    } catch (error) {
      toast({
        title: 'Mini quiz өшіру мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleMiniQuizCorrectAnswer = (optionIndex: number) => {
    setMiniQuizQuestionForm((prev: any) => {
      if (prev.questionType === 'single_choice') {
        return {
          ...prev,
          correctAnswer: [optionIndex],
        };
      }

      const exists = prev.correctAnswer.includes(optionIndex);

      return {
        ...prev,
        correctAnswer: exists
          ? prev.correctAnswer.filter((item: number) => item !== optionIndex)
          : [...prev.correctAnswer, optionIndex].sort((a, b) => a - b),
      };
    });
  };

  const handleEditMiniQuizQuestion = (question: LessonMiniQuizQuestionView) => {
    const options = [...question.options];

    while (options.length < 4) {
      options.push('');
    }

    setEditingMiniQuizQuestionId(question.id);
    setMiniQuizQuestionForm({
      questionText: question.questionText,
      questionType: question.questionType,
      options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation || '',
      sortOrder: String(question.sortOrder),
    });

    scrollToBuilderSection('lesson-mini-quiz');
  };

  const handleSaveMiniQuizQuestion = async () => {
    if (!selectedCourse || !selectedEditingLesson || !user?.id) return;

    try {
      const options = normalizeQuestionOptions(miniQuizQuestionForm.options);
      const sortOrder = Number(miniQuizQuestionForm.sortOrder || 1);

      if (!Number.isInteger(sortOrder) || sortOrder <= 0) {
        throw new Error('Сұрақ реті 1 немесе одан жоғары бүтін сан болуы керек.');
      }

      const quizRow = selectedMiniQuiz || (await saveMiniQuizBase());
      const quizId = selectedMiniQuiz?.id || quizRow.id;

      const payload = {
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user.id,
        questionText: miniQuizQuestionForm.questionText.trim(),
        questionType: miniQuizQuestionForm.questionType,
        options,
        correctAnswer: miniQuizQuestionForm.correctAnswer,
        explanation: miniQuizQuestionForm.explanation.trim() || null,
        sortOrder,
      };

      if (editingMiniQuizQuestionId) {
        await updateMiniQuizQuestionMutation.mutateAsync({
          ...payload,
          questionId: editingMiniQuizQuestionId,
        });

        toast({ title: 'Mini quiz сұрағы жаңартылды' });
      } else {
        await createMiniQuizQuestionMutation.mutateAsync({
          ...payload,
          quizId,
        });

        toast({ title: 'Mini quiz сұрағы қосылды' });
      }

      resetMiniQuizQuestionForm();
      await refetchWorkspace();
    } catch (error) {
      toast({
        title: 'Mini quiz сұрағын сақтау мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMiniQuizQuestion = async (question: LessonMiniQuizQuestionView) => {
    if (!selectedCourse || !selectedEditingLesson) return;

    if (!window.confirm('Бұл сұрақты өшіргіңіз келе ме?')) {
      return;
    }

    try {
      await deleteMiniQuizQuestionMutation.mutateAsync({
        questionId: question.id,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      if (editingMiniQuizQuestionId === question.id) {
        resetMiniQuizQuestionForm();
      }

      await refetchWorkspace();

      toast({ title: 'Mini quiz сұрағы өшірілді' });
    } catch (error) {
      toast({
        title: 'Mini quiz сұрағын өшіру мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleMoveMiniQuizQuestion = async (
    questionId: string,
    direction: 'up' | 'down'
  ) => {
    if (!selectedCourse || !selectedEditingLesson || !selectedMiniQuiz) return;

    const questions = selectedMiniQuiz.questions;
    const currentIndex = questions.findIndex((question: any) => question.id === questionId);
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= questions.length) {
      return;
    }

    const orderedQuestionIds = moveItem(questions, currentIndex, nextIndex).map(
      (question: any) => question.id
    );

    try {
      await reorderMiniQuizQuestionsMutation.mutateAsync({
        quizId: selectedMiniQuiz.id,
        orderedQuestionIds,
        lessonId: selectedEditingLesson.id,
        courseId: selectedCourse.id,
        teacherId: user?.id,
      });

      await refetchWorkspace();
      toast({ title: 'Mini quiz сұрақтарының реті жаңартылды' });
    } catch (error) {
      toast({
        title: 'Mini quiz сұрақтарын реттеу мүмкін болмады',
        description: error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const canSaveMiniQuiz =
    !!selectedCourse &&
    !!selectedEditingLesson &&
    !!user?.id &&
    !!miniQuizForm.title.trim() &&
    !upsertMiniQuizMutation.isPending;

  const canSaveMiniQuizQuestion =
    !!selectedCourse &&
    !!selectedEditingLesson &&
    !!user?.id &&
    !!miniQuizQuestionForm.questionText.trim() &&
    normalizeQuestionOptions(miniQuizQuestionForm.options).length >= 2 &&
    miniQuizQuestionForm.correctAnswer.length > 0 &&
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
