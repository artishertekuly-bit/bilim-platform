// Simulation entry: "Көшпелілердің маусымдық көші" (Kazakhstan history, grades 5–8).
// Learning flow: objective → prediction → lab (3D/2D + controls) → live metrics and chart →
// knowledge check → discussion with the AI tutor. All numbers come from the deterministic model.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Banner, Button, Card, CheckRow, ErrorNote, RadioCard, Segmented, Select } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';

import {
  CHECK_CORRECT_ID,
  CHECK_EXPLANATION,
  CHECK_OPTIONS,
  CHECK_QUESTION,
  HYPOTHESIS_OPTIONS,
  HYPOTHESIS_QUESTION,
  JUT_NOTE,
  MODEL_NOTE,
  OBJECTIVE,
  OBJECTIVES,
  PASTURE_INFO,
  SEASON_TITLES,
  TREND_TITLES,
  VERDICT_TEXT,
} from '../../domain/nomad-seasons/content';
import { NOMAD_SEASONS_META } from '../../domain/nomad-seasons/meta';
import {
  DEFAULT_PARAMS,
  HERD_MAX,
  HERD_MIN,
  HERD_STEP,
  JUT_YEAR,
  MODEL_VERSION,
  PASTURES,
  SEASONS,
  STAY_PLAN,
  TOTAL_STEPS,
  TRADITIONAL_PLAN,
  planKind,
  simulateNomadSeasons,
  stateAt,
  type NomadParams,
  type PastureId,
  type PlanKind,
  type Season,
  type Trend,
} from '../../domain/nomad-seasons/model';
import { buildExperimentSummary, buildTutorMessage } from '../../domain/nomad-seasons/summary';
import type { SimulationEntryProps } from '../../registry/registry';
import { isLowEndDevice } from '../../renderers/webgl';
import { saveSimulationAttempt, simulationKeys } from '../../services/attempts';
import { tutorDraftState } from '../../services/tutor-bridge';
import { useDocumentVisible, useStoredFlag } from '../hooks';
import { HerdChart, SeasonTable } from './HerdChart';
import { NomadStage } from './NomadStage';

const AUTOPLAY_MS = 1800;

function rendererFromQuery(): boolean | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('renderer');
  return value === '2d' ? true : value === '3d' ? false : null;
}

function Metric({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-bl-line bg-white px-3.5 py-3">
      <span className="text-[12px] font-semibold text-bl-ink2">{label}</span>
      <span className="truncate text-[17px] font-semibold text-bl-ink" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

function SectionCard({ step, title, children, testId }: { step: number; title: string; children: ReactNode; testId?: string }) {
  return (
    <Card as="section" className="flex flex-col gap-3 p-4">
      <h2 className="m-0 flex items-center gap-2.5 text-[17px] font-semibold" data-testid={testId}>
        <span aria-hidden="true" className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-bl-ink text-[13px] font-bold text-white">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

export default function NomadSeasonsLab({ saveEnabled }: SimulationEntryProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const visible = useDocumentVisible();
  const [storedLowEnd, setStoredLowEnd] = useStoredFlag('bilim.lab.lowEnd', isLowEndDevice);
  const [queryLowEnd] = useState(rendererFromQuery);
  const [lowEndOverride, setLowEndOverride] = useState<boolean | null>(queryLowEnd);
  const lowEnd = lowEndOverride ?? storedLowEnd;

  const [params, setParams] = useState<NomadParams>(DEFAULT_PARAMS);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hypothesis, setHypothesis] = useState<Trend | null>(null);
  const [checkAnswer, setCheckAnswer] = useState<string | null>(null);
  const [checkSubmitted, setCheckSubmitted] = useState(false);
  const savedRun = useRef<string | null>(null);

  const result = useMemo(() => simulateNomadSeasons(params), [params]);
  const finished = step >= TOTAL_STEPS;
  const kind: PlanKind = planKind(params.plan);
  const view = stateAt(result, step);
  const current = step > 0 ? result.steps[step - 1] : null;
  const canPlay = hypothesis !== null;

  // Autoplay advances one season at a time and pauses while the tab is hidden.
  useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setInterval(() => {
      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [playing, visible]);

  useEffect(() => {
    if (finished && playing) setPlaying(false);
  }, [finished, playing]);

  const restart = () => {
    setStep(0);
    setPlaying(false);
    savedRun.current = null;
  };

  const updateParams = (next: NomadParams) => {
    setParams(next);
    restart();
  };

  const setPlan = (season: Season, pasture: PastureId) => updateParams({ ...params, plan: { ...params.plan, [season]: pasture } });
  const applyPreset = (preset: PlanKind) => {
    if (preset === 'traditional') updateParams({ ...params, plan: { ...TRADITIONAL_PLAN } });
    if (preset === 'stay') updateParams({ ...params, plan: { ...STAY_PLAN } });
  };

  const checkCorrect = checkSubmitted ? checkAnswer === CHECK_CORRECT_ID : null;
  const summary = useMemo(
    () => buildExperimentSummary(result, { hypothesis, checkAnswerId: checkSubmitted ? checkAnswer : null, checkCorrect }),
    [result, hypothesis, checkAnswer, checkSubmitted, checkCorrect],
  );

  const save = useMutation({
    mutationFn: () =>
      saveSimulationAttempt({
        slug: NOMAD_SEASONS_META.slug,
        version: MODEL_VERSION,
        params: summary.params,
        outputs: summary.result,
        hypothesis,
        checkAnswer,
        checkCorrect,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: simulationKeys.stats }),
  });
  const { mutate: saveAttempt } = save;

  // One saved attempt per finished run, once the knowledge check has been answered.
  const runKey = `${JSON.stringify(params)}|${hypothesis}|${checkAnswer}`;
  useEffect(() => {
    if (!saveEnabled || !user || !finished || !checkSubmitted || savedRun.current === runKey) return;
    savedRun.current = runKey;
    saveAttempt();
  }, [saveEnabled, user, finished, checkSubmitted, runKey, saveAttempt]);

  const openTutor = () => navigate('/ai-tutor', { state: tutorDraftState(buildTutorMessage(summary)) });

  const herdChange = current ? `${current.losses ? `−${current.losses}` : '0'} / ${current.born ? `+${current.born}` : '0'}` : '—';
  const verdict = VERDICT_TEXT[result.verdict];

  return (
    <div className="flex flex-col gap-4">
      <Card as="section" className="flex flex-col gap-3 p-4 lg:p-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="dark">Қазақстан тарихы</Badge>
          <Badge>
            {NOMAD_SEASONS_META.gradeRange[0]}–{NOMAD_SEASONS_META.gradeRange[1]}-сынып
          </Badge>
          <Badge>~{NOMAD_SEASONS_META.estimatedMinutes} минут</Badge>
        </div>
        <h1 className="m-0 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] lg:text-[30px]">{NOMAD_SEASONS_META.title}</h1>
        <p className="m-0 text-[15px] leading-normal text-bl-ink3">
          <span className="font-semibold text-bl-ink">Мақсат: </span>
          {OBJECTIVE}
        </p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] text-bl-ink3">
          {OBJECTIVES.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        <details className="rounded-[14px] border border-bl-line bg-[#FBFAF8] px-3.5 py-2.5 text-[14px]">
          <summary className="cursor-pointer font-semibold">Төрт маусымдық жайылым</summary>
          <dl className="m-0 mt-2 flex flex-col gap-2">
            {PASTURES.map((id) => (
              <div key={id}>
                <dt className="font-semibold">
                  {PASTURE_INFO[id].title} — {PASTURE_INFO[id].short.toLowerCase()}
                </dt>
                <dd className="m-0 text-bl-ink3">{PASTURE_INFO[id].description}</dd>
              </div>
            ))}
          </dl>
        </details>
        <Banner tone="info">{MODEL_NOTE}</Banner>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">
          <SectionCard step={1} title="Болжам" testId="lab-hypothesis">
            <p className="m-0 text-[15px]">{HYPOTHESIS_QUESTION}</p>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Болжам">
              {HYPOTHESIS_OPTIONS.map((o) => (
                <RadioCard
                  key={o.id}
                  name="hypothesis"
                  value={o.id}
                  title={o.label}
                  checked={hypothesis === o.id}
                  onSelect={() => setHypothesis(o.id)}
                  disabled={step > 0}
                />
              ))}
            </div>
            {step > 0 ? <p className="m-0 text-[13px] text-bl-ink2">Болжам бекітілді. Өзгерту үшін «Қайта бастау» бас.</p> : null}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:col-start-1 lg:row-span-6 lg:row-start-1 lg:self-start">
          <NomadStage
            result={result}
            step={step}
            playing={playing}
            canPlay={canPlay}
            lowEnd={lowEnd}
            onLowEndChange={(next) => {
              setLowEndOverride(null);
              setStoredLowEnd(next);
            }}
            onTogglePlay={() => {
              if (finished) return;
              setPlaying((p) => !p);
            }}
            onNext={() => {
              setPlaying(false);
              setStep((s) => Math.min(TOTAL_STEPS, s + 1));
            }}
            onPrev={() => {
              setPlaying(false);
              setStep((s) => Math.max(0, s - 1));
            }}
            onReset={restart}
            onSeek={(s) => {
              setPlaying(false);
              setStep(Math.max(0, Math.min(TOTAL_STEPS, s)));
            }}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Маусым" value={`${view.year}-жыл · ${SEASON_TITLES[view.season]}`} testId="metric-season" />
            <Metric label="Жайылым" value={PASTURE_INFO[view.pasture].title} testId="metric-pasture" />
            <Metric label="Мал саны" value={`${view.herd} бас`} testId="metric-herd" />
            <Metric label="Қажеті өтелді" value={current ? `${current.fedPct}%` : '—'} testId="metric-fed" />
            <Metric label="Шығын / төл" value={herdChange} testId="metric-change" />
            <Metric label="Жайылымдағы шөп" value={`${view.grassPct[view.pasture]}%`} testId="metric-grass" />
          </div>
        </div>

        <div className="lg:col-start-2">
          <SectionCard step={2} title="Зертхана баптаулары">
            <div className="flex flex-col gap-2">
              <label htmlFor="lab-herd" className="flex items-baseline justify-between text-sm font-semibold">
                <span>Мал саны (қой есебімен)</span>
                <span className="text-[15px]" data-testid="lab-herd-value">
                  {params.herd} бас
                </span>
              </label>
              <input
                id="lab-herd"
                type="range"
                min={HERD_MIN}
                max={HERD_MAX}
                step={HERD_STEP}
                value={params.herd}
                onChange={(e) => updateParams({ ...params, herd: Number(e.target.value) })}
                aria-valuetext={`${params.herd} бас`}
                className="h-11 w-full accent-bl-ink"
              />
            </div>

            <Segmented
              label="Көш жоспары"
              value={kind}
              onChange={applyPreset}
              options={[
                { id: 'traditional', label: 'Дәстүрлі көш' },
                { id: 'stay', label: 'Бір жерде' },
                { id: 'custom', label: 'Өз жоспарым', disabled: kind !== 'custom' },
              ]}
            />

            <div className="grid grid-cols-2 gap-2">
              {SEASONS.map((season) => (
                <div key={season} className="flex flex-col gap-1.5">
                  <label htmlFor={`lab-plan-${season}`} className="text-[13px] font-semibold">
                    {SEASON_TITLES[season]}
                  </label>
                  <Select id={`lab-plan-${season}`} value={params.plan[season]} onChange={(e) => setPlan(season, e.target.value as PastureId)}>
                    {PASTURES.map((id) => (
                      <option key={id} value={id}>
                        {PASTURE_INFO[id].title}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-bl-line">
              <CheckRow checked={params.jut} onChange={(next) => updateParams({ ...params, jut: next })}>
                {JUT_YEAR}-жылы жұт болсын
              </CheckRow>
              <p className="m-0 px-4 pb-3 text-[13px] leading-[1.45] text-bl-ink2">{JUT_NOTE}</p>
            </div>
            <p className="m-0 text-[13px] text-bl-ink2">Баптауды өзгертсең, модель қайта есептеліп, көш басынан басталады.</p>
          </SectionCard>
        </div>

        <div className="lg:col-start-2">
          <SectionCard step={3} title="Мал саны мен маусымдар">
            <HerdChart
              result={result}
              step={step}
              onSelect={(s) => {
                setPlaying(false);
                setStep(s);
              }}
            />
            <SeasonTable result={result} step={step} />
            {finished ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-[#FBFAF8] p-3.5" data-testid="lab-result">
                <p className="m-0 text-[16px] font-semibold">{verdict.title}</p>
                <p className="m-0 text-[14px] leading-normal text-bl-ink3">{verdict.text}</p>
                <p className="m-0 text-[14px] leading-normal">
                  Мал саны {result.initialHerd}-ден {result.finalHerd}-ге {TREND_TITLES[result.trend]}. Аштықтан шығын: {result.totalLosses} бас, төл:{' '}
                  {result.totalBorn} бас.
                </p>
                {hypothesis ? (
                  <Banner tone={hypothesis === result.trend ? 'good' : 'warn'}>
                    {hypothesis === result.trend
                      ? 'Болжамың расталды.'
                      : `Болжамың расталмады: сен «${HYPOTHESIS_OPTIONS.find((o) => o.id === hypothesis)?.label.toLowerCase()}» деп ойладың.`}
                  </Banner>
                ) : null}
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="lg:col-start-2">
          <SectionCard step={4} title="Білімді тексеру" testId="lab-check">
            {!finished ? (
              <p className="m-0 text-sm text-bl-ink2">Сұрақ үш жылдық көш аяқталғанда ашылады.</p>
            ) : (
              <>
                <p className="m-0 text-[15px]">{CHECK_QUESTION}</p>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={CHECK_QUESTION}>
                  {CHECK_OPTIONS.map((o) => (
                    <RadioCard
                      key={o.id}
                      name="check"
                      value={o.id}
                      title={o.label}
                      checked={checkAnswer === o.id}
                      onSelect={() => setCheckAnswer(o.id)}
                      disabled={checkSubmitted}
                    />
                  ))}
                </div>
                {checkSubmitted ? (
                  <Banner tone={checkCorrect ? 'good' : 'bad'}>
                    {checkCorrect ? 'Дұрыс! ' : 'Қате. '}
                    {CHECK_EXPLANATION}
                  </Banner>
                ) : (
                  <Button size="md" onClick={() => setCheckSubmitted(true)} disabled={!checkAnswer}>
                    Жауапты тексеру
                  </Button>
                )}
                {save.isSuccess ? <p className="m-0 text-[13px] text-bl-ink2">Нәтиже сақталды.</p> : null}
                {save.isError ? <ErrorNote error={save.error} onRetry={() => saveAttempt()} /> : null}
              </>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-start-2">
          <SectionCard step={5} title="Тьютормен талқылау" testId="lab-tutor">
            <p className="m-0 text-[14px] leading-normal text-bl-ink3">
              Тьютор сенің нәтижеңді тарихпен байланыстырып түсіндіреді. Сандарды модель есептеді, тьютор оларды өзгертпейді.
            </p>
            {user?.role === 'student' ? (
              <Button size="md" variant="secondary" onClick={openTutor} disabled={!finished}>
                Тьютордан түсіндірме сұрау
              </Button>
            ) : (
              <p className="m-0 text-[13px] text-bl-ink2">Тьютор оқушы аккаунтында ашылады.</p>
            )}
            {!finished ? <p className="m-0 text-[13px] text-bl-ink2">Алдымен үш жылдық көшті соңына дейін жүргіз.</p> : null}
            <details className="text-[13px] text-bl-ink2">
              <summary className="cursor-pointer font-semibold text-bl-ink">Тьюторға не жіберіледі?</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-bl-soft p-3 text-[12px]" data-testid="lab-tutor-summary">
                {JSON.stringify(summary, null, 1)}
              </pre>
            </details>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
