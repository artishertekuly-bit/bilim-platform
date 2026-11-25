// Ойын беттеріне ортақ мәтіндер.
import type { GameType } from '@/lib/games-api';

export const FINISH_REASON: Record<string, string> = {
  opponent_left: 'Қарсылас ойыннан шықты.',
  draw: 'Тең: қатарынан 30 жүрісте тас алынбады.',
  no_moves: 'Қарсыластың жүрісі қалмады.',
  time_limit: 'Ойынның 40 минуты бітті.',
  board_full: 'Картадағы барлық ұяшық иеленді.',
  players_left: 'Ойыншылар ойыннан шықты.',
};

export const FINISH_TITLE: Record<GameType, string> = {
  conquest: 'Жорық аяқталды',
  checkers: 'Ойын аяқталды',
  battleship: 'Шайқас аяқталды',
  debate: 'Дебат аяқталды',
  baige: 'Бәйге аяқталды',
  auction: 'Аукцион аяқталды',
  fact_check: 'Ойын аяқталды',
  escape_room: 'Эскейп рум аяқталды',
};

// D99: аукцион ставкасы — 50…баланс, 10-ға еселі; пресеттер баланстың үлесі.
export const BET_STEP = 10;
export const BET_PRESETS: { share: number; label: string }[] = [
  { share: 0.1, label: '10%' },
  { share: 0.25, label: '25%' },
  { share: 0.5, label: '50%' },
  { share: 1, label: 'Барлығы' },
];

export function clampBet(value: number, min: number, max: number): number {
  if (max < min) return max;
  return Math.min(max, Math.max(min, Math.round(value / BET_STEP) * BET_STEP));
}

/** Эскейп румның уақыты: 110 → «1:50». */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
