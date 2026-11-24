// AI Tutor (дизайн: Tutor.dc.html, TutorStates.dc.html; api §4, D39, D40, D70).
// Tutor баға қоймайды. Әр пәннің диалогы бөлек; бұғат — уақытша (cooldown) немесе мұғалім жапқан.
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { ChevronDownIcon, SendIcon } from '@/components/bl/icons';
import { Banner, BareScreen, Button, ButtonLink, ErrorNote, LoadingBlock, StateCard, TopBar } from '@/components/bl/ui';
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
import { readTutorDraft } from '@/modules/simulation-lab/services/tutor-bridge';

const STARTERS = ['Бұл тақырыпты түсіндірші', 'Мысал келтірші', 'Не үйрендік?'];
const SUBJECT_KEY = 'bilim.tutor.subject';

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

function readSubject(): string | null {
  try {
    return window.localStorage.getItem(SUBJECT_KEY);
  } catch {
    return null;
  }
}

function ClockMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
    </svg>
  );
}

function LockMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function TutorPage() {
  const api = useTutorApi();
  const location = useLocation();
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState<string | null>(readSubject);
  const [picking, setPicking] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [hasMore, setHasMore] = useState(false);
  // Зертхана (D92) дайын хабарды router state арқылы береді: ол тек жолаққа жазылады, оқушы өзі жібереді.
  const [draft, setDraft] = useState(() => readTutorDraft(location.state) ?? '');
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [blocked, setBlocked] = useState<{ reason: BlockedReason; until: string | null } | null>(null);
  const [failed, setFailed] = useState<FailedSend | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const subjects = useQuery({ queryKey: tutorKeys.subjects, queryFn: api.subjects });
  const activeSubject =
    subjectId && subjects.data?.some((s) => s.id === subjectId) ? subjectId : subjects.data?.[0]?.id ?? null;
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
    setFailed(null);
    setNotice(null);
  }, [conversation.data]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Дайын хабар бір рет қана қойылады: бетті жаңартқанда қайта шықпауы үшін state тазаланады.
  useEffect(() => {
    if (readTutorDraft(location.state)) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  // Cooldown біткенде диалог өзі ашылады (D70).
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
              setLines((current) => current.map((line) => (line.key === tutorKey ? { ...line, text: line.text + chunk } : line))),
            onDone: (payload) => {
              setLines((current) =>
                current.map((line) => (line.key === tutorKey ? { ...line, key: payload.message_id, pending: false } : line)),
              );
              setSuggestions(payload.suggestions ?? []);
            },
            onBlocked: (payload) => {
              setLines((current) =>
                current.map((line) => (line.key === tutorKey ? { ...line, text: payload.message, pending: false } : line)),
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

  const subject = useMemo(() => subjects.data?.find((s) => s.id === activeSubject), [subjects.data, activeSubject]);
  const loadError = (subjects.error ?? conversation.error) as TutorApiError | null;
  const inputDisabled = !conversationId || sending || !!blocked;

  const pickSubject = (id: string) => {
    abortRef.current?.abort();
    setSubjectId(id);
    try {
      window.localStorage.setItem(SUBJECT_KEY, id);
    } catch {
      /* жеке терезеде сақталмауы мүмкін */
    }
    setPicking(false);
  };

  if (picking) {
    return (
      <BareScreen header={<TopBar onBack={() => setPicking(false)} backLabel="Тьюторға оралу" title="Пән таңдау" />}>
        <div className="flex flex-col gap-3 px-4 pb-5 pt-4">
          <p className="m-0 text-[15px] leading-normal text-bl-ink2">
            Әр пәннің диалогы бөлек сақталады. Пәнге оралсаңыз, әңгіме тоқтаған жерінен жалғасады.
          </p>
          <div role="radiogroup" aria-label="Пән" className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
            {(subjects.data ?? []).map((s) => {
              const on = s.id === activeSubject;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickSubject(s.id)}
                  className={cn('flex min-h-[60px] w-full items-center gap-3 border-0 px-4 py-2.5 text-left text-bl-ink', on ? 'bg-[#F1EFEA]' : 'bg-white')}
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{s.title}</span>
                    <span className="text-[13px] text-bl-ink2">{s.grade}-сынып</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn('box-border h-[22px] w-[22px] flex-none rounded-full bg-white', on ? 'border-[7px] border-bl-ink' : 'border-2 border-bl-field')}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </BareScreen>
    );
  }

  const header = (
    <header className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-5 lg:mx-auto lg:w-full lg:max-w-[1040px] lg:px-10 lg:pt-8">
      <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">Тьютор</h1>
      {subjects.data && subjects.data.length ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-label={subject ? `Пәнді ауыстыру: ${subject.title}, ${subject.grade}-сынып` : 'Пән таңдау'}
          className="box-border flex h-11 items-center gap-1.5 rounded-full border border-bl-line bg-white px-3.5 text-sm font-semibold text-bl-ink"
        >
          {subject ? `${subject.title} · ${subject.grade}-сынып` : 'Пән таңдау'}
          <ChevronDownIcon size={16} />
        </button>
      ) : null}
    </header>
  );

  // TutorStates.dc.html: уақытша жабық және мұғалім жапқан күйлер — диалог орнына.
  if (blocked && !lines.some((l) => l.pending)) {
    return (
      <AppShell>
        {header}
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 pb-6 pt-4 lg:max-w-[640px]">
          {blocked.reason === 'teacher' ? (
            <StateCard
              mark={<LockMark />}
              markTone="dark"
              title="Мұғалім диалогты жапты"
              text="Мұғалім ашқанша Тьютор жауап бермейді. Сұрағыңыз болса, мұғаліміңізге жазыңыз."
            >
              <ButtonLink to="/chat">Мұғалімге жазу</ButtonLink>
            </StateCard>
          ) : (
            <StateCard
              mark={<ClockMark />}
              markTone="dark"
              title="Тьютор біраз уақытқа жабылды"
              text={
                <>
                  Соңғы хабарламада қауіпсіздік ережесіне қайшы мәтін болды. Мұғалімге тек осы хабарлама көрсетілді, қалған диалог жеке
                  қалады.
                  {blocked.until ? (
                    <span className="mt-3 block text-[15px] font-bold text-bl-ink">{formatBlockedUntil(blocked.until)}-та қайта ашылады</span>
                  ) : null}
                </>
              }
            >
              <p className="m-0 text-sm leading-normal text-bl-ink2">Мұғалім оны ертерек ашуы мүмкін. Осы уақытта Емтихан мен Сабақтар ашық.</p>
              <ButtonLink to="/lessons" variant="secondary" size="md">
                Сабақтарға өту
              </ButtonLink>
            </StateCard>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fill>
      {header}
      {/* Ноутбукта (дизайн: DesktopStudent.dc.html «Тьютор») диалог ақ картада, оң жақта қысқа панель. */}
      <div className="flex min-h-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[1040px] lg:flex-row lg:gap-6 lg:px-10 lg:pb-6">
      <section aria-label="Тьютор диалогы" className="flex min-h-0 flex-1 flex-col lg:overflow-hidden lg:rounded-[18px] lg:border lg:border-bl-line lg:bg-white">
      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 px-4 pb-4 pt-1.5 lg:max-w-none lg:px-5 lg:pt-5">
          {subjects.isPending || conversation.isPending ? <LoadingBlock rows={2} /> : null}
          {loadError ? <ErrorNote error={loadError} onRetry={() => (subjects.isError ? subjects.refetch() : conversation.refetch())} /> : null}
          {subjects.data && subjects.data.length === 0 ? <Banner tone="info">Тьютор әзірге бірде-бір пәнге дайын емес.</Banner> : null}

          {conversation.data && lines.length === 0 ? (
            <div className="flex max-w-[88%] flex-col gap-2 self-start rounded-[16px_16px_16px_4px] border border-bl-line bg-white p-3.5 text-[15px] leading-normal lg:bg-bl-bg">
              <p className="m-0 font-semibold">Сәлем! Мен — {subject?.title ?? 'пән'} тьюторыңмын.</p>
              <p className="m-0">
                Кез келген сұрақ қой: оқулық бойынша түсіндіріп, бірге ойланамыз. Мен баға қоймаймын, мұнда қателесуге болады. Не
                үйренгеніңді білгің келсе, «Не үйрендік?» деп сұра.
              </p>
            </div>
          ) : null}

          {hasMore ? (
            <button type="button" onClick={() => void loadOlder()} className="min-h-11 border-0 bg-transparent text-center text-sm font-semibold text-bl-ink2">
              Ертеректегі хабарламалар
            </button>
          ) : null}

          {lines.map((line) =>
            line.role === 'student' ? (
              <div
                key={line.key}
                className="max-w-[82%] self-end whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-bl-ink px-3.5 py-3 text-[15px] leading-[1.45] text-white lg:max-w-[78%]"
              >
                {line.text}
              </div>
            ) : line.pending && !line.text ? (
              <div
                key={line.key}
                className="flex items-center gap-1.5 self-start rounded-[16px_16px_16px_4px] border border-bl-line bg-white px-3.5 py-3 text-sm text-bl-ink2"
              >
                Тьютор жазып жатыр…
              </div>
            ) : (
              <div
                key={line.key}
                className="max-w-[88%] self-start whitespace-pre-wrap rounded-[16px_16px_16px_4px] border border-bl-line bg-white p-3.5 text-[15px] leading-normal lg:max-w-[78%] lg:bg-bl-bg"
              >
                {line.text}
              </div>
            ),
          )}

          {suggestions.length && !inputDisabled ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="h-11 rounded-full border border-bl-field bg-white px-4 text-sm font-semibold text-bl-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      {conversationId ? (
        <form onSubmit={onSubmit} className="border-t border-bl-line bg-bl-bg lg:bg-white">
          <div className="mx-auto flex w-full max-w-[480px] flex-col gap-2 px-4 py-2.5 lg:max-w-none lg:px-5 lg:py-3.5">
            {notice ? <Banner tone="info">{notice}</Banner> : null}
            {failed ? (
              <Banner tone="bad">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  {failed.message}
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void send(failed.text, failed.requestId)}
                    className="min-h-9 border-0 bg-transparent p-0 text-sm font-semibold text-bl-badtext underline"
                  >
                    Қайталау
                  </button>
                </span>
              </Banner>
            ) : null}
            <div className="flex items-end gap-2">
              <label htmlFor="tutor-ask" className="sr-only">
                Сұрағыңыз
              </label>
              <textarea
                id="tutor-ask"
                rows={1}
                value={draft}
                maxLength={MAX_TUTOR_MESSAGE_CHARS}
                disabled={inputDisabled}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Сұрағыңызды жазыңыз"
                className="box-border max-h-[120px] min-h-12 flex-1 resize-none rounded-[14px] border border-bl-field bg-white px-3.5 py-3 text-base leading-[1.4] text-bl-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label="Жіберу"
                disabled={inputDisabled || !draft.trim()}
                className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] border-0 bg-bl-btn text-white disabled:bg-bl-handle disabled:text-bl-ink3"
              >
                <SendIcon size={20} />
              </button>
            </div>
          </div>
        </form>
      ) : null}
      </section>
      <aside aria-label="Тьютор туралы" className="hidden lg:flex lg:w-[260px] lg:flex-none lg:flex-col lg:gap-3">
        <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
          <h2 className="m-0 text-[15px] font-bold">Осы әңгімеде</h2>
          <span className="text-sm leading-[1.45] text-bl-ink3">
            {subject ? `${subject.title} · ${subject.grade}-сынып` : 'Пән таңдалмаған'}
            {lines.length ? ` · ${lines.length} хабарлама` : ''}
          </span>
          <Button variant="secondary" size="sm" full={false} className="self-start" disabled={inputDisabled} onClick={() => void send('Не үйрендік?')}>
            Не үйрендік?
          </Button>
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
          <h2 className="m-0 text-[15px] font-bold">Тексеріп көресіз бе?</h2>
          <span className="text-sm leading-[1.45] text-bl-ink3">Түсінгеніңізді Емтиханда тексеріңіз: кез келген деңгейден бастауға болады.</span>
          <ButtonLink to="/exam" size="md">
            Емтиханға өту
          </ButtonLink>
        </section>
      </aside>
      </div>
    </AppShell>
  );
}
