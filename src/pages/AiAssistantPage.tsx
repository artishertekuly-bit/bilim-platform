import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, RotateCcw, Sparkles } from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/DataState';
import AiPromptShell, {
  type AiPromptSubmitPayload,
} from '@/components/ai-tools/AiPromptShell';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import {
  useCourseAnalyticsStudents,
  useTeacherCourseWorkspace,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CourseAnalyticsStudentOptionView } from '@/lib/app-data-types';

type CourseOption = {
  id: string;
  title: string;
  subjectName?: string | null;
};

function normalizeCourseOptions(workspace: unknown): CourseOption[] {
  const raw = workspace as any;

  const source =
    (Array.isArray(raw?.courses) && raw.courses) ||
    (Array.isArray(raw?.items) && raw.items) ||
    (Array.isArray(raw?.teacherCourses) && raw.teacherCourses) ||
    (Array.isArray(raw) && raw) ||
    [];

  return source
    .map((item: any) => ({
      id: String(item.id || item.courseId || ''),
      title: String(item.title || item.courseTitle || 'Курс'),
      subjectName: item.subjectName || item.subject_name || null,
    }))
    .filter((item: CourseOption) => Boolean(item.id));
}

function getStudentName(student: CourseAnalyticsStudentOptionView) {
  return student.fullName?.trim() || `Оқушы ${student.studentId.slice(0, 8)}`;
}

function normalizePrompt(value: string) {
  return value
    .toLowerCase()
    .replace(/[?.,!;:()[\]{}"'`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function shouldUseTeacherCourseCreatorAdvisor(prompt: string) {
  const normalized = normalizePrompt(prompt);

  const creatorPhrases = [
    'қандай курс',
    'қай курс',
    'курс жасасам',
    'курс жасай',
    'курс құрасам',
    'курс құру',
    'курс құр',
    'жаңа курс',
    'курстың идеясын',
    'курс идея',
    'қандай сабақ',
    'қай сабақ',
    'сабақ жасасам',
    'сабақ жасай',
    'сабақ құру',
    'сабақ құр',
    'сабақ тақырыбы',
    'тақырып ұсын',
    'тақырыптар ұсын',
    'модуль ұсын',
    'силлабус',
    'оқу бағдарламасы',
    'контент жоспары',
    'lesson plan',
    'curriculum',
    'course idea',
    'content plan',
  ];

  if (includesAny(normalized, creatorPhrases)) {
    return true;
  }

  const creatorIntent = includesAny(normalized, [
    'курс',
    'сабақ',
    'тақырып',
    'модуль',
    'бағдарлама',
    'контент',
    'тапсырма',
    'mini quiz',
    'мини quiz',
  ]);

  const actionIntent = includesAny(normalized, [
    'жаса',
    'құр',
    'ұсын',
    'идея',
    'қандай',
    'қай',
    'қалай',
    'қоссам',
    'құрастыр',
  ]);

  const strongAnalysisIntent = includesAny(normalized, [
    'осы курс',
    'осы оқушы',
    'нәтиже',
    'progress',
    'прогресс',
    'аналитика',
    'талда',
    'қайталау',
    'қиындық',
    'әлсіз',
  ]);

  if (strongAnalysisIntent && !creatorIntent) {
    return false;
  }

  return creatorIntent && actionIntent;
}

function getAnswerTitle(mode: string | undefined) {
  if (mode === 'teacher_course_creator_advisor') {
    return 'Course Creator Advisor жауабы';
  }

  if (mode === 'teacher_student_assistant') {
    return 'AI оқушы көмекшісінің жауабы';
  }

  return 'AI курс көмекшісінің жауабы';
}

function getChatDescription(hasSelectedCourse: boolean, hasSelectedStudent: boolean) {
  if (hasSelectedStudent) {
    return 'Таңдалған оқушы бойынша сұрақ қойсаңыз, AI жеке педагогикалық қолдау ұсынады. Курс/сабақ идеяларын сұрасаңыз, Course Creator Advisor ретінде жауап береді.';
  }

  if (hasSelectedCourse) {
    return 'Таңдалған курс бойынша сұрақ қойсаңыз, AI курс context-ін талдайды. Жаңа курс немесе сабақ идеясын сұрасаңыз, Course Creator Advisor ретінде жауап береді.';
  }

  return 'Курс таңдалмаса да, AI мұғалімге жаңа курс, сабақ, тақырып немесе тапсырма идеяларын ұсына алады.';
}

function getContextLabel(course: CourseOption | null, student: CourseAnalyticsStudentOptionView | null) {
  if (course && student) {
    return `${getStudentName(student)} · ${course.title}`;
  }

  if (course) {
    return course.title;
  }

  return 'Курссыз кеңес';
}

export default function AiAssistantPage() {
  const { user } = useAuth();

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const {
    data: workspace,
    isFetching: workspaceFetching,
    refetch: refetchWorkspace,
  } = useTeacherCourseWorkspace(user?.id || '', Boolean(user?.id));

  const courses = useMemo(() => normalizeCourseOptions(workspace), [workspace]);

  useEffect(() => {
    if (!selectedCourseId) return;

    const exists = courses.some((course) => course.id === selectedCourseId);
    if (!exists) {
      setSelectedCourseId('');
      setSelectedStudentId('');
    }
  }, [courses, selectedCourseId]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const {
    data: students = [],
    isFetching: studentsFetching,
    refetch: refetchStudents,
  } = useCourseAnalyticsStudents(selectedCourseId, Boolean(selectedCourseId));

  useEffect(() => {
    if (!selectedStudentId) return;

    const exists = students.some((student) => student.studentId === selectedStudentId);
    if (!exists) {
      setSelectedStudentId('');
    }
  }, [students, selectedStudentId]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.studentId === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const teacherAi = useLearningAiAnalysis({
    mode: 'teacher_course_creator_advisor',
    role: 'teacher',
    scope: {},
  });

  const refreshAll = () => {
    teacherAi.reset();
    void refetchWorkspace();

    if (selectedCourseId) {
      void refetchStudents();
    }
  };

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      const useCreatorAdvisor =
        !selectedCourseId || shouldUseTeacherCourseCreatorAdvisor(payload.prompt);

      if (useCreatorAdvisor) {
        await teacherAi.submit(payload, {
          mode: 'teacher_course_creator_advisor',
          role: 'teacher',
          scope: {},
        });
        return;
      }

      if (selectedCourseId && selectedStudentId) {
        await teacherAi.submit(payload, {
          mode: 'teacher_student_assistant',
          role: 'teacher',
          scope: {
            courseId: selectedCourseId,
            studentId: selectedStudentId,
          },
        });
        return;
      }

      await teacherAi.submit(payload, {
        mode: 'teacher_course_assistant',
        role: 'teacher',
        scope: {
          courseId: selectedCourseId,
        },
      });
    },
    [selectedCourseId, selectedStudentId, teacherAi.submit]
  );

  const isFetching = workspaceFetching || studentsFetching;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              AI құралдар
            </>
          }
          icon={<BrainCircuit size={20} />}
          title="AI көмекші"
          description="Курс анализі, оқушыға қолдау және жаңа курс/сабақ идеяларын бір чатта ұсынатын мұғалім AI copilot."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={refreshAll}
              disabled={isFetching || !user?.id || teacherAi.isSubmitting}
            >
              <RotateCcw size={15} className="mr-2" />
              Жаңарту
            </Button>
          }
        />

        {!user ? (
          <EmptyState
            title="Аккаунт анықталмады"
            text="AI көмекшіні қолдану үшін мұғалім аккаунтымен кіру қажет."
          />
        ) : null}

        {user ? (
          <>
            <Card className="border-border/80 bg-card/95 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Курс context
                    </label>
                    <select
                      value={selectedCourseId}
                      onChange={(event) => {
                        setSelectedCourseId(event.target.value);
                        setSelectedStudentId('');
                        teacherAi.reset();
                      }}
                      className="h-11 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Курссыз кеңес / жаңа курс идеясы</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                          {course.subjectName ? ` · ${course.subjectName}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Оқушы context
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(event) => {
                        setSelectedStudentId(event.target.value);
                        teacherAi.reset();
                      }}
                      disabled={!selectedCourseId || students.length === 0 || studentsFetching}
                      className="h-11 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">
                        {selectedCourseId
                          ? studentsFetching
                            ? 'Оқушылар жүктелуде...'
                            : students.length === 0
                              ? 'Бұл курста оқушы context жоқ'
                              : 'Оқушы таңдалмаған'
                          : 'Алдымен курс таңдаңыз'}
                      </option>

                      {students.map((student) => (
                        <option key={student.studentId} value={student.studentId}>
                          {getStudentName(student)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Курс таңдалмаса, AI жаңа курс/сабақ идеяларын ұсынады. Курс таңдалса,
                  курс context бойынша жауап береді. Оқушы таңдалса, сол оқушыға арналған
                  педагогикалық қолдау режимі қолданылады.
                </p>
              </CardContent>
            </Card>

            <AiPromptShell
              title="AI көмекші"
              description={getChatDescription(Boolean(selectedCourse), Boolean(selectedStudent))}
              placeholder="Сұрағыңызды жазыңыз..."
              suggestions={[]}
              contextLabel={getContextLabel(selectedCourse, selectedStudent)}
              contextDescription=""
              disabled={false}
              isSubmitting={teacherAi.isSubmitting}
              answer={teacherAi.answer}
              error={teacherAi.error}
              onSubmit={handleSubmit}
              answerTitle={getAnswerTitle(teacherAi.lastRequest?.mode)}
              emptyAnswerText="Мысал сұрақтар көрсетілмейді. Курс анализі, оқушыға қолдау немесе жаңа курс/сабақ идеясы туралы нақты сұрағыңызды жазыңыз."
              contextSummary={null}
              warnings={[]}
              followUpPrompts={[]}
            />
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}