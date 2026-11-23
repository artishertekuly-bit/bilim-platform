import type { GameAction, RoomView } from '@/lib/games-api';

export interface GameViewProps {
  view: RoomView;
  act: (action: GameAction) => Promise<void>;
  busy: boolean;
}

export function nameBySeat(view: RoomView, seat: number | null | undefined): string {
  if (seat === null || seat === undefined) return '';
  return view.room.players.find((p) => p.seat === seat)?.name ?? (seat === 1 && view.room.mode === 'bot' ? 'Демо-бот' : `Ойыншы ${seat + 1}`);
}
