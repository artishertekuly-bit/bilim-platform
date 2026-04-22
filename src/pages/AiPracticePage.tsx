import { useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import t from '@/lib/i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  generateQuestions,
  evaluateAnswer,
  type GenerateQuestionsResponse,
  type EvaluateAnswerResponse,
  type AiQuestionKind,
  type GeneratedQuestion,
} from '@/lib/ai-api';
import {
  Sparkles,
  BrainCircuit,
  FileCheck2,
  RefreshCcw,
  CheckCircle2,
} from 'lucide-react';

type Difficulty = 'easy' | 'medium' | 'hard';

type AnswerMap = Record<string, string>;
type FeedbackMap = Record<string, EvaluateAnswerResponse>;

export default function AiPracticePage() {
  const { user, session } = useAuth();
  const { toast } = useToast();

  const accessToken = session?.access_token;

  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [count, setCount] = useState(5);
  const [kind, setKind] = useState<AiQuestionKind>('mixed');

  const [result, setResult] = useState<GenerateQuestionsResponse | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [feedback, setFeedback] = useState<FeedbackMap>({});

  const [isGenerating, setIsGenerating] = useState(false);
  const [evaluatingQuestionId, setEvaluatingQuestionId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');

  const generatedCount = result?.questions.length || 0;
  const isAuthMissing = !accessToken;

  const canGenerate = useMemo(() => {
    const hasTopic = topic.trim().length > 0;
    const hasSource = sourceText.trim().length > 0;
    return !isGenerating && !isAuthMissing && (hasTopic || hasSource);
  }, [topic, sourceText, isGenerating, isAuthMissing]);

  const answeredCount = useMemo(() => {
    if (!result) return 0;
    return result.questions.filter((question) => {
      const value = answers[question.id];
      return typeof value === 'string' && value.trim().length > 0;
    }).length;
  }, [answers, result]);

  const evaluatedCount = useMemo(() => Object.keys(feedback).length, [feedback]);

  const resetPracticeState = () => {
    setResult(null);
    setAnswers({});
    setFeedback({});
    setEvaluatingQuestionId(null);
    setErrorText('');
  };

  const handleGenerate = async () => {
    const topicText = topic.trim();
    const source = sourceText.trim();

    if (!topicText && !source) {
      setErrorText('Кемінде тақырып немесе қысқаша мазмұн енгізіңіз.');
      return;
    }

    if (!accessToken) {
      const message = user
        ? 'AI practice пайдалану үшін белсенді сессия access token қажет.'
        : 'AI practice пайдалану үшін авторизация қажет.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    resetPracticeState();

    try {
      const response = await generateQuestions(
        {
          sourceText: source || topicText,
          topic: topicText || undefined,
          subject: subject.trim() || undefined,
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
        title: 'Практика дайын',
        description: `${response.questions.length} сұрақ генерацияланды.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Практика сұрақтарын генерациялау мүмкін болмады.';

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
    setSubject('');
    setTopic('');
    setSourceText('');
    setDifficulty('medium');
    setCount(5);
    setKind('mixed');
    resetPracticeState();
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    if (errorText) {
      setErrorText('');
    }

    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));

    setFeedback((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleEvaluateQuestion = async (question: GeneratedQuestion) => {
    const studentAnswer = answers[question.id]?.trim();

    if (!studentAnswer) {
      toast({
        title: 'Жауап жоқ',
        description: 'Алдымен осы сұраққа жауап беріңіз.',
        variant: 'destructive',
      });
      return;
    }

    if (!accessToken) {
      const message = user
        ? 'Жауапты тексеру үшін белсенді сессия access token қажет.'
        : 'Жауапты тексеру үшін авторизация қажет.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setEvaluatingQuestionId(question.id);
    setErrorText('');

    try {
      const response = await evaluateAnswer(
        {
          questionId: question.id,
          question: question.question,
          expectedAnswer: question.correctAnswer,
          referenceAnswer: question.explanation,
          studentAnswer,
          context: sourceText.trim() || topic.trim() || subject.trim() || undefined,
          options: question.options?.map((option) => option.text) ?? [],
          answerFormat: question.type === 'multiple_choice' ? 'mcq' : 'text',
        },
        {
          accessToken,
        }
      );

      setFeedback((prev) => ({
        ...prev,
        [question.id]: response,
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Жауапты тексеру мүмкін болмады.';

      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setEvaluatingQuestionId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('nav.ai_practice')}</h2>
            <p className="text-sm text-muted-foreground">
              AI көмегімен қосымша practice сұрақтарын генерациялау және жауапты тексеру бөлімі.
            </p>
          </div>

          <div className="flex gap-2">
            <Link to="/tests">
              <Button variant="outline" size="sm">
                <FileCheck2 size={14} className="mr-2" />
                Қазіргі тесттерге өту
              </Button>
            </Link>

            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCcw size={14} className="mr-2" />
              Тазалау
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Practice параметрлері</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Пән</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      if (errorText) setErrorText('');
                    }}
                    placeholder="Мысалы: Математика"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="topic">Тақырып</Label>
                  <Input
                    id="topic"
                    value={topic}
                    onChange={(e) => {
                      setTopic(e.target.value);
                      if (errorText) setErrorText('');
                    }}
                    placeholder="Мысалы: Квадрат теңдеулер"
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
                    {[3, 5, 7, 10].map((value) => (
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
                    onChange={(e) => setKind(e.target.value as AiQuestionKind)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="mixed">Аралас</option>
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="short_answer">Қысқа жауап</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sourceText">Қосымша мазмұн немесе контекст</Label>
                <Textarea
                  id="sourceText"
                  value={sourceText}
                  onChange={(e) => {
                    setSourceText(e.target.value);
                    if (errorText) setErrorText('');
                  }}
                  placeholder="Қаласаңыз, қысқаша теория немесе контекст жазыңыз..."
                  rows={6}
                />
              </div>

              <Button onClick={handleGenerate} disabled={!canGenerate}>
                <Sparkles size={16} className="mr-2" />
                {isGenerating ? 'Практика дайындалып жатыр...' : 'Практика генерациялау'}
              </Button>

              {isAuthMissing ? (
                <p className="text-xs text-muted-foreground">
                  AI practice пайдалану үшін белсенді авторизация сессиясы қажет.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Прогресс</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Генерацияланған</p>
                <p className="mt-1 text-lg font-semibold">{generatedCount}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Жауап берілді</p>
                <p className="mt-1 text-lg font-semibold">{answeredCount}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Тексерілді</p>
                <p className="mt-1 text-lg font-semibold">{evaluatedCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isGenerating ? <LoadingState text="Practice сұрақтары дайындалып жатыр..." /> : null}
        {errorText ? <ErrorState text={errorText} /> : null}

        {!isGenerating && !errorText && result && result.questions.length === 0 ? (
          <EmptyState
            title="Сұрақтар табылмады"
            text="AI жауап қайтарды, бірақ қолдануға болатын сұрақтар жоқ. Тақырыпты нақтылап көріңіз."
          />
        ) : null}

        {!isGenerating && result && result.questions.length > 0 ? (
          <div className="space-y-4">
            {result.questions.map((question, index) => {
              const currentAnswer = answers[question.id] || '';
              const currentFeedback = feedback[question.id];
              const isEvaluating = evaluatingQuestionId === question.id;

              return (
                <Card key={question.id}>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">
                      Сұрақ {index + 1}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-7">{question.question}</p>

                    {question.type === 'multiple_choice' && question.options?.length ? (
                      <div className="space-y-2">
                        {question.options.map((option) => {
                          const checked = currentAnswer === option.text;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleAnswerChange(question.id, option.text)}
                              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                                checked ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                              }`}
                            >
                              <span
                                className={`mt-0.5 inline-block h-4 w-4 rounded-full border ${
                                  checked ? 'border-primary bg-primary' : ''
                                }`}
                              />
                              <span>{option.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Textarea
                        value={currentAnswer}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        placeholder="Жауабыңызды жазыңыз..."
                        rows={4}
                      />
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => handleEvaluateQuestion(question)}
                        disabled={isEvaluating || isAuthMissing}
                      >
                        <BrainCircuit size={16} className="mr-2" />
                        {isEvaluating ? 'Тексерілуде...' : 'Жауапты тексеру'}
                      </Button>
                    </div>

                    {currentFeedback ? (
                      <div className="rounded-lg border p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <CheckCircle2 size={15} className="text-primary" />
                          <span className="text-sm font-medium">
                            Нәтиже: {currentFeedback.score}
                            {currentFeedback.maxScore !== undefined
                              ? ` / ${currentFeedback.maxScore}`
                              : ''}
                          </span>
                        </div>

                        <p className="text-sm leading-7 text-muted-foreground">
                          {currentFeedback.feedback}
                        </p>

                        {currentFeedback.explanation ? (
                          <div className="mt-3 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Түсіндірме: </span>
                            {currentFeedback.explanation}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}