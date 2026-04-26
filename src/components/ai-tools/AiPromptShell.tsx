import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  HelpCircle,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
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

  const selectedSuggestion = useMemo(
    () => suggestions.find((item) => item.prompt === prompt) || null,
    [suggestions, prompt]
  );

  const hasPrompt = prompt.trim().length > 0;
  const endpointReady = Boolean(onSubmit);
  const effectiveDisabled = disabled || !endpointReady;

  const visibleDisabledReason =
    disabledReason ||
    (!endpointReady
      ? 'AI жауап беру backend-і кейін қосылады. Қазір бұл блок сұрақ сценарийін және context логикасын дайындап тұр.'
      : 'AI қазір уақытша өшірулі.');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (effectiveDisabled || isSubmitting || !hasPrompt || !onSubmit) {
      return;
    }

    await onSubmit({
      prompt: prompt.trim(),
      selectedSuggestionId: selectedSuggestion?.id || null,
    });
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit size={16} />
              {title}
            </CardTitle>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Sparkles size={12} />
            {endpointReady && !disabled ? 'AI қосуға дайын' : 'Дайындық режимі'}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
                <HelpCircle size={16} />
              </div>

              <div>
                <p className="text-sm font-semibold">{contextLabel}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {contextDescription}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Жылдам сұрақтар
            </p>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => {
                const active = selectedSuggestion?.id === suggestion.id;

                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => setPrompt(suggestion.prompt)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-accent'
                    }`}
                  >
                    {suggestion.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Сұрағыңыз
            </label>

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={placeholder}
              rows={5}
              className="min-h-[130px] w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background text-destructive">
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              {effectiveDisabled
                ? visibleDisabledReason
                : 'AI берілген snapshot пен сұрақ бойынша жауап дайындайды.'}
            </p>

            <Button
              type="submit"
              disabled={effectiveDisabled || isSubmitting || !hasPrompt}
            >
              {isSubmitting ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : (
                <Send size={14} className="mr-2" />
              )}
              {isSubmitting ? 'Жауап дайындалуда...' : 'AI ұсыныс алу'}
            </Button>
          </div>

          <div className="rounded-xl border border-dashed bg-background/70 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <MessageCircle size={16} />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold">{answerTitle}</p>

                {answer ? (
                  <div className="mt-2 whitespace-pre-line text-sm leading-7 text-foreground">
                    {answer}
                  </div>
                ) : (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {emptyAnswerText}
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}