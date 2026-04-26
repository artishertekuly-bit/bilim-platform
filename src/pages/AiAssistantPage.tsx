import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  GraduationCap,
  MessageCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Users,
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
    label: 'Қиын сабақтар',
    prompt:
      'Осы курс нәтижелеріне қарап, оқушыларға қай сабақтар қиын болып тұрғанын түсіндір.',
  },
  {
    id: 'course-improvement',
    label: 'Курсты жақсарту',
    prompt:
      'Осы курс нәтижелеріне сүйеніп, қандай сабақтарды, тапсырмаларды немесе mini quiz-дерді жақсартуға болатынын ұсын.',
  },
  {
    id: 'course-repeat-plan',
    label: 'Қайталау жоспары',
    prompt:
      'Осы курс бойынша оқушыларға ортақ қысқа қайталау жоспарын ұсын.',
  },
  {
    id: 'teacher-discussion',
    label: 'Талқылау сұрақтары',
    prompt:
      'Осы курс нәтижелеріне қарап, мұғалім оқушылармен қандай сұрақтарды талқылай алады?',
  },
];

const TEACHER_STUDENT_ASSISTANT_PROMPTS: AiPromptSuggestion[] = [
  {
    id: 'student-support',
    label: 'Оқушыға көмек',
    prompt:
      'Осы оқушының курс бойынша нәтижелеріне қарап, оған қандай педагогикалық қолдау ұсынуға болады?',
  },
  {
    id: 'student-repeat-plan',
    label: 'Жеке жоспар',
    prompt:
      'Осы оқушыға progress және mini quiz нәтижелері бойынша жеке қайталау жоспарын жаса.',
  },
  {
    id: 'student-parent-summary',
    label: 'Ата-анаға summary',
    prompt:
      'Осы оқушының оқу жағдайын ата-анаға түсінікті, жұмсақ және нақты тілмен қысқаша summary етіп дайында.',
  },
  {
    id: 'student-discussion',
    label: 'Талқылау сұрақтары',
    prompt:
      'Осы оқушымен мұғалім қандай сұрақтарды талқыласа пайдалы болады?',
  },
];

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${value}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('kk-KZ');
}

function getScoreTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'muted';
  if (value >= 80) return 'success';
  if (value >= 60) return 'warning';
  return 'danger';
}

function getRiskLabel(risk: LearningRiskLevel) {
  const map: Record<LearningRiskLevel, string> = {
    low: 'Тұрақты',
    medium: 'Назар керек',
    high: 'Қайталау қажет',
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

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold">{value}</p>
          {hint ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
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
    () =>
      students.find((student) => student.studentId === selectedStudentId) || null,
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

  const isAnyFetching =
    workspaceFetching ||
    courseSnapshotFetching ||
    studentsFetching ||
    studentSnapshotFetching;

  const promptShell =
    assistantMode === 'student' && selectedStudent ? (
      <AiPromptShell
        title="AI оқушы көмекшісі"
        description="AI таңдалған оқушының осы курс бойынша оқу нәтижелерін ғана қолданып, мұғалімге педагогикалық ұсыныс береді."
        placeholder="Мысалы: Осы оқушыға қандай қайталау жоспарын ұсынуға болады?"
        suggestions={TEACHER_STUDENT_ASSISTANT_PROMPTS}
        contextLabel="Оқушы бойынша оқу деректері"
        contextDescription="Context ретінде таңдалған оқушының осы курс бойынша progress, mini quiz, test, сақталған сабақтар және кейін қайталау белгілері қолданылады."
        disabled={false}
        isSubmitting={studentAi.isSubmitting}
        answer={studentAi.answer}
        error={studentAi.error}
        onSubmit={studentAi.submit}
        answerTitle="AI оқушы көмекшісінің жауабы"
        emptyAnswerText={
          studentAi.isConfigured
            ? 'Сұрақ жазып немесе жылдам сұрақ таңдап, AI ұсыныс алуға болады.'
            : 'AI backend әлі қосылмаған. Батырманы басқанда жүйе конфигурация қатесін көрсетеді. Кейін VITE_AI_API_URL қосылғанда осы жерге нақты жауап шығады.'
        }
      />
    ) : selectedCourse ? (
      <AiPromptShell
        title="AI курс көмекшісі"
        description="AI таңдалған курстың оқу нәтижелерін ғана қолданып, мұғалімге курс бойынша ұсыныс береді."
        placeholder="Мысалы: Осы курста қай сабақтарды қайта түсіндіру керек?"
        suggestions={TEACHER_COURSE_ASSISTANT_PROMPTS}
        contextLabel="Курс бойынша оқу деректері"
        contextDescription="Context ретінде курс progress-і, оқушы саны, қиын сабақтар, mini quiz pass rate және course-level оқу нәтижелері қолданылады."
        disabled={false}
        isSubmitting={courseAi.isSubmitting}
        answer={courseAi.answer}
        error={courseAi.error}
        onSubmit={courseAi.submit}
        answerTitle="AI курс көмекшісінің жауабы"
        emptyAnswerText={
          courseAi.isConfigured
            ? 'Сұрақ жазып немесе жылдам сұрақ таңдап, AI ұсыныс алуға болады.'
            : 'AI backend әлі қосылмаған. Батырманы басқанда жүйе конфигурация қатесін көрсетеді. Кейін VITE_AI_API_URL қосылғанда осы жерге нақты жауап шығады.'
        }
      />
    ) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              AI құралдар
            </>
          }
          icon={<BrainCircuit size={20} />}
          title="AI көмекші"
          description="Мұғалімге курс және оқушы нәтижелері бойынша педагогикалық талқылау мен ұсыныс дайындауға арналған көмекші."
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

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle size={16} />
                Құралдың мақсаты
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
              <p>
                AI көмекші мұғалімге курс немесе нақты оқушы бойынша оқу нәтижелерін
                түсіндіруге көмектеседі. Қазір бұл бет AI integration алдында дайын
                оқу деректерін көру және сұрақ сценарийін дайындау үшін жасалды.
              </p>
              <p>
                Кейін AI жауап беру бөлігі қосылғанда, мұғалім “Осы оқушыға қандай
                қайталау жоспары керек?”, “Қай сабақтарды қайта түсіндіру керек?”
                сияқты сұрақтар қоя алады.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck size={16} />
                Педагогикалық шектеу
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-muted-foreground">
              AI оқушыға үкім шығармайды. Ол тек оқу нәтижесі бойынша талқылауға
              арналған ұсыныс береді. Соңғы шешім мұғалімде қалады.
            </CardContent>
          </Card>
        </div>

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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Курс таңдау</CardTitle>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedCourseId}
                  onChange={(event) => {
                    const nextCourseId = event.target.value;

                    setSelectedCourseId(nextCourseId);
                    setSelectedStudentId('');
                    setAssistantMode('course');
                    courseAi.reset();
                    studentAi.reset();
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                      {course.subjectName ? ` · ${course.subjectName}` : ''}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {selectedCourse ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Курс"
                  value={selectedCourse.title}
                  icon={<BookOpen size={17} />}
                />

                <MetricCard
                  label="Оқушы саны"
                  value={formatNumber(courseSnapshot?.totals.students)}
                  icon={<Users size={17} />}
                />

                <MetricCard
                  label="Орташа progress"
                  value={formatPercent(courseSnapshot?.totals.avgProgressPct)}
                  icon={<Target size={17} />}
                />

                <MetricCard
                  label="Mini quiz өту көрсеткіші"
                  value={formatPercent(courseSnapshot?.totals.miniQuizPassRatePct)}
                  icon={<CheckCircle2 size={17} />}
                />
              </div>
            ) : null}

            {courseSnapshotLoading ? (
              <LoadingState text="Курс деректері жүктелуде..." />
            ) : null}

            {!courseSnapshotLoading && courseSnapshotError ? (
              <ErrorState
                text="Курс оқу деректерін жүктеу мүмкін болмады."
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

            {!courseSnapshotLoading && !courseSnapshotError && courseSnapshot ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">Қиын сабақтар</CardTitle>
                      <StatusBadge
                        tone={
                          courseSnapshot.difficultLessons.length ? 'warning' : 'success'
                        }
                      >
                        {courseSnapshot.difficultLessons.length}
                      </StatusBadge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {courseSnapshot.difficultLessons.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                        Қазір курс бойынша айқын қиын сабақ байқалмайды.
                      </div>
                    ) : (
                      courseSnapshot.difficultLessons.slice(0, 5).map((lesson) => (
                        <div key={lesson.lessonId} className="rounded-lg border p-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-amber-500/10 text-amber-600">
                              <TrendingDown size={15} />
                            </div>

                            <div>
                              <p className="text-sm font-medium">{lesson.lessonTitle}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {lesson.reason}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Mini quiz нәтижелері</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {courseSnapshot.miniQuizzes.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                        Бұл курс бойынша mini quiz нәтижелері әлі жоқ.
                      </div>
                    ) : (
                      courseSnapshot.miniQuizzes.slice(0, 5).map((quiz) => (
                        <div key={quiz.quizId} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-medium">
                                {quiz.lessonTitle}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Тапсырылғаны: {quiz.attempts} · Өткен: {quiz.passed} ·
                                Қайта қарау керек: {quiz.failed}
                              </p>
                            </div>

                            <StatusBadge tone={getScoreTone(quiz.avgScore)}>
                              Орташа: {formatPercent(quiz.avgScore)}
                            </StatusBadge>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <GraduationCap size={16} />
                      Оқушы бойынша оқу деректері
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Нақты оқушыны таңдап оқу дер, оның осы курс бойынша оқу нәтижесін көріңіз.
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
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
                  <EmptyState
                    title="Оқушы деректері жоқ"
                    text="Курсқа оқушы тіркелгеннен кейін бұл жерде жеке оқу деректері көрінеді."
                  />
                ) : null}

                {!studentsLoading && !studentsError && students.length > 0 ? (
                  <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
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

                      <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                        {filteredStudents.map((student) => (
                          <button
                            key={student.studentId}
                            type="button"
                            onClick={() => {
                              setSelectedStudentId(student.studentId);
                              setAssistantMode('student');
                              studentAi.reset();
                            }}
                            className={`w-full rounded-xl border p-3 text-left transition-all ${
                              selectedStudentId === student.studentId
                                ? 'border-primary/40 bg-primary/5 shadow-sm'
                                : 'bg-card hover:-translate-y-0.5 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold">
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
                                  Progress: {student.progressPct}% · Mini quiz:{' '}
                                  {formatPercent(student.miniQuizAvgScore)}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="min-w-0 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={assistantMode === 'course' ? 'default' : 'outline'}
                          onClick={() => setAssistantMode('course')}
                        >
                          Курс бойынша
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant={assistantMode === 'student' ? 'default' : 'outline'}
                          onClick={() => setAssistantMode('student')}
                          disabled={!selectedStudent}
                        >
                          Оқушы бойынша
                        </Button>
                      </div>

                      {!selectedStudent ? (
                        <EmptyState
                          title="Оқушы таңдалмаған"
                          text="Жеке оқу деректерін көру үшін тізімнен оқушы таңдаңыз."
                        />
                      ) : null}

                      {selectedStudent ? (
                        <>
                          <div className="rounded-xl border bg-card p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h3 className="text-base font-semibold">
                                  {getStudentName(selectedStudent)}
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {selectedStudent.courseTitle}
                                </p>
                              </div>

                              <StatusBadge tone={getRiskTone(selectedStudent.riskLevel)}>
                                {getRiskLabel(selectedStudent.riskLevel)}
                              </StatusBadge>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <MetricCard
                                label="Progress"
                                value={formatPercent(selectedStudent.progressPct)}
                                icon={<Target size={15} />}
                              />

                              <MetricCard
                                label="Mini quiz"
                                value={formatPercent(selectedStudent.miniQuizAvgScore)}
                                icon={<CheckCircle2 size={15} />}
                              />

                              <MetricCard
                                label="Сақталған сабақтар"
                                value={formatNumber(selectedStudent.savedLessons)}
                                icon={<BookOpen size={15} />}
                              />

                              <MetricCard
                                label="Кейін қайталау"
                                value={formatNumber(selectedStudent.reviewLaterItems)}
                                icon={<RotateCcw size={15} />}
                              />
                            </div>
                          </div>

                          {studentSnapshotLoading ? (
                            <LoadingState text="Оқушы деректері жүктелуде..." />
                          ) : null}

                          {!studentSnapshotLoading && studentSnapshotError ? (
                            <ErrorState
                              text="Оқушы оқу деректерін жүктеу мүмкін болмады."
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

                          {!studentSnapshotLoading &&
                          !studentSnapshotError &&
                          studentSnapshot ? (
                            <div className="grid gap-4 xl:grid-cols-2">
                              <div className="rounded-xl border p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold">
                                    Қайталау ұсыныстары
                                  </p>
                                  <StatusBadge
                                    tone={
                                      studentSnapshot.recommendations.length
                                        ? 'warning'
                                        : 'success'
                                    }
                                  >
                                    {studentSnapshot.recommendations.length}
                                  </StatusBadge>
                                </div>

                                {studentSnapshot.recommendations.length === 0 ? (
                                  <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                                    Қазір нақты қайталау ұсынысы жоқ.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {studentSnapshot.recommendations
                                      .slice(0, 5)
                                      .map((item) => (
                                        <div
                                          key={item.id}
                                          className="rounded-lg border p-3"
                                        >
                                          <p className="text-sm font-medium">
                                            {item.title}
                                          </p>
                                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                            {item.description}
                                          </p>
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-xl border p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold">
                                    Қиындық байқалған сабақтар
                                  </p>
                                  <StatusBadge
                                    tone={
                                      studentSnapshot.weakLessons.length
                                        ? 'warning'
                                        : 'success'
                                    }
                                  >
                                    {studentSnapshot.weakLessons.length}
                                  </StatusBadge>
                                </div>

                                {studentSnapshot.weakLessons.length === 0 ? (
                                  <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                                    Бұл оқушы бойынша айқын қиын сабақ байқалмайды.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {studentSnapshot.weakLessons
                                      .slice(0, 5)
                                      .map((lesson) => (
                                        <div
                                          key={lesson.lessonId}
                                          className="rounded-lg border p-3"
                                        >
                                          <p className="text-sm font-medium">
                                            {lesson.lessonTitle}
                                          </p>
                                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                            {lesson.reason}
                                          </p>
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {promptShell}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}