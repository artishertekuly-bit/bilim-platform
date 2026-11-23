// Ойын бөлмесінің ортақ бөліктері (дизайн: GameWaiting.dc.html, GameResult.dc.html, TeacherGameHost.dc.html).
import { initialsOf } from '@/components/bl/styles';
import type { ResultRow } from '@/components/games/GameUi';
import { SEAT_COLORS, type RoomPlayer } from '@/lib/games-api';
import { cn } from '@/lib/utils';

export function RoomCode({ code, hint, big }: { code: string; hint?: string; big?: boolean }) {
  return (
    <section className="flex flex-col items-center gap-2.5 rounded-2xl border border-bl-line bg-white px-4 py-[18px]">
      <span className="text-[13px] font-semibold text-bl-ink2">Бөлме коды</span>
      <span
        className={cn('pl-[0.22em] font-bold tabular-nums tracking-[0.22em]', big ? 'text-[64px] leading-none' : 'text-[34px]')}
        aria-label={`Бөлме коды: ${code.split('').join(' ')}`}
      >
        {code}
      </span>
      {hint ? <span className="text-center text-sm leading-[1.45] text-bl-ink2">{hint}</span> : null}
    </section>
  );
}

export function PlayerGrid({
  players,
  max,
  meId,
  columns = 2,
}: {
  players: RoomPlayer[];
  max: number;
  meId?: string;
  columns?: number;
}) {
  const empty = Math.max(0, Math.min(max, 6) - players.length);
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-bl-ink2">Ойыншылар</h2>
        <span className="text-sm font-semibold tabular-nums">
          {players.length} / {max}
        </span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {players.map((p) => (
          <div key={p.seat} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-bl-line bg-white px-3 py-2.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: SEAT_COLORS[p.seat % SEAT_COLORS.length] }}
            >
              {initialsOf(p.name).charAt(0)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{p.name}</span>
              <span className="text-xs text-bl-ink2">{p.user_id === meId ? 'сіз' : 'дайын'}</span>
            </span>
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} className="flex h-[58px] items-center justify-center rounded-xl border border-dashed border-bl-dash text-[13px] text-bl-ink2">
            Күтілуде
          </div>
        ))}
      </div>
    </section>
  );
}

export function Podium({ rows, meSeat }: { rows: ResultRow[]; meSeat?: number | null }) {
  const top = [rows.find((r) => r.place === 2), rows.find((r) => r.place === 1), rows.find((r) => r.place === 3)];
  const heights = [110, 150, 80];
  if (!top[1]) return null;
  return (
    <div aria-hidden="true" className="grid h-[210px] grid-cols-3 items-end gap-2.5">
      {top.map((r, i) =>
        r ? (
          <div key={i} className="flex flex-col gap-1.5 text-center">
            <span className="truncate text-sm font-semibold">{r.seat !== undefined && r.seat === meSeat ? 'Сіз' : r.name}</span>
            <span className="text-xs text-bl-ink2">{r.score !== undefined ? `${r.score} ұпай` : ''}</span>
            <div
              className="flex items-center justify-center rounded-t-xl text-[30px] font-bold text-white"
              style={{ height: heights[i], background: r.seat !== undefined ? SEAT_COLORS[r.seat % SEAT_COLORS.length] : '#111111' }}
            >
              {r.place}
            </div>
          </div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}

export function ResultsTable({ rows, meSeat }: { rows: ResultRow[]; meSeat?: number | null }) {
  const hasCells = rows.some((r) => r.cells !== undefined);
  const hasRight = rows.some((r) => r.right_answers !== undefined);
  return (
    <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-bl-line bg-white text-sm tabular-nums">
      <thead>
        <tr className="text-right text-xs text-bl-ink2">
          <th scope="col" className="px-3 py-2.5 text-left font-semibold">
            Ойыншы
          </th>
          <th scope="col" className="px-2 py-2.5 font-semibold">
            Ұпай
          </th>
          {hasCells ? (
            <th scope="col" className="px-2 py-2.5 font-semibold">
              Ұяшық
            </th>
          ) : null}
          {hasRight ? (
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Дұрыс
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody className="text-right">
        {rows.map((r, i) => {
          const me = r.seat !== undefined && r.seat === meSeat;
          return (
            <tr key={`${r.name}-${i}`} className={me ? 'bg-bl-bg' : undefined}>
              <th scope="row" className="border-t border-bl-soft px-3 py-2.5 text-left font-semibold">
                {r.place}. {me ? 'Сіз' : r.name}
                {r.bot ? ' · бот' : ''}
              </th>
              <td className="border-t border-bl-soft px-2 py-2.5">{r.score ?? '—'}</td>
              {hasCells ? <td className="border-t border-bl-soft px-2 py-2.5">{r.cells ?? '—'}</td> : null}
              {hasRight ? <td className="border-t border-bl-soft px-3 py-2.5">{r.right_answers ?? '—'}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
