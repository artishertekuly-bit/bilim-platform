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
  LearningAiScope,
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
const MAX_PROMPT_CHARS = 4000;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'AI сұранысын орындау кезінде белгісіз қате болды.';
}

function cleanText(value: unknown, limit?: number) {
  const normalized = String(value || '')
    .replace(/\x00/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return typeof limit === 'number' ? normalized.slice(0, limit) : normalized;
}

function toOptionalString(value: unknown, limit = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = cleanText(value, limit);
  return normalized || undefined;
}

function cleanConversationMessageContent(value: unknown) {
  return cleanText(value, MAX_CONVERSATION_MESSAGE_CHARS);
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

function normalizeScope(scope: LearningAiScope | undefined): LearningAiScope | undefined {
  if (!scope) return undefined;

  const normalized: LearningAiScope = {};

  const courseId = toOptionalString(scope.courseId);
  const studentId = toOptionalString(scope.studentId);
  const subjectId = toOptionalString(scope.subjectId);
  const subjectName = toOptionalString(scope.subjectName, 240);
  const gradeLevel = toOptionalString(scope.gradeLevel, 120);
  const targetAudience = toOptionalString(scope.targetAudience, 240);

  if (courseId) normalized.courseId = courseId;
  if (studentId) normalized.studentId = studentId;
  if (subjectId) normalized.subjectId = subjectId;
  if (subjectName) normalized.subjectName = subjectName;
  if (gradeLevel) normalized.gradeLevel = gradeLevel;
  if (targetAudience) normalized.targetAudience = targetAudience;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildLearningAiRequest(
  defaultInput: LearningAiAnalysisInput,
  payload: AiPromptSubmitPayload,
  override?: LearningAiSubmitOverride
): LearningAiRequest {
  const prompt = cleanText(payload.prompt, MAX_PROMPT_CHARS);
  const selectedSuggestionId = toOptionalString(payload.selectedSuggestionId, 160);
  const mergedScope = normalizeScope({
    ...(defaultInput.scope || {}),
    ...(override?.scope || {}),
  });

  return {
    ...defaultInput,
    ...override,
    prompt,
    selectedSuggestionId,
    conversationHistory: normalizeConversationHistory(payload.conversationHistory),
    ...(mergedScope ? { scope: mergedScope } : { scope: undefined }),
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
  const isMountedRef = useRef(true);

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

      if (!request.prompt) {
        throw new Error('Сұрақ бос болмауы керек.');
      }

      const accessToken = accessTokenRef.current?.trim() || undefined;

      if (!accessToken) {
        throw new Error('AI сұранысы үшін аккаунт авторизациясы қажет.');
      }

      const result = await requestLearningAiAnalysis(request, {
        accessToken,
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
      if (!isMountedRef.current) return;
      if (activeRequestIdRef.current !== requestId) return;

      setAnswer(null);
      setLastResponse(null);
      setLastRequest(null);
      setError(null);
    },

    onSuccess: ({ data, request, requestId }) => {
      if (!isMountedRef.current) return;
      if (activeRequestIdRef.current !== requestId) return;

      setAnswer(data.answer);
      setLastResponse(data);
      setLastRequest(request);
      setError(null);
    },

    onError: (caughtError, variables) => {
      if (!isMountedRef.current) return;
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

      if (!isConfigured) {
        setAnswer(null);
        setLastResponse(null);
        setLastRequest(null);
        setError('AI backend endpoint әлі қосылмаған.');
        return;
      }

      const prompt = cleanText(payload.prompt, MAX_PROMPT_CHARS);
      if (!prompt) {
        setAnswer(null);
        setLastResponse(null);
        setLastRequest(null);
        setError('Сұрақ бос болмауы керек.');
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        await mutation.mutateAsync({
          payload: {
            ...payload,
            prompt,
          },
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
    [isConfigured, mutation]
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
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
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

    contextSummary: lastResponse?.contextSummary ?? null,
    confidence: lastResponse?.confidence ?? null,
    warnings: lastResponse?.warnings ?? [],
    followUpPrompts: lastResponse?.followUpPrompts ?? [],
    usedContext: lastResponse?.usedContext ?? null,

    isConfigured,
    isSubmitting: mutation.isPending,
  };
}
