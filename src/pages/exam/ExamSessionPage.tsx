// Емтихан сессиясы (1–4-деңгейлер, 13 формат: код, гибрид, ЖИ, таймерлі A-блок және SSE диалог).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  Banner,
  Card,
  CheckIcon,
  CloseIcon,
  ExamScreen,
  LoadingBlock,
  PrimaryButton,
  PrimaryLink,
  SessionHeader,
} from '@/components/exam/ExamUi';
import { DIALOG_FORMATS, FORMAT_COMPONENTS, SUBMIT_ON_PICK } from '@/components/exam/formatRegistry';
import { type Answer, DialogTask } from '@/components/exam/formats';
import {
  type AnswerResult,
  type DialogTurn,
  type ExamSession,
  ExaminerApiError,
  FORMAT_TITLES,
  LEVEL_TITLES,
  type SocraticContent,
  type TeachAiContent,
  newRequestId,
  useExaminerApi,
} from '@/lib/examiner-api';

export default function ExamSessionPage() {
  const { sessionId = '' } = useParams();
  const api = useExaminerApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [session, setSession] = useState<ExamSession | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moderationNotice, setModerationNotice] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  const [dialogTurns, setDialogTurns] = useState<DialogTurn[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [dialogSending, setDialogSending] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestIds = useRef(new Map<string, string>());

  const loaded = useQuery({
    queryKey: ['examiner', 'session', sessionId],
    queryFn: () => api.session(sessionId),
    enabled: Boolean(sessionId),
    retry: false,
  });

  useEffect(() => {
    if (loaded.data && !session) setSession(loaded.data);
  }, [loaded.data, session]);

  useEffect(() => {
    if (session?.status === 'completed' && !feedback) {
      navigate(`/exam/result/${session.session_id}`, { replace: true });
    }
  }, [session, feedback, navigate]);

  const currentItem = feedback ? null : session?.current ?? null;
  const shown = currentItem ?? (feedback && session ? lastItem(session, feedback.item_id) : null);

  useEffect(() => {
    setDialogTurns(currentItem?.turns ?? []);
    setStreamingText('');
    setDialogSending(false);
  }, [currentItem?.item_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A-блок таймері
  useEffect(() => {
    if (!currentItem || currentItem.block !== 'A' || !currentItem.deadline_at || feedback) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [currentItem?.item_id, currentItem?.block, currentItem?.deadline_at, feedback]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2-саты: қате жауап түсіндірмесін асинхрон сұрау
  useEffect(() => {
    if (!feedback || feedback.check !== 'incorrect' || feedback.explanation !== 'pending') {
      setExplanationText(null);
      setExplanationLoading(false);
      return;
    }
    let cancelled = false;
    setExplanationLoading(true);
    setExplanationText(null);

    const poll = async () => {
      for (let attempt = 0; attempt < 15; attempt++) {
        if (cancelled) return;
        try {
          const res = await api.explanation(sessionId, feedback.item_id);
          if (cancelled) return;
          if (res.status === 'ready') {
            setExplanationText(res.text);
            setExplanationLoading(false);
            return;
          }
          if (res.status === 'failed') {
            setExplanationLoading(false);
            return;
          }
        } catch {
          if (cancelled) return;
        }
        await new Promise((r) => window.setTimeout(r, 1000));
      }
      if (!cancelled) setExplanationLoading(false);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [feedback, sessionId, api]);

  // Егер алдыңғы тапсырма pending күйінде қалса (ЖИ провайдері кідірсе), күйін сұрау
  useEffect(() => {
    if (!session || session.status !== 'active' || session.current || feedback) return;
    const id = window.setInterval(() => {
      void api.session(sessionId).then((fresh) => setSession(fresh)).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(id);
  }, [session, feedback, sessionId, api]);

  const formatRef = useRef<string | null>(null);
  const sendRef = useRef<(value: Answer | null) => void>(() => undefined);
  const onAnswerChange = useCallback((value: Answer | null) => {
    setAnswer(value);
    if (formatRef.current && SUBMIT_ON_PICK.has(formatRef.current)) sendRef.current(value);
  }, []);

  const submit = useMutation({
    mutationFn: ({ itemId, value }: { itemId: string; value: Answer }) => {
      let requestId = requestIds.current.get(itemId);
      if (!requestId) {
        requestId = newRequestId();
        requestIds.current.set(itemId, requestId);
      }
      return api.answer(sessionId, itemId, value, requestId);
    },
    onSuccess: (result, variables) => {
      setError(null);
      if (result.moderation?.retry_allowed) {
        requestIds.current.delete(variables.itemId);
        setModerationNotice(result.moderation.message);
        setSession(result.session);
        return;
      }
      setModerationNotice(null);
      if (result.session.status === 'blocked') {
        setSession(result.session);
        void queryClient.invalidateQueries({ queryKey: ['examiner', 'active'] });
        return;
      }
      setFeedback(result);
      void queryClient.invalidateQueries({ queryKey: ['examiner', 'active'] });
    },
    onError: (err, variables) => {
      if (err instanceof ExaminerApiError) {
        if (err.code === 'VALIDATION_ERROR' || err.code === 'ANSWER_FILTERED') {
          requestIds.current.delete(variables.itemId);
        } else if (err.code === 'SESSION_BLOCKED') {
          void api.session(sessionId).then(setSession).catch(() => undefined);
        }
      }
      setError(err instanceof Error ? err.message : 'Жауап жіберілмеді.');
    },
  });

  const abandon = useMutation({
    mutationFn: () => api.abandon(sessionId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['examiner'] });
      navigate('/exam');
    },
  });

  const handleSendDialogTurn = async (text: string): Promise<boolean> => {
    if (!currentItem || dialogSending) return false;
    setError(null);
    setModerationNotice(null);
    setDialogSending(true);
    setStreamingText('');
    const nextTurnNo = dialogTurns.length + 1;
    let accumulated = '';
    try {
      await api.streamTurn(sessionId, currentItem.item_id, text, {
        onToken: (chunk) => {
          accumulated += chunk;
          setStreamingText(accumulated);
        },
        onDone: (done) => {
          setStreamingText('');
          setDialogSending(false);
          if (done.moderation) {
            if (done.moderation.retry_allowed) {
              setModerationNotice(done.moderation.message);
            }
            setSession(done.session);
            return;
          }
          setDialogTurns((prev) => [
            ...prev,
            { turn_no: done.turn_no ?? nextTurnNo, student_text: text, examiner_text: accumulated },
          ]);
          if (done.dialog_complete) {
            void queryClient.invalidateQueries({ queryKey: ['examiner'] });
            setSession(done.session);
          }
        },
        onError: (apiErr) => {
          setStreamingText('');
          setDialogSending(false);
          setError(apiErr.message);
        },
      });
      return true;
    } catch (err) {
      setStreamingText('');
      setDialogSending(false);
      setError(err instanceof Error ? err.message : 'Диалог сұранысы сәтсіз болды.');
      return false;
    }
  };

  const next = () => {
    if (!feedback) return;
    const updated = feedback.session;
    setFeedback(null);
    setAnswer(null);
    setError(null);
    setModerationNotice(null);
    setExplanationText(null);
    if (updated.status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['examiner'] });
      navigate(`/exam/result/${updated.session_id}`, { replace: true });
      return;
    }
    setSession(updated);
  };

  if (loaded.isError) {
    return (
      <ExamScreen footer={<PrimaryLink to="/exam">Емтихандарға оралу</PrimaryLink>}>
        <Banner tone="bad">{(loaded.error as Error).message}</Banner>
      </ExamScreen>
    );
  }

  if (!session) {
    return (
      <ExamScreen>
        <LoadingBlock />
      </ExamScreen>
    );
  }

  if (session.status === 'abandoned' || session.status === 'blocked') {
    return (
      <ExamScreen footer={<PrimaryLink to="/exam">Емтихандарға оралу</PrimaryLink>}>
        <Banner tone={session.status === 'blocked' ? 'bad' : 'warn'}>
          {session.status === 'abandoned'
            ? 'Бұл емтихан аяқталмай тоқтатылды, сондықтан нәтиже есептелмеді.'
            : 'Сессия ереже бұзушылыққа байланысты уақытша тоқтатылды. Мұғаліміңізге хабарласыңыз.'}
        </Banner>
      </ExamScreen>
    );
  }

  const levelLabel = `${session.level} · ${LEVEL_TITLES[session.level] ?? ''}`;
  const answered = feedback ? feedback.session.progress.answered - 1 : session.progress.answered;
  const total = feedback ? feedback.session.progress.total : session.progress.total;
  const isDialog = Boolean(shown && DIALOG_FORMATS.has(shown.format));
  const Component = shown && !isDialog ? FORMAT_COMPONENTS[shown.format as keyof typeof FORMAT_COMPONENTS] : undefined;
  const locked = Boolean(feedback) || submit.isPending;

  const timerSeconds =
    currentItem?.block === 'A' && currentItem.deadline_at && !feedback
      ? Math.max(0, Math.ceil((Date.parse(currentItem.deadline_at) - nowMs) / 1000))
      : null;

  const send = (value: Answer | null) => {
    if (!shown || !value || locked) return;
    setError(null);
    submit.mutate({ itemId: shown.item_id, value });
  };
  formatRef.current = shown?.format ?? null;
  sendRef.current = send;

  const footer = feedback ? (
    <PrimaryButton onClick={next}>
      {feedback.session.status === 'completed' ? 'Нәтижені көру' : 'Келесі'}
    </PrimaryButton>
  ) : !shown || isDialog ? null : SUBMIT_ON_PICK.has(shown.format) ? (
    <PrimaryButton disabled>{submit.isPending ? 'Тексерілуде…' : 'Жауапты таңдаңыз'}</PrimaryButton>
  ) : (
    <PrimaryButton disabled={!answer || submit.isPending} onClick={() => send(answer)}>
      {submit.isPending ? 'Тексерілуде…' : 'Жауап беру'}
    </PrimaryButton>
  );

  return (
    <ExamScreen
      header={
        <SessionHeader
          levelLabel={levelLabel}
          answered={answered}
          total={total}
          timerSeconds={timerSeconds}
          onClose={() => setConfirmExit(true)}
        />
      }
      footer={footer}
    >
      {confirmExit ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#E2E0DB] bg-white p-4" role="alertdialog" aria-label="Емтиханнан шығу">
          <p className="m-0 text-[15px] font-semibold">Емтиханнан шығасыз ба?</p>
          <p className="m-0 text-sm leading-snug text-[#5E5E5E]">
            Аяқталмаған емтихан нәтиже бермейді. Берілген сұрақтар «көрілді» деп саналады.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => abandon.mutate()}
              disabled={abandon.isPending}
              className="h-11 flex-1 rounded-xl bg-[#B42323] text-sm font-semibold text-white"
            >
              Шығу
            </button>
            <button
              type="button"
              onClick={() => setConfirmExit(false)}
              className="h-11 flex-1 rounded-xl border border-[#D9D6D0] bg-white text-sm font-semibold"
            >
              Жалғастыру
            </button>
          </div>
        </div>
      ) : null}

      {moderationNotice ? <Banner tone="warn">{moderationNotice}</Banner> : null}
      {timerSeconds === 0 && !feedback ? (
        <Banner tone="warn">Уақыт аяқталды — жіберілген жауап кешіктірілген деп тіркеледі.</Banner>
      ) : null}

      {shown ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#ECE9E3] px-2.5 py-1 text-xs font-semibold text-[#4A4A4A]">
              {FORMAT_TITLES[shown.format] ?? shown.format}
              {shown.tier === 'X3' ? ' · Деңгей боссы' : ''}
            </span>
            {shown.block === 'A' ? (
              <span className="rounded-full bg-[#ECE9E3] px-2.5 py-1 text-xs font-semibold text-[#111111]">
                A блогы · Таймер
              </span>
            ) : shown.block === 'D' ? (
              <span className="rounded-full bg-[#ECE9E3] px-2.5 py-1 text-xs font-semibold text-[#111111]">
                D блогы · Пайымдау
              </span>
            ) : null}
          </div>

          {isDialog ? (
            <DialogTask
              key={shown.item_id}
              format={shown.format}
              content={shown.content as unknown as SocraticContent | TeachAiContent}
              turns={dialogTurns}
              streamingText={streamingText}
              sending={dialogSending}
              onSendTurn={handleSendDialogTurn}
            />
          ) : Component ? (
            <Component
              key={shown.item_id}
              content={shown.content as never}
              locked={locked}
              verdict={feedback?.item_id === shown.item_id ? (feedback.check === 'pending' ? null : feedback.check) : null}
              onChange={onAnswerChange}
            />
          ) : (
            <Banner tone="warn">Бұл формат әзірге қолдауда жоқ.</Banner>
          )}
        </>
      ) : (
        <Banner tone="info">Жауап бағалануда…</Banner>
      )}

      {feedback ? (
        <div className="flex flex-col gap-2">
          {feedback.late ? (
            <Banner tone="bad">
              <CloseIcon /> Уақыт аяқталды (0 балл)
            </Banner>
          ) : feedback.check === 'correct' ? (
            <Banner tone="good">
              <CheckIcon size={20} /> Дұрыс жауап
            </Banner>
          ) : feedback.check === 'incorrect' ? (
            <Banner tone="bad">
              <CloseIcon /> Қате жауап
            </Banner>
          ) : (
            <Banner tone="info">Жауап қабылданды — бағалау аяқталуда.</Banner>
          )}

          {feedback.check === 'incorrect' && (explanationLoading || explanationText) ? (
            <Card className="p-3.5 text-sm leading-relaxed text-[#111111]">
              <p className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-[#5E5E5E]">Түсіндірме</p>
              {explanationLoading ? (
                <p className="m-0 text-[#5E5E5E]">Түсіндірме дайындалуда…</p>
              ) : (
                <p className="m-0">{explanationText}</p>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}

      {error ? <Banner tone="warn">{error}</Banner> : null}
      <Link to="/exam" className="sr-only">
        Емтихандарға оралу
      </Link>
    </ExamScreen>
  );
}

function lastItem(session: ExamSession, itemId: string) {
  if (session.current?.item_id === itemId) return session.current;
  return session.upcoming.find((item) => item.item_id === itemId) ?? null;
}
