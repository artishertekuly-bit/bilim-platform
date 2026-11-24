// The "stage": 3D scene (or 2D fallback), playback toolbar and timeline. Owns renderer selection,
// WebGL failure handling, fullscreen and keyboard shortcuts. Playback state lives in the parent.
import { Suspense, lazy, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Banner, Button, ChipButton, Skeleton } from '@/components/bl/ui';
import { cn } from '@/lib/utils';

import { PASTURE_INFO, SEASON_TITLES } from '../../domain/nomad-seasons/content';
import { PASTURES, TOTAL_STEPS, stateAt, type NomadResult } from '../../domain/nomad-seasons/model';
import NomadMap2D from '../../renderers/nomad-seasons/NomadMap2D';
import SceneErrorBoundary from '../../renderers/SceneErrorBoundary';
import { detectWebGL } from '../../renderers/webgl';
import { useDocumentVisible, useFullscreen, usePrefersReducedMotion } from '../hooks';
import { CollapseIcon, ExpandIcon, NextIcon, PauseIcon, PlayIcon, ResetIcon } from '../LabIcons';

// three.js is only downloaded when the 3D renderer is actually used.
const NomadScene3D = lazy(() => import('../../renderers/nomad-seasons/NomadScene3D'));

type Failure = 'context' | 'error';

export interface NomadStageProps {
  result: NomadResult;
  step: number;
  playing: boolean;
  /** False until the learner has made a prediction. */
  canPlay: boolean;
  lowEnd: boolean;
  onLowEndChange: (next: boolean) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
  onSeek: (step: number) => void;
}

export function NomadStage({ result, step, playing, canPlay, lowEnd, onLowEndChange, onTogglePlay, onNext, onPrev, onReset, onSeek }: NomadStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const visible = useDocumentVisible();
  const reducedMotion = usePrefersReducedMotion();
  const fullscreen = useFullscreen(stageRef);
  const webgl = useMemo(detectWebGL, []);
  const [failure, setFailure] = useState<Failure | null>(null);

  const view = stateAt(result, step);
  const current = step > 0 ? result.steps[step - 1] : null;
  const harshWinter = current?.harshWinter ?? false;
  const renderer: '3d' | '2d' = lowEnd || !webgl || failure ? '2d' : '3d';
  const finished = step >= TOTAL_STEPS;

  const description =
    `${view.year}-жыл, ${SEASON_TITLES[view.season]}. Ауыл ${PASTURE_INFO[view.pasture].title} жайылымында, мал саны ${view.herd} бас. ` +
    `Шөп: ${PASTURES.map((id) => `${PASTURE_INFO[id].title} ${view.grassPct[id]}%`).join(', ')}.` +
    (harshWinter ? ' Бұл қыста жұт болды.' : '');

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !canPlay) return;
    if (event.key === 'ArrowRight') onNext();
    else if (event.key === 'ArrowLeft') onPrev();
    else if (event.key === ' ' || event.key === 'k') onTogglePlay();
    else if (event.key === 'Home') onSeek(0);
    else if (event.key === 'End') onSeek(TOTAL_STEPS);
    else return;
    event.preventDefault();
  };

  const mapProps = { season: view.season, pasture: view.pasture, grassPct: view.grassPct, herd: view.herd, harshWinter, reducedMotion };

  return (
    <div
      ref={stageRef}
      className={cn('flex flex-col gap-3', fullscreen.active && 'h-full overflow-y-auto bg-bl-bg p-4')}
      data-testid="lab-stage"
      data-renderer={renderer}
    >
      <div
        role="img"
        aria-label={description}
        aria-keyshortcuts="ArrowLeft ArrowRight Space Home End"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          'relative w-full overflow-hidden rounded-[18px] border border-bl-line bg-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink',
          fullscreen.active ? 'min-h-0 flex-1' : 'aspect-[4/3] lg:aspect-[16/11]',
        )}
      >
        {renderer === '3d' ? (
          <SceneErrorBoundary fallback={<NomadMap2D {...mapProps} />} onError={() => setFailure('error')}>
            <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
              <NomadScene3D {...mapProps} paused={!visible} onContextLost={() => setFailure('context')} />
            </Suspense>
          </SceneErrorBoundary>
        ) : (
          <NomadMap2D {...mapProps} />
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-bl-ink px-3 py-1.5 text-[13px] font-semibold text-white" data-testid="lab-stage-season">
            {step === 0 ? 'Басталуы · ' : ''}
            {view.year}-жыл · {SEASON_TITLES[view.season]}
          </span>
          {harshWinter ? (
            <span className="rounded-full bg-bl-warnbg px-3 py-1.5 text-[13px] font-semibold text-bl-warntext">Жұт: мұз қатты</span>
          ) : null}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {description}
      </p>

      {failure || !webgl ? (
        <Banner tone="info">3D көрініс бұл құрылғыда іске қосылмады, сондықтан 2D карта көрсетілді.</Banner>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" full={false} onClick={onTogglePlay} disabled={!canPlay || (finished && !playing)} aria-pressed={playing}>
          {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          {playing ? 'Тоқтату' : step === 0 ? 'Бастау' : finished ? 'Аяқталды' : 'Жалғастыру'}
        </Button>
        <Button variant="secondary" size="sm" full={false} onClick={onNext} disabled={!canPlay || finished}>
          <NextIcon size={18} />
          Келесі маусым
        </Button>
        <Button variant="secondary" size="sm" full={false} onClick={onReset} disabled={step === 0 && !playing}>
          <ResetIcon size={18} />
          Қайта бастау
        </Button>
        {fullscreen.supported ? (
          <Button
            variant="secondary"
            size="sm"
            full={false}
            onClick={fullscreen.toggle}
            aria-label={fullscreen.active ? 'Толық экраннан шығу' : 'Толық экран'}
          >
            {fullscreen.active ? <CollapseIcon size={18} /> : <ExpandIcon size={18} />}
          </Button>
        ) : null}
        <ChipButton on={lowEnd} onClick={() => onLowEndChange(!lowEnd)} className="ml-auto">
          Жеңіл режим (2D)
        </ChipButton>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="lab-timeline" className="flex justify-between text-[13px] text-bl-ink2">
          <span className="font-semibold text-bl-ink">Уақыт сызығы</span>
          <span>
            {step} / {TOTAL_STEPS} маусым
          </span>
        </label>
        <input
          id="lab-timeline"
          type="range"
          min={0}
          max={TOTAL_STEPS}
          step={1}
          value={step}
          disabled={!canPlay}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-valuetext={step === 0 ? 'Басталуы' : `${view.year}-жыл, ${SEASON_TITLES[view.season]}`}
          className="h-11 w-full accent-bl-ink disabled:opacity-50"
        />
        {!canPlay ? <p className="m-0 text-[13px] text-bl-ink2">Бастау үшін алдымен болжам таңда.</p> : null}
      </div>
    </div>
  );
}
