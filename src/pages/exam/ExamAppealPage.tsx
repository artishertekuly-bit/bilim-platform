// Бағаға шағым: тек ЖИ бағалаған тапсырмаға, 20–500 таңба (дизайн: Appeal.dc.html; api §3 /appeal, D69).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { CheckIcon } from '@/components/bl/icons';
import { Banner, BareScreen, Button, ButtonLink, ErrorNote, LoadingBlock, Section, TextArea, TopBar } from '@/components/bl/ui';
import { FORMAT_TITLES, useExaminerApi } from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

const MIN = 20;
const MAX = 500;

export default function ExamAppealPage() {
  const { sessionId = '' } = useParams();
  const api = useExaminerApi();
  const queryClient = useQueryClient();
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  const result = useQuery({
    queryKey: ['examiner', 'result', sessionId],
    queryFn: () => api.result(sessionId),
    enabled: Boolean(sessionId),
    retry: false,
  });
  const items = (result.data?.items ?? []).filter((i) => i.appealable && !i.appealed);

  useEffect(() => {
    if (!pick && items.length) setPick(items[0].item_id);
  }, [items, pick]);

  const send = useMutation({
    mutationFn: () => api.appeal(sessionId, pick as string, text.trim()),
    onSuccess: async () => {
      setSent(true);
      await queryClient.invalidateQueries({ queryKey: ['examiner', 'result', sessionId] });
    },
  });

  const len = text.trim().length;
  const ok = Boolean(pick) && len >= MIN && len <= MAX;
  const back = `/exam/result/${sessionId}`;

  return (
    <BareScreen
      header={<TopBar back={back} backLabel="Нәтижеге оралу" title="Бағаға шағым" />}
      footer={
        sent ? (
          <ButtonLink to={back}>Нәтижеге оралу</ButtonLink>
        ) : (
          <Button onClick={() => send.mutate()} disabled={!ok} loading={send.isPending}>
            {send.isPending ? 'Жіберілуде…' : 'Шағым жіберу'}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 px-4 pb-5 pt-2">
        {sent ? (
          <section role="status" className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-7 text-center">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-okbg text-bl-oktext">
              <CheckIcon size={28} />
            </span>
            <h1 className="m-0 text-[22px] font-bold">Шағым жіберілді</h1>
            <p className="m-0 text-[15px] leading-normal text-bl-ink3">
              Мұғалім шешім қабылдағанда хабарлама келеді. Балл өзгерсе, профиліңіз де жаңарады.
            </p>
          </section>
        ) : (
          <>
            <p className="m-0 text-[15px] leading-normal text-bl-ink2">
              Шағымды тек ЖИ бағалаған тапсырмаға беруге болады. Ол мұғалімнің растау кезегінің басына түседі.
            </p>
            {result.isLoading ? <LoadingBlock rows={2} /> : null}
            {result.isError ? <ErrorNote error={result.error} onRetry={() => result.refetch()} /> : null}
            {result.data && !items.length ? <Banner tone="info">Бұл сессияда шағым беруге болатын тапсырма жоқ.</Banner> : null}

            {items.length ? (
              <Section label="Тапсырма">
                <div role="radiogroup" aria-label="Тапсырма" className="flex flex-col gap-2">
                  {items.map((it) => {
                    const on = it.item_id === pick;
                    return (
                      <button
                        key={it.item_id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPick(it.item_id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-[14px] bg-white px-4 py-3.5 text-left text-bl-ink',
                          on ? 'border-2 border-bl-ink' : 'border border-bl-line',
                        )}
                      >
                        <span className="flex flex-1 flex-col gap-1">
                          <span className="text-[15px] font-semibold">
                            {FORMAT_TITLES[it.format] ?? it.format} · {it.position}
                          </span>
                          <span className="text-sm text-bl-ink3">{it.grade_status === 'final' ? 'Бағасы бекітілген' : 'ЖИ бағасы, алдын ала'}</span>
                        </span>
                        <span className="flex-none text-sm font-bold tabular-nums">
                          {it.score} / {it.max_score}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>
            ) : null}

            <section className="flex flex-col gap-2">
              <label htmlFor="appeal-why" className="text-sm font-semibold">
                Неге келіспейсіз?
              </label>
              <TextArea
                id="appeal-why"
                value={text}
                maxLength={MAX}
                onChange={(e) => setText(e.target.value.slice(0, MAX))}
                placeholder="Жауабыңызда нені ескермеді деп ойлайсыз?"
                className="min-h-[160px] resize-none"
              />
              <span className="self-end text-[13px] text-bl-ink2">
                {len} / {MAX} · кемінде {MIN}
              </span>
            </section>
            {send.isError ? <ErrorNote error={send.error} /> : null}
          </>
        )}
      </div>
    </BareScreen>
  );
}
