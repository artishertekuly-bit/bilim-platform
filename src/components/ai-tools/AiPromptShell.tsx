import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Check,
  Clipboard,
  CornerDownRight,
  Eraser,
  HelpCircle,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
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

  onSubmit?: (payload: AiPromptSubmitPayload) => void | Promise<void>;
};

function normalizeMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
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

    if (/^#{1,6}\s+/.test(line)) {
      return (
        <h4 key={`${line}-${index}`} className="mt-4 first:mt-0 text-sm font-semibold text-foreground">
          {normalizeMarkdownLine(line)}
        </h4>
      );
    }

    if (/^[-*]\s+/.test(line)) {
      return (
        <div key={`${line}-${index}`} className="flex gap-2 text-sm leading-7 text-foreground">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{normalizeMarkdownLine(line)}</span>
        </div>
      );
    }

    if (numbered) {
      return (
        <div key={`${line}-${index}`} className="flex gap-2 text-sm leading-7 text-foreground">
          <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border bg-primary/10 px-1 text-[10px] font-semibold text-primary">
            {numbered[1]}
          </span>
          <span>{normalizeMarkdownLine(numbered[2])}</span>
        </div>
      );
    }

    return (
      <p key={`${line}-${index}`} className="text-sm leading-7 text-foreground">
        {normalizeMarkdownLine(line)}
      </p>
    );
  });
}

function SoftInfoRow({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div className="rounded-2xl border bg-background/80 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p>
        </div>
      </div>
    </div>
  );
}

export default function AiPromptShell({
  title,
  description,
  placeholder,
  suggestions,

  contextLabel = 'Analytics snapshot',
  contextDescription = 'AI кейін осы беттегі дайын analytics snapshot бойынша ғана жауап береді.',

  disabled = true,
  disabledReason,

  isSubmitting = false,
  answer = null,
  error = null,

  answerTitle = 'AI жауабы',
  emptyAnswerText = 'Backend AI endpoint қосылғаннан кейін жауап осы жерде көрсетіледі. Жауап тек берілген snapshot context пен сіз жазған сұраққа сүйенеді.',

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

  const renderedAnswer = useMemo(
    () => (answer ? renderStructuredAnswer(answer) : null),
    [answer]
  );

  const hasPrompt = prompt.trim().length > 0;
  const endpointReady = Boolean(onSubmit);
  const effectiveDisabled = disabled || !endpointReady;

  const visibleDisabledReason =
    disabledReason ||
    (!endpointReady
      ? 'AI жауап беру backend-і кейін қосылады. Қазір бұл блок сұрақ сценарийін және context логикасын дайындап тұр.'
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (effectiveDisabled || isSubmitting || !hasPrompt || !onSubmit) {
      return;
    }

    const normalizedPrompt = prompt.trim();
    setLastPrompt(normalizedPrompt);

    await onSubmit({
      prompt: normalizedPrompt,
      selectedSuggestionId: selectedSuggestion?.id || null,
    });
  };

  const handleCopy = async () => {
    if (!answer) return;

    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const clearPrompt = () => {
    setPrompt('');
    setSelectedSuggestionId(null);
  };

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-background to-background shadow-sm">
      <CardHeader className="border-b bg-background/55 pb-4 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <BrainCircuit size={19} />
            </div>

            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm">
            <Sparkles size={12} className={endpointReady && !disabled ? 'text-primary' : ''} />
            {endpointReady && !disabled ? 'Live AI endpoint' : 'Дайындық режимі'}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <SoftInfoRow
            icon={<HelpCircle size={16} />}
            label={contextLabel}
            text={contextDescription}
          />
          <SoftInfoRow
            icon={<CornerDownRight size={16} />}
            label="Жауап шектеуі"
            text="AI жауапты осы экрандағы snapshot пен сіздің сұрағыңызға сүйеніп береді; роль мен scope backend жағында қайта тексеріледі."
          />
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-muted-foreground">Жылдам action prompt</p>
                <span className="text-[11px] text-muted-foreground">{suggestions.length} сценарий</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.map((suggestion) => {
                  const active = selectedSuggestion?.id === suggestion.id;

                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={`group rounded-2xl border p-3 text-left transition-all duration-200 ${
                        active
                          ? 'border-primary/45 bg-primary/10 shadow-sm ring-1 ring-primary/20 scale-[1.01]'
                          : 'bg-background/85 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/5 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                          }`}
                        >
                          <Wand2 size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {suggestion.label}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                            {suggestion.prompt}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-muted-foreground">
                  Сұрағыңыз
                </label>
                <button
                  type="button"
                  onClick={clearPrompt}
                  disabled={!hasPrompt || isSubmitting}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <Eraser size={12} />
                  Тазалау
                </button>
              </div>

              <textarea
                value={prompt}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setPrompt(nextValue);

                  if (selectedSuggestion && nextValue !== selectedSuggestion.prompt) {
                    setSelectedSuggestionId(null);
                  }
                }}
                placeholder={placeholder}
                rows={6}
                className="min-h-[150px] w-full resize-y rounded-2xl border border-input bg-background/90 px-4 py-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-background text-destructive">
                    <AlertTriangle size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      AI жауабын алу мүмкін болмады
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-2xl border bg-background/75 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                {effectiveDisabled
                  ? visibleDisabledReason
                  : 'AI берілген snapshot пен сұрақ бойынша қысқа, нақты ұсыныс дайындайды.'}
              </p>

              <Button
                type="submit"
                disabled={effectiveDisabled || isSubmitting || !hasPrompt}
                className="shrink-0"
              >
                {isSubmitting ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : (
                  <Send size={14} className="mr-2" />
                )}
                {isSubmitting ? 'Талдау жүріп жатыр...' : 'AI ұсыныс алу'}
              </Button>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border bg-background/90 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                  {answer ? <Bot size={16} /> : <MessageCircle size={16} />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{answerTitle}</p>
                  {lastPrompt ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      Соңғы сұрақ: {lastPrompt}
                    </p>
                  ) : null}
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                disabled={!answer}
              >
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
                {copied ? 'Көшірілді' : 'Көшіру'}
              </Button>
            </div>

            <div className="min-h-[280px] p-4">
              {isSubmitting ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-3 w-2/3 rounded-full bg-muted" />
                  <div className="h-3 w-full rounded-full bg-muted" />
                  <div className="h-3 w-5/6 rounded-full bg-muted" />
                  <div className="mt-5 h-20 rounded-2xl bg-muted" />
                </div>
              ) : renderedAnswer ? (
                <div className="space-y-2 animate-fade-in">{renderedAnswer}</div>
              ) : (
                <div className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/30 p-5 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-background text-primary">
                    <Sparkles size={18} />
                  </div>
                  <p className="mt-3 max-w-sm text-xs leading-5 text-muted-foreground">
                    {emptyAnswerText}
                  </p>
                </div>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
