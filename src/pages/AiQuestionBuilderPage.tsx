import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import t from '@/lib/i18n';
import { savePendingAiQuestionImport } from '@/lib/ai-question-import';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  generateQuestions,
  type GenerateQuestionsResponse,
  type AiQuestionKind,
  type GeneratedQuestion,
} from '@/lib/ai-api';

import {
  AlertTriangle,
  Check,
  ClipboardList,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionKindOption = AiQuestionKind;

const difficultyOptions: Array<{
  value: Difficulty;
  label: string;
}> = [
  {
    value: 'easy',
    label: 'Оңай',
  },
  {
    value: 'medium',
    label: 'Орташа',
  },
  {
    value: 'hard',
    label: 'Қиын',
  },
];

const questionKindOptions: Array<{
  value: QuestionKindOption;
  label: string;
}> = [
  {
    value: 'mixed',
    label: 'Аралас',
  },
  {
    value: 'multiple_choice',
    label: 'Жауап нұсқалары',
  },
  {
    value: 'short_answer',
    label: 'Қысқа жауап',
  },
];

const questionCountOptions = [5, 10, 15, 20, 30, 40, 50];

function isImportCompatibleQuestion(question: GeneratedQuestion) {
  return (
    question.type === 'multiple_choice' &&
    Array.isArray(question.options) &&
    question.options.length >= 2 &&
    Boolean(question.correctAnswer?.trim())
  );
}

function getDifficultyLabel(value: Difficulty) {
  return difficultyOptions.find((item) => item.value === value)?.label || value;
}

function getKindLabel(value: QuestionKindOption) {
  return questionKindOptions.find((item) => item.value === value)?.label || value;
}

function normalizeDifficulty(value: string): Difficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard') {
    return value;
  }

  return 'medium';
}

function normalizeQuestionKind(value: string): QuestionKindOption {
  if (
    value === 'mixed' ||
    value === 'multiple_choice' ||
    value === 'short_answer'
  ) {
    return value;
  }

  return 'mixed';
}

function getQuestionTypeLabel(type: GeneratedQuestion['type']) {
  if (type === 'multiple_choice') return 'Жауап нұсқалары';

  return 'Қысқа жауап';
}

function OptionButton({
  active,
  label,
  value,
  onSelect,
}: {
  active: boolean;
  label: string;
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-2xl border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card hover:bg-accent'
      }`}
    >
      {label}
    </button>
  );
}

function AiQuestionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles size={16} className="animate-pulse text-primary" />
          Сұрақтар дайындалып жатыр...
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border p-4">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-3 h-4 w-4/5" />
            <SkeletonBlock className="mt-2 h-4 w-2/3" />
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-9 w-full rounded-lg" />
              <SkeletonBlock className="h-9 w-full rounded-lg" />
              <SkeletonBlock className="h-9 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QuestionPreviewCard({
  question,
  index,
}: {
  question: GeneratedQuestion;
  index: number;
}) {
  const isCompatible = isImportCompatibleQuestion(question);

  return (
    <div className="rounded-2xl border p-4 transition-colors hover:bg-accent/30">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Сұрақ {index + 1}</p>
          <p className="mt-1 text-sm font-medium leading-6">
            {question.question}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusBadge tone="info">{getQuestionTypeLabel(question.type)}</StatusBadge>
          <StatusBadge tone={isCompatible ? 'success' : 'muted'}>
            {isCompatible ? 'Тестке жарамды' : 'Тек қарау'}
          </StatusBadge>
        </div>
      </div>

      {question.options && question.options.length > 0 ? (
        <div className="space-y-2">
          {question.options.map((option, optionIndex) => (
            <div
              key={option.id || `${question.id}-${optionIndex}`}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                option.isCorrect
                  ? 'border-primary/40 bg-primary/5'
                  : 'bg-card'
              }`}
            >
              {option.isCorrect ? (
                <Check size={14} className="mt-0.5 shrink-0 text-primary" />
              ) : (
                <span className="mt-[2px] inline-block h-3.5 w-3.5 shrink-0 rounded-full border" />
              )}

              <span>{option.text}</span>
            </div>
          ))}
        </div>
      ) : question.correctAnswer ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Дұрыс жауап: </span>
          <span className="font-medium">{question.correctAnswer}</span>
        </div>
      ) : null}

      {question.explanation ? (
        <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Түсіндірме: </span>
          {question.explanation}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {question.topic ? (
          <span className="rounded-full border px-2 py-1">
            Тақырып: {question.topic}
          </span>
        ) : null}

        {question.difficulty ? (
          <span className="rounded-full border px-2 py-1">
            Деңгей: {question.difficulty}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function AiQuestionBuilderPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const accessToken = session?.access_token;

  const [sourceText, setSourceText] = useState('');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState(10);
  const [kind, setKind] = useState<QuestionKindOption>('mixed');

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateQuestionsResponse | null>(null);
  const [errorText, setErrorText] = useState('');

  const generatedCount = result?.questions.length || 0;

  const importableCount = useMemo(() => {
    if (!result) return 0;

    return result.questions.filter(isImportCompatibleQuestion).length;
  }, [result]);

  const skippedCount = useMemo(() => {
    if (!result) return 0;

    return Math.max(result.questions.length - importableCount, 0);
  }, [result, importableCount]);

  const hasGeneratedQuestions = !!result && generatedCount > 0;

  const canGenerate = useMemo(() => {
    const hasSource = sourceText.trim().length > 0;
    const hasTopic = topic.trim().length > 0;

    return !isGenerating && !!accessToken && (hasSource || hasTopic);
  }, [sourceText, topic, isGenerating, accessToken]);

  const canSendToTestBuilder = hasGeneratedQuestions && importableCount > 0;

  const clearError = () => {
    if (errorText) {
      setErrorText('');
    }
  };

  const handleGenerate = async () => {
    const trimmedSource = sourceText.trim();
    const trimmedTopic = topic.trim();
    const trimmedSubject = subject.trim();

    if (!trimmedSource && !trimmedTopic) {
      setErrorText('Мәтін немесе тақырып енгізу қажет.');
      return;
    }

    if (!accessToken) {
      const message = user
        ? 'AI генерация үшін белсенді сессия қажет.'
        : 'AI генерацияны пайдалану үшін жүйеге кіру қажет.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setErrorText('');
    setResult(null);

    try {
      const response = await generateQuestions(
        {
          sourceText: trimmedSource || undefined,
          topic: trimmedTopic || undefined,
          subject: trimmedSubject || undefined,
          difficulty,
          count,
          kind,
        },
        {
          accessToken,
        },
      );

      setResult(response);

      toast({
        title: 'Сұрақтар дайын',
        description: `${response.questions.length} сұрақ генерацияланды.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Сұрақ генерациялау сәтсіз аяқталды.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setSourceText('');
    setTopic('');
    setSubject('');
    setDifficulty('medium');
    setCount(10);
    setKind('mixed');
    setResult(null);
    setErrorText('');
  };

  const handleSendToTestBuilder = () => {
    if (!result || generatedCount === 0) return;

    const payload = savePendingAiQuestionImport({
      titleSuggestion: topic.trim() || subject.trim() || 'AI тест',
      topic: topic.trim() || undefined,
      subject: subject.trim() || undefined,
      questions: result.questions,
    });

    if (payload.questions.length === 0) {
      toast({
        title: 'Тестке жарамды сұрақ жоқ',
        description:
          'Тест редакторы тек жауап нұсқалары бар сұрақтарды қабылдайды.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Тест редакторына дайын',
      description:
        payload.skippedCount > 0
          ? `${payload.questions.length} сұрақ дайын, ${payload.skippedCount} сұрақ өтпеді.`
          : `${payload.questions.length} сұрақ дайындалды.`,
    });

    navigate('/create-test');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <Sparkles size={13} />
              AI сұрақ құрастыру
            </>
          }
          icon={<Sparkles size={20} />}
          title={t('nav.ai_question_builder')}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" asChild>
                <Link to="/create-test">
                  <ClipboardList size={14} className="mr-2" />
                  Тест редакторы
                </Link>
              </Button>

              <Button type="button" variant="outline" onClick={handleReset}>
                <RefreshCcw size={14} className="mr-2" />
                Тазалау
              </Button>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="border-b border-border/70 bg-card pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles size={16} />
                  Генерация
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-5 p-4 sm:p-5">
                <div className="space-y-1.5">
                  <Label htmlFor="sourceText">Мәтін</Label>
                  <Textarea
                    id="sourceText"
                    value={sourceText}
                    onChange={(event) => {
                      setSourceText(event.target.value);
                      clearError();
                    }}
                    placeholder="Теория, конспект немесе сабақ мәтінін енгізіңіз."
                    rows={11}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="topic">Тақырып</Label>
                    <Input
                      id="topic"
                      value={topic}
                      onChange={(event) => {
                        setTopic(event.target.value);
                        clearError();
                      }}
                      placeholder="Мысалы: Квадрат теңдеулер"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="subject">Пән</Label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(event) => {
                        setSubject(event.target.value);
                        clearError();
                      }}
                      placeholder="Мысалы: Математика"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Қиындық</Label>
                  <div className="flex flex-wrap gap-2">
                    {difficultyOptions.map((item) => (
                      <OptionButton
                        key={item.value}
                        active={difficulty === item.value}
                        label={item.label}
                        value={item.value}
                        onSelect={(value) => setDifficulty(normalizeDifficulty(value))}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Сұрақ түрі</Label>
                  <div className="flex flex-wrap gap-2">
                    {questionKindOptions.map((item) => (
                      <OptionButton
                        key={item.value}
                        active={kind === item.value}
                        label={item.label}
                        value={item.value}
                        onSelect={(value) => setKind(normalizeQuestionKind(value))}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Сұрақ саны</Label>
                  <div className="flex flex-wrap gap-2">
                    {questionCountOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCount(value)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          count === value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:bg-accent'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                {!accessToken ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>AI генерация үшін жүйеге кіру қажет.</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
                    <Sparkles size={16} className="mr-2" />
                    {isGenerating ? 'Генерация жүріп жатыр...' : 'Сұрақ генерациялау'}
                  </Button>

                  {hasGeneratedQuestions ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendToTestBuilder}
                      disabled={!canSendToTestBuilder}
                    >
                      <ClipboardList size={16} className="mr-2" />
                      Тест редакторына жіберу
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/70 bg-card pb-4">
                <CardTitle className="text-base font-semibold">
                  Таңдалған параметрлер
                </CardTitle>
              </CardHeader>

              <CardContent className="grid gap-2 p-4 text-sm sm:grid-cols-2 sm:p-5">
                <div className="rounded-2xl border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Қиындық</p>
                  <p className="mt-1 font-medium">{getDifficultyLabel(difficulty)}</p>
                </div>

                <div className="rounded-2xl border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Түрі</p>
                  <p className="mt-1 font-medium">{getKindLabel(kind)}</p>
                </div>

                <div className="rounded-2xl border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Сұрақ саны</p>
                  <p className="mt-1 font-medium">{count}</p>
                </div>

                <div className="rounded-2xl border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Мәтін ұзындығы</p>
                  <p className="mt-1 font-medium">
                    {sourceText.trim().length || '—'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {errorText ? <ErrorState text={errorText} /> : null}

            {!isGenerating && !errorText && !result ? (
              <EmptyState
                title="Нәтиже жоқ"
                text="Мәтін немесе тақырып енгізіп, сұрақ генерациялаңыз."
              />
            ) : null}

            {isGenerating ? <AiQuestionSkeleton /> : null}

            {!isGenerating && !errorText && result && generatedCount === 0 ? (
              <EmptyState
                title="Сұрақ табылмады"
                text="Мәтінді нақтылап немесе сұрақ санын өзгертіп көріңіз."
              />
            ) : null}

            {!isGenerating && hasGeneratedQuestions ? (
              <>
                <Card>
                  <CardHeader className="border-b border-border/70 bg-card pb-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base font-semibold">
                        Нәтиже
                      </CardTitle>

                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone="info">{generatedCount} сұрақ</StatusBadge>
                        <StatusBadge tone="success">
                          {importableCount} жарамды
                        </StatusBadge>

                        {skippedCount > 0 ? (
                          <StatusBadge tone="warning">
                            {skippedCount} өтпейді
                          </StatusBadge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>

                  {kind !== 'multiple_choice' && skippedCount > 0 ? (
                    <CardContent className="border-b border-border/70 p-4 sm:p-5">
                      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <span>
                          Тест редакторы тек жауап нұсқалары бар сұрақтарды қабылдайды.
                        </span>
                      </div>
                    </CardContent>
                  ) : null}

                  <CardContent className="space-y-4 p-4 sm:p-5">
                    {result?.questions.map((question, index) => (
                      <QuestionPreviewCard
                        key={question.id || `${index}-${question.question}`}
                        question={question}
                        index={index}
                      />
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}