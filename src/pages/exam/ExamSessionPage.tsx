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
import { ButtonLink, ConfirmSheet, StateCard } from '@/components/bl/ui';
import { DIALOG_FORMATS, FORMAT_COMPONENTS, SUBMIT_ON_PICK } from '@/components/exam/formatRegistry';
import { type Answer, DialogTask } from '@/components/exam/formats';
import {
  type AnswerResult,
  type DialogTurn,
  type ExamSession,
  ExaminerApiError,
  FORMAT_TITLES,
  LEVEL_TITLES,
  mixSummary,
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

  // D93: банкте сұрақ жетпеді, тапсырмалар осы сессияға құрылып жатыр. Біткенде сессия active болады.
  useEffect(() => {
    if (session?.status !== 'preparing') return;
    const id = window.setInterval(() => {
      void api
        .session(sessionId)
        .then((fresh) => {
          if (fresh.status !== 'preparing') {
            setSession(fresh);
            void queryClient.invalidateQueries({ queryKey: ['examiner', 'active'] });
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(id);
  }, [session?.status, sessionId, api, queryClient]);

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

  if (session.status === 'preparing') {
    return (
      <ExamScreen>
        <div className="pt-5">
          <StateCard
            markTone="dark"
            mark={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="motion-safe:animate-spin">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            }
            title="Тапсырмалар дайындалып жатыр"
            text={`${session.scope.title} бойынша тапсырмалар осы деңгейге алғаш рет құрылып жатыр. Бұл бірнеше минут алуы мүмкін: дайын болғанда сессия өзі ашылады. Құрылған тапсырмалар кейін басқа оқушыларға да беріледі.`}
          >
            <p role="status" aria-live="polite" className="m-0 text-sm text-bl-ink2">
              Бетті жапсаңыз да, дайындау тоқтамайды: сессияны кейін Емтихан бетінен ашасыз.
            </p>
            <ButtonLink to="/exam" variant="secondary" size="md">
              Емтиханға оралу
            </ButtonLink>
          </StateCard>
        </div>
      </ExamScreen>
    );
  }

  if (session.status === 'blocked') {
    // ExamStates.dc.html · «Жабылды»: екінші ескерту — тапсырма 0 балл, сессия уақытша жабық (ai_examiner D36).
    return (
      <ExamScreen>
        <div className="pt-5">
          <StateCard
            markTone="dark"
            mark={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            }
            title="Сессия уақытша жабылды"
            text="Ереже екінші рет бұзылды деп белгіленді, сондықтан тапсырма 0 балл алды. Мұғалім жағдайды көреді. Қате болса, ол балды қалпына келтіреді."
          >
            <ButtonLink to="/chat">Мұғалімге жазу</ButtonLink>
            <ButtonLink to="/exam" variant="secondary" size="md">
              Емтиханға оралу
            </ButtonLink>
          </StateCard>
        </div>
      </ExamScreen>
    );
  }

  if (session.status === 'abandoned') {
    return (
      <ExamScreen>
        <div className="pt-5">
          <StateCard
            mark="—"
            title="Сессия тоқтатылды"
            text={
              session.notice ??
              'Тасталған сессия профильге балл бермейді. Көрген тапсырмаларыңыз келесі сессияларда біраз уақыт қайталанбайды.'
            }
          >
            <ButtonLink to="/exam">Емтиханға оралу</ButtonLink>
          </StateCard>
        </div>
      </ExamScreen>
    );
  }

  // D97: аралас тестте деңгей жоқ — оның орнына нақты құрамы («12 тест · 8 аралас тапсырма»).
  const levelLabel =
    session.mode === 'mixed' && session.mix
      ? mixSummary(session.mix)
      : `${session.level} · ${LEVEL_TITLES[session.level] ?? ''}`;
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
      <ConfirmSheet
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="Сессиядан шығасыз ба?"
        description="Тасталған сессия профильге балл бермейді. Көрген тапсырмаларыңыз келесі сессияларда біраз уақыт қайталанбайды."
        cancelLabel="Жалғастыру"
        confirmLabel="Шығу"
        busy={abandon.isPending}
        onConfirm={() => abandon.mutate()}
      />

      {moderationNotice ? (
        // ExamStates.dc.html · «Ескерту»: бірінші бұзушылық — сол тапсырмаға екінші мүмкіндік.
        <section role="alert" className="flex flex-col gap-2.5 rounded-2xl bg-bl-warnbg p-4 text-bl-warntext">
          <span className="flex items-center gap-2 text-base font-bold">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l9 16H3z" />
              <path d="M12 10v4M12 17h.01" />
            </svg>
            Ескерту
          </span>
          <p className="m-0 text-[15px] leading-normal">{moderationNotice}</p>
          <p className="m-0 text-[13px] leading-[1.45]">Екінші рет қайталанса, тапсырма 0 балл алады және сессия уақытша жабылады.</p>
        </section>
      ) : null}
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
