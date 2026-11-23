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
};
