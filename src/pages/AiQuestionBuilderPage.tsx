import { useMemo, useState, type ReactNode } from 'react';
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
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  HelpCircle,
  ListChecks,
  RefreshCcw,
  Sparkles,
  Target,
} from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionKindOption = AiQuestionKind;

const difficultyOptions: Array<{
  value: Difficulty;
  label: string;
  description: string;
}> = [
  {
    value: 'easy',
    label: 'Оңай',
    description: 'Негізгі ұғымдарды тексеру.',
  },
  {
    value: 'medium',
    label: 'Орташа',
    description: 'Түсіну және қолдану деңгейі.',
  },
  {
    value: 'hard',
    label: 'Қиын',
    description: 'Талдау, салыстыру, ой қорыту.',
  },
];

const questionKindOptions: Array<{
  value: QuestionKindOption;
  label: string;
  description: string;
}> = [
  {
    value: 'mixed',
    label: 'Аралас',
    description: 'Multiple choice және қысқа жауап араласуы мүмкін.',
  },
  {
    value: 'multiple_choice',
    label: 'Multiple choice',
    description: 'Test Builder-ге импорттауға ең қолайлы формат.',
  },
  {
    value: 'short_answer',
    label: 'Қысқа жауап',
    description: 'Preview үшін жақсы, бірақ тестке импортталмауы мүмкін.',
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

function getQuestionTypeLabel(type: GeneratedQuestion['type']) {
  if (type === 'multiple_choice') return 'Multiple choice';
  return 'Қысқа жауап';
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionCard<T extends string>({
  active,
  label,
  description,
  value,
  onSelect,
}: {
  active: boolean;
  label: string;
  description: string;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-xl border p-3 text-left transition-all ${
        active
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:bg-accent'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>

        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
          }`}
        >
          {active ? (
            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
          ) : null}
        </span>
      </div>
    </button>
  );
}

function AiQuestionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles size={16} className="animate-pulse text-primary" />
          AI сұрақтарды дайындап жатыр...
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SkeletonBlock className="h-16 rounded-xl" />
          <SkeletonBlock className="h-16 rounded-xl" />
          <SkeletonBlock className="h-16 rounded-xl" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border p-4">
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
        </div>
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
  const isImportCompatible = isImportCompatibleQuestion(question);

  return (
    <div className="rounded-xl border p-4 transition-colors hover:bg-accent/30">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Сұрақ {index + 1}</p>
          <p className="mt-1 text-sm font-medium leading-6">
            {question.question}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusBadge tone="info">{getQuestionTypeLabel(question.type)}</StatusBadge>
          <StatusBadge tone={isImportCompatible ? 'success' : 'muted'}>
            {isImportCompatible ? 'Import ready' : 'Preview only'}
          </StatusBadge>
        </div>
      </div>

      {question.options && question.options.length > 0 ? (
        <div className="space-y-2">
          {question.options.map((option, optionIndex) => (
            <div
              key={option.id || `${question.id}-${optionIndex}`}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                option.isCorrect ? 'border-primary/40 bg-primary/5' : 'bg-card'
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
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Дұрыс жауап: </span>
          <span className="font-medium">{question.correctAnswer}</span>
        </div>
      ) : null}

      {question.explanation ? (
        <div className="mt-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
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
            Қиындық: {question.difficulty}
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

  const generatedCount = useMemo(() => result?.questions.length || 0, [result]);

  const importableCount = useMemo(() => {
    if (!result) return 0;
    return result.questions.filter(isImportCompatibleQuestion).length;
  }, [result]);

  const skippedCount = useMemo(() => {
    if (!result) return 0;
    return Math.max(result.questions.length - importableCount, 0);
  }, [result, importableCount]);

  const hasGeneratedQuestions = !!result && generatedCount > 0;
  const sourceTextLength = sourceText.trim().length;

  const canGenerate = useMemo(() => {
    const hasSource = sourceText.trim().length > 0;
    const hasTopic = topic.trim().length > 0;
    return !isGenerating && !!accessToken && (hasSource || hasTopic);
  }, [sourceText, topic, isGenerating, accessToken]);

  const canImport = hasGeneratedQuestions && importableCount > 0;

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
        ? 'AI генерация үшін белсенді сессия access token қажет.'
        : 'AI генерацияны пайдалану үшін авторизация қажет.';

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
        }
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

  const handleImportToTestBuilder = () => {
    if (!result || generatedCount === 0) return;

    const payload = savePendingAiQuestionImport({
      titleSuggestion: topic.trim() || subject.trim() || 'AI generated test',
      topic: topic.trim() || undefined,
      subject: subject.trim() || undefined,
      questions: result.questions,
    });

    if (payload.questions.length === 0) {
      toast({
        title: 'Импортқа жарамды сұрақ жоқ',
        description:
          'Генерация жасалды, бірақ current test builder-ге үйлесімді multiple choice сұрақтар табылмады.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Импортқа дайын',
      description:
        payload.skippedCount > 0
          ? `${payload.questions.length} сұрақ дайын, ${payload.skippedCount} сұрақ import-қа кірмеді.`
          : `${payload.questions.length} сұрақ тест редакторына дайындалды.`,
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
              AI question builder
            </>
          }
          icon={<Sparkles size={20} />}
          title={t('nav.ai_question_builder')}
          description="AI арқылы сұрақ генерациялап, жарамды multiple choice сұрақтарды тест редакторына импорттаңыз."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" asChild>
                <Link to="/create-test">
                  <ClipboardList size={14} className="mr-2" />
                  Тест редакторына өту
                </Link>
              </Button>

              <Button type="button" variant="outline" onClick={handleReset}>
                <RefreshCcw size={14} className="mr-2" />
                Тазалау
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Мәтін ұзындығы"
            value={sourceTextLength > 0 ? sourceTextLength : '—'}
            icon={<FileText size={17} />}
          />
          <StatCard
            label="Сұрақ саны"
            value={count}
            icon={<ListChecks size={17} />}
          />
          <StatCard
            label="Қиындық"
            value={getDifficultyLabel(difficulty)}
            icon={<Target size={17} />}
          />
          <StatCard
            label="Формат"
            value={getKindLabel(kind)}
            icon={<HelpCircle size={17} />}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles size={16} />
                  Генерация параметрлері
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="sourceText">Мәтін немесе мазмұн</Label>
                  <Textarea
                    id="sourceText"
                    value={sourceText}
                    onChange={(event) => {
                      setSourceText(event.target.value);
                      clearError();
                    }}
                    placeholder="Тақырып мәтінін, қысқаша конспектіні немесе теориялық мазмұнды енгізіңіз..."
                    rows={11}
                  />
                  <p className="text-xs text-muted-foreground">
                    Толық мәтін енгізсеңіз, сұрақ сапасы жоғары болады. Тек тақырыппен де генерация жасауға болады.
                  </p>
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
                  <Label>Қиындық деңгейі</Label>
                  <div className="grid gap-3 md:grid-cols-3">
                    {difficultyOptions.map((item) => (
                      <OptionCard
                        key={item.value}
                        active={difficulty === item.value}
                        label={item.label}
                        description={item.description}
                        value={item.value}
                        onSelect={setDifficulty}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Сұрақ түрі</Label>
                  <div className="grid gap-3 md:grid-cols-3">
                    {questionKindOptions.map((item) => (
                      <OptionCard
                        key={item.value}
                        active={kind === item.value}
                        label={item.label}
                        description={item.description}
                        value={item.value}
                        onSelect={setKind}
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
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
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
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>
                      AI сұрақ генерациялау үшін белсенді авторизация сессиясы қажет.
                    </span>
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
                      onClick={handleImportToTestBuilder}
                      disabled={!canImport}
                    >
                      <ClipboardList size={16} className="mr-2" />
                      Тест редакторына импорттау
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {errorText ? <ErrorState text={errorText} /> : null}

            {!isGenerating && !errorText && !result ? (
              <EmptyState
                title="Генерация нәтижесі әзірге жоқ"
                text="Мәтін немесе тақырып енгізіп, сұрақ генерациялаңыз. Нәтиже осы жерде preview ретінде ашылады."
              />
            ) : null}

            {isGenerating ? <AiQuestionSkeleton /> : null}

            {!isGenerating && !errorText && result && generatedCount === 0 ? (
              <EmptyState
                title="Сұрақтар табылмады"
                text="AI жауап қайтарды, бірақ ішінде қолдануға болатын сұрақтар жоқ. Мәтінді нақтылап көріңіз."
              />
            ) : null}

            {!isGenerating && hasGeneratedQuestions ? (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <CheckCircle2 size={16} />
                        Генерация нәтижесі
                      </CardTitle>

                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone="info">{generatedCount} сұрақ</StatusBadge>
                        <StatusBadge tone="success">{importableCount} import ready</StatusBadge>
                        {skippedCount > 0 ? (
                          <StatusBadge tone="warning">{skippedCount} preview only</StatusBadge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Сұрақ саны</p>
                      <p className="mt-1 text-lg font-semibold">{generatedCount}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Импортқа жарамды</p>
                      <p className="mt-1 text-lg font-semibold">{importableCount}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Импортқа кірмейді</p>
                      <p className="mt-1 text-lg font-semibold">{skippedCount}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Тақырып</p>
                      <p className="mt-1 line-clamp-2 text-sm font-medium">{topic || '—'}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Пән</p>
                      <p className="mt-1 line-clamp-2 text-sm font-medium">{subject || '—'}</p>
                    </div>
                  </CardContent>
                </Card>

                {kind !== 'multiple_choice' && skippedCount > 0 ? (
                  <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="flex items-start gap-2 pt-6 text-sm text-amber-700 dark:text-amber-300">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>
                        Test Builder тек multiple choice сұрақтарды импорттайды. Short answer немесе толық емес сұрақтар preview ретінде ғана қалады.
                      </span>
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">
                      Generated questions preview
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
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
