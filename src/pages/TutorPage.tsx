// AI Tutor чаты (architect/v2/lightrag_personarag.md, api-kelisimderi.md §4, D39, D40, D70).
// Tutor баға қоймайды және әрқашан қолжетімді (бұғаттан басқа кезде). Прогресс бөлек экранда емес:
// оқушы оны тьютордан «Не үйрендік?» деп сұрайды.
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { Banner, Card, Chip, ExamScreen, LoadingBlock, SimpleHeader } from '@/components/exam/ExamUi';
import {
  MAX_TUTOR_MESSAGE_CHARS,
  TutorApiError,
  formatBlockedUntil,
  newRequestId,
  tutorKeys,
  useTutorApi,
  type BlockedReason,
  type TutorMessage,
} from '@/lib/tutor-api';
import { cn } from '@/lib/utils';

const STARTERS = ['Қазақ хандығы қалай құрылды?', 'Сақтар туралы айтшы', 'Не үйрендік?'];

interface ChatLine {
  key: string;
  role: 'student' | 'tutor';
  text: string;
  pending?: boolean;
}

interface FailedSend {
  text: string;
  requestId: string;
  message: string;
}

function toLine(message: TutorMessage): ChatLine {
  return { key: message.message_id, role: message.role, text: message.text };
}

function blockedText(reason: BlockedReason, until: string | null): string {
  if (reason === 'teacher') return 'Әңгіме мұғалім ашқанша жабық. Мұғаліміңе хабарлас.';
  return `Әңгіме уақытша тоқтатылды${until ? `, ${formatBlockedUntil(until)}-де қайта ашылады` : ''}.`;
}

export default function TutorPage() {
  const api = useTutorApi();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [blocked, setBlocked] = useState<{ reason: BlockedReason; until: string | null } | null>(null);
  const [failed, setFailed] = useState<FailedSend | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const subjects = useQuery({ queryKey: tutorKeys.subjects, queryFn: api.subjects });
  const activeSubject = subjectId ?? subjects.data?.[0]?.id ?? null;
  const conversation = useQuery({
    queryKey: tutorKeys.conversation(activeSubject ?? ''),
    queryFn: () => api.currentConversation(activeSubject as string),
    enabled: !!activeSubject,
    staleTime: Infinity,
  });

  useEffect(() => {
    const data = conversation.data;
    if (!data) return;
    setLines(data.messages.map(toLine));
    setHasMore(data.messages.length >= 30);
    setBlocked(data.blocked_reason ? { reason: data.blocked_reason, until: data.blocked_until } : null);
    setSuggestions(data.messages.length ? [] : STARTERS);
  }, [conversation.data]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  // Cooldown таймері біткенде диалог өзі ашылады (D70).
  useEffect(() => {
    if (blocked?.reason !== 'cooldown' || !blocked.until) return;
    const wait = new Date(blocked.until).getTime() - Date.now();
    const timer = window.setTimeout(() => setBlocked(null), Math.max(0, wait) + 1000);
    return () => window.clearTimeout(timer);
  }, [blocked]);

  const conversationId = conversation.data?.conversation_id;

  const loadOlder = useCallback(async () => {
    const first = lines.find((line) => !line.key.startsWith('local-'));
    if (!conversationId || !first) return;
    try {
      const page = await api.messages(conversationId, first.key);
      setLines((current) => [...page.messages.map(toLine), ...current]);
      setHasMore(page.has_more);
    } catch (err) {
      setNotice((err as Error).message);
    }
  }, [api, conversationId, lines]);

  const send = useCallback(
    async (text: string, requestId: string = newRequestId()) => {
      const clean = text.trim();
      if (!conversationId || !clean || sending) return;
      setSending(true);
      setFailed(null);
      setNotice(null);
      setSuggestions([]);
      const tutorKey = `local-tutor-${requestId}`;
      setLines((current) => [
        ...current.filter((line) => line.key !== `local-student-${requestId}` && line.key !== tutorKey),
        { key: `local-student-${requestId}`, role: 'student', text: clean },
        { key: tutorKey, role: 'tutor', text: '', pending: true },
      ]);
      const controller = new AbortController();
      abortRef.current = controller;
      const dropPending = () => setLines((current) => current.filter((line) => line.key !== tutorKey));
      try {
        await api.send(
          conversationId,
          clean,
          {
            onToken: (chunk) =>
              setLines((current) =>
                current.map((line) => (line.key === tutorKey ? { ...line, text: line.text + chunk } : line)),
              ),
            onDone: (payload) => {
              setLines((current) =>
                current.map((line) =>
                  line.key === tutorKey ? { ...line, key: payload.message_id, pending: false } : line,
                ),
              );
              setSuggestions(payload.suggestions ?? []);
            },
            onBlocked: (payload) => {
              setLines((current) =>
                current.map((line) =>
                  line.key === tutorKey ? { ...line, text: payload.message, pending: false } : line,
                ),
              );
              setBlocked({ reason: payload.blocked_reason, until: payload.blocked_until });
            },
            onError: (error) => {
              dropPending();
              setFailed({ text: clean, requestId, message: error.message });
            },
          },
          requestId,
          controller.signal,
        );
      } catch (err) {
        dropPending();
        const error = err as TutorApiError;
        if (error.code === 'TUTOR_BLOCKED') {
          const reason = (error.details.blocked_reason as BlockedReason | undefined) ?? 'cooldown';
          setBlocked({ reason, until: (error.details.blocked_until as string | null | undefined) ?? null });
          setLines((current) => current.filter((line) => line.key !== `local-student-${requestId}`));
        } else if (error.code === 'RATE_LIMITED') {
          setLines((current) => current.filter((line) => line.key !== `local-student-${requestId}`));
          setNotice(error.message);
          setDraft(clean);
        } else {
          setFailed({ text: clean, requestId, message: error.message });
        }
      } finally {
        setSending(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [api, conversationId, sending],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft;
    setDraft('');
    void send(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit(event);
    }
  };

  const inputDisabled = !conversationId || sending || !!blocked;
  const subjectTitle = useMemo(
    () => subjects.data?.find((subject) => subject.id === activeSubject)?.title,
    [subjects.data, activeSubject],
  );

  const loadError = (subjects.error ?? conversation.error) as TutorApiError | null;

  return (
    <ExamScreen
      header={<SimpleHeader title={subjectTitle ? `Тьютор · ${subjectTitle}` : 'Тьютор'} to="/dashboard" label="Артқа" />}
      footer={
        conversationId ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-2">
            {blocked ? <Banner tone="warn">{blockedText(blocked.reason, blocked.until)}</Banner> : null}
            {notice ? <Banner tone="info">{notice}</Banner> : null}
            {failed ? (
              <div className="flex items-center gap-2">
                <Banner tone="bad">{failed.message}</Banner>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void send(failed.text, failed.requestId)}
                  className="h-10 shrink-0 rounded-xl border border-[#D9D6D0] bg-white px-3 text-sm font-semibold disabled:opacity-60"
                >
                  Қайталау
                </button>
              </div>
            ) : null}
            {suggestions.length && !blocked ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={inputDisabled}
                    onClick={() => void send(suggestion)}
                    className="rounded-full border border-[#D9D6D0] bg-white px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={draft}
                maxLength={MAX_TUTOR_MESSAGE_CHARS}
                disabled={inputDisabled}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={blocked ? 'Әңгіме жабық' : 'Тарихтан сұрағыңды жаз…'}
                aria-label="Хабарлама"
                className="min-h-[48px] flex-1 resize-none rounded-2xl border border-[#D9D6D0] bg-white px-3.5 py-3 text-[15px] outline-none focus:border-[#111111] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={inputDisabled || !draft.trim()}
                className="h-12 shrink-0 rounded-2xl bg-[#121212] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? '…' : 'Жіберу'}
              </button>
            </div>
          </form>
        ) : undefined
      }
    >
      {subjects.isPending || conversation.isPending ? <LoadingBlock /> : null}
      {loadError ? <Banner tone="bad">{loadError.message}</Banner> : null}
      {subjects.data && subjects.data.length === 0 ? (
        <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">Тьютор әзірге бірде-бір пәнге дайын емес.</Card>
      ) : null}
      {subjects.data && subjects.data.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {subjects.data.map((subject) => (
            <button key={subject.id} type="button" onClick={() => setSubjectId(subject.id)}>
              <Chip tone={subject.id === activeSubject ? 'good' : 'neutral'}>{subject.title}</Chip>
            </button>
          ))}
        </div>
      ) : null}

      {conversation.data && lines.length === 0 ? (
        <Card className="flex flex-col gap-1.5 px-4 py-4">
          <span className="text-[17px] font-bold">Сәлем! Мен — тарих тьюторыңмын.</span>
          <span className="text-sm leading-snug text-[#5E5E5E]">
            Кез келген сұрақ қой: түсіндіріп, бірге ойланамыз. Мен баға қоймаймын, мұнда қателесуге болады.
            Не үйренгеніңді білгің келсе, «Не үйрендік?» деп сұра.
          </span>
        </Card>
      ) : null}

      {hasMore ? (
        <button type="button" onClick={() => void loadOlder()} className="text-center text-sm font-semibold text-[#5E5E5E]">
          Ертеректегі хабарламалар
        </button>
      ) : null}

      <div className="flex flex-col gap-2.5" aria-live="polite">
        {lines.map((line) => (
          <div
            key={line.key}
            className={cn(
              'max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed',
              line.role === 'student'
                ? 'self-end bg-[#121212] text-white'
                : 'self-start border border-[#E2E0DB] bg-white text-[#111111]',
            )}
          >
            {line.text || (line.pending ? <span className="text-[#8A8A8A]">Ойланып жатыр…</span> : null)}
          </div>
        ))}
      </div>
      <div ref={endRef} />
    </ExamScreen>
  );
}
