import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  GraduationCap,
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
  if (risk === 'high') return 'danger' as const;
  if (risk === 'medium') return 'warning' as const;
  return 'success' as const;
}

function getScoreTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'muted' as const;
  if (value >= 80) return 'success' as const;
  if (value >= 60) return 'warning' as const;
  return 'danger' as const;
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

function ProgressLine({ value }: { value: number | null | undefined }) {
  const normalized = Math.min(100, Math.max(0, Number(value || 0)));

  return (
    <div className="h-2 overflow-hidden rounded-full border border-border bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-soft"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

function StudentAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClassName = {
    sm: 'h-10 w-10 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-14 w-14 text-base',
  }[size];

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary-muted bg-primary-soft font-semibold text-primary ${sizeClassName}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || 'Оқушы'}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

function SmallMetric({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'ai';
}) {
  const toneClassName = {
    primary: 'border-primary-muted bg-primary-soft text-primary',
    success: 'border-success-muted bg-success-soft text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    ai: 'border-ai-border bg-ai-soft text-primary',
  }[tone];

  return (
    <div className="rounded-3xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${toneClassName}`}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
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
      aria-pressed={selected}
      className={`w-full rounded-3xl border p-3 text-left transition-colors active:scale-[0.99] ${
        selected
          ? 'border-primary-muted bg-primary-soft'
          : 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <StudentAvatar
          name={student.fullName}
          avatarUrl={student.avatarUrl}
          size="sm"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="line-clamp-1 text-sm font-semibold text-foreground">
              {getDisplayName(student)}
            </p>

            <StatusBadge tone={getRiskTone(student.riskLevel)}>
              {getRiskLabel(student.riskLevel)}
            </StatusBadge>
          </div>

          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Прогресс: {student.progressPct}% · Шағын тест:{' '}
            {formatPercent(student.miniQuizAvgScore)}
          </p>

          <div className="mt-2">
            <ProgressLine value={student.progressPct} />
          </div>
        </div>
      </div>
    </button>
  );
}

function InsightCard({
  icon,
  title,
  description,
  tone = 'warning',
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: 'warning' | 'danger' | 'ai';
  children?: ReactNode;
}) {
  const toneClassName = {
    warning: {
      card: 'border-warning-muted bg-warning-soft/50',
      icon: 'border-warning-muted bg-card text-warning-foreground',
    },
    danger: {
      card: 'border-destructive-muted bg-destructive-soft/50',
      icon: 'border-destructive-muted bg-card text-destructive',
    },
    ai: {
      card: 'border-ai-border bg-ai-soft/60',
      icon: 'border-ai-border bg-card text-primary',
    },
  }[tone];

  return (
    <div className={`rounded-3xl border p-3 ${toneClassName.card}`}>
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${toneClassName.icon}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>

          {children ? <div className="mt-2">{children}</div> : null}
        </div>
      </div>
    </div>
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
    <Card id="teacher-student-analytics" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <GraduationCap size={16} />
              Оқушы талдауы
            </CardTitle>

            {students.length > 0 ? (
              <StatusBadge tone="secondary">
                <UserRound size={12} />
                {students.length}
              </StatusBadge>
            ) : null}
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
            {studentsFetching || snapshotFetching ? 'Жаңартылуда...' : 'Жаңарту'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {studentsLoading ? (
          <LoadingState text="Жүктелуде..." compact />
        ) : null}

        {!studentsLoading && studentsError ? (
          <ErrorState
            text="Оқушы деректерін жүктеу мүмкін болмады."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => void refetchStudents()}
              >
                <RotateCcw size={15} className="mr-2" />
                Қайта жүктеу
              </Button>
            }
            compact
          />
        ) : null}

        {!studentsLoading && !studentsError && students.length === 0 ? (
          <EmptyState
            title="Оқушы дерегі жоқ"
            text="Дерек пайда болғаннан кейін көрсетіледі."
            compact
            tone="ai"
          />
        ) : null}

        {!studentsLoading && !studentsError && students.length > 0 ? (
          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <aside className="space-y-3">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Оқушыны іздеу"
                  className="pl-10"
                />
              </div>

              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {filteredStudents.length === 0 ? (
                  <EmptyState
                    title="Оқушы табылмады"
                    text="Іздеуді өзгертіңіз."
                    compact
                  />
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
            </aside>

            <div className="min-w-0 space-y-4">
              {!selectedStudent ? (
                <EmptyState
                  title="Оқушы таңдалмаған"
                  text="Тізімнен оқушы таңдаңыз."
                  compact
                />
              ) : null}

              {selectedStudent ? (
                <>
                  <section className="rounded-3xl border border-border bg-card p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <StudentAvatar
                          name={selectedStudent.fullName}
                          avatarUrl={selectedStudent.avatarUrl}
                          size="md"
                        />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="line-clamp-1 text-base font-semibold text-foreground">
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
                        Шағын тест: {formatPercent(selectedStudent.miniQuizAvgScore)}
                      </StatusBadge>
                    </div>

                    <div className="mt-4">
                      <ProgressLine value={selectedStudent.progressPct} />
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">Прогресс</span>
                      <span className="text-right font-medium text-foreground">
                        {selectedStudent.completedLessons}/{selectedStudent.totalLessons} сабақ ·{' '}
                        {selectedStudent.progressPct}%
                      </span>
                    </div>
                  </section>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SmallMetric
                      label="Аяқталған"
                      value={`${selectedStudent.completedLessons}/${selectedStudent.totalLessons}`}
                      icon={<BookOpen size={15} />}
                      tone="success"
                    />
                    <SmallMetric
                      label="Шағын тест"
                      value={formatNumber(selectedStudent.miniQuizAttempts)}
                      icon={<Target size={15} />}
                      tone="ai"
                    />
                    <SmallMetric
                      label="Сақталған"
                      value={formatNumber(selectedStudent.savedLessons)}
                      icon={<Star size={15} />}
                    />
                    <SmallMetric
                      label="Қайталау"
                      value={formatNumber(selectedStudent.reviewLaterItems)}
                      icon={<RotateCcw size={15} />}
                      tone="warning"
                    />
                  </div>

                  {snapshotLoading ? (
                    <LoadingState text="Жүктелуде..." compact />
                  ) : null}

                  {!snapshotLoading && snapshotError ? (
                    <ErrorState
                      text="Snapshot жүктеу мүмкін болмады."
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void refetchSnapshot()}
                        >
                          <RotateCcw size={15} className="mr-2" />
                          Қайта жүктеу
                        </Button>
                      }
                      compact
                    />
                  ) : null}

                  {!snapshotLoading && !snapshotError && selectedSnapshot ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      <section className="rounded-3xl border border-border bg-card p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              Қайталау
                            </p>

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
                        </div>

                        {selectedSnapshot.recommendations.length === 0 ? (
                          <EmptyState
                            title="Ұсыныс жоқ"
                            text="Оқушы жалғастыра алады."
                            compact
                          />
                        ) : (
                          <div className="space-y-2">
                            {selectedSnapshot.recommendations
                              .slice(0, 5)
                              .map((recommendation) => (
                                <InsightCard
                                  key={recommendation.id}
                                  icon={<AlertTriangle size={15} />}
                                  title={recommendation.title}
                                  description={recommendation.description}
                                  tone={
                                    recommendation.priority === 'high'
                                      ? 'danger'
                                      : recommendation.priority === 'medium'
                                        ? 'warning'
                                        : 'ai'
                                  }
                                >
                                  <StatusBadge
                                    tone={getRiskTone(recommendation.priority)}
                                  >
                                    {getRiskLabel(recommendation.priority)}
                                  </StatusBadge>
                                </InsightCard>
                              ))}
                          </div>
                        )}
                      </section>

                      <section className="rounded-3xl border border-border bg-card p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              Қиын сабақтар
                            </p>

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
                        </div>

                        {selectedSnapshot.weakLessons.length === 0 ? (
                          <EmptyState
                            title="Қиын сабақ жоқ"
                            text="Дерек көбейгенде жаңарады."
                            compact
                          />
                        ) : (
                          <div className="space-y-2">
                            {selectedSnapshot.weakLessons.slice(0, 5).map((lesson) => (
                              <InsightCard
                                key={lesson.lessonId}
                                icon={<TrendingDown size={15} />}
                                title={lesson.lessonTitle}
                                description={lesson.reason}
                                tone="danger"
                              >
                                <div className="flex flex-wrap gap-2">
                                  <StatusBadge
                                    tone={getScoreTone(lesson.miniQuizAvgScore)}
                                  >
                                    Ұпай: {formatPercent(lesson.miniQuizAvgScore)}
                                  </StatusBadge>

                                  {lesson.failedAttempts > 0 ? (
                                    <StatusBadge tone="danger">
                                      Өтпеді: {lesson.failedAttempts}
                                    </StatusBadge>
                                  ) : null}

                                  {lesson.reviewLater ? (
                                    <StatusBadge tone="warning">
                                      Қайталау
                                    </StatusBadge>
                                  ) : null}
                                </div>
                              </InsightCard>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  ) : null}

                  {!snapshotLoading && !snapshotError && !selectedCourseSnapshot ? (
                    <div className="rounded-3xl border border-dashed border-border bg-muted/45 p-4 text-xs leading-5 text-muted-foreground">
                      Snapshot толық емес.
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