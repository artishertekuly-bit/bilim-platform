import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, RotateCcw, Sparkles } from 'lucide-react';

import AiPromptShell, {
  type AiPromptSubmitPayload,
} from '@/components/ai-tools/AiPromptShell';
import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState } from '@/components/common/DataState';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import {
  useCourseAnalyticsStudents,
  useTeacherCourseWorkspace,
} from '@/hooks/use-platform-data';
import type { CourseAnalyticsStudentOptionView } from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';

// AI Assistant supports three teacher-facing modes:
// 1) no course selected  -> course creator advisor
// 2) course selected     -> course-level assistant
// 3) course + student    -> student-in-course assistant
//
// The prompt classifier below only changes the mode when the intent is clear.
// It avoids sending course/student analysis questions to the creator-advisor mode.

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
  const raw = workspace as {
    courses?: unknown[];
    items?: unknown[];
    teacherCourses?: unknown[];
  };

  const source =
    (Array.isArray(raw?.courses) && raw.courses) ||
    (Array.isArray(raw?.items) && raw.items) ||
    (Array.isArray(raw?.teacherCourses) && raw.teacherCourses) ||
    (Array.isArray(raw) && raw) ||
    [];

  return source
    .map((item) => {
      const row = item as Record<string, unknown>;

      return {
        id: String(row.id || row.courseId || '').trim(),
        title: String(row.title || row.courseTitle || 'Курс').trim(),
        subjectName:
          typeof row.subjectName === 'string'
            ? row.subjectName
            : typeof row.subject_name === 'string'
              ? row.subject_name
              : null,
      };
    })
    .filter((item): item is CourseOption => Boolean(item.id));
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

function hasCourseContextReference(prompt: string) {
  const normalized = normalizePrompt(prompt);

  return includesAny(normalized, [
    'осы курс',
    'таңдалған курс',
    'бұл курс',
    'курс бойынша',
    'курсқа',
    'осы оқушы',
    'таңдалған оқушы',
    'бұл оқушы',
    'оқушы бойынша',
    'оқушыға',
    'осы сабақ',
    'сабақ бойынша',
  ]);
}

function hasCourseOrStudentAnalysisIntent(prompt: string) {
  const normalized = normalizePrompt(prompt);

  return includesAny(normalized, [
    'нәтиже',
    'progress',
    'прогресс',
    'аналитика',
    'талда',
    'талдау',
    'қайталау',
    'қиындық',
    'әлсіз',
    'үлгерім',
    'оқу жағдайы',
    'оқушы',
    'сынып',
    'интервенция',
    'қолдау',
    'қай тақырып',
    'қай сабақ',
    'mini quiz нәтижесі',
    'мини quiz нәтижесі',
  ]);
}

function shouldUseTeacherCourseCreatorAdvisor(
  prompt: string,
  hasSelectedCourse: boolean
) {
  const normalized = normalizePrompt(prompt);

  if (!hasSelectedCourse) {
    return true;
  }

  if (hasCourseContextReference(normalized) || hasCourseOrStudentAnalysisIntent(normalized)) {
    return false;
  }

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
    'қандай сабақ жасасам',
    'сабақ жасасам',
    'жаңа сабақ',
    'сабақ тақырыбы ұсын',
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

  return creatorIntent && actionIntent;
}

function getAnswerTitle(mode: AssistantMode) {
  if (mode === 'teacher_course_creator_advisor') {
    return 'Курс құру бойынша AI кеңес';
  }

  if (mode === 'teacher_student_assistant') {
    return 'Оқушы бойынша AI ұсыныс';
  }

  return 'Курс бойынша AI жауап';
}

function getChatDescription({
  selectedCourse,
  selectedStudent,
}: {
  selectedCourse: CourseOption | null;
  selectedStudent: CourseAnalyticsStudentOptionView | null;
}) {
  if (selectedCourse && selectedStudent) {
    return 'Таңдалған оқушыға жеке педагогикалық қолдау, қайталау бағыты немесе курс ішіндегі қиындықтар туралы сұраңыз.';
  }

  if (selectedCourse) {
    return 'Таңдалған курс бойынша анализ, сабақ, тапсырма, mini quiz немесе жақсарту ұсынысын сұраңыз.';
  }

  return 'Жаңа курс, сабақ, модуль, тапсырма немесе оқу жоспары бойынша идея сұраңыз.';
}

function getPlaceholder({
  selectedCourse,
  selectedStudent,
}: {
  selectedCourse: CourseOption | null;
  selectedStudent: CourseAnalyticsStudentOptionView | null;
}) {
  if (selectedCourse && selectedStudent) {
    return 'Мысалы: Осы оқушыға келесі сабақта қандай қолдау берген дұрыс?';
  }

  if (selectedCourse) {
    return 'Мысалы: Осы курс бойынша қай тақырыптарды қайталау керек?';
  }

  return 'Мысалы: 7-сыныпқа Python бойынша қандай курс құрсам болады?';
}

function getSuggestions({
  selectedCourse,
  selectedStudent,
}: {
  selectedCourse: CourseOption | null;
  selectedStudent: CourseAnalyticsStudentOptionView | null;
}) {
  if (selectedCourse && selectedStudent) {
    return [
      'Осы оқушыға жеке қолдау жоспарын жаса.',
      'Осы оқушыға қай тақырыпты қайталау керек?',
      'Ата-анаға жұмсақ түсіндіретін қысқа мәтін дайында.',
    ];
  }

  if (selectedCourse) {
    return [
      'Осы курс бойынша бір апталық қайталау жоспарын жаса.',
      'Курста қай сабақтарды қайта түсіндіру керек?',
      'Осы курсқа practice және mini quiz жақсарту идеясын ұсын.',
    ];
  }

  return [
    'Жаңа курс идеясын ұсын.',
    '6 сабақтан тұратын курс құрылымын жаса.',
    'Курсқа practice және mini quiz идеяларын қос.',
  ];
}

export default function AiAssistantPage() {
  const { user } = useAuth();

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [activeMode, setActiveMode] = useState<AssistantMode>(
    'teacher_course_creator_advisor'
  );

  const isTeacher = user?.role === 'teacher';
  const canUseAssistant = Boolean(user?.id && isTeacher);

  const {
    data: workspace,
    isFetching: workspaceFetching,
    refetch: refetchWorkspace,
  } = useTeacherCourseWorkspace(user?.id || '', canUseAssistant);

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
  } = useCourseAnalyticsStudents(
    selectedCourseId,
    canUseAssistant && Boolean(selectedCourseId)
  );

  useEffect(() => {
    if (!selectedStudentId) return;

    const exists = students.some(
      (student) => student.studentId === selectedStudentId
    );

    if (!exists) {
      setSelectedStudentId('');
      setActiveMode(selectedCourseId ? 'teacher_course_assistant' : 'teacher_course_creator_advisor');
    }
  }, [selectedCourseId, selectedStudentId, students]);

  const selectedStudent = useMemo(
    () =>
      students.find((student) => student.studentId === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const teacherAi = useLearningAiAnalysis({
    mode: 'teacher_course_creator_advisor',
    role: 'teacher',
    scope: {},
  });

  const refreshAll = useCallback(() => {
    teacherAi.reset();

    if (canUseAssistant) {
      void refetchWorkspace();
    }

    if (canUseAssistant && selectedCourseId) {
      void refetchStudents();
    }
  }, [canUseAssistant, refetchStudents, refetchWorkspace, selectedCourseId, teacherAi]);

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      if (!canUseAssistant) {
        return;
      }

      const useCreatorAdvisor = shouldUseTeacherCourseCreatorAdvisor(
        payload.prompt,
        Boolean(selectedCourseId)
      );

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

      if (selectedCourseId) {
        setActiveMode('teacher_course_assistant');

        await teacherAi.submit(payload, {
          mode: 'teacher_course_assistant',
          role: 'teacher',
          scope: {
            courseId: selectedCourseId,
          },
        });

        return;
      }

      setActiveMode('teacher_course_creator_advisor');

      await teacherAi.submit(payload, {
        mode: 'teacher_course_creator_advisor',
        role: 'teacher',
        scope: {},
      });
    },
    [canUseAssistant, selectedCourseId, selectedStudentId, teacherAi]
  );

  const isFetching = workspaceFetching || studentsFetching;

  const disabledReason = !teacherAi.isConfigured
    ? 'AI backend endpoint әлі қосылмаған.'
    : !canUseAssistant
      ? 'AI көмекші тек мұғалім аккаунты үшін қолжетімді.'
      : undefined;

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
          description="Курс, сабақ, оқушыға қолдау және жаңа оқу идеялары бойынша чат."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={refreshAll}
              disabled={isFetching || !canUseAssistant || teacherAi.isSubmitting}
            >
              <RotateCcw size={15} className="mr-2" />
              {isFetching ? 'Жаңартылуда...' : 'Тазалау'}
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

        {user && !isTeacher ? (
          <EmptyState
            title="Бұл бөлім мұғалімге арналған"
            text="AI көмекші курс, сабақ және оқушыға педагогикалық қолдау ұсыну үшін мұғалім аккаунтында жұмыс істейді."
            tone="ai"
          />
        ) : null}

        {canUseAssistant ? (
          <>
            <Card className="overflow-hidden">
              <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Курс
                  </label>

                  <select
                    value={selectedCourseId}
                    onChange={(event) => {
                      const nextCourseId = event.target.value;

                      setSelectedCourseId(nextCourseId);
                      setSelectedStudentId('');
                      setActiveMode(
                        nextCourseId
                          ? 'teacher_course_assistant'
                          : 'teacher_course_creator_advisor'
                      );
                      teacherAi.reset();
                    }}
                    disabled={workspaceFetching}
                    className="h-11 w-full rounded-2xl border border-input bg-card px-4 text-sm text-foreground shadow-inner-soft outline-none transition-all duration-200 ease-soft hover:border-primary-muted focus:border-primary-muted focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
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
                  <label className="text-xs font-semibold text-foreground">
                    Оқушы
                  </label>

                  <select
                    value={selectedStudentId}
                    onChange={(event) => {
                      const nextStudentId = event.target.value;

                      setSelectedStudentId(nextStudentId);
                      setActiveMode(
                        nextStudentId
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
                            ? 'Бұл курста оқушы жоқ'
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
              </CardContent>
            </Card>

            <AiPromptShell
              title="AI көмекші"
              description={getChatDescription({
                selectedCourse,
                selectedStudent,
              })}
              placeholder={getPlaceholder({ selectedCourse, selectedStudent })}
              suggestions={getSuggestions({ selectedCourse, selectedStudent })}
              contextLabel={
                selectedStudent
                  ? 'Оқушы context'
                  : selectedCourse
                    ? 'Курс context'
                    : 'Курс құру context'
              }
              contextDescription={
                selectedStudent
                  ? `${selectedCourse?.title || 'Курс'} · ${getStudentName(selectedStudent)}`
                  : selectedCourse
                    ? selectedCourse.title
                    : 'Мұғалім профилі және бұрынғы курстар негізінде кеңес беріледі.'
              }
              disabled={!teacherAi.isConfigured || !canUseAssistant}
              disabledReason={disabledReason}
              isSubmitting={teacherAi.isSubmitting}
              answer={teacherAi.answer}
              error={teacherAi.error}
              onSubmit={handleSubmit}
              answerTitle={getAnswerTitle(activeMode)}
              emptyAnswerText="Курс анализі, оқушыға қолдау немесе жаңа курс/сабақ идеясы туралы нақты сұрағыңызды жазыңыз."
              contextSummary={teacherAi.contextSummary}
              warnings={teacherAi.warnings}
              followUpPrompts={teacherAi.followUpPrompts}
            />
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
