import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type MutationVariables = {
  payload: AiPromptSubmitPayload;
  override?: SubmitOverride;
  requestId: number;
  signal: AbortSignal;
};

type MutationSuccess = {
  data: LearningAiResponse;
  requestId: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'AI сұранысын орындау кезінде белгісіз қате болды.';
}

export function useLearningAiAnalysis(defaultInput: LearningAiAnalysisInput) {
  const { session } = useAuth();

  const [answer, setAnswer] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<LearningAiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestCounterRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);

  const isConfigured = useMemo(() => isLearningAiConfigured(), []);

  const mutation = useMutation<MutationSuccess, Error, MutationVariables>({
    mutationFn: async ({ payload, override, requestId, signal }) => {
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
        signal,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      return {
        data: result.data,
        requestId,
      };
    },

    onMutate: ({ requestId }) => {
      if (activeRequestIdRef.current !== requestId) return;

      setAnswer(null);
      setLastResponse(null);
      setError(null);
    },

    onSuccess: ({ data, requestId }) => {
      if (activeRequestIdRef.current !== requestId) return;

      setAnswer(data.answer);
      setLastResponse(data);
      setError(null);
    },

    onError: (caughtError, variables) => {
      if (activeRequestIdRef.current !== variables.requestId) return;

      setAnswer(null);
      setLastResponse(null);
      setError(getErrorMessage(caughtError));
    },
  });

  const submit = useCallback(
    async (payload: AiPromptSubmitPayload, override?: SubmitOverride) => {
      abortControllerRef.current?.abort();

      const requestId = requestCounterRef.current + 1;
      requestCounterRef.current = requestId;
      activeRequestIdRef.current = requestId;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        await mutation.mutateAsync({
          payload,
          override,
          requestId,
          signal: abortController.signal,
        });
      } catch {
        // Error state is handled inside onError.
        // Do not rethrow, because AiPromptShell should not receive an unhandled promise rejection.
      } finally {
        if (activeRequestIdRef.current === requestId) {
          abortControllerRef.current = null;
        }
      }
    },
    [mutation]
  );

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRequestIdRef.current = null;

    setAnswer(null);
    setLastResponse(null);
    setError(null);

    mutation.reset();
  }, [mutation]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      activeRequestIdRef.current = null;
    };
  }, []);

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