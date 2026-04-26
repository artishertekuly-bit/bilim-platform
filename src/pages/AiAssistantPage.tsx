import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  Compass,
  GraduationCap,
  RotateCcw,
  Sparkles,
  UserRound,
} from 'lucide-react';

import AiPromptShell, {
  type AiPromptSubmitPayload,
} from '@/components/ai-tools/AiPromptShell';
import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState } from '@/components/common/DataState';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import {
  useCourseAnalyticsStudents,
  useTeacherCourseWorkspace,
} from '@/hooks/use-platform-data';
import type { CourseAnalyticsStudentOptionView } from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';

type CourseOption = {
  id: string;
  title: string;
  subjectName?: string | null;
};

type AssistantMode =
  | 'teacher_course_creator_advisor'
  | 'teacher_course_assistant'
  | 'teacher_student_assistant';

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

function getAnswerTitle(mode: AssistantMode) {
  if (mode === 'teacher_course_creator_advisor') {
    return 'Course Creator Advisor жауабы';
  }

  if (mode === 'teacher_student_assistant') {
    return 'AI оқушы көмекшісінің жауабы';
  }

  return 'AI курс көмекшісінің жауабы';
}

function getChatDescription({
  selectedCourse,
  selectedStudent,
}: {
  selectedCourse: CourseOption | null;
  selectedStudent: CourseAnalyticsStudentOptionView | null;
}) {
  if (selectedCourse && selectedStudent) {
    return 'Таңдалған оқушы бойынша сұрақ қойсаңыз, AI жеке педагогикалық қолдау ұсынады. Курс немесе сабақ идеясын сұрасаңыз, Course Creator Advisor ретінде жауап береді.';
  }

  if (selectedCourse) {
    return 'Таңдалған курс бойынша сұрақ қойсаңыз, AI курс context-ін қолданады. Жаңа курс, сабақ немесе тапсырма идеясын сұрасаңыз, Course Creator Advisor ретінде жауап береді.';
  }

  return 'Курс таңдалмаса да, AI мұғалімге жаңа курс, сабақ, тақырып, модуль немесе тапсырма идеясын ұсына алады.';
}

function getContextLabel(
  course: CourseOption | null,
  student: CourseAnalyticsStudentOptionView | null
) {
  if (course && student) {
    return `${getStudentName(student)} · ${course.title}`;
  }

  if (course) {
    return course.title;
  }

  return 'Курссыз кеңес';
}

function getModeLabel(mode: AssistantMode) {
  if (mode === 'teacher_course_creator_advisor') {
    return 'Course Creator Advisor';
  }

  if (mode === 'teacher_student_assistant') {
    return 'Оқушы context';
  }

  return 'Курс context';
}

export default function AiAssistantPage() {
  const { user } = useAuth();

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [activeMode, setActiveMode] = useState<AssistantMode>(
    'teacher_course_creator_advisor'
  );

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
      setActiveMode('teacher_course_creator_advisor');
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

  const refreshAll = useCallback(() => {
    teacherAi.reset();
    void refetchWorkspace();

    if (selectedCourseId) {
      void refetchStudents();
    }
  }, [refetchStudents, refetchWorkspace, selectedCourseId, teacherAi]);

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      const useCreatorAdvisor =
        !selectedCourseId || shouldUseTeacherCourseCreatorAdvisor(payload.prompt);

      if (useCreatorAdvisor) {
        setActiveMode('teacher_course_creator_advisor');

        await teacherAi.submit(payload, {
          mode: 'teacher_course_creator_advisor',
          role: 'teacher',
          scope: {},
        });

        return;
      }

      if (selectedCourseId && selectedStudentId) {
        setActiveMode('teacher_student_assistant');

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

      setActiveMode('teacher_course_assistant');

      await teacherAi.submit(payload, {
        mode: 'teacher_course_assistant',
        role: 'teacher',
        scope: {
          courseId: selectedCourseId,
        },
      });
    },
    [selectedCourseId, selectedStudentId, teacherAi]
  );

  const isFetching = workspaceFetching || studentsFetching;
  const contextLabel = getContextLabel(selectedCourse, selectedStudent);

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
          description="Курс анализі, оқушыға педагогикалық қолдау және жаңа курс/сабақ идеяларын бір чатта ұсынатын мұғалім AI copilot."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={refreshAll}
              disabled={isFetching || !user?.id || teacherAi.isSubmitting}
            >
              <RotateCcw size={15} className="mr-2" />
              {isFetching ? 'Жаңартылуда...' : 'Жаңарту'}
            </Button>
          }
        />

        {!user ? (
          <EmptyState
            title="Аккаунт анықталмады"
            text="AI көмекшіні қолдану үшін мұғалім аккаунтымен кіру қажет."
            tone="ai"
          />
        ) : null}

        {user ? (
          <>
            <Card className="overflow-hidden border-ai-border/70 bg-card/95 shadow-soft">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="ai">
                        <BrainCircuit size={12} />
                        Chat-first assistant
                      </StatusBadge>

                      <StatusBadge tone={selectedCourse ? 'primary' : 'secondary'}>
                        <Compass size={12} />
                        {getModeLabel(activeMode)}
                      </StatusBadge>

                      {selectedCourse ? (
                        <StatusBadge tone="muted">
                          <BookOpen size={12} />
                          Курс таңдалды
                        </StatusBadge>
                      ) : null}

                      {selectedStudent ? (
                        <StatusBadge tone="primary">
                          <UserRound size={12} />
                          Оқушы таңдалды
                        </StatusBadge>
                      ) : null}
                    </div>

                    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                      Бұл бет аналитика dashboard емес. Мұнда тек context таңдалып,
                      негізгі жұмыс чат арқылы жүреді. Курссыз режим жаңа курс/сабақ
                      идеяларына арналған.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-soft/70 px-3 py-2 text-xs text-muted-foreground">
                    Context:{' '}
                    <span className="font-semibold text-foreground">{contextLabel}</span>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">
                      Курс context
                    </label>

                    <select
                      value={selectedCourseId}
                      onChange={(event) => {
                        setSelectedCourseId(event.target.value);
                        setSelectedStudentId('');
                        setActiveMode(
                          event.target.value
                            ? 'teacher_course_assistant'
                            : 'teacher_course_creator_advisor'
                        );
                        teacherAi.reset();
                      }}
                      className="h-11 w-full rounded-2xl border border-input bg-card px-4 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25"
                    >
                      <option value="">Курссыз кеңес / жаңа курс идеясы</option>

                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                          {course.subjectName ? ` · ${course.subjectName}` : ''}
                        </option>
                      ))}
                    </select>

                    <p className="text-[11px] leading-5 text-muted-foreground">
                      Курс таңдалмаса, AI курс құру, сабақ жоспары, модуль және
                      тапсырма идеяларын ұсынады.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">
                      Оқушы context
                    </label>

                    <select
                      value={selectedStudentId}
                      onChange={(event) => {
                        setSelectedStudentId(event.target.value);
                        setActiveMode(
                          event.target.value
                            ? 'teacher_student_assistant'
                            : selectedCourseId
                              ? 'teacher_course_assistant'
                              : 'teacher_course_creator_advisor'
                        );
                        teacherAi.reset();
                      }}
                      disabled={!selectedCourseId || students.length === 0 || studentsFetching}
                      className="h-11 w-full rounded-2xl border border-input bg-card px-4 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
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

                    <p className="text-[11px] leading-5 text-muted-foreground">
                      Оқушы таңдалса, AI сол оқушының оқу нәтижесіне сүйеніп,
                      жұмсақ педагогикалық ұсыныс береді.
                    </p>
                  </div>
                </div>

                {!teacherAi.isConfigured ? (
                  <div className="rounded-3xl border border-warning-muted bg-warning-soft/70 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-warning-muted bg-card text-warning-foreground shadow-inner-soft">
                        <Sparkles size={17} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          AI backend қосылмаған
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Frontend env ішінде AI backend URL көрсетілмесе, чат сұранысы
                          жіберілмейді.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <AiPromptShell
              title="AI көмекші"
              description={getChatDescription({
                selectedCourse,
                selectedStudent,
              })}
              placeholder="Мысалы: 7-сыныпқа Қазақстан тарихынан қандай курс құрсам болады?"
              suggestions={[]}
              contextLabel={contextLabel}
              contextDescription=""
              disabled={!teacherAi.isConfigured}
              disabledReason="AI backend endpoint әлі қосылмаған."
              isSubmitting={teacherAi.isSubmitting}
              answer={teacherAi.answer}
              error={teacherAi.error}
              onSubmit={handleSubmit}
              answerTitle={getAnswerTitle(activeMode)}
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