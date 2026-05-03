import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Send,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  createTutorSession,
  sendTutorMessage,
  type TutorMessage,
  type TutorSession,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';

const MAX_SUBJECT_CHARS = 120;
const MAX_TOPIC_CHARS = 200;
const MAX_CONTEXT_CHARS = 4000;
const MAX_MESSAGE_CHARS = 4000;
const MAX_VISIBLE_MESSAGES = 80;
const REQUEST_TIMEOUT_MS = 120_000;

type TutorContextPayload = {
  subject?: string;
  topic?: string;
  passage?: string;
};

function cleanText(value: string, limit: number) {
  return value.replace(/\x00/g, ' ').trim().slice(0, limit);
}

function createLocalMessage(role: 'user' | 'assistant', content: string): TutorMessage {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function normalizeTutorMessage(message: TutorMessage, fallbackIndex: number): TutorMessage | null {
  const content = cleanText(String(message.content || ''), 12_000);
  if (!content) return null;

  return {
    id: String(message.id || `message-${fallbackIndex + 1}`),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content,
    createdAt: message.createdAt,
  };
}

function normalizeTutorMessages(messages: TutorMessage[]) {
  return messages
    .map((message, index) => normalizeTutorMessage(message, index))
    .filter((message): message is TutorMessage => Boolean(message))
    .slice(-MAX_VISIBLE_MESSAGES);
}

function createTimeoutSignal(externalSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const abortFromExternal = () => controller.abort();
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    externalSignal.removeEventListener('abort', abortFromExternal);
  };

  controller.signal.addEventListener('abort', cleanup, { once: true });

  if (externalSignal.aborted) {
    controller.abort();
  } else {
    externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  return controller.signal;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'AI Tutor сұранысы тоқтатылды немесе уақытынан асып кетті.';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

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

  const requestCounterRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const accessToken = session?.access_token?.trim();
  const isStudent = user?.role === 'student';
  const isBusy = isCreatingSession || isSending;
  const hasMessages = messages.length > 0;
  const isAuthMissing = !accessToken;

  const normalizedSubject = useMemo(
    () => cleanText(subject, MAX_SUBJECT_CHARS),
    [subject]
  );
  const normalizedTopic = useMemo(() => cleanText(topic, MAX_TOPIC_CHARS), [topic]);
  const normalizedContext = useMemo(
    () => cleanText(context, MAX_CONTEXT_CHARS),
    [context]
  );
  const normalizedMessage = useMemo(
    () => cleanText(messageInput, MAX_MESSAGE_CHARS),
    [messageInput]
  );

  const canSendMessage = Boolean(
    accessToken && user && isStudent && !isBusy && normalizedMessage.length > 0
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isCreatingSession, isSending, errorText]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      activeRequestIdRef.current = null;
    };
  }, []);

  const clearError = useCallback(() => {
    if (errorText) {
      setErrorText('');
    }
  }, [errorText]);

  const resetActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRequestIdRef.current = null;
    setIsCreatingSession(false);
    setIsSending(false);
  }, []);

  const handleReset = useCallback(() => {
    resetActiveRequest();
    setSubject('');
    setTopic('');
    setContext('');
    setMessageInput('');
    setTutorSession(null);
    setMessages([]);
    setErrorText('');
  }, [resetActiveRequest]);

  const buildTutorContext = useCallback((): TutorContextPayload => {
    return {
      subject: normalizedSubject || undefined,
      topic: normalizedTopic || undefined,
      passage: normalizedContext || undefined,
    };
  }, [normalizedContext, normalizedSubject, normalizedTopic]);

  const startRequest = useCallback(() => {
    abortControllerRef.current?.abort();

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;
    activeRequestIdRef.current = requestId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    return {
      requestId,
      controller,
      signal: createTimeoutSignal(controller.signal, REQUEST_TIMEOUT_MS),
    };
  }, []);

  const ensureSession = useCallback(
    async ({
      accessTokenValue,
      signal,
      requestId,
    }: {
      accessTokenValue: string;
      signal: AbortSignal;
      requestId: number;
    }): Promise<TutorSession> => {
      if (tutorSession) {
        return tutorSession;
      }

      setIsCreatingSession(true);

      try {
        const response = await createTutorSession(
          {
            subject: normalizedSubject || undefined,
            topic: normalizedTopic || undefined,
            initialContext: normalizedContext || undefined,
          },
          {
            accessToken: accessTokenValue,
            signal,
            timeoutMs: REQUEST_TIMEOUT_MS,
          }
        );

        if (activeRequestIdRef.current !== requestId) {
          throw new DOMException('Stale tutor session request', 'AbortError');
        }

        setTutorSession(response.session);

        if (response.messages?.length) {
          setMessages(normalizeTutorMessages(response.messages));
        }

        return response.session;
      } finally {
        if (activeRequestIdRef.current === requestId) {
          setIsCreatingSession(false);
        }
      }
    },
    [normalizedContext, normalizedSubject, normalizedTopic, tutorSession]
  );

  const handleSendMessage = useCallback(async () => {
    if (!normalizedMessage) {
      setErrorText('Алдымен хабар немесе сұрақ жазыңыз.');
      return;
    }

    if (!user) {
      const message = 'AI Tutor пайдалану үшін жүйеге кіру керек.';
      setErrorText(message);
      toast({ title: 'Қате', description: message, variant: 'destructive' });
      return;
    }

    if (!isStudent) {
      const message = 'AI Tutor тек оқушы аккаунты үшін қолжетімді.';
      setErrorText(message);
      toast({ title: 'Қате', description: message, variant: 'destructive' });
      return;
    }

    if (!accessToken) {
      const message = 'AI Tutor пайдалану үшін белсенді авторизация сессиясы қажет.';
      setErrorText(message);
      toast({ title: 'Қате', description: message, variant: 'destructive' });
      return;
    }

    const { requestId, controller, signal } = startRequest();
    const optimisticUserMessage = createLocalMessage('user', normalizedMessage);

    setErrorText('');
    setIsSending(true);
    setMessages((prev) => normalizeTutorMessages([...prev, optimisticUserMessage]));
    setMessageInput('');

    try {
      const activeSession = await ensureSession({
        accessTokenValue: accessToken,
        signal,
        requestId,
      });

      const response = await sendTutorMessage(
        {
          sessionId: activeSession.id,
          message: normalizedMessage,
          subject: normalizedSubject || undefined,
          topic: normalizedTopic || undefined,
          context: buildTutorContext(),
        },
        {
          accessToken,
          signal,
          timeoutMs: REQUEST_TIMEOUT_MS,
        }
      );

      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      setTutorSession((prev) => prev ?? activeSession);

      if (response.messages?.length) {
        setMessages(normalizeTutorMessages(response.messages));
      } else {
        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (item) => item.id !== optimisticUserMessage.id
          );

          return normalizeTutorMessages([
            ...withoutOptimistic,
            optimisticUserMessage,
            normalizeTutorMessage(response.reply, withoutOptimistic.length + 1) ||
              createLocalMessage('assistant', 'AI Tutor бос жауап қайтарды.'),
          ]);
        });
      }
    } catch (error) {
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      const message = getErrorMessage(
        error,
        'Tutor-ға хабар жіберу мүмкін болмады.'
      );

      setMessages((prev) =>
        prev.filter((item) => item.id !== optimisticUserMessage.id)
      );
      setMessageInput(normalizedMessage);
      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsSending(false);
        abortControllerRef.current = null;
        activeRequestIdRef.current = null;
      }

      controller.abort();
    }
  }, [
    accessToken,
    buildTutorContext,
    ensureSession,
    isStudent,
    normalizedMessage,
    normalizedSubject,
    normalizedTopic,
    startRequest,
    toast,
    user,
  ]);

  const handleMessageKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSendMessage();
      }
    },
    [handleSendMessage]
  );

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
            <Button variant="outline" size="sm" asChild>
              <Link to="/lessons">
                <BookOpen size={14} className="mr-2" />
                Сабақтарға қайту
              </Link>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isBusy}
            >
              <RefreshCcw size={14} className="mr-2" />
              Жаңа session
            </Button>
          </div>
        </div>

        {!user ? (
          <EmptyState
            title="Авторизация қажет"
            text="AI Tutor пайдалану үшін алдымен жүйеге кіріңіз."
          />
        ) : null}

        {user && !isStudent ? (
          <EmptyState
            title="Оқушы аккаунты қажет"
            text="AI Tutor оқушыға арналған құрал. Мұғалім үшін AI көмекші бетін қолданыңыз."
          />
        ) : null}

        {user && isStudent ? (
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Tutor параметрлері
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Пән</Label>
                  <Input
                    id="subject"
                    value={subject}
                    maxLength={MAX_SUBJECT_CHARS}
                    disabled={isBusy}
                    onChange={(event) => {
                      setSubject(event.target.value.slice(0, MAX_SUBJECT_CHARS));
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
                    maxLength={MAX_TOPIC_CHARS}
                    disabled={isBusy}
                    onChange={(event) => {
                      setTopic(event.target.value.slice(0, MAX_TOPIC_CHARS));
                      clearError();
                    }}
                    placeholder="Мысалы: Квадрат теңдеулер"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="context">Қосымша контекст</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {normalizedContext.length}/{MAX_CONTEXT_CHARS}
                    </span>
                  </div>
                  <Textarea
                    id="context"
                    value={context}
                    maxLength={MAX_CONTEXT_CHARS}
                    disabled={isBusy}
                    onChange={(event) => {
                      setContext(event.target.value.slice(0, MAX_CONTEXT_CHARS));
                      clearError();
                    }}
                    placeholder="Қай жерде қиналып тұрғаныңызды немесе қай бөлікті түсіндіру керек екенін жазыңыз..."
                    rows={5}
                  />
                </div>

                {tutorSession ? (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <CheckCircle2 size={13} className="text-primary" />
                      Session белсенді
                    </span>
                    <p className="mt-1">
                      Пән/тақырыпты өзгертсеңіз, жаңа контекст келесі хабарға ғана қолданылады. Толық жаңа диалог үшін “Жаңа session” басыңыз.
                    </p>
                  </div>
                ) : null}
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

                  {isAuthMissing && !isCreatingSession ? (
                    <EmptyState
                      title="Авторизация қажет"
                      text="AI Tutor пайдалану үшін белсенді сессия access token қажет."
                    />
                  ) : null}

                  {!isAuthMissing && !isCreatingSession && !hasMessages ? (
                    <EmptyState
                      title="Сұхбат әлі басталмады"
                      text="Төмендегі өріске сұрағыңызды жазыңыз. Бірінші хабар жіберілгенде tutor session автоматты түрде ашылады."
                    />
                  ) : null}

                  {hasMessages ? (
                    <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                      {messages.map((message) => {
                        const isAssistant = message.role === 'assistant';

                        return (
                          <div
                            key={message.id}
                            className={`rounded-2xl border p-4 text-sm ${
                              isAssistant
                                ? 'border-primary/20 bg-primary/5'
                                : 'bg-card'
                            }`}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              {isAssistant ? (
                                <Bot size={15} className="text-primary" />
                              ) : (
                                <MessageSquare
                                  size={15}
                                  className="text-muted-foreground"
                                />
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

                      <div ref={scrollAnchorRef} />
                    </div>
                  ) : (
                    <div ref={scrollAnchorRef} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Хабар жіберу</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="tutor-message">Хабар</Label>
                      <span className="text-[11px] text-muted-foreground">
                        {normalizedMessage.length}/{MAX_MESSAGE_CHARS}
                      </span>
                    </div>
                    <Textarea
                      id="tutor-message"
                      value={messageInput}
                      maxLength={MAX_MESSAGE_CHARS}
                      disabled={isBusy || !accessToken}
                      onChange={(event) => {
                        setMessageInput(event.target.value.slice(0, MAX_MESSAGE_CHARS));
                        clearError();
                      }}
                      onKeyDown={handleMessageKeyDown}
                      placeholder="Сұрағыңызды жазыңыз. Мысалы: осы тақырыпты қарапайым тілмен түсіндіріп бер."
                      rows={5}
                    />
                  </div>

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
                      <p className="mt-1">Жылдам жіберу: Ctrl/⌘ + Enter.</p>
                    </div>

                    <Button onClick={handleSendMessage} disabled={!canSendMessage}>
                      {isBusy ? (
                        <Loader2 size={14} className="mr-2 animate-spin" />
                      ) : (
                        <Send size={14} className="mr-2" />
                      )}
                      {isBusy ? 'Жіберілуде...' : 'Жіберу'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
