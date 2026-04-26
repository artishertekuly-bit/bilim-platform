import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Clipboard,
  Eraser,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  UserRound,
  Wand2,
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

  /**
   * Optional response metadata.
   * These fields are intentionally compact. They should not turn the chat into an analytics dashboard.
   */
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

function getVisibleWarnings(warnings: string[] | undefined) {
  return (warnings || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function getVisibleFollowUps(followUpPrompts: string[] | undefined) {
  return (followUpPrompts || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export default function AiPromptShell({
  title,
  description,
  placeholder,
  suggestions,

  contextLabel = 'Контекст',
  contextDescription = 'AI таңдалған оқу context-ін ішкі талдап, сұрағыңызға байланысты жауап береді.',

  disabled = true,
  disabledReason,

  isSubmitting = false,
  answer = null,
  error = null,

  answerTitle = 'AI жауабы',
  emptyAnswerText = 'Сұрақ жазыңыз немесе дайын prompt таңдаңыз. AI жауап осы жерде чат ретінде көрсетіледі.',

  contextSummary = null,
  warnings = [],
  followUpPrompts = [],

  onSubmit,
}: AiPromptShellProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  const selectedSuggestion = useMemo(
    () => suggestions.find((item) => item.id === selectedSuggestionId) || null,
    [suggestions, selectedSuggestionId]
  );

  const renderedAnswer = useMemo(() => (answer ? renderStructuredAnswer(answer) : null), [answer]);

  const visibleWarnings = useMemo(() => getVisibleWarnings(warnings), [warnings]);
  const visibleFollowUps = useMemo(() => getVisibleFollowUps(followUpPrompts), [followUpPrompts]);

  const hasPrompt = prompt.trim().length > 0;
  const endpointReady = Boolean(onSubmit);
  const effectiveDisabled = disabled || !endpointReady;

  const visibleDisabledReason =
    disabledReason ||
    (!endpointReady
      ? 'AI backend endpoint әлі қосылмаған. Бұл интерфейс тек сценарий мен context логикасын дайындап тұр.'
      : 'AI қазір уақытша өшірулі.');

  useEffect(() => {
    if (!copied) return;

    const timeoutId = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleSuggestionClick = (suggestion: AiPromptSuggestion) => {
    setSelectedSuggestionId(suggestion.id);
    setPrompt(suggestion.prompt);
  };

  const clearPrompt = () => {
    setPrompt('');
    setSelectedSuggestionId(null);
  };

  const submitPrompt = async (nextPrompt?: string, nextSuggestionId?: string | null) => {
    const rawPrompt = nextPrompt ?? prompt;

    if (effectiveDisabled || isSubmitting || !rawPrompt.trim() || !onSubmit) {
      return;
    }

    const normalizedPrompt = rawPrompt.trim();
    setLastPrompt(normalizedPrompt);

    await onSubmit({
      prompt: normalizedPrompt,
      selectedSuggestionId:
        nextSuggestionId !== undefined ? nextSuggestionId : selectedSuggestion?.id || null,
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

  const handleFollowUpClick = async (followUpPrompt: string) => {
    setPrompt(followUpPrompt);
    setSelectedSuggestionId(null);
    await submitPrompt(followUpPrompt, null);
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
    <Card className="overflow-hidden border-border/80 bg-background shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <Sparkles size={12} className={endpointReady && !disabled ? 'text-primary' : ''} />
              {endpointReady && !disabled ? 'AI дайын' : 'Дайындық режимі'}
            </span>
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <MessageCircle size={12} />
              {contextLabel}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <form onSubmit={handleSubmit} className="flex min-h-[560px] flex-col">
          <div className="border-b bg-background px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
                {contextDescription}
              </p>

              <p className="text-[11px] text-muted-foreground">
                Ctrl + Enter арқылы жіберуге болады
              </p>
            </div>

            {suggestions.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {suggestions.map((suggestion) => {
                  const active = selectedSuggestion?.id === suggestion.id;

                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200 ${
                        active
                          ? 'border-primary/40 bg-primary text-primary-foreground shadow-sm'
                          : 'bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground'
                      }`}
                      title={suggestion.prompt}
                    >
                      <Wand2 size={13} />
                      {suggestion.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-muted/10 px-4 py-5 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-primary">
                <Bot size={15} />
              </div>
              <div className="max-w-3xl rounded-2xl border bg-background px-4 py-3 shadow-sm">
                <p className="text-sm leading-6 text-foreground">
                  Сұрағыңызды жазыңыз. Мен оқу context-ін ішкі талдап, тек сұрағыңызға қажет түсіндірме мен келесі қадамды ұсынамын.
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Барлық analytics көрсеткіштері жауапта тізілмейді. Олар тек бағытты нақтылау үшін қолданылады.
                </p>
              </div>
            </div>

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
                        Сұраққа байланысты қорытылған жауап
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
                      {copied ? <Check size={14} className="mr-1.5" /> : <Clipboard size={14} className="mr-1.5" />}
                      {copied ? 'Көшірілді' : 'Көшіру'}
                    </Button>
                  </div>

                  <div className="space-y-2 px-4 py-4 animate-fade-in">{renderedAnswer}</div>

                  {contextSummary || visibleWarnings.length > 0 || visibleFollowUps.length > 0 ? (
                    <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
                      {contextSummary ? (
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          {contextSummary}
                        </p>
                      ) : null}

                      {visibleWarnings.length > 0 ? (
                        <div className="space-y-1">
                          {visibleWarnings.map((warning) => (
                            <p key={warning} className="text-[11px] leading-5 text-muted-foreground">
                              {warning}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      {visibleFollowUps.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {visibleFollowUps.map((followUp) => (
                            <button
                              key={followUp}
                              type="button"
                              onClick={() => void handleFollowUpClick(followUp)}
                              disabled={effectiveDisabled || isSubmitting}
                              className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                            >
                              <Sparkles size={12} />
                              {followUp}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center">
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
            )}
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
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setPrompt(nextValue);

                  if (selectedSuggestion && nextValue !== selectedSuggestion.prompt) {
                    setSelectedSuggestionId(null);
                  }
                }}
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