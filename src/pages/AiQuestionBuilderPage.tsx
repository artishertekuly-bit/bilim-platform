import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';

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
  Sparkles,
  ClipboardList,
  RefreshCcw,
  Check,
} from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard';
type QuestionKindOption = AiQuestionKind;

function isImportCompatibleQuestion(question: GeneratedQuestion) {
  return (
    question.type === 'multiple_choice' &&
    Array.isArray(question.options) &&
    question.options.length >= 2 &&
    Boolean(question.correctAnswer?.trim())
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('nav.ai_question_builder')}</h2>
            <p className="text-sm text-muted-foreground">
              AI арқылы сұрақ генерациялап, жарамды сұрақтарды тест редакторына импорттау бөлімі.
            </p>
          </div>

          <div className="flex gap-2">
            <Link to="/create-test">
              <Button variant="outline" size="sm">
                <ClipboardList size={14} className="mr-2" />
                Тест редакторына өту
              </Button>
            </Link>

            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCcw size={14} className="mr-2" />
              Тазалау
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Генерация параметрлері
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sourceText">Мәтін немесе мазмұн</Label>
              <Textarea
                id="sourceText"
                value={sourceText}
                onChange={(e) => {
                  setSourceText(e.target.value);
                  clearError();
                }}
                placeholder="Тақырып мәтінін, қысқаша конспектіні немесе теориялық мазмұнды енгізіңіз..."
                rows={10}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="topic">Тақырып</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
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
                  onChange={(e) => {
                    setSubject(e.target.value);
                    clearError();
                  }}
                  placeholder="Мысалы: Математика"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="difficulty">Қиындық деңгейі</Label>
                <select
                  id="difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="easy">Оңай</option>
                  <option value="medium">Орташа</option>
                  <option value="hard">Қиын</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="count">Сұрақ саны</Label>
                <select
                  id="count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {[5, 10, 15, 20, 30, 40, 50].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="kind">Сұрақ түрі</Label>
                <select
                  id="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as QuestionKindOption)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="mixed">Аралас</option>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="short_answer">Қысқа жауап</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleGenerate} disabled={!canGenerate}>
                <Sparkles size={16} className="mr-2" />
                {isGenerating ? 'Генерация жүріп жатыр...' : 'Сұрақ генерациялау'}
              </Button>

              {hasGeneratedQuestions ? (
                <Button variant="outline" onClick={handleImportToTestBuilder} disabled={!canImport}>
                  <ClipboardList size={16} className="mr-2" />
                  Тест редакторына импорттау
                </Button>
              ) : null}
            </div>

            {!accessToken ? (
              <p className="text-xs text-muted-foreground">
                AI сұрақ генерациялау үшін белсенді авторизация сессиясы қажет.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {isGenerating ? (
          <LoadingState text="AI сұрақтарды дайындап жатыр..." />
        ) : null}

        {errorText ? <ErrorState text={errorText} /> : null}

        {!isGenerating && !errorText && result && generatedCount === 0 ? (
          <EmptyState
            title="Сұрақтар табылмады"
            text="AI жауап қайтарды, бірақ ішінде қолдануға болатын сұрақтар жоқ. Мәтінді нақтылап көріңіз."
          />
        ) : null}

        {!isGenerating && hasGeneratedQuestions ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Генерация нәтижесі
                </CardTitle>
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
                  <p className="mt-1 text-sm font-medium">{topic || '—'}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Пән</p>
                  <p className="mt-1 text-sm font-medium">{subject || '—'}</p>
                </div>
              </CardContent>
            </Card>

            {kind === 'multiple_choice' && skippedCount > 0 ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Генерация multiple choice режимінде жасалды, бірақ барлық сұрақ test builder-ге
                  бірдей жарамауы мүмкін. Импортқа кірмеген сұрақтар preview ішінде қалып қояды.
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Generated questions preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result?.questions.map((question, index) => {
                  const isImportCompatible = isImportCompatibleQuestion(question);

                  return (
                    <div key={question.id} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Сұрақ {index + 1}
                          </p>
                          <p className="mt-1 text-sm font-medium leading-6">
                            {question.question}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground">
                            {question.type === 'multiple_choice'
                              ? 'Multiple choice'
                              : 'Қысқа жауап'}
                          </span>

                          <span
                            className={`rounded-full border px-2 py-1 text-[11px] ${
                              isImportCompatible
                                ? 'border-primary/40 bg-primary/5 text-foreground'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {isImportCompatible ? 'Import ready' : 'Preview only'}
                          </span>
                        </div>
                      </div>

                      {question.options && question.options.length > 0 ? (
                        <div className="space-y-2">
                          {question.options.map((option) => (
                            <div
                              key={option.id}
                              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                                option.isCorrect
                                  ? 'border-primary/40 bg-primary/5'
                                  : ''
                              }`}
                            >
                              {option.isCorrect ? (
                                <Check
                                  size={14}
                                  className="mt-0.5 shrink-0 text-primary"
                                />
                              ) : (
                                <span className="mt-[2px] inline-block h-3.5 w-3.5 shrink-0 rounded-full border" />
                              )}
                              <span>{option.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : question.correctAnswer ? (
                        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                          <span className="text-muted-foreground">Дұрыс жауап: </span>
                          <span className="font-medium">{question.correctAnswer}</span>
                        </div>
                      ) : null}

                      {question.explanation ? (
                        <div className="mt-3 rounded-md border px-3 py-2 text-sm text-muted-foreground">
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
                })}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}