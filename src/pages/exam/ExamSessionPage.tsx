// Емтихан сессиясы (дизайн: Session, Matching, Order, ErrorStep, Constructor, Slider .dc.html).
// 1-саты: жауап жіберілген сәтте сервер c ∈ {0, 1} қайтарады; оқушыға балл емес, тек «Дұрыс / Қате» көрінеді
// (api §3.5). Тапсырма реті серверде бекітілген, клиент оны өзгертпейді.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  Banner,
  CheckIcon,
  CloseIcon,
  ExamScreen,
  LoadingBlock,
  PrimaryButton,
  PrimaryLink,
  SessionHeader,
} from '@/components/exam/ExamUi';
import { FORMAT_COMPONENTS, SUBMIT_ON_PICK } from '@/components/exam/formatRegistry';
import type { Answer } from '@/components/exam/formats';
import {
  type AnswerResult,
  type ExamSession,
  ExaminerApiError,
  FORMAT_TITLES,
  LEVEL_TITLES,
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
  const [confirmExit, setConfirmExit] = useState(false);
  // Бір тапсырмаға қайта жіберілген жауап сол id-мен барады: сервер бірінші жауабын қайталайды (api §2.3).
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
    if (session?.status === 'completed' && !feedback) navigate(`/exam/result/${session.session_id}`, { replace: true });
  }, [session, feedback, navigate]);

  // Формат компоненттері onChange-ті useEffect ішінде шақырады, сондықтан ол тұрақты болуы керек:
  // соңғы формат пен жіберу функциясы ref арқылы алынады.
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
    onSuccess: (result) => {
      setFeedback(result);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['examiner', 'active'] });
    },
    onError: (err, variables) => {
      if (err instanceof ExaminerApiError && err.code === 'VALIDATION_ERROR') {
        requestIds.current.delete(variables.itemId);
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

  const next = () => {
    if (!feedback) return;
    const updated = feedback.session;
    setFeedback(null);
    setAnswer(null);
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
        <Banner tone="warn">
          {session.status === 'abandoned'
            ? 'Бұл емтихан аяқталмай тоқтатылды, сондықтан нәтиже есептелмеді.'
            : 'Сессия уақытша тоқтатылды. Мұғаліміңізге хабарласыңыз.'}
        </Banner>
      </ExamScreen>
    );
  }

  const item = feedback ? null : session.current;
  const shown = item ?? (feedback ? lastItem(session, feedback.item_id) : null);
  const levelLabel = `${session.level} · ${LEVEL_TITLES[session.level] ?? ''}`;
  const answered = feedback ? feedback.session.progress.answered - 1 : session.progress.answered;
  const total = feedback ? feedback.session.progress.total : session.progress.total;
  const Component = shown ? FORMAT_COMPONENTS[shown.format as keyof typeof FORMAT_COMPONENTS] : undefined;
  const locked = Boolean(feedback) || submit.isPending;

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
  ) : shown && SUBMIT_ON_PICK.has(shown.format) ? (
    <PrimaryButton disabled>{submit.isPending ? 'Тексерілуде…' : 'Жауапты таңдаңыз'}</PrimaryButton>
  ) : (
    <PrimaryButton disabled={!answer || submit.isPending} onClick={() => send(answer)}>
      {submit.isPending ? 'Тексерілуде…' : 'Жауап беру'}
    </PrimaryButton>
  );

  return (
    <ExamScreen
      header={
        <SessionHeader levelLabel={levelLabel} answered={answered} total={total} onClose={() => setConfirmExit(true)} />
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

      {shown ? (
        <>
          <span className="self-start rounded-full bg-[#ECE9E3] px-2.5 py-1 text-xs font-semibold text-[#4A4A4A]">
            {FORMAT_TITLES[shown.format] ?? shown.format}
            {shown.tier === 'X3' ? ' · Деңгей боссы' : ''}
          </span>
          {Component ? (
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
        <Banner tone="info">Келесі тапсырма дайындалып жатыр…</Banner>
      )}

      {feedback ? (
        feedback.check === 'correct' ? (
          <Banner tone="good">
            <CheckIcon size={20} /> Дұрыс жауап
          </Banner>
        ) : (
          <Banner tone="bad">
            <CloseIcon /> Қате жауап
          </Banner>
        )
      ) : null}
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <Link to="/exam" className="sr-only">
        Емтихандарға оралу
      </Link>
    </ExamScreen>
  );
}

/** Жауап берілген тапсырма: жаңартылған сессияда ол енді `current` емес, сондықтан алдыңғы күйден алынады. */
function lastItem(session: ExamSession, itemId: string) {
  if (session.current?.item_id === itemId) return session.current;
  return session.upcoming.find((item) => item.item_id === itemId) ?? null;
}
