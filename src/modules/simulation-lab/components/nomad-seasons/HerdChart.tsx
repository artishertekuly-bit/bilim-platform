// Herd size over the twelve seasons, revealed up to the current step. One series, so the section
// title names it and there is no legend box. The season table below is the chart's table view.
import { useState, type MouseEvent } from 'react';

import { PASTURE_INFO, SEASON_TITLES } from '../../domain/nomad-seasons/content';
import { TOTAL_STEPS, type NomadResult } from '../../domain/nomad-seasons/model';

const W = 360;
const H = 176;
const PAD = { left: 40, right: 16, top: 14, bottom: 28 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const SERIES = '#2A78D6';
const GRID = '#E1E0D9';
const AXIS = '#C3C2B7';
const MUTED = '#898781';

function tickStep(max: number): number {
  for (const step of [50, 100, 200, 250, 500, 1000]) if (max / step <= 4) return step;
  return 1000;
}

function herdAt(result: NomadResult, i: number): number {
  return i === 0 ? result.initialHerd : result.steps[i - 1].herdEnd;
}

export function HerdChart({ result, step, onSelect }: { result: NomadResult; step: number; onSelect: (step: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(result.initialHerd, ...result.steps.map((s) => s.herdEnd));
  const stepSize = tickStep(max * 1.1);
  const top = Math.ceil((max * 1.1) / stepSize) * stepSize;
  const ticks = Array.from({ length: Math.floor(top / stepSize) + 1 }, (_, i) => i * stepSize);
  const x = (i: number) => PAD.left + (i / TOTAL_STEPS) * PLOT_W;
  const y = (v: number) => PAD.top + (1 - v / top) * PLOT_H;

  const shown = Array.from({ length: step + 1 }, (_, i) => [x(i), y(herdAt(result, i))] as const);
  const line = shown.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = shown.length > 1 ? `${line} L${shown[shown.length - 1][0].toFixed(1)} ${y(0)} L${shown[0][0].toFixed(1)} ${y(0)} Z` : '';
  const [endX, endY] = shown[shown.length - 1];

  // PointerEvent extends MouseEvent, so one picker serves hover and click.
  const pick = (event: MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const px = ((event.clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(step, Math.round(((px - PAD.left) / PLOT_W) * TOTAL_STEPS)));
  };

  const hoverStep = hover !== null && hover <= step ? hover : null;
  const hoverInfo =
    hoverStep === null
      ? null
      : hoverStep === 0
        ? { title: 'Басталуы', herd: result.initialHerd, fed: null as number | null }
        : (() => {
            const s = result.steps[hoverStep - 1];
            return { title: `${s.year}-жыл · ${SEASON_TITLES[s.season]} · ${PASTURE_INFO[s.pasture].title}`, herd: s.herdEnd, fed: s.fedPct };
          })();

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Мал саны: басында ${result.initialHerd}, қазір ${herdAt(result, step)} бас`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t}
            </text>
          </g>
        ))}
        {[1, 2, 3].map((year) => (
          <text key={year} x={x(year * 4 - 2)} y={H - 9} textAnchor="middle" fontSize="10" fill={MUTED}>
            {year}-жыл
          </text>
        ))}
        {[0, 4, 8, 12].map((i) => (
          <line key={i} x1={x(i)} x2={x(i)} y1={y(0)} y2={y(0) + 4} stroke={AXIS} strokeWidth="1" />
        ))}

        {area ? <path d={area} fill={SERIES} fillOpacity="0.1" /> : null}
        <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hoverStep !== null ? <line x1={x(hoverStep)} x2={x(hoverStep)} y1={PAD.top} y2={y(0)} stroke={AXIS} strokeWidth="1" /> : null}
        <circle cx={endX} cy={endY} r="5" fill={SERIES} stroke="#FFFFFF" strokeWidth="2" />
        <text
          x={Math.min(endX + 8, W - PAD.right)}
          y={endY - 8}
          textAnchor={endX + 40 > W ? 'end' : 'start'}
          fontSize="11"
          fontWeight="600"
          fill="#111111"
        >
          {herdAt(result, step)}
        </text>
        {hoverStep !== null ? (
          <circle cx={x(hoverStep)} cy={y(herdAt(result, hoverStep))} r="5" fill={SERIES} stroke="#FFFFFF" strokeWidth="2" />
        ) : null}

        <rect
          x={PAD.left - 8}
          y={PAD.top}
          width={PLOT_W + 16}
          height={PLOT_H}
          fill="transparent"
          style={{ cursor: 'pointer', touchAction: 'pan-y' }}
          onPointerMove={(e) => setHover(pick(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const target = pick(e);
            if (target !== null) onSelect(target);
          }}
        />
      </svg>

      {hoverInfo && hoverStep !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-bl-line bg-white px-3 py-2 text-[12px] leading-[1.4] shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
          style={{ left: `${(x(hoverStep) / W) * 100}%`, top: `${(y(herdAt(result, hoverStep)) / H) * 100 - 4}%` }}
        >
          <div className="font-semibold text-bl-ink">{hoverInfo.title}</div>
          <div className="text-bl-ink2">Мал: {hoverInfo.herd} бас</div>
          {hoverInfo.fed !== null ? <div className="text-bl-ink2">Қажеті өтелді: {hoverInfo.fed}%</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function SeasonTable({ result, step }: { result: NomadResult; step: number }) {
  const rows = result.steps.slice(0, step);
  if (!rows.length) {
    return <p className="m-0 text-sm text-bl-ink2">Кесте бірінші маусымнан кейін толады.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse text-left text-[13px]">
        <caption className="sr-only">Маусымдар бойынша нәтиже: мал саны, қажетінің өтелуі, шығын мен төл</caption>
        <thead>
          <tr className="text-bl-ink2">
            <th scope="col" className="py-2 pr-2 font-semibold">Маусым</th>
            <th scope="col" className="py-2 pr-2 font-semibold">Жайылым</th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">Мал</th>
            <th scope="col" className="py-2 pr-2 font-semibold">Өтелуі</th>
            <th scope="col" className="py-2 text-right font-semibold">Шығын / төл</th>
          </tr>
        </thead>
        <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
          {rows.map((s) => (
            <tr key={s.index} className={s.index === step ? 'border-t border-bl-soft bg-[#FBFAF8] font-semibold' : 'border-t border-bl-soft'}>
              <td className="whitespace-nowrap py-2 pr-2">
                {s.year}-ж · {SEASON_TITLES[s.season]}
                {s.harshWinter ? <span className="ml-1 rounded-full bg-bl-warnbg px-1.5 py-0.5 text-[11px] font-semibold text-bl-warntext">жұт</span> : null}
              </td>
              <td className="py-2 pr-2">{PASTURE_INFO[s.pasture].title}</td>
              <td className="py-2 pr-2 text-right">{s.herdEnd}</td>
              <td className="py-2 pr-2">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="relative h-1.5 w-9 flex-none overflow-hidden rounded-full bg-[#CDE2FB]">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-[#2A78D6]" style={{ width: `${s.fedPct}%` }} />
                  </span>
                  {s.fedPct}%
                </span>
              </td>
              <td className="whitespace-nowrap py-2 text-right">
                {s.losses ? `−${s.losses}` : '0'} / {s.born ? `+${s.born}` : '0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
