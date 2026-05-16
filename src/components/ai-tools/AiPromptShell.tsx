import {
  useEffect,
  useMemo,
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
  Loader2,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

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
  title?: string;
};

type AiPromptShellProps = {
  title: string;
  description: string;
  placeholder: string;
  suggestions?: AiPromptSuggestion[];

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
const MAX_LOCAL_MESSAGES = 40;
const MAX_PROMPT_CHARS = 4_000;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_META_TEXT_CHARS = 700;
const MAX_WARNING_CHARS = 260;
const MAX_FOLLOW_UP_PROMPTS = 4;

function cleanText(value: unknown, limit?: number): string {
  return typeof limit === 'number' ? limitText(value, limit) : limitText(value, MAX_MESSAGE_CHARS);
}

function cleanMultilineText(value: unknown, limit?: number): string {
  const normalized = removeNullCharacters(String(value ?? ''))
    .replace(/\r\n/g, '\n')
    .trim();

  if (typeof limit !== 'number') {
    return normalized;
  }

  return normalized.slice(0, limit).trim();
}

function normalizeStringList(
  values: unknown,
  {
    limit,
    itemLimit,
  }: {
    limit: number;
    itemLimit: number;
  },
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const output: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const text = cleanText(value, itemLimit);
    const key = text.toLowerCase();

    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(text);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function normalizeSuggestions(values: AiPromptSuggestion[] | undefined): AiPromptSuggestion[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const output: AiPromptSuggestion[] = [];
  const seen = new Set<string>();

  for (const suggestion of values) {
    const id = cleanText(suggestion?.id, 80) || `suggestion-${output.length + 1}`;
    const label = cleanText(suggestion?.label, 120);
    const prompt = cleanMultilineText(suggestion?.prompt, MAX_PROMPT_CHARS);
    const key = `${label.toLowerCase()}::${prompt.toLowerCase()}`;

    if (!label || !prompt || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push({
      id,
      label,
      prompt,
    });
  }

  return output;
}

function normalizeMarkdownLine(line: string): string {
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
    .map((message): AiConversationMessage => ({
      role: message.role,
      content: cleanMultilineText(message.content, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => Boolean(message.content));
}

function createMessage(
  role: ChatMessage['role'],
  content: string,
  title?: string,
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: cleanMultilineText(content, MAX_MESSAGE_CHARS),
    title: title ? cleanText(title, 120) : undefined,
  };
}

function appendLocalMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const nextMessages = [...messages, message].filter((item) => Boolean(item.content));

  return nextMessages.slice(-MAX_LOCAL_MESSAGES);
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, 500);
  }

  return 'AI сұранысын жіберу кезінде қате пайда болды.';
}

export default function AiPromptShell({
  title,
  placeholder,
  suggestions = [],

  contextLabel = 'Дерек',

  disabled = true,
  disabledReason,

  isSubmitting = false,
  answer = null,
  error = null,

  answerTitle = 'AI жауабы',
  emptyAnswerText = 'Сұрағыңызды жазыңыз.',

  contextSummary = null,
  warnings = [],
  followUpPrompts = [],

  onSubmit,
}: AiPromptShellProps) {
  const [prompt, setPrompt] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const lastAppliedAnswerRef = useRef<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const normalizedSuggestions = useMemo(
    () => normalizeSuggestions(suggestions),
    [suggestions],
  );

  const normalizedWarnings = useMemo(
    () =>
      normalizeStringList(warnings, {
        limit: 4,
        itemLimit: MAX_WARNING_CHARS,
      }),
    [warnings],
  );

  const normalizedFollowUpPrompts = useMemo(
    () =>
      normalizeStringList(followUpPrompts, {
        limit: MAX_FOLLOW_UP_PROMPTS,
        itemLimit: MAX_PROMPT_CHARS,
      }),
    [followUpPrompts],
  );

  const normalizedContextSummary = cleanText(contextSummary, MAX_META_TEXT_CHARS);

  const visibleError = error || localError;
  const hasPrompt = prompt.trim().length > 0;
  const endpointReady = Boolean(onSubmit);
  const effectiveDisabled = disabled || !endpointReady;
  const hasConversation = messages.length > 0;
  const hasSuggestions = normalizedSuggestions.length > 0;
  const hasMeta =
    Boolean(normalizedContextSummary) ||
    normalizedWarnings.length > 0 ||
    normalizedFollowUpPrompts.length > 0;

  const visibleDisabledReason =
    cleanText(disabledReason, 300) ||
    (!endpointReady ? 'AI сервері қосылмаған.' : 'AI уақытша қолжетімсіз.');

  useEffect(() => {
    if (!copiedMessageId) return;

    const timeoutId = window.setTimeout(() => setCopiedMessageId(null), 1_400);

    return () => window.clearTimeout(timeoutId);
  }, [copiedMessageId]);

  useEffect(() => {
    const normalizedAnswer = cleanMultilineText(answer, MAX_MESSAGE_CHARS);

    if (!normalizedAnswer) {
      lastAppliedAnswerRef.current = null;
      return;
    }

    if (lastAppliedAnswerRef.current === normalizedAnswer) {
      return;
    }

    lastAppliedAnswerRef.current = normalizedAnswer;
    setLocalError(null);

    setMessages((currentMessages) =>
      appendLocalMessage(
        currentMessages,
        createMessage('assistant', normalizedAnswer, answerTitle),
      ),
    );
  }, [answer, answerTitle]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages.length, isSubmitting, visibleError]);

  const clearPrompt = () => {
    setPrompt('');
  };

  const clearConversation = () => {
    setPrompt('');
    setMessages([]);
    lastAppliedAnswerRef.current = null;
    setCopiedMessageId(null);
    setLocalError(null);
  };

  const submitPrompt = async (
    overridePrompt?: string,
    suggestionId: string | null = null,
  ) => {
    const promptText = cleanMultilineText(
      overridePrompt ?? prompt,
      MAX_PROMPT_CHARS,
    );

    if (effectiveDisabled || isSubmitting || !promptText || !onSubmit) {
      return;
    }

    const history = buildHistory(messages);
    const userMessage = createMessage('user', promptText);

    lastAppliedAnswerRef.current = null;
    setLocalError(null);
    setMessages((currentMessages) => appendLocalMessage(currentMessages, userMessage));
    setPrompt('');

    try {
      await onSubmit({
        prompt: promptText,
        selectedSuggestionId: suggestionId,
        conversationHistory: history,
      });
    } catch (submitError) {
      setLocalError(getSubmitErrorMessage(submitError));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitPrompt();
  };

  const handleTextareaKeyDown = async (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
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
                    <span className="truncate">{contextLabel}</span>
                  </StatusBadge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-semibold',
                endpointReady && !disabled
                  ? 'border-ai-border bg-ai-soft text-ai-foreground'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {endpointReady && !disabled ? 'Дайын' : 'Қолжетімсіз'}
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
                Тазалау
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <form onSubmit={handleSubmit} className="flex min-h-[620px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto bg-surface-soft/40 px-4 py-5 sm:px-5">
            {hasMeta ? (
              <div className="rounded-3xl border border-border bg-card/85 p-4 shadow-soft">
                <div className="min-w-0 space-y-3">
                  {normalizedContextSummary ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {normalizedContextSummary}
                    </p>
                  ) : null}

                  {normalizedWarnings.length > 0 ? (
                    <div className="space-y-1">
                      {normalizedWarnings.map((warning, index) => (
                        <p
                          key={`${warning}-${index}`}
                          className="rounded-2xl border border-warning-muted bg-warning-soft/65 px-3 py-2 text-xs leading-5 text-muted-foreground"
                        >
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {normalizedFollowUpPrompts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {normalizedFollowUpPrompts.map((followUpPrompt, index) => (
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
            ) : null}

            {!hasConversation && !visibleError && !isSubmitting ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="max-w-md rounded-3xl border border-dashed border-ai-border bg-card/80 px-6 py-7 text-center shadow-soft backdrop-blur">
                  <p className="text-sm font-semibold text-foreground">
                    Сұрақ жазыңыз
                  </p>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {emptyAnswerText}
                  </p>

                  {hasSuggestions ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {normalizedSuggestions.slice(0, 4).map((suggestion) => (
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
                      <p className="text-sm font-semibold text-foreground">
                        {message.title || answerTitle}
                      </p>

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

            {visibleError ? (
              <div className="flex items-start gap-3 animate-fade-in-soft">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-destructive-muted bg-destructive-soft text-destructive shadow-soft">
                  <AlertTriangle size={15} />
                </div>

                <div className="max-w-3xl rounded-3xl border border-destructive-muted bg-destructive-soft px-4 py-3 shadow-soft">
                  <p className="text-sm font-semibold text-destructive">
                    Жауап алу мүмкін болмады
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {visibleError}
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
                onChange={(event) =>
                  setPrompt(event.target.value.slice(0, MAX_PROMPT_CHARS))
                }
                onKeyDown={handleTextareaKeyDown}
                placeholder={placeholder}
                rows={3}
                maxLength={MAX_PROMPT_CHARS}
                disabled={effectiveDisabled || isSubmitting}
                className="min-h-[88px] w-full resize-none border-0 bg-transparent px-1 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
              />

              <div className="mt-3 flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={clearPrompt}
                    disabled={!hasPrompt || isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-medium text-muted-foreground transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-primary-soft hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Eraser size={13} />
                    Тазалау
                  </button>

                  <span className="text-[11px] text-muted-foreground">
                    {prompt.length}/{MAX_PROMPT_CHARS}
                  </span>
                </div>

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
              Ctrl/⌘ + Enter
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}