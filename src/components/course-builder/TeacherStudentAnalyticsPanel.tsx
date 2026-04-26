import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  HelpCircle,
  RotateCcw,
  Search,
  Star,
  Target,
  TrendingDown,
  UserRound,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import {
  useCourseAnalyticsStudents,
  useTeacherStudentLearningSnapshot,
} from '@/hooks/use-platform-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  CourseAnalyticsStudentOptionView,
  LearningRiskLevel,
} from '@/lib/app-data-types';

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${value}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('kk-KZ');
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

function getScoreTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'muted';
  if (value >= 80) return 'success';
  if (value >= 60) return 'warning';
  return 'danger';
}

function getInitials(name: string | null | undefined) {
  const normalized = name?.trim();

  if (!normalized) return 'О';

  const parts = normalized.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function getDisplayName(student: CourseAnalyticsStudentOptionView) {
  return student.fullName?.trim() || `Оқушы ${student.studentId.slice(0, 8)}`;
}

function SmallMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-sm font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StudentListItem({
  student,
  selected,
  onSelect,
}: {
  student: CourseAnalyticsStudentOptionView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition-all ${
        selected
          ? 'border-primary/40 bg-primary/5 shadow-sm'
          : 'bg-card hover:-translate-y-0.5 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold">
          {student.avatarUrl ? (
            <img
              src={student.avatarUrl}
              alt={getDisplayName(student)}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            getInitials(student.fullName)
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="line-clamp-1 text-sm font-semibold">
              {getDisplayName(student)}
            </p>

            <StatusBadge tone={getRiskTone(student.riskLevel)}>
              {getRiskLabel(student.riskLevel)}
            </StatusBadge>
          </div>

          <p className="mt-1 text-[11px] text-muted-foreground">
            Progress: {student.progressPct}% · Mini quiz:{' '}
            {formatPercent(student.miniQuizAvgScore)}
          </p>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, student.progressPct))}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

export default function TeacherStudentAnalyticsPanel({
  courseId,
  teacherId,
}: {
  courseId: string;
  teacherId: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const {
    data: students = [],
    isLoading: studentsLoading,
    error: studentsError,
    isFetching: studentsFetching,
    refetch: refetchStudents,
  } = useCourseAnalyticsStudents(courseId, Boolean(courseId));

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return students;

    return students.filter((student) => {
      const name = getDisplayName(student).toLowerCase();
      return name.includes(q) || student.studentId.toLowerCase().includes(q);
    });
  }, [students, search]);

  useEffect(() => {
    if (selectedStudentId) {
      const stillExists = students.some(
        (student) => student.studentId === selectedStudentId
      );

      if (stillExists) return;
    }

    setSelectedStudentId(students[0]?.studentId || null);
  }, [students, selectedStudentId]);

  const selectedStudent = useMemo(
    () =>
      students.find((student) => student.studentId === selectedStudentId) ||
      null,
    [students, selectedStudentId]
  );

  const {
    data: selectedSnapshot,
    isLoading: snapshotLoading,
    error: snapshotError,
    refetch: refetchSnapshot,
    isFetching: snapshotFetching,
  } = useTeacherStudentLearningSnapshot(
    {
      teacherId,
      studentId: selectedStudentId || '',
      courseId,
    },
    Boolean(teacherId && courseId && selectedStudentId)
  );

  const selectedCourseSnapshot = selectedSnapshot?.courses?.[0] || null;

  return (
    <Card id="teacher-student-analytics" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GraduationCap size={16} />
              Оқушы бойынша талдау
            </CardTitle>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Бұл бөлім мұғалімге курс ішіндегі нақты оқушының оқу нәтижесін көруге
              көмектеседі. Мұнда бақылау event-тері жоқ, тек progress, quiz/test
              нәтижелері және қайталау ұсыныстары қолданылады.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchStudents();
              if (selectedStudentId) void refetchSnapshot();
            }}
            disabled={studentsFetching || snapshotFetching}
          >
            <RotateCcw size={14} className="mr-1.5" />
            Жаңарту
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {studentsLoading ? (
          <LoadingState text="Оқушылар аналитикасы жүктелуде..." />
        ) : null}

        {!studentsLoading && studentsError ? (
          <ErrorState
            text="Оқушылар аналитикасын жүктеу мүмкін болмады."
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
            title="Бұл курста оқушы деректері жоқ"
            text="Оқушы курсқа тіркелгеннен немесе оқу нәтижелері пайда болғаннан кейін бұл бөлімде жеке аналитика көрінеді."
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
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Оқушыны іздеу..."
                  className="pl-9"
                />
              </div>

              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {filteredStudents.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                    Іздеу бойынша оқушы табылмады.
                  </div>
                ) : (
                  filteredStudents.map((student) => (
                    <StudentListItem
                      key={student.studentId}
                      student={student}
                      selected={student.studentId === selectedStudentId}
                      onSelect={() => setSelectedStudentId(student.studentId)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              {!selectedStudent ? (
                <EmptyState
                  title="Оқушы таңдалмаған"
                  text="Жеке аналитиканы көру үшін тізімнен оқушы таңдаңыз."
                />
              ) : null}

              {selectedStudent ? (
                <>
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold">
                          {selectedStudent.avatarUrl ? (
                            <img
                              src={selectedStudent.avatarUrl}
                              alt={getDisplayName(selectedStudent)}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            getInitials(selectedStudent.fullName)
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="line-clamp-1 text-base font-semibold">
                              {getDisplayName(selectedStudent)}
                            </h3>

                            <StatusBadge tone={getRiskTone(selectedStudent.riskLevel)}>
                              {getRiskLabel(selectedStudent.riskLevel)}
                            </StatusBadge>
                          </div>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedStudent.courseTitle}
                          </p>
                        </div>
                      </div>

                      <StatusBadge tone={getScoreTone(selectedStudent.miniQuizAvgScore)}>
                        Mini quiz: {formatPercent(selectedStudent.miniQuizAvgScore)}
                      </StatusBadge>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, selectedStudent.progressPct)
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Course progress</span>
                      <span className="font-medium">
                        {selectedStudent.completedLessons}/{selectedStudent.totalLessons} сабақ ·{' '}
                        {selectedStudent.progressPct}%
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SmallMetric
                      label="Аяқталған сабақ"
                      value={`${selectedStudent.completedLessons}/${selectedStudent.totalLessons}`}
                      icon={<BookOpen size={15} />}
                    />
                    <SmallMetric
                      label="Mini quiz attempts"
                      value={formatNumber(selectedStudent.miniQuizAttempts)}
                      icon={<Target size={15} />}
                    />
                    <SmallMetric
                      label="Saved lessons"
                      value={formatNumber(selectedStudent.savedLessons)}
                      icon={<Star size={15} />}
                    />
                    <SmallMetric
                      label="Review later"
                      value={formatNumber(selectedStudent.reviewLaterItems)}
                      icon={<RotateCcw size={15} />}
                    />
                  </div>

                  {snapshotLoading ? (
                    <LoadingState text="Оқушы snapshot жүктелуде..." />
                  ) : null}

                  {!snapshotLoading && snapshotError ? (
                    <ErrorState
                      text="Оқушы snapshot-ын жүктеу мүмкін болмады."
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void refetchSnapshot()}
                        >
                          Қайта жүктеу
                        </Button>
                      }
                    />
                  ) : null}

                  {!snapshotLoading && !snapshotError && selectedSnapshot ? (
                    <>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-xl border p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                Қайталау ұсыныстары
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Автоматты үкім емес, мұғаліммен талқылауға арналған
                                ұсыныстар.
                              </p>
                            </div>

                            <StatusBadge
                              tone={
                                selectedSnapshot.recommendations.length
                                  ? 'warning'
                                  : 'success'
                              }
                            >
                              {selectedSnapshot.recommendations.length}
                            </StatusBadge>
                          </div>

                          {selectedSnapshot.recommendations.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                              Қазір нақты қайталау ұсынысы жоқ. Оқушы жоспар бойынша
                              жалғастыра алады.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {selectedSnapshot.recommendations
                                .slice(0, 5)
                                .map((recommendation) => (
                                  <div
                                    key={recommendation.id}
                                    className="rounded-lg border p-3"
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-amber-500/10 text-amber-600">
                                        <AlertTriangle size={15} />
                                      </div>

                                      <div className="min-w-0">
                                        <p className="text-sm font-medium">
                                          {recommendation.title}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                          {recommendation.description}
                                        </p>

                                        <div className="mt-2">
                                          <StatusBadge
                                            tone={getRiskTone(recommendation.priority)}
                                          >
                                            {getRiskLabel(recommendation.priority)}
                                          </StatusBadge>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                Қиындық байқалған сабақтар
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Mini quiz нәтижелері және review later белгісі бойынша.
                              </p>
                            </div>

                            <StatusBadge
                              tone={
                                selectedSnapshot.weakLessons.length
                                  ? 'warning'
                                  : 'success'
                              }
                            >
                              {selectedSnapshot.weakLessons.length}
                            </StatusBadge>
                          </div>

                          {selectedSnapshot.weakLessons.length === 0 ? (
                            <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                              Бұл оқушы бойынша айқын қиын сабақ байқалмайды.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {selectedSnapshot.weakLessons.slice(0, 5).map((lesson) => (
                                <div key={lesson.lessonId} className="rounded-lg border p-3">
                                  <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-destructive/10 text-destructive">
                                      <TrendingDown size={15} />
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-sm font-medium">
                                        {lesson.lessonTitle}
                                      </p>
                                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                        {lesson.reason}
                                      </p>

                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <StatusBadge
                                          tone={getScoreTone(lesson.miniQuizAvgScore)}
                                        >
                                          Score:{' '}
                                          {formatPercent(lesson.miniQuizAvgScore)}
                                        </StatusBadge>

                                        {lesson.failedAttempts > 0 ? (
                                          <StatusBadge tone="danger">
                                            Failed: {lesson.failedAttempts}
                                          </StatusBadge>
                                        ) : null}

                                        {lesson.reviewLater ? (
                                          <StatusBadge tone="warning">
                                            Review later
                                          </StatusBadge>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
                            <HelpCircle size={16} />
                          </div>

                          <div>
                            <p className="text-sm font-semibold">
                              Педагогикалық ескерту
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {selectedSnapshot.teacherScopeNote ||
                                'Бұл snapshot тек оқу нәтижелері мен progress деректеріне негізделеді. Бұл автоматты баға немесе педагогикалық үкім емес.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {!snapshotLoading && !snapshotError && !selectedCourseSnapshot ? (
                    <div className="rounded-xl border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                      Бұл оқушы бойынша осы курсқа қатысты snapshot әзірге толық емес.
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}