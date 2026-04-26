import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  Eraser,
  Info,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type AiPromptSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

export type AiConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiPromptSubmitPayload = {
  prompt: string;
  selectedSuggestionId: string | null;
  conversationHistory?: AiConversationMessage[];
};

type ChatMessage = AiConversationMessage & {
  id: string;
};

type AiPromptShellProps = {
  title: string;
  description: string;
  placeholder: string;
  suggestions: AiPromptSuggestion[];

  contextLabel?: string;
  contextDescription?: string;

  disabled?: boolean;
  disabledReason?: string;

  isSubmitting?: boolean;
  answer?: string | null;
  error?: string | null;

  answerTitle?: string;
  emptyAnswerText?: string;

  contextSummary?: string | null;
  warnings?: string[];
  followUpPrompts?: string[];

  onSubmit?: (payload: AiPromptSubmitPayload) => void | Promise<void>;
};

const MAX_CONVERSATION_HISTORY_MESSAGES = 8;

function normalizeMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .trim();
}

function renderStructuredAnswer(answer: string) {
  const lines = answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  return lines.map((line, index) => {
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    const key = `${line}-${index}`;

    if (/^#{1,6}\s+/.test(line)) {
      return (
        <h4
          key={key}
          className="mt-4 text-sm font-semibold tracking-tight text-foreground first:mt-0"
        >
          {normalizeMarkdownLine(line)}
        </h4>
      );
    }

    if (/^[-*]\s+/.test(line)) {
      return (
        <div key={key} className="flex gap-2 text-sm leading-7 text-foreground">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{normalizeMarkdownLine(line)}</span>
        </div>
      );
    }

    if (numbered) {
      return (
        <div key={key} className="flex gap-2 text-sm leading-7 text-foreground">
          <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-primary-muted bg-primary-soft px-1 text-[10px] font-semibold text-primary">
            {numbered[1]}
          </span>
          <span>{normalizeMarkdownLine(numbered[2])}</span>
        </div>
      );
    }

    return (
      <p key={key} className="text-sm leading-7 text-foreground">
        {normalizeMarkdownLine(line)}
      </p>
    );
  });
}

function buildHistory(messages: ChatMessage[]): AiConversationMessage[] {
  return messages
    .slice(-MAX_CONVERSATION_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
}

export default function AiPromptShell({
  title,
  description,
  placeholder,
  suggestions,

  contextLabel = 'Контекст',
  contextDescription = '',

  disabled = true,
  disabledReason,

  isSubmitting = false,
  answer = null,
  error = null,

  answerTitle = 'AI жауабы',
  emptyAnswerText = 'Сұрағыңызды жазыңыз. AI жауабы осы жерде көрсетіледі.',

  contextSummary = null,
  warnings = [],
  followUpPrompts = [],

  onSubmit,
}: AiPromptShellProps) {
  const [prompt, setPrompt] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const lastAppliedAnswerRef = useRef<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const hasPrompt = prompt.trim().length > 0;
  const endpointReady = Boolean(onSubmit);
  const effectiveDisabled = disabled || !endpointReady;
  const hasConversation = messages.length > 0;
  const hasSuggestions = suggestions.length > 0;
  const hasCompactMeta =
    Boolean(contextSummary?.trim()) || warnings.length > 0 || followUpPrompts.length > 0;

  const visibleDisabledReason =
    disabledReason ||
    (!endpointReady
      ? 'AI backend endpoint әлі қосылмаған.'
      : 'AI қазір уақытша өшірулі.');

  useEffect(() => {
    if (!copiedMessageId) return;

    const timeoutId = window.setTimeout(() => setCopiedMessageId(null), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [copiedMessageId]);

  useEffect(() => {
    if (!answer?.trim()) return;
    if (lastAppliedAnswerRef.current === answer) return;

    lastAppliedAnswerRef.current = answer;

    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('assistant', answer.trim()),
    ]);
  }, [answer]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages.length, isSubmitting, error]);

  const clearPrompt = () => {
    setPrompt('');
  };

  const clearConversation = () => {
    setPrompt('');
    setMessages([]);
    lastAppliedAnswerRef.current = null;
    setCopiedMessageId(null);
  };

  const submitPrompt = async (overridePrompt?: string, suggestionId: string | null = null) => {
    const promptText = (overridePrompt ?? prompt).trim();

    if (effectiveDisabled || isSubmitting || !promptText || !onSubmit) {
      return;
    }

    const history = buildHistory(messages);
    const userMessage = createMessage('user', promptText);

    lastAppliedAnswerRef.current = null;
    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setPrompt('');

    await onSubmit({
      prompt: promptText,
      selectedSuggestionId: suggestionId,
      conversationHistory: history,
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitPrompt();
  };

  const handleTextareaKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      await submitPrompt();
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    if (!message.content || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
    } catch {
      setCopiedMessageId(null);
    }
  };

  return (
    <Card className="ai-soft-panel overflow-hidden">
      <CardHeader className="border-b border-ai-border/70 bg-card/70 px-4 py-4 backdrop-blur sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-soft">
              <Bot size={18} />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base sm:text-lg">{title}</CardTitle>

                {contextLabel ? (
                  <StatusBadge tone="ai" className="max-w-[240px] truncate">
                    <Sparkles size={11} />
                    <span className="truncate">{contextLabel}</span>
                  </StatusBadge>
                ) : null}
              </div>

              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold',
                endpointReady && !disabled
                  ? 'border-ai-border bg-ai-soft text-ai-foreground'
                  : 'border-border bg-muted text-muted-foreground'
              )}
            >
              <Sparkles
                size={12}
                className={endpointReady && !disabled ? 'text-primary' : ''}
              />
              {endpointReady && !disabled ? 'AI дайын' : 'Дайын емес'}
            </span>

            {hasConversation ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearConversation}
                disabled={isSubmitting}
                className="h-8 px-2 text-[11px] text-muted-foreground"
              >
                <Trash2 size={12} className="mr-1.5" />
                Диалогты тазалау
              </Button>
            ) : null}
          </div>
        </div>

        {contextDescription ? (
          <p className="mt-3 rounded-2xl border border-border/70 bg-card/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {contextDescription}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        <form onSubmit={handleSubmit} className="flex min-h-[640px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto bg-surface-soft/40 px-4 py-5 sm:px-5">
            {hasCompactMeta ? (
              <div className="rounded-3xl border border-border bg-card/85 p-4 shadow-soft">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-inner-soft">
                    <Info size={15} />
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    {contextSummary ? (
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          Контекст қысқаша
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {contextSummary}
                        </p>
                      </div>
                    ) : null}

                    {warnings.length > 0 ? (
                      <div className="space-y-1">
                        {warnings.map((warning, index) => (
                          <p
                            key={`${warning}-${index}`}
                            className="rounded-2xl border border-warning-muted bg-warning-soft/65 px-3 py-2 text-xs leading-5 text-muted-foreground"
                          >
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {followUpPrompts.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {followUpPrompts.slice(0, 4).map((followUpPrompt, index) => (
                          <button
                            key={`${followUpPrompt}-${index}`}
                            type="button"
                            disabled={effectiveDisabled || isSubmitting}
                            onClick={() => void submitPrompt(followUpPrompt, null)}
                            className="rounded-full border border-primary-muted bg-primary-soft px-3 py-1.5 text-[11px] font-medium text-primary transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-card disabled:pointer-events-none disabled:opacity-60"
                          >
                            {followUpPrompt}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {!hasConversation && !error && !isSubmitting ? (
              <div className="flex min-h-[340px] items-center justify-center">
                <div className="max-w-md rounded-3xl border border-dashed border-ai-border bg-card/80 px-6 py-7 text-center shadow-soft backdrop-blur">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-inner-soft">
                    <MessageCircle size={18} />
                  </div>

                  <p className="mt-3 text-sm font-semibold text-foreground">
                    AI диалог дайын
                  </p>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {emptyAnswerText}
                  </p>

                  {hasSuggestions ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {suggestions.slice(0, 4).map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          disabled={effectiveDisabled || isSubmitting}
                          onClick={() =>
                            void submitPrompt(suggestion.prompt, suggestion.id)
                          }
                          className="rounded-full border border-primary-muted bg-primary-soft px-3 py-1.5 text-[11px] font-medium text-primary transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-card disabled:pointer-events-none disabled:opacity-60"
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {messages.map((message) => {
              if (message.role === 'user') {
                return (
                  <div
                    key={message.id}
                    className="flex items-start justify-end gap-3 animate-fade-in-soft"
                  >
                    <div className="max-w-3xl rounded-[1.35rem] rounded-tr-md bg-primary px-4 py-3 text-primary-foreground shadow-soft">
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </p>
                    </div>

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-card text-primary shadow-soft">
                      <UserRound size={15} />
                    </div>
                  </div>
                );
              }

              const isCopied = copiedMessageId === message.id;

              return (
                <div
                  key={message.id}
                  className="flex items-start gap-3 animate-fade-in-soft"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-soft">
                    <Bot size={15} />
                  </div>

                  <div className="group w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card/95 shadow-soft">
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-card/80 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {answerTitle}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Диалог жалғасы бойынша жауап
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyMessage(message)}
                        className="h-8 px-2 text-xs"
                      >
                        {isCopied ? (
                          <Check size={14} className="mr-1.5" />
                        ) : (
                          <Clipboard size={14} className="mr-1.5" />
                        )}
                        {isCopied ? 'Көшірілді' : 'Көшіру'}
                      </Button>
                    </div>

                    <div className="space-y-2 px-4 py-4">
                      {renderStructuredAnswer(message.content)}
                    </div>
                  </div>
                </div>
              );
            })}

            {error ? (
              <div className="flex items-start gap-3 animate-fade-in-soft">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-destructive-muted bg-destructive-soft text-destructive shadow-soft">
                  <AlertTriangle size={15} />
                </div>

                <div className="max-w-3xl rounded-3xl border border-destructive-muted bg-destructive-soft px-4 py-3 shadow-soft">
                  <p className="text-sm font-semibold text-destructive">
                    AI жауабын алу мүмкін болмады
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {error}
                  </p>
                </div>
              </div>
            ) : null}

            {isSubmitting ? (
              <div className="flex items-start gap-3 animate-fade-in-soft">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-ai-soft text-primary shadow-soft">
                  <Loader2 size={15} className="animate-spin" />
                </div>

                <div className="w-full max-w-3xl rounded-3xl border border-border bg-card/90 px-4 py-4 shadow-soft">
                  <div className="space-y-3 animate-pulse">
                    <div className="h-3 w-2/3 rounded-full bg-muted" />
                    <div className="h-3 w-full rounded-full bg-muted" />
                    <div className="h-3 w-5/6 rounded-full bg-muted" />
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={scrollAnchorRef} />
          </div>

          <div className="border-t border-ai-border/70 bg-card/80 p-4 backdrop-blur sm:p-5">
            {effectiveDisabled ? (
              <div className="mb-3 rounded-2xl border border-warning-muted bg-warning-soft/70 px-4 py-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  {visibleDisabledReason}
                </p>
              </div>
            ) : null}

            <div className="rounded-3xl border border-border bg-card px-3 py-3 shadow-inner-soft transition-all duration-200 ease-soft focus-within:border-primary-muted focus-within:ring-2 focus-within:ring-ring/25">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={placeholder}
                rows={3}
                className="min-h-[88px] w-full resize-none border-0 bg-transparent px-1 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
              />

              <div className="mt-3 flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={clearPrompt}
                  disabled={!hasPrompt || isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-medium text-muted-foreground transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-primary-soft hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                >
                  <Eraser size={13} />
                  Тазалау
                </button>

                <Button
                  type="submit"
                  variant="ai"
                  disabled={effectiveDisabled || isSubmitting || !hasPrompt}
                  className="sm:min-w-[150px]"
                >
                  {isSubmitting ? (
                    <Loader2 size={14} className="mr-2 animate-spin" />
                  ) : (
                    <Send size={14} className="mr-2" />
                  )}
                  {isSubmitting ? 'Жіберілуде...' : 'Жіберу'}
                </Button>
              </div>
            </div>

            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Жіберу: батырма арқылы. Жылдам жіберу: Ctrl/⌘ + Enter.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}