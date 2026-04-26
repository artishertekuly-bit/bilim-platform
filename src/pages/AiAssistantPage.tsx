import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  GraduationCap,
  MessageCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import AiPromptShell, {
  type AiPromptSuggestion,
} from '@/components/ai-tools/AiPromptShell';
import { useLearningAiAnalysis } from '@/hooks/use-learning-ai-analysis';
import {
  useCourseAnalyticsStudents,
  useCourseLearningSnapshot,
  useTeacherCourseWorkspace,
  useTeacherStudentLearningSnapshot,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  CourseAnalyticsStudentOptionView,
  LearningRiskLevel,
} from '@/lib/app-data-types';

type CourseOption = {
  id: string;
  title: string;
  subjectName?: string | null;
};

type AssistantMode = 'course' | 'student';

const TEACHER_COURSE_ASSISTANT_PROMPTS: AiPromptSuggestion[] = [
  {
    id: 'course-difficult-lessons',
    label: 'Қай сабаққа назар аударамын?',
    prompt:
      'Осы курс context-іне сүйеніп, мұғалім ретінде ең алдымен қай сабаққа немесе бағытқа назар аударуым керек екенін түсіндір. Сандық көрсеткіштерді тізбей, нақты педагогикалық әрекет ұсын.',
  },
  {
    id: 'course-improvement',
    label: 'Курсты жақсарту',
    prompt:
      'Осы курс бойынша оқу жағдайын түсіндіріп, сабақты немесе тапсырманы қалай жақсартуға болатынын қысқа әрі нақты ұсын.',
  },
  {
    id: 'course-repeat-plan',
    label: 'Қайталау жоспары',
    prompt:
      'Осы курс үшін оқушыларға ортақ, орындауға ыңғайлы қысқа қайталау жоспарын жаса.',
  },
  {
    id: 'teacher-discussion',
    label: 'Талқылау сұрақтары',
    prompt:
      'Осы курс context-іне сүйеніп, оқушылармен талқылауға болатын пайдалы сұрақтар дайында.',
  },
];

const TEACHER_STUDENT_ASSISTANT_PROMPTS: AiPromptSuggestion[] = [
  {
    id: 'student-support',
    label: 'Қалай көмектесемін?',
    prompt:
      'Осы оқушының оқу context-іне сүйеніп, оған қандай педагогикалық қолдау пайдалы болуы мүмкін екенін түсіндір. Оқушыны бағаламай, қолдау бағытын ұсын.',
  },
  {
    id: 'student-repeat-plan',
    label: 'Жеке жоспар',
    prompt:
      'Осы оқушыға қысқа, нақты және орындауға болатын жеке қайталау жоспарын жаса.',
  },
  {
    id: 'student-parent-summary',
    label: 'Ата-анаға summary',
    prompt:
      'Осы оқушының оқу жағдайын ата-анаға түсінікті, жұмсақ және кінәламайтын тілмен қысқаша summary етіп дайында.',
  },
  {
    id: 'student-discussion',
    label: 'Оқушымен сөйлесу',
    prompt:
      'Осы оқушымен мұғалім қандай сұрақтарды талқыласа пайдалы болады? Сұрақтар қолдаушы және нақты болсын.',
  },
];

function getRiskLabel(risk: LearningRiskLevel) {
  const map: Record<LearningRiskLevel, string> = {
    low: 'Тұрақты',
    medium: 'Назар керек',
    high: 'Қолдау қажет',
  };

  return map[risk];
}

function getRiskTone(risk: LearningRiskLevel) {
  if (risk === 'high') return 'danger';
  if (risk === 'medium') return 'warning';
  return 'success';
}

function getInitials(name: string | null | undefined) {
  const normalized = name?.trim();

  if (!normalized) return 'О';

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function getStudentName(student: CourseAnalyticsStudentOptionView) {
  return student.fullName?.trim() || `Оқушы ${student.studentId.slice(0, 8)}`;
}

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

export default function AiAssistantPage() {
  const { user } = useAuth();

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('course');

  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
    refetch: refetchWorkspace,
    isFetching: workspaceFetching,
  } = useTeacherCourseWorkspace(user?.id || '', Boolean(user?.id));

  const courses = useMemo(() => normalizeCourseOptions(workspace), [workspace]);

  useEffect(() => {
    if (selectedCourseId) {
      const exists = courses.some((course) => course.id === selectedCourseId);
      if (exists) return;
    }

    setSelectedCourseId(courses[0]?.id || '');
  }, [courses, selectedCourseId]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const {
    data: courseSnapshot,
    isLoading: courseSnapshotLoading,
    error: courseSnapshotError,
    refetch: refetchCourseSnapshot,
    isFetching: courseSnapshotFetching,
  } = useCourseLearningSnapshot(selectedCourseId, Boolean(selectedCourseId));

  const {
    data: students = [],
    isLoading: studentsLoading,
    error: studentsError,
    refetch: refetchStudents,
    isFetching: studentsFetching,
  } = useCourseAnalyticsStudents(selectedCourseId, Boolean(selectedCourseId));

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();

    if (!q) return students;

    return students.filter((student) => {
      const name = getStudentName(student).toLowerCase();
      return name.includes(q) || student.studentId.toLowerCase().includes(q);
    });
  }, [students, studentSearch]);

  useEffect(() => {
    if (selectedStudentId) {
      const exists = students.some((student) => student.studentId === selectedStudentId);
      if (exists) return;
    }

    setSelectedStudentId(students[0]?.studentId || '');
  }, [students, selectedStudentId]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.studentId === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const {
    data: studentSnapshot,
    isLoading: studentSnapshotLoading,
    error: studentSnapshotError,
    refetch: refetchStudentSnapshot,
    isFetching: studentSnapshotFetching,
  } = useTeacherStudentLearningSnapshot(
    {
      teacherId: user?.id || '',
      studentId: selectedStudentId,
      courseId: selectedCourseId,
    },
    Boolean(user?.id && selectedCourseId && selectedStudentId)
  );

  const courseAi = useLearningAiAnalysis({
    mode: 'teacher_course_assistant',
    role: 'teacher',
    scope: {
      courseId: selectedCourseId || null,
    },
  });

  const studentAi = useLearningAiAnalysis({
    mode: 'teacher_student_assistant',
    role: 'teacher',
    scope: {
      courseId: selectedCourseId || null,
      studentId: selectedStudentId || null,
    },
  });

  const refreshAll = () => {
    courseAi.reset();
    studentAi.reset();

    void refetchWorkspace();

    if (selectedCourseId) {
      void refetchCourseSnapshot();
      void refetchStudents();
    }

    if (selectedStudentId) {
      void refetchStudentSnapshot();
    }
  };

  const changeMode = (mode: AssistantMode) => {
    setAssistantMode(mode);
    courseAi.reset();
    studentAi.reset();
  };

  const isAnyFetching =
    workspaceFetching ||
    courseSnapshotFetching ||
    studentsFetching ||
    studentSnapshotFetching;

  const topDifficultLesson = courseSnapshot?.difficultLessons[0] || null;
  const topStudentWeakLesson = studentSnapshot?.weakLessons[0] || null;
  const topStudentRecommendation = studentSnapshot?.recommendations[0] || null;

  const selectedModeLabel = assistantMode === 'student' ? 'Оқушы context' : 'Курс context';

  const activeScopeLabel =
    assistantMode === 'student' && selectedStudent
      ? `${getStudentName(selectedStudent)} · ${selectedCourse?.title || 'Курс'}`
      : selectedCourse?.title || 'Курс таңдалмаған';

  const chatDisabled =
    assistantMode === 'student'
      ? !selectedCourse || !selectedStudent
      : !selectedCourse;

  const chatDisabledReason =
    assistantMode === 'student'
      ? 'AI оқушы көмекшісін қолдану үшін курс пен нақты оқушыны таңдаңыз.'
      : 'AI курс көмекшісін қолдану үшін алдымен курс таңдаңыз.';

  const chatTitle =
    assistantMode === 'student' && selectedStudent
      ? 'AI оқушы көмекшісі'
      : 'AI курс көмекшісі';

  const chatDescription =
    assistantMode === 'student' && selectedStudent
      ? 'AI таңдалған оқушының оқу context-ін ішкі талдап, мұғалімге жұмсақ әрі нақты педагогикалық ұсыныс береді.'
      : 'AI таңдалған курс context-ін ішкі талдап, мұғалімге сабақ пен қайталау жұмысын жоспарлауға көмектеседі.';

  const chatPlaceholder =
    assistantMode === 'student'
      ? 'Мысалы: Осы оқушыға қандай жеке қолдау жоспарын ұсынуға болады?'
      : 'Мысалы: Осы курста қай бағытқа бірінші назар аудару керек?';

  const chatSuggestions =
    assistantMode === 'student'
      ? TEACHER_STUDENT_ASSISTANT_PROMPTS
      : TEACHER_COURSE_ASSISTANT_PROMPTS;

  const activeAi = assistantMode === 'student' ? studentAi : courseAi;

  const contextSignalTitle =
    assistantMode === 'student'
      ? topStudentRecommendation?.title || topStudentWeakLesson?.lessonTitle || 'Жеке қолдау бағыты'
      : topDifficultLesson?.lessonTitle || 'Курс бойынша жалпы бағыт';

  const contextSignalDescription =
    assistantMode === 'student'
      ? topStudentRecommendation?.description ||
        topStudentWeakLesson?.reason ||
        'Оқушы бойынша айқын шұғыл қиындық байқалмаса, AI жеке оқу бағытын жұмсақ түрде нақтылап береді.'
      : topDifficultLesson?.reason ||
        'Курс бойынша AI қиындық байқалған бағыттарды ішкі context ретінде талдап, мұғалімге нақты әрекет ұсынады.';

  const activeWarnings = activeAi.lastResponse?.warnings || [];
  const activeFollowUpPrompts = activeAi.lastResponse?.followUpPrompts || [];

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
          description="Курс немесе нақты оқушы context-ін түсіндіріп, мұғалімге педагогикалық шешім қабылдауға көмектесетін AI copilot."
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={refreshAll}
              disabled={isAnyFetching || !user?.id}
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

        {user && workspaceLoading ? (
          <LoadingState text="Мұғалім курстары жүктелуде..." />
        ) : null}

        {user && !workspaceLoading && workspaceError ? (
          <ErrorState
            text="Мұғалім курстарын жүктеу мүмкін болмады."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => void refetchWorkspace()}
              >
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {user && !workspaceLoading && !workspaceError && courses.length === 0 ? (
          <EmptyState
            title="Курстар табылмады"
            text="AI көмекші жұмыс істеуі үшін алдымен курс жасаңыз."
            action={
              <Button type="button" asChild>
                <a href="/create-course">Курс жасау</a>
              </Button>
            }
          />
        ) : null}

        {user && !workspaceLoading && !workspaceError && courses.length > 0 ? (
          <>
            <Card className="border-primary/10 bg-card/95 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="primary">{selectedModeLabel}</StatusBadge>
                      <StatusBadge tone={activeAi.isConfigured ? 'success' : 'warning'}>
                        {activeAi.isConfigured ? 'AI endpoint дайын' : 'Env күтілуде'}
                      </StatusBadge>
                      <StatusBadge tone="muted">Соңғы шешім мұғалімде</StatusBadge>
                    </div>

                    <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                      Мұғалімге арналған AI copilot
                    </h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                      Бұл бет analytics dashboard емес. Оқу деректері AI үшін ішкі context ретінде қолданылады, ал мұғалімге тек сұраққа байланысты түсіндірілген ұсыныс қайтарылады.
                    </p>
                  </div>

                  <div className="rounded-2xl border bg-background px-4 py-3 text-xs leading-5 text-muted-foreground xl:max-w-sm">
                    AI course/student context-ті талдайды, бірақ барлық сандық көрсеткішті тізбейді. Негізгі мақсат — мұғалімге келесі педагогикалық әрекетті нақтылау.
                  </div>
                </div>
              </CardContent>
            </Card>

            {courseSnapshotLoading ? (
              <LoadingState text="Курс context жүктелуде..." />
            ) : null}

            {!courseSnapshotLoading && courseSnapshotError ? (
              <ErrorState
                text="Курс оқу context-ін жүктеу мүмкін болмады."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void refetchCourseSnapshot()}
                  >
                    Қайта жүктеу
                  </Button>
                }
              />
            ) : null}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
              <div className="min-w-0">
                <AiPromptShell
                  title={chatTitle}
                  description={chatDescription}
                  placeholder={chatPlaceholder}
                  suggestions={chatSuggestions}
                  contextLabel={activeScopeLabel}
                  contextDescription={
                    assistantMode === 'student'
                      ? 'AI таңдалған оқушының оқу context-ін ішкі талдау ретінде қолданады. Жауапта барлық сандық көрсеткіш емес, мұғалімге қажет қорытылған insight беріледі.'
                      : 'AI таңдалған курс context-ін ішкі талдау ретінде қолданады. Жауап dashboard есебі емес, педагогикалық ұсыныс ретінде қайтарылады.'
                  }
                  disabled={chatDisabled}
                  disabledReason={chatDisabledReason}
                  isSubmitting={activeAi.isSubmitting}
                  answer={activeAi.answer}
                  error={activeAi.error}
                  onSubmit={activeAi.submit}
                  answerTitle={
                    assistantMode === 'student'
                      ? 'AI оқушы көмекшісінің жауабы'
                      : 'AI курс көмекшісінің жауабы'
                  }
                  emptyAnswerText={
                    activeAi.isConfigured
                      ? 'Дайын prompt таңдаңыз немесе өз сұрағыңызды жазыңыз. AI жауапты осы жерде береді.'
                      : 'AI backend әлі қосылмаған. Frontend env ішінде VITE_AI_API_BASE_URL көрсетілгенде нақты жауап осы жерде шығады.'
                  }
                  contextSummary={null}
                  warnings={activeWarnings}
                  followUpPrompts={activeFollowUpPrompts}
                />
              </div>

              <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageCircle size={16} />
                      Context таңдау
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Курс
                      </label>
                      <select
                        value={selectedCourseId}
                        onChange={(event) => {
                          const nextCourseId = event.target.value;

                          setSelectedCourseId(nextCourseId);
                          setSelectedStudentId('');
                          setStudentSearch('');
                          setAssistantMode('course');
                          courseAi.reset();
                          studentAi.reset();
                        }}
                        className="h-11 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10"
                      >
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                            {course.subjectName ? ` · ${course.subjectName}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={assistantMode === 'course' ? 'default' : 'outline'}
                        onClick={() => changeMode('course')}
                      >
                        Курс
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={assistantMode === 'student' ? 'default' : 'outline'}
                        onClick={() => changeMode('student')}
                        disabled={!selectedStudent}
                      >
                        Оқушы
                      </Button>
                    </div>

                    {studentsLoading ? (
                      <LoadingState text="Оқушылар жүктелуде..." />
                    ) : null}

                    {!studentsLoading && studentsError ? (
                      <ErrorState
                        text="Оқушылар деректерін жүктеу мүмкін болмады."
                        action={
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void refetchStudents()}
                          >
                            Қайта жүктеу
                          </Button>
                        }
                      />
                    ) : null}

                    {!studentsLoading && !studentsError && students.length === 0 ? (
                      <div className="rounded-2xl border border-dashed bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                        Бұл курс бойынша оқушы context әзірге жоқ. Оқушы қосылғаннан кейін student mode іске қосылады.
                      </div>
                    ) : null}

                    {!studentsLoading && !studentsError && students.length > 0 ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search
                            size={15}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          />
                          <Input
                            value={studentSearch}
                            onChange={(event) => setStudentSearch(event.target.value)}
                            placeholder="Оқушыны іздеу..."
                            className="pl-9"
                          />
                        </div>

                        <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                          {filteredStudents.map((student) => (
                            <button
                              key={student.studentId}
                              type="button"
                              onClick={() => {
                                setSelectedStudentId(student.studentId);
                                setAssistantMode('student');
                                studentAi.reset();
                              }}
                              className={`w-full rounded-2xl border p-3 text-left transition-all duration-200 ${
                                selectedStudentId === student.studentId
                                  ? 'border-primary/45 bg-primary/10 shadow-sm ring-1 ring-primary/15'
                                  : 'bg-background hover:border-primary/25 hover:bg-primary/5'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold">
                                  {getInitials(student.fullName)}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="line-clamp-1 text-sm font-semibold">
                                      {getStudentName(student)}
                                    </p>

                                    <StatusBadge tone={getRiskTone(student.riskLevel)}>
                                      {getRiskLabel(student.riskLevel)}
                                    </StatusBadge>
                                  </div>

                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    Оқушы context дайын. Толық түсіндірмені AI жауап ретінде береді.
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Target size={16} />
                      Context signal
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border bg-background p-3">
                      <div className="flex items-start gap-2">
                        {assistantMode === 'student' ? (
                          <GraduationCap size={15} className="mt-0.5 shrink-0 text-primary" />
                        ) : (
                          <BookOpen size={15} className="mt-0.5 shrink-0 text-primary" />
                        )}

                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-5">
                            {contextSignalTitle}
                          </p>
                          <p className="mt-1 line-clamp-4 text-xs leading-5 text-muted-foreground">
                            {contextSignalDescription}
                          </p>
                        </div>
                      </div>
                    </div>

                    {assistantMode === 'student' && selectedStudent ? (
                      <>
                        {studentSnapshotLoading ? (
                          <LoadingState text="Оқушы context жүктелуде..." />
                        ) : null}

                        {!studentSnapshotLoading && studentSnapshotError ? (
                          <ErrorState
                            text="Оқушы оқу context-ін жүктеу мүмкін болмады."
                            action={
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void refetchStudentSnapshot()}
                              >
                                Қайта жүктеу
                              </Button>
                            }
                          />
                        ) : null}

                        {!studentSnapshotLoading && !studentSnapshotError ? (
                          <div className="rounded-2xl border bg-background p-3">
                            <p className="text-xs font-medium text-foreground">
                              Таңдалған оқушы
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {getStudentName(selectedStudent)}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              AI бұл оқушыны бағаламайды. Тек оқу context бойынша қолдау бағытын ұсынады.
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="rounded-2xl border bg-background p-3">
                        <p className="text-xs font-medium text-foreground">
                          Курс режимі
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          AI курс бойынша ортақ оқу сигналдарын ішкі талдап, мұғалімге сабақ жоспарын нақтылауға көмектеседі.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles size={16} />
                      Human–AI collaboration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs leading-5 text-muted-foreground">
                    <div className="rounded-2xl border bg-background p-3">
                      <p className="font-medium text-foreground">AI рөлі</p>
                      <p className="mt-1">
                        Оқу context-ін түсіндіреді, бағыт береді, жоспар ұсынады.
                      </p>
                    </div>

                    <div className="rounded-2xl border bg-background p-3">
                      <p className="font-medium text-foreground">Мұғалім рөлі</p>
                      <p className="mt-1">
                        Оқушының нақты жағдайын ескеріп, соңғы педагогикалық шешім қабылдайды.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-primary/10 bg-card/90 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck size={16} />
                      Педагогикалық шектеу
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs leading-5 text-muted-foreground">
                    <p>
                      AI оқушыға үкім шығармайды және баға қоймайды. Ол тек оқу нәтижесін түсіндіруге арналған көмекші ұсыныс береді.
                    </p>
                    <div className="rounded-2xl border bg-background p-3">
                      Сандық analytics негізгі экранға шығарылмайды; қажет insight AI жауабында түсіндіріліп беріледі.
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}