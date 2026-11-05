import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, RotateCcw, Sparkles } from 'lucide-react';

import AiPromptShell, {
  type AiConversationMessage,
  type AiPromptSubmitPayload,
  type AiPromptSuggestion,
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
import { limitText, removeNullCharacters } from '@/lib/utils';

type CourseOption = {
  id: string;
  title: string;
  subjectName: string | null;
};

type AssistantMode =
  | 'teacher_course_creator_advisor'
  | 'teacher_course_assistant'
  | 'teacher_student_assistant';

const CREATOR_SUGGESTIONS: AiPromptSuggestion[] = [
  {
    id: 'creator-course-idea',
    label: 'Курс идеясы',
    prompt: 'Жаңа курс идеясын ұсын.',
  },
  {
    id: 'creator-six-lesson-plan',
    label: '6 сабақ жоспары',
    prompt: '6 сабақтан тұратын курс құрылымын жаса.',
  },
  {
    id: 'creator-practice-quiz',
    label: 'Тапсырма және тест',
    prompt: 'Курсқа тапсырма және шағын тест идеяларын қос.',
  },
];

const COURSE_SUGGESTIONS: AiPromptSuggestion[] = [
  {
    id: 'course-week-review',
    label: 'Қайталау жоспары',
    prompt: 'Осы курс бойынша бір апталық қайталау жоспарын жаса.',
  },
  {
    id: 'course-hard-lessons',
    label: 'Қиын сабақтар',
    prompt: 'Курста қай сабақтарды қайта түсіндіру керек?',
  },
  {
    id: 'course-improve-quiz',
    label: 'Тестті жақсарту',
    prompt: 'Осы курсқа тапсырма және шағын тест жақсарту идеясын ұсын.',
  },
];

const STUDENT_SUGGESTIONS: AiPromptSuggestion[] = [
  {
    id: 'student-support-plan',
    label: 'Жеке қолдау',
    prompt: 'Осы оқушыға жеке қолдау жоспарын жаса.',
  },
  {
    id: 'student-review-topic',
    label: 'Қайталау тақырыбы',
    prompt: 'Осы оқушыға қай тақырыпты қайталау керек?',
  },
  {
    id: 'student-parent-message',
    label: 'Ата-анаға мәтін',
    prompt: 'Ата-анаға жұмсақ түсіндіретін қысқа мәтін дайында.',
  },
];

const CREATOR_PHRASES = [
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
] as const;

const CREATOR_INTENT_KEYWORDS = [
  'курс',
  'сабақ',
  'тақырып',
  'модуль',
  'бағдарлама',
  'контент',
  'тапсырма',
  'mini quiz',
  'мини quiz',
  'шағын тест',
] as const;

const CREATOR_ACTION_KEYWORDS = [
  'жаса',
  'құр',
  'ұсын',
  'идея',
  'қандай',
  'қай',
  'қалай',
  'қоссам',
  'құрастыр',
] as const;

const CONTEXT_REFERENCE_KEYWORDS = [
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
] as const;

const COURSE_OR_STUDENT_ANALYSIS_KEYWORDS = [
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
  'шағын тест нәтижесі',
] as const;

const MAX_PROMPT_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_CHARS = 6_000;
const MAX_SUGGESTION_ID_CHARS = 120;
const MAX_ID_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_STUDENT_NAME_CHARS = 180;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit?: number): string {
  const normalized = cleanRawText(value).replace(/\s+/g, ' ').trim();

  return typeof limit === 'number' ? limitText(normalized, limit) : normalized;
}

function cleanMultilineText(value: unknown, limit?: number): string {
  const normalized = cleanRawText(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return typeof limit === 'number' ? limitText(normalized, limit) : normalized;
}

function normalizeCourseOptions(workspace: unknown): CourseOption[] {
  const raw = workspace as {
    courses?: unknown[];
    items?: unknown[];
    teacherCourses?: unknown[];
  };

  const source: unknown[] =
    (Array.isArray(raw?.courses) && raw.courses) ||
    (Array.isArray(raw?.items) && raw.items) ||
    (Array.isArray(raw?.teacherCourses) && raw.teacherCourses) ||
    (Array.isArray(raw) && raw) ||
    [];

  return source
    .map((item): CourseOption => {
      const row = item as Record<string, unknown>;

      const subjectName =
        typeof row.subjectName === 'string'
          ? cleanText(row.subjectName, MAX_TITLE_CHARS)
          : typeof row.subject_name === 'string'
            ? cleanText(row.subject_name, MAX_TITLE_CHARS)
            : null;

      return {
        id: cleanText(row.id || row.courseId || '', MAX_ID_CHARS),
        title: cleanText(row.title || row.courseTitle || 'Курс', MAX_TITLE_CHARS),
        subjectName: subjectName || null,
      };
    })
    .filter((item) => item.id.length > 0);
}

function getStudentName(student: CourseAnalyticsStudentOptionView): string {
  const fullName = cleanText(student.fullName, MAX_STUDENT_NAME_CHARS);

  return fullName || `Оқушы ${cleanText(student.studentId, MAX_ID_CHARS).slice(0, 8)}`;
}

function normalizePrompt(value: unknown): string {
  return cleanText(value, MAX_PROMPT_CHARS)
    .toLowerCase()
    .replace(/[?.,!;:()[\]{}"'`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function hasCourseContextReference(prompt: string): boolean {
  return includesAny(normalizePrompt(prompt), CONTEXT_REFERENCE_KEYWORDS);
}

function hasCourseOrStudentAnalysisIntent(prompt: string): boolean {
  return includesAny(normalizePrompt(prompt), COURSE_OR_STUDENT_ANALYSIS_KEYWORDS);
}

function shouldUseTeacherCourseCreatorAdvisor(
  prompt: string,
  hasSelectedCourse: boolean,
): boolean {
  const normalized = normalizePrompt(prompt);

  if (!normalized) {
    return false;
  }

  if (!hasSelectedCourse) {
    return true;
  }

  if (
    hasCourseContextReference(normalized) ||
    hasCourseOrStudentAnalysisIntent(normalized)
  ) {
    return false;
  }

  if (includesAny(normalized, CREATOR_PHRASES)) {
    return true;
  }

  const creatorIntent = includesAny(normalized, CREATOR_INTENT_KEYWORDS);
  const actionIntent = includesAny(normalized, CREATOR_ACTION_KEYWORDS);

  return creatorIntent && actionIntent;
}

function normalizeSubmitPayload(payload: AiPromptSubmitPayload): AiPromptSubmitPayload {
  const conversationHistory: AiConversationMessage[] = Array.isArray(
    payload.conversationHistory,
  )
    ? payload.conversationHistory
        .slice(-MAX_HISTORY_MESSAGES)
        .map(
          (message): AiConversationMessage => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: cleanMultilineText(
              message.content,
              MAX_HISTORY_MESSAGE_CHARS,
            ),
          }),
        )
        .filter((message) => message.content.length > 0)
    : [];

  return {
    prompt: cleanMultilineText(payload.prompt, MAX_PROMPT_CHARS),
    selectedSuggestionId: payload.selectedSuggestionId
      ? cleanText(payload.selectedSuggestionId, MAX_SUGGESTION_ID_CHARS)
      : null,
    conversationHistory,
  };
}

function getAnswerTitle(mode: AssistantMode): string {
  if (mode === 'teacher_course_creator_advisor') {
    return 'Курс құру кеңесі';
  }

  if (mode === 'teacher_student_assistant') {
    return 'Оқушы ұсынысы';
  }

  return 'Курс жауабы';
}

function getPlaceholder({
  selectedCourse,
  selectedStudent,
}: {
  selectedCourse: CourseOption | null;
  selectedStudent: CourseAnalyticsStudentOptionView | null;
}): string {
  if (selectedCourse && selectedStudent) {
    return 'Мысалы: Осы оқушыға қандай қолдау берген дұрыс?';
  }

  if (selectedCourse) {
    return 'Мысалы: Осы курста қай тақырыптарды қайталау керек?';
  }

  return 'Мысалы: 7-сыныпқа Python курс жоспарын жаса.';
}

function getSuggestions({
  selectedCourse,
  selectedStudent,
}: {
  selectedCourse: CourseOption | null;
  selectedStudent: CourseAnalyticsStudentOptionView | null;
}): AiPromptSuggestion[] {
  if (selectedCourse && selectedStudent) {
    return STUDENT_SUGGESTIONS;
  }

  if (selectedCourse) {
    return COURSE_SUGGESTIONS;
  }

  return CREATOR_SUGGESTIONS;
}

function getContextLabel({
  selectedCourse,
  selectedStudent,
}: {
  selectedCourse: CourseOption | null;
  selectedStudent: CourseAnalyticsStudentOptionView | null;
}): string {
  if (selectedCourse && selectedStudent) return 'Оқушы дерегі';
  if (selectedCourse) return 'Курс дерегі';

  return 'Курс құру';
}

export default function AiAssistantPage() {
  const { user } = useAuth();

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [activeMode, setActiveMode] = useState<AssistantMode>(
    'teacher_course_creator_advisor',
  );

  const isAuthor = user?.role === 'admin';
  const canUseAssistant = Boolean(user?.id && isAuthor);

  const {
    data: workspace,
    isFetching: workspaceFetching,
    refetch: refetchWorkspace,
  } = useTeacherCourseWorkspace(user?.id || '', canUseAssistant);

  const courses = useMemo(() => normalizeCourseOptions(workspace), [workspace]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const {
    data: students = [],
    isFetching: studentsFetching,
    refetch: refetchStudents,
  } = useCourseAnalyticsStudents(
    selectedCourseId,
    canUseAssistant && Boolean(selectedCourseId),
  );

  const selectedStudent = useMemo(
    () =>
      students.find(
        (student) =>
          cleanText(student.studentId, MAX_ID_CHARS) === selectedStudentId,
      ) || null,
    [students, selectedStudentId],
  );

  const teacherAi = useLearningAiAnalysis({
    mode: 'teacher_course_creator_advisor',
    role: 'teacher',
    scope: {},
  });

  const suggestions = useMemo(
    () =>
      getSuggestions({
        selectedCourse,
        selectedStudent,
      }),
    [selectedCourse, selectedStudent],
  );

  const contextLabel = useMemo(
    () =>
      getContextLabel({
        selectedCourse,
        selectedStudent,
      }),
    [selectedCourse, selectedStudent],
  );

  useEffect(() => {
    if (!selectedCourseId) return;

    const courseExists = courses.some((course) => course.id === selectedCourseId);

    if (!courseExists) {
      setSelectedCourseId('');
      setSelectedStudentId('');
      setActiveMode('teacher_course_creator_advisor');
      teacherAi.reset();
    }
  }, [courses, selectedCourseId, teacherAi]);

  useEffect(() => {
    if (!selectedStudentId) return;

    const studentExists = students.some(
      (student) => cleanText(student.studentId, MAX_ID_CHARS) === selectedStudentId,
    );

    if (!studentExists) {
      setSelectedStudentId('');
      setActiveMode(
        selectedCourseId
          ? 'teacher_course_assistant'
          : 'teacher_course_creator_advisor',
      );
      teacherAi.reset();
    }
  }, [selectedCourseId, selectedStudentId, students, teacherAi]);

  const refreshAll = useCallback(() => {
    teacherAi.reset();

    if (canUseAssistant) {
      void refetchWorkspace();
    }

    if (canUseAssistant && selectedCourseId) {
      void refetchStudents();
    }
  }, [canUseAssistant, refetchStudents, refetchWorkspace, selectedCourseId, teacherAi]);

  const handleCourseChange = (courseId: string) => {
    const normalizedCourseId = cleanText(courseId, MAX_ID_CHARS);

    setSelectedCourseId(normalizedCourseId);
    setSelectedStudentId('');
    setActiveMode(
      normalizedCourseId
        ? 'teacher_course_assistant'
        : 'teacher_course_creator_advisor',
    );
    teacherAi.reset();
  };

  const handleStudentChange = (studentId: string) => {
    const normalizedStudentId = cleanText(studentId, MAX_ID_CHARS);

    setSelectedStudentId(normalizedStudentId);
    setActiveMode(
      normalizedStudentId
        ? 'teacher_student_assistant'
        : selectedCourseId
          ? 'teacher_course_assistant'
          : 'teacher_course_creator_advisor',
    );
    teacherAi.reset();
  };

  const handleSubmit = useCallback(
    async (payload: AiPromptSubmitPayload) => {
      if (!canUseAssistant) {
        return;
      }

      const normalizedPayload = normalizeSubmitPayload(payload);

      if (!normalizedPayload.prompt) {
        return;
      }

      const useCreatorAdvisor = shouldUseTeacherCourseCreatorAdvisor(
        normalizedPayload.prompt,
        Boolean(selectedCourseId),
      );

      if (useCreatorAdvisor) {
        setActiveMode('teacher_course_creator_advisor');

        await teacherAi.submit(normalizedPayload, {
          mode: 'teacher_course_creator_advisor',
          role: 'teacher',
          scope: {},
        });

        return;
      }

      if (selectedCourseId && selectedStudentId) {
        setActiveMode('teacher_student_assistant');

        await teacherAi.submit(normalizedPayload, {
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

        await teacherAi.submit(normalizedPayload, {
          mode: 'teacher_course_assistant',
          role: 'teacher',
          scope: {
            courseId: selectedCourseId,
          },
        });

        return;
      }

      setActiveMode('teacher_course_creator_advisor');

      await teacherAi.submit(normalizedPayload, {
        mode: 'teacher_course_creator_advisor',
        role: 'teacher',
        scope: {},
      });
    },
    [canUseAssistant, selectedCourseId, selectedStudentId, teacherAi],
  );

  const isFetching = workspaceFetching || studentsFetching;

  const disabledReason = !teacherAi.isConfigured
    ? 'ЖИ сервисі қосылмаған.'
    : !canUseAssistant
      ? 'Бұл бөлім автор аккаунтына арналған.'
      : undefined;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              ЖИ құралдары
            </>
          }
          icon={<BrainCircuit size={20} />}
          title="ЖИ көмекші"
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
            text="Жүйеге кіріңіз."
            tone="ai"
          />
        ) : null}

        {user && !isAuthor ? (
          <EmptyState
            title="Админ аккаунты қажет"
            text="Бұл бөлім тек админге арналған."
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
                    onChange={(event) => handleCourseChange(event.target.value)}
                    disabled={workspaceFetching}
                    className="h-11 w-full rounded-2xl border-0 bg-muted/40 px-4 text-sm text-foreground shadow-xs outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Жаңа курс идеясы</option>

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
                    onChange={(event) => handleStudentChange(event.target.value)}
                    disabled={!selectedCourseId || students.length === 0 || studentsFetching}
                    className="h-11 w-full rounded-2xl border-0 bg-muted/40 px-4 text-sm text-foreground shadow-xs outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {selectedCourseId
                        ? studentsFetching
                          ? 'Оқушылар жүктелуде...'
                          : students.length === 0
                            ? 'Оқушы жоқ'
                            : 'Оқушы таңдау'
                        : 'Алдымен курс таңдаңыз'}
                    </option>

                    {students.map((student) => {
                      const studentId = cleanText(student.studentId, MAX_ID_CHARS);

                      return (
                        <option key={studentId} value={studentId}>
                          {getStudentName(student)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </CardContent>
            </Card>

            <AiPromptShell
              title="ЖИ көмекші"
              description=""
              placeholder={getPlaceholder({
                selectedCourse,
                selectedStudent,
              })}
              suggestions={suggestions}
              contextLabel={contextLabel}
              disabled={!teacherAi.isConfigured || !canUseAssistant}
              disabledReason={disabledReason}
              isSubmitting={teacherAi.isSubmitting}
              answer={teacherAi.answer}
              error={teacherAi.error}
              onSubmit={handleSubmit}
              answerTitle={getAnswerTitle(activeMode)}
              emptyAnswerText="Сұрағыңызды жазыңыз."
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