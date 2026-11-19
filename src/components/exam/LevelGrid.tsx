// Профильдің төрт деңгейі (дизайн: Result.dc.html, Profile.dc.html). Өтпеген деңгей «—», ешқашан 0 емес
// (api §3.8, bagalau §4.3).
import type { LevelResult } from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

const THRESHOLDS: Record<number, number> = { 1: 80, 2: 85, 3: 75, 4: 75 };

export function LevelGrid({ levels }: { levels: LevelResult[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {levels.map((level) => {
        const taken = level.p !== null;
        return (
          <div
            key={level.level}
            className={cn(
              'flex flex-col gap-1 rounded-xl p-2.5',
              !taken && 'border border-dashed border-[#C9C5BD] bg-[#F1EFEA]',
              taken && level.mastered && 'border-2 border-[#1F7A47] bg-white',
              taken && !level.mastered && 'border border-[#E2E0DB] bg-white',
            )}
          >
            <span className="text-xs text-[#5E5E5E]">{level.level}-деңгей</span>
            <span className={cn('text-[17px] font-bold', !taken && 'text-[#4A4A4A]')}>
              {taken ? `${Math.round(level.p as number)}%` : '—'}
            </span>
            <span className={cn('text-[11px] font-semibold', level.mastered ? 'text-[#1F6B3F]' : 'text-[#4A4A4A]')}>
              {!taken ? 'өтпеді' : level.mastered ? 'меңгерілді' : `шек ${THRESHOLDS[level.level]}%`}
              {taken && !level.is_final ? ' · алдын ала' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
