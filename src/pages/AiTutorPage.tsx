import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Send,
  Sparkles,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
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
const MAX_CONTEXT_CHARS = 4_000;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_VISIBLE_MESSAGES = 80;
const REQUEST_TIMEOUT_MS = 120_000;

const NULL_CHAR = String.fromCharCode(0);

function removeNullChars(value: unknown): string {
  return String(value ?? '').split(NULL_CHAR).join(' ');
}

type TutorContextPayload = {
  subject?: string;
  topic?: string;
  passage?: string;
};

function cleanText(value: unknown, limit: number) {
  return removeNullChars(value).trim().slice(0, limit).trim();
}

function createLocalMessage(
  role: 'user' | 'assistant',
  content: string,
): TutorMessage {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: cleanText(content, 12_000),
    createdAt: new Date().toISOString(),
  };
}

function normalizeTutorMessage(
  message: TutorMessage,
  fallbackIndex: number,
): TutorMessage | null {
  const content = cleanText(message.content, 12_000);

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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'AI тәлімгер сұранысы тоқтатылды немесе уақытынан асып кетті.';
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
  const requestCleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const accessToken = session?.access_token?.trim();
  const isStudent = user?.role === 'student';
  const isBusy = isCreatingSession || isSending;
  const hasMessages = messages.length > 0;
  const isAuthMissing = !accessToken;

  const normalizedSubject = useMemo(
    () => cleanText(subject, MAX_SUBJECT_CHARS),
    [subject],
  );

  const normalizedTopic = useMemo(
    () => cleanText(topic, MAX_TOPIC_CHARS),
    [topic],
  );

  const normalizedContext = useMemo(
    () => cleanText(context, MAX_CONTEXT_CHARS),
    [context],
  );

  const normalizedMessage = useMemo(
    () => cleanText(messageInput, MAX_MESSAGE_CHARS),
    [messageInput],
  );

  const canSendMessage = Boolean(
    accessToken && user && isStudent && !isBusy && normalizedMessage.length > 0,
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages.length, isCreatingSession, isSending, errorText]);

  const cleanupActiveRequest = useCallback(() => {
    requestCleanupRef.current?.();
    requestCleanupRef.current = null;
  }, []);

  const resetActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    cleanupActiveRequest();

    abortControllerRef.current = null;
    activeRequestIdRef.current = null;

    setIsCreatingSession(false);
    setIsSending(false);
  }, [cleanupActiveRequest]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      resetActiveRequest();
    };
  }, [resetActiveRequest]);

  const clearError = useCallback(() => {
    if (errorText) {
      setErrorText('');
    }
  }, [errorText]);

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
    resetActiveRequest();

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;
    activeRequestIdRef.current = requestId;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
    };

    abortControllerRef.current = controller;
    requestCleanupRef.current = cleanup;

    return {
      requestId,
      signal: controller.signal,
      cleanup,
    };
  }, [resetActiveRequest]);

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
          },
        );

        if (!mountedRef.current || activeRequestIdRef.current !== requestId) {
          throw new DOMException('Stale tutor session request', 'AbortError');
        }

        setTutorSession(response.session);

        if (response.messages?.length) {
          setMessages(normalizeTutorMessages(response.messages));
        }

        return response.session;
      } finally {
        if (mountedRef.current && activeRequestIdRef.current === requestId) {
          setIsCreatingSession(false);
        }
      }
    },
    [normalizedContext, normalizedSubject, normalizedTopic, tutorSession],
  );

  const handleSendMessage = useCallback(async () => {
    if (!normalizedMessage) {
      setErrorText('Алдымен хабар немесе сұрақ жазыңыз.');
      return;
    }

    if (!user) {
      const message = 'AI тәлімгерді пайдалану үшін жүйеге кіру керек.';

      setErrorText(message);
      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    if (!isStudent) {
      const message = 'AI тәлімгер тек оқушы аккаунты үшін қолжетімді.';

      setErrorText(message);
      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    if (!accessToken) {
      const message = 'AI тәлімгерді пайдалану үшін белсенді сессия қажет.';

      setErrorText(message);
      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    const { requestId, signal, cleanup } = startRequest();
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
        },
      );

      if (!mountedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      setTutorSession((prev) => prev ?? activeSession);

      if (response.messages?.length) {
        setMessages(normalizeTutorMessages(response.messages));
      } else {
        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (item) => item.id !== optimisticUserMessage.id,
          );

          const reply =
            normalizeTutorMessage(response.reply, withoutOptimistic.length + 1) ||
            createLocalMessage(
              'assistant',
              'AI тәлімгер бос жауап қайтарды. Сұрақты нақтылап қайта жіберіңіз.',
            );

          return normalizeTutorMessages([
            ...withoutOptimistic,
            optimisticUserMessage,
            reply,
          ]);
        });
      }
    } catch (error) {
      if (!mountedRef.current || activeRequestIdRef.current !== requestId) {
        return;
      }

      const message = getErrorMessage(
        error,
        'AI тәлімгерге хабар жіберу мүмкін болмады.',
      );

      setMessages((prev) =>
        prev.filter((item) => item.id !== optimisticUserMessage.id),
      );
      setMessageInput(normalizedMessage);
      setErrorText(message);

      toast({
        title: 'Қате',
        description: message,
        variant: 'destructive',
      });
    } finally {
      cleanup();

      if (mountedRef.current && activeRequestIdRef.current === requestId) {
        setIsSending(false);
        setIsCreatingSession(false);
        abortControllerRef.current = null;
        activeRequestIdRef.current = null;
        requestCleanupRef.current = null;
      }
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
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSendMessage();
      }
    },
    [handleSendMessage],
  );

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
          icon={<Bot size={20} />}
          title={t('nav.ai_tutor')}
          actions={
            <div className="flex flex-wrap gap-2">
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
                Жаңа диалог
              </Button>
            </div>
          }
        />

        {!user ? (
          <EmptyState
            title="Авторизация қажет"
            text="AI тәлімгерді пайдалану үшін алдымен жүйеге кіріңіз."
            tone="ai"
          />
        ) : null}

        {user && !isStudent ? (
          <EmptyState
            title="Оқушы аккаунты қажет"
            text="AI тәлімгер оқушыға арналған. Мұғалім үшін AI көмекші бетін қолданыңыз."
            tone="ai"
          />
        ) : null}

        {user && isStudent ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card className="overflow-hidden shadow-xs">
                  <CardHeader className="bg-card pb-2">
                    <CardTitle className="text-base font-semibold">
                      Параметрлер
                    </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 p-4 sm:p-5">
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
                    <Label htmlFor="context">Қосымша мәтін</Label>
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
                    placeholder="Қосымша түсіндірме немесе контекст"
                    rows={5}
                  />
                </div>

                {tutorSession ? (
                  <div className="rounded-2xl bg-primary/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <CheckCircle2 size={14} className="text-primary" />
                      Диалог белсенді
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="min-h-[420px] overflow-hidden shadow-xs">
                <CardHeader className="bg-card pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base font-semibold">
                      Диалог
                    </CardTitle>

                    <StatusBadge tone={tutorSession ? 'success' : 'muted'}>
                      {tutorSession ? 'Белсенді' : 'Жаңа'}
                    </StatusBadge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 p-4 sm:p-5">
                  {isCreatingSession ? (
                    <LoadingState text="Диалог ашылып жатыр..." />
                  ) : null}

                  {errorText ? <ErrorState text={errorText} /> : null}

                  {isAuthMissing && !isCreatingSession ? (
                    <EmptyState
                      title="Авторизация қажет"
                      text="Белсенді сессия қажет."
                      tone="ai"
                      compact
                    />
                  ) : null}

                  {!isAuthMissing && !isCreatingSession && !hasMessages ? (
                    <EmptyState
                      title="Сұхбат әлі басталмады"
                      text="Төмендегі өріске сұрағыңызды жазыңыз."
                      tone="ai"
                      compact
                    />
                  ) : null}

                  {hasMessages ? (
                    <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                      {messages.map((message) => {
                        const isAssistant = message.role === 'assistant';

                        return (
                          <div
                            key={message.id}
                            className={`rounded-2xl p-4 text-sm ${
                              isAssistant
                                ? 'bg-muted/40 text-foreground'
                                : 'bg-primary text-primary-foreground shadow-xs'
                            }`}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              {isAssistant ? (
                                <Bot size={15} className="text-primary" />
                              ) : (
                                <MessageSquare
                                  size={15}
                                  className="text-primary-foreground/80"
                                />
                              )}

                              <span className="text-xs font-semibold">
                                {isAssistant ? 'AI тәлімгер' : 'Сіз'}
                              </span>
                            </div>

                            <p className="whitespace-pre-wrap leading-relaxed">
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

              <Card className="overflow-hidden shadow-xs">
                <CardHeader className="bg-card pb-2">
                  <CardTitle className="text-base font-semibold">
                    Хабар жіберу
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="space-y-1.5">
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
                      placeholder="Сұрағыңызды жазыңыз..."
                      rows={4}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Ctrl/⌘ + Enter
                    </p>

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