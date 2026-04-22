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
  createTutorSession,
  sendTutorMessage,
  type TutorMessage,
  type TutorSession,
} from '@/lib/ai-api';
import {
  Bot,
  BookOpen,
  MessageSquare,
  RefreshCcw,
  Send,
  CheckCircle2,
} from 'lucide-react';

export default function AiTutorPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();

  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [messageInput, setMessageInput] = useState('');

  const [tutorSession, setTutorSession] = useState<TutorSession | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);

  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState('');

  const accessToken = session?.access_token;
  const isBusy = isCreatingSession || isSending;

  const canSendMessage = useMemo(
    () => !!accessToken && !!user && !isBusy && messageInput.trim().length > 0,
    [accessToken, user, isBusy, messageInput]
  );

  const hasMessages = messages.length > 0;

  const clearError = () => {
    if (errorText) {
      setErrorText('');
    }
  };

  const handleReset = () => {
    setSubject('');
    setTopic('');
    setContext('');
    setMessageInput('');
    setTutorSession(null);
    setMessages([]);
    setErrorText('');
  };

  const buildTutorContext = () => {
    const trimmedSubject = subject.trim();
    const trimmedTopic = topic.trim();
    const trimmedContext = context.trim();

    return {
      subject: trimmedSubject || undefined,
      topic: trimmedTopic || undefined,
      passage: trimmedContext || undefined,
    };
  };

  const ensureSession = async (): Promise<TutorSession> => {
    if (tutorSession) {
      return tutorSession;
    }

    if (!accessToken) {
      throw new Error('AI Tutor пайдалану үшін белсенді сессия қажет.');
    }

    setIsCreatingSession(true);

    try {
      const response = await createTutorSession(
        {
          subject: subject.trim() || undefined,
          topic: topic.trim() || undefined,
          initialContext: context.trim() || undefined,
        },
        {
          accessToken,
        }
      );

      setTutorSession(response.session);

      if (response.messages?.length) {
        setMessages(response.messages);
      }

      return response.session;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Tutor session ашу мүмкін болмады.';
      setErrorText(message);
      throw new Error(message);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleSendMessage = async () => {
    const trimmedMessage = messageInput.trim();

    if (!trimmedMessage) {
      setErrorText('Алдымен хабар немесе сұрақ жазыңыз.');
      return;
    }

    if (!accessToken) {
      const message = 'AI Tutor пайдалану үшін жүйеге кіріп, белсенді сессиямен жұмыс істеу керек.';
      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setErrorText('');
    setIsSending(true);

    const optimisticUserMessage: TutorMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: trimmedMessage,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMessage]);
    setMessageInput('');

    try {
      const activeSession = await ensureSession();

      const response = await sendTutorMessage(
        {
          sessionId: activeSession.id,
          message: trimmedMessage,
          subject: subject.trim() || undefined,
          topic: topic.trim() || undefined,
          context: buildTutorContext(),
        },
        {
          accessToken,
        }
      );

      setTutorSession((prev) => prev ?? activeSession);

      if (response.messages?.length) {
        setMessages(response.messages);
      } else {
        setMessages((prev) => [
          ...prev.filter((item) => item.id !== optimisticUserMessage.id),
          optimisticUserMessage,
          response.reply,
        ]);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Tutor-ға хабар жіберу мүмкін болмады.';

      setMessages((prev) =>
        prev.filter((item) => item.id !== optimisticUserMessage.id)
      );
      setMessageInput(trimmedMessage);
      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('nav.ai_tutor')}</h2>
            <p className="text-sm text-muted-foreground">
              Тақырып пен контекст негізінде AI tutor-мен сөйлесу бөлімі.
            </p>
          </div>

          <div className="flex gap-2">
            <Link to="/lessons">
              <Button variant="outline" size="sm">
                <BookOpen size={14} className="mr-2" />
                Сабақтарға қайту
              </Button>
            </Link>

            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCcw size={14} className="mr-2" />
              Жаңа session
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Tutor параметрлері</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Label htmlFor="context">Қосымша контекст</Label>
                <Textarea
                  id="context"
                  value={context}
                  onChange={(e) => {
                    setContext(e.target.value);
                    clearError();
                  }}
                  placeholder="Қай жерде қиналып тұрғаныңызды немесе қай бөлікті түсіндіру керек екенін жазыңыз..."
                  rows={5}
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="min-h-[420px]">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Tutor chat</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isCreatingSession ? (
                  <LoadingState text="Tutor session ашылып жатыр..." />
                ) : null}

                {errorText ? <ErrorState text={errorText} /> : null}

                {!accessToken && !isCreatingSession ? (
                  <EmptyState
                    title="Авторизация қажет"
                    text="AI Tutor пайдалану үшін алдымен жүйеге кіріңіз."
                  />
                ) : null}

                {accessToken && !isCreatingSession && !hasMessages ? (
                  <EmptyState
                    title="Сұхбат әлі басталмады"
                    text="Төмендегі өріске сұрағыңызды жазыңыз. Бірінші хабар жіберілгенде tutor session автоматты түрде ашылады."
                  />
                ) : null}

                {hasMessages ? (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const isAssistant = message.role === 'assistant';

                      return (
                        <div
                          key={message.id}
                          className={`rounded-lg border p-4 text-sm ${
                            isAssistant ? 'border-primary/20 bg-primary/5' : ''
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            {isAssistant ? (
                              <Bot size={15} className="text-primary" />
                            ) : (
                              <MessageSquare size={15} className="text-muted-foreground" />
                            )}
                            <span className="text-xs font-medium">
                              {isAssistant ? 'AI Tutor' : 'Сіз'}
                            </span>
                          </div>

                          <p className="whitespace-pre-wrap leading-7 text-muted-foreground">
                            {message.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Хабар жіберу</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={messageInput}
                  onChange={(e) => {
                    setMessageInput(e.target.value);
                    clearError();
                  }}
                  placeholder="Сұрағыңызды жазыңыз. Мысалы: осы тақырыпты қарапайым тілмен түсіндіріп бер."
                  rows={5}
                />

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {tutorSession ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-primary" />
                        Session белсенді
                      </span>
                    ) : (
                      <span>
                        {accessToken
                          ? 'Session бірінші хабармен ашылады'
                          : 'Session ашу үшін авторизация қажет'}
                      </span>
                    )}
                  </div>

                  <Button onClick={handleSendMessage} disabled={!canSendMessage}>
                    <Send size={14} className="mr-2" />
                    {isBusy ? 'Жіберілуде...' : 'Жіберу'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}