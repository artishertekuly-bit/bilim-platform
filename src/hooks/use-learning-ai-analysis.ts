import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth-context';
import type { AiPromptSubmitPayload } from '@/components/ai-tools/AiPromptShell';
import {
  isLearningAiConfigured,
  requestLearningAiAnalysis,
} from '@/lib/ai/learning-ai-client';
import type {
  LearningAiRequest,
  LearningAiResponse,
} from '@/lib/ai/learning-ai-types';

type LearningAiAnalysisInput = Omit<
  LearningAiRequest,
  'prompt' | 'selectedSuggestionId'
>;

type SubmitOverride = Partial<LearningAiAnalysisInput>;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'AI сұранысын орындау кезінде белгісіз қате болды.';
}

export function useLearningAiAnalysis(defaultInput: LearningAiAnalysisInput) {
  const { session } = useAuth();

  const [answer, setAnswer] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<LearningAiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = useMemo(() => isLearningAiConfigured(), []);

  const mutation = useMutation({
    mutationFn: async ({
      payload,
      override,
    }: {
      payload: AiPromptSubmitPayload;
      override?: SubmitOverride;
    }) => {
      const request: LearningAiRequest = {
        ...defaultInput,
        ...override,
        prompt: payload.prompt,
        selectedSuggestionId: payload.selectedSuggestionId,
        scope: {
          ...(defaultInput.scope || {}),
          ...(override?.scope || {}),
        },
      };

      const result = await requestLearningAiAnalysis(request, {
        accessToken: session?.access_token || null,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onMutate: () => {
      setError(null);
    },
    onSuccess: (data) => {
      setAnswer(data.answer);
      setLastResponse(data);
      setError(null);
    },
    onError: (caughtError) => {
      setError(getErrorMessage(caughtError));
    },
  });

  const submit = useCallback(
    async (payload: AiPromptSubmitPayload, override?: SubmitOverride) => {
      await mutation.mutateAsync({
        payload,
        override,
      });
    },
    [mutation]
  );

  const reset = useCallback(() => {
    setAnswer(null);
    setLastResponse(null);
    setError(null);
    mutation.reset();
  }, [mutation]);

  return {
    submit,
    reset,

    answer,
    error,
    lastResponse,

    isConfigured,
    isSubmitting: mutation.isPending,
  };
}