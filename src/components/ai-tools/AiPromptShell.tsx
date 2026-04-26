import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  Eraser,
  Loader2,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type AiPromptSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

export type AiPromptSubmitPayload = {
  prompt: string;
  selectedSuggestionId: string | null;
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
        <h4 key={key} className="mt-4 first:mt-0 text-sm font-semibold text-foreground">
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
          <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border bg-primary/10 px-1 text-[10px] font-semibold text-primary">
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
  const [copied, setCopied] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  const renderedAnswer = useMemo(() => (answer ? renderStructuredAnswer(answer) : null), [answer]);

  const hasPrompt = prompt.trim().length > 0;
  const endpointReady = Boolean(onSubmit);
  const effectiveDisabled = disabled || !endpointReady;

  const visibleDisabledReason =
    disabledReason ||
    (!endpointReady
      ? 'AI backend endpoint әлі қосылмаған.'
      : 'AI қазір уақытша өшірулі.');

  useEffect(() => {
    if (!copied) return;

    const timeoutId = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const clearPrompt = () => {
    setPrompt('');
  };

  const submitPrompt = async () => {
    if (effectiveDisabled || isSubmitting || !hasPrompt || !onSubmit) {
      return;
    }

    const normalizedPrompt = prompt.trim();
    setLastPrompt(normalizedPrompt);

    await onSubmit({
      prompt: normalizedPrompt,
      selectedSuggestionId: null,
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

  const handleCopy = async () => {
    if (!answer || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card
      className="overflow-hidden border-border/80 bg-background shadow-sm"
      data-suggestion-count={suggestions.length}
      data-context-label={contextLabel}
      data-context-summary={contextSummary || ''}
      data-warning-count={warnings.length}
      data-follow-up-count={followUpPrompts.length}
    >
      <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border bg-background text-primary shadow-sm">
              <Bot size={17} />
            </span>

            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <Sparkles size={12} className={endpointReady && !disabled ? 'text-primary' : ''} />
            {endpointReady && !disabled ? 'AI дайын' : 'Дайын емес'}
          </span>
        </div>

        {contextDescription ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {contextDescription}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        <form onSubmit={handleSubmit} className="flex min-h-[620px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto bg-muted/10 px-4 py-5 sm:px-5">
            {!lastPrompt && !renderedAnswer && !error && !isSubmitting ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <div className="max-w-md rounded-3xl border border-dashed bg-background/80 px-6 py-7 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/40 text-primary">
                    <Sparkles size={18} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    AI диалог дайын
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {emptyAnswerText}
                  </p>
                </div>
              </div>
            ) : null}

            {lastPrompt ? (
              <div className="flex items-start justify-end gap-3">
                <div className="max-w-3xl rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-sm">
                  <p className="text-sm leading-6">{lastPrompt}</p>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <UserRound size={15} />
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-destructive">
                  <AlertTriangle size={15} />
                </div>
                <div className="max-w-3xl rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <p className="text-sm font-semibold text-destructive">
                    AI жауабын алу мүмкін болмады
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p>
                </div>
              </div>
            ) : null}

            {isSubmitting ? (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-primary">
                  <Loader2 size={15} className="animate-spin" />
                </div>
                <div className="w-full max-w-3xl rounded-2xl border bg-background px-4 py-4 shadow-sm">
                  <div className="space-y-3 animate-pulse">
                    <div className="h-3 w-2/3 rounded-full bg-muted" />
                    <div className="h-3 w-full rounded-full bg-muted" />
                    <div className="h-3 w-5/6 rounded-full bg-muted" />
                  </div>
                </div>
              </div>
            ) : renderedAnswer ? (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-primary">
                  <Bot size={15} />
                </div>

                <div className="group w-full max-w-4xl rounded-2xl border bg-background shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{answerTitle}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Сұраққа байланысты жауап
                      </p>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleCopy}
                      disabled={!answer}
                      className="h-8 px-2 text-xs"
                    >
                      {copied ? (
                        <Check size={14} className="mr-1.5" />
                      ) : (
                        <Clipboard size={14} className="mr-1.5" />
                      )}
                      {copied ? 'Көшірілді' : 'Көшіру'}
                    </Button>
                  </div>

                  <div className="space-y-2 px-4 py-4 animate-fade-in">{renderedAnswer}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t bg-background p-4 sm:p-5">
            {effectiveDisabled ? (
              <div className="mb-3 rounded-2xl border bg-muted/30 px-4 py-3">
                <p className="text-xs leading-5 text-muted-foreground">{visibleDisabledReason}</p>
              </div>
            ) : null}

            <div className="rounded-3xl border bg-background px-3 py-3 shadow-sm focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/10">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={placeholder}
                rows={3}
                className="min-h-[88px] w-full resize-none border-0 bg-transparent px-1 text-sm leading-6 outline-none placeholder:text-muted-foreground"
              />

              <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={clearPrompt}
                  disabled={!hasPrompt || isSubmitting}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <Eraser size={13} />
                  Тазалау
                </button>

                <Button
                  type="submit"
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
          </div>
        </form>
      </CardContent>
    </Card>
  );
}