import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth-context';
import type { AiPromptSubmitPayload } from '@/components/ai-tools/AiPromptShell';
import {
  isLearningAiConfigured,
  requestLearningAiAnalysis,
} from '@/lib/ai/learning-ai-client';
import type {
  LearningAiConversationMessage,
  LearningAiRequest,
  LearningAiResponse,
} from '@/lib/ai/learning-ai-types';

type LearningAiAnalysisInput = Omit<
  LearningAiRequest,
  'prompt' | 'selectedSuggestionId' | 'conversationHistory'
>;

export type LearningAiSubmitOverride = Partial<LearningAiAnalysisInput>;

type MutationVariables = {
  payload: AiPromptSubmitPayload;
  override?: LearningAiSubmitOverride;
  requestId: number;
  signal: AbortSignal;
};

type MutationSuccess = {
  data: LearningAiResponse;
  request: LearningAiRequest;
  requestId: number;
};

const MAX_CONVERSATION_HISTORY_MESSAGES = 8;
const MAX_CONVERSATION_MESSAGE_CHARS = 6000;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'AI сұранысын орындау кезінде белгісіз қате болды.';
}

function cleanConversationMessageContent(value: unknown) {
  return String(value || '')
    .replace(/\x00/g, ' ')
    .trim()
    .slice(0, MAX_CONVERSATION_MESSAGE_CHARS);
}

function normalizeConversationHistory(
  history: AiPromptSubmitPayload['conversationHistory']
): LearningAiConversationMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-MAX_CONVERSATION_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: cleanConversationMessageContent(message.content),
    }))
    .filter((message) => message.content.length > 0);
}

function buildLearningAiRequest(
  defaultInput: LearningAiAnalysisInput,
  payload: AiPromptSubmitPayload,
  override?: LearningAiSubmitOverride
): LearningAiRequest {
  return {
    ...defaultInput,
    ...override,
    prompt: payload.prompt,
    selectedSuggestionId: payload.selectedSuggestionId,
    conversationHistory: normalizeConversationHistory(payload.conversationHistory),
    scope: {
      ...(defaultInput.scope || {}),
      ...(override?.scope || {}),
    },
  };
}

export function useLearningAiAnalysis(defaultInput: LearningAiAnalysisInput) {
  const { session } = useAuth();

  const [answer, setAnswer] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<LearningAiResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<LearningAiRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultInputRef = useRef(defaultInput);
  const accessTokenRef = useRef<string | null>(session?.access_token || null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestCounterRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);

  const isConfigured = useMemo(() => isLearningAiConfigured(), []);

  useEffect(() => {
    defaultInputRef.current = defaultInput;
  }, [defaultInput]);

  useEffect(() => {
    accessTokenRef.current = session?.access_token || null;
  }, [session?.access_token]);

  const mutation = useMutation<MutationSuccess, Error, MutationVariables>({
    mutationFn: async ({ payload, override, requestId, signal }) => {
      const request = buildLearningAiRequest(
        defaultInputRef.current,
        payload,
        override
      );

      const result = await requestLearningAiAnalysis(request, {
        accessToken: accessTokenRef.current,
        signal,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      return {
        data: result.data,
        request,
        requestId,
      };
    },

    onMutate: ({ requestId }) => {
      if (activeRequestIdRef.current !== requestId) return;

      setAnswer(null);
      setLastResponse(null);
      setLastRequest(null);
      setError(null);
    },

    onSuccess: ({ data, request, requestId }) => {
      if (activeRequestIdRef.current !== requestId) return;

      setAnswer(data.answer);
      setLastResponse(data);
      setLastRequest(request);
      setError(null);
    },

    onError: (caughtError, variables) => {
      if (activeRequestIdRef.current !== variables.requestId) return;

      setAnswer(null);
      setLastResponse(null);
      setLastRequest(null);
      setError(getErrorMessage(caughtError));
    },
  });

  const submit = useCallback(
    async (
      payload: AiPromptSubmitPayload,
      override?: LearningAiSubmitOverride
    ) => {
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
    setLastRequest(null);
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
    lastRequest,

    isConfigured,
    isSubmitting: mutation.isPending,
  };
}