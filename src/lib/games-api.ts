// Ойын API клиенті: /api/games/v1 (architect/v2/geimifikatsiya.md §5–§7). Ойын күйін сервер басқарады:
// клиент тек әрекет жібереді, ал күйдің проекциясын әрекет жауабынан және Realtime Broadcast-тың private
// арналарынан алады (D67). Хабар келмей қалса, бет күйді API-дан қайта сұрайды.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { getAiApiBaseUrl } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';

export type GameType = 'conquest' | 'checkers' | 'battleship' | 'debate' | 'baige';
export type GameMode = 'multi' | 'bot' | 'solo';
export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export interface GameInfo {
  type: GameType;
  title: string;
  players: string;
  summary: string;
  modes: GameMode[];
}

export const GAMES: GameInfo[] = [
  { type: 'conquest', title: 'Әдіс жорығы', players: '3–6 ойыншы', modes: ['multi'],
    summary: 'Картадағы ұяшықты сұраққа дұрыс жауап беріп басып ал. Әр аймақ — бір §.' },
  { type: 'baige', title: 'Бәйге', players: '2–6 ойыншы не жалғыз', modes: ['multi', 'solo'],
    summary: 'Сұрақ құны өседі: тоқтап ұпайды сақта не тәуекел етіп шаба бер.' },
  { type: 'checkers', title: 'Шашки', players: '1 × 1 не ботпен', modes: ['multi', 'bot'],
    summary: 'Орыс дойбысы: әр жүріс алдында сұрақ, тас алу үшін қиынырақ сұрақ.' },
  { type: 'battleship', title: 'Теңіз шайқасы', players: '1 × 1 не ботпен', modes: ['multi', 'bot'],
    summary: '6 × 6 алаң: әр оқ алдында сұрақ, тигізсең — тағы атасың.' },
  { type: 'debate', title: 'Дебат аренасы', players: '1 × 1', modes: ['multi'],
    summary: 'Тарихи тұжырымды жақта не оған қарсы шық. Үш раунд, ЖИ-төреші.' },
];

export const GAME_TITLE: Record<GameType, string> = Object.fromEntries(GAMES.map((g) => [g.type, g.title])) as Record<
  GameType,
  string
>;

export interface ScopeParagraph { topic_id: string; label: string; chapter: string | null; mcq: number; debate: number }
export interface ScopeBook { book: string; title: string; grade: number | null; paragraphs: ScopeParagraph[] }
export interface ScopeSubject { subject_id: string; title: string; books: ScopeBook[] }

export interface RoomPlayer { seat: number; name: string; left: boolean; user_id: string }
export interface RoomSummary {
  room_id: string;
  game_type: GameType;
  mode: GameMode;
  status: RoomStatus;
  join_code: string | null;
  host_role: 'student' | 'teacher';
  is_host?: boolean;
  scope: { subject_id: string | null; book: string | null; labels: string[] };
  settings: Record<string, number>;
  min_players: number;
  max_players: number;
  players: RoomPlayer[];
  created_at: string | null;
  started_at: string | null;
}

// Ойынның проекциясы ойынға қарай әртүрлі: бетте әр ойынның өз типі қолданылады.
export type PublicView = Record<string, unknown> & { game: GameType; phase: string; deadline: string | null };
export type PrivateView = Record<string, unknown>;

export interface RoomView {
  room: RoomSummary;
  version: number;
  public: PublicView | null;
  private: PrivateView;
  me: { user_id: string; seat: number | null; left: boolean };
}

export interface MyRoom {
  room_id: string;
  game_type: GameType;
  mode: GameMode;
  status: RoomStatus;
  join_code: string | null;
  is_host: boolean;
  players: number;
  created_at: string;
}

export interface PracticeRecord { best_score: number | null; best_correct: number | null; achieved_at: string | null }

/** D98: сұрақ көзі — оқулық §-тері, дайын пән банкі не еркін тақырып (банк бірінші, тапшылығы ЖИ-мен). */
export type GameSource = 'paragraphs' | 'bank' | 'topic';

export const SOURCE_LABEL: Record<GameSource, string> = {
  bank: 'Пән банкі',
  paragraphs: 'Параграфтар',
  topic: 'Еркін тақырып',
};

/** Емтихан банкінде белсенді тесті бар пән (оқулығы жоқ «Дүниежүзі тарихы» да). */
export interface BankSubject { subject_id: string; title: string; mcq: number; has_textbook: boolean }

export interface SourceFields {
  source?: GameSource;
  subject_id?: string | null;
  book?: string | null;
  topic_ids?: string[];
  subject_text?: string | null;
  topic_query?: string | null;
}

export interface CreateRoomBody extends SourceFields {
  game_type: GameType;
  mode: GameMode;
  settings: Record<string, number>;
}

/** Бөлме ашпай: көзде қанша сұрақ бар, ойынға қанша керек, ЖИ генерациясы керек пе. */
export interface SourcePreview {
  source: GameSource;
  available: number;
  needed: number;
  deficit: number;
  generate: boolean;
  ready: boolean;
  from_cache?: number;
  from_bank?: number;
}

export type GameAction =
  | { type: 'pick'; cell: number }
  | { type: 'card'; card: 'fifty' | 'double' | 'second' | 'shield'; cell?: number }
  | { type: 'answer'; option: string }
  | { type: 'move'; path: number[] }
  | { type: 'place'; ships: number[][] }
  | { type: 'auto_place' }
  | { type: 'shoot'; cell: number }
  | { type: 'submit'; text: string }
  | { type: 'decide'; choice: 'stop' | 'continue' };

export class GamesApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = 'GamesApiError';
  }
}

const PREFIX = '/api/games/v1';

async function request<T>(token: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new GamesApiError('Ойнау үшін жүйеге кіріңіз.', 401, 'UNAUTHENTICATED');
  let response: Response;
  try {
    response = await fetch(`${getAiApiBaseUrl()}${PREFIX}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new GamesApiError('Серверге қосылу мүмкін болмады. Интернетті тексеріңіз.', 0, 'NETWORK');
  }
  const text = await response.text();
  if (!response.ok) {
    let body: { error?: { code?: string; message?: string }; detail?: unknown } | null = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    throw new GamesApiError(
      body?.error?.message ?? (typeof body?.detail === 'string' ? body.detail : 'Сұраныс орындалмады.'),
      response.status,
      body?.error?.code ?? 'HTTP_ERROR',
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

export function createGamesApi(token: string | undefined) {
  return {
    scopes: () => request<ScopeSubject[]>(token, '/scopes'),
    bankSubjects: () => request<BankSubject[]>(token, '/bank-subjects'),
    preview: (body: SourceFields & { game_type: GameType }) =>
      request<SourcePreview>(token, '/sources/preview', { method: 'POST', body: JSON.stringify(body) }),
    myRooms: () => request<MyRoom[]>(token, '/rooms/mine'),
    record: () => request<PracticeRecord>(token, '/practice/record'),
    createRoom: (body: CreateRoomBody) => request<RoomView>(token, '/rooms', { method: 'POST', body: JSON.stringify(body) }),
    join: (code: string) => request<RoomView>(token, '/rooms/join', { method: 'POST', body: JSON.stringify({ code }) }),
    room: (roomId: string) => request<RoomView>(token, `/rooms/${roomId}`),
    start: (roomId: string) => request<RoomView>(token, `/rooms/${roomId}/start`, { method: 'POST' }),
    leave: (roomId: string) => request<{ left: boolean }>(token, `/rooms/${roomId}/leave`, { method: 'POST' }),
    act: (roomId: string, action: GameAction) =>
      request<RoomView>(token, `/rooms/${roomId}/actions`, {
        method: 'POST',
        body: JSON.stringify({ client_request_id: crypto.randomUUID(), ...action }),
      }),
  };
}

export type GamesApi = ReturnType<typeof createGamesApi>;

export function useGamesApi(): GamesApi {
  const { session } = useAuth();
  const token = session?.access_token;
  return useMemo(() => createGamesApi(token), [token]);
}

export const gamesKeys = {
  scopes: ['games', 'scopes'] as const,
  bankSubjects: ['games', 'bank-subjects'] as const,
  mine: ['games', 'mine'] as const,
  record: ['games', 'record'] as const,
  room: (roomId: string) => ['games', 'room', roomId] as const,
};

type BroadcastState = { room_id: string; version: number; status: RoomStatus; room: RoomSummary; public: PublicView | null };
type BroadcastPrivate = { room_id: string; version: number; private: PrivateView };

const POLL_MS = 3000;
const SILENCE_MS = 6000;

// Бөлменің күйі: HTTP (бірінші жүктеу, қайта қосылу) + Realtime (D67). Хабар реті `version` бойынша тексеріледі.
export function useLiveRoom(roomId: string | undefined) {
  const api = useGamesApi();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const lastMessage = useRef(0);
  const key = gamesKeys.room(roomId ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.room(roomId as string),
    enabled: Boolean(roomId && session?.access_token),
    staleTime: 0,
    refetchInterval: (q) => {
      const status = q.state.data?.room.status;
      if (status !== 'lobby' && status !== 'playing') return false;
      return Date.now() - lastMessage.current > SILENCE_MS ? POLL_MS : false;
    },
  });

  const userId = query.data?.me.user_id;
  const token = session?.access_token;

  useEffect(() => {
    if (!roomId || !token || !userId) return undefined;
    void supabase.realtime.setAuth(token);
    const merge = (patch: (current: RoomView) => RoomView | null) => {
      lastMessage.current = Date.now();
      queryClient.setQueryData<RoomView>(key, (current) => (current ? patch(current) ?? current : current));
    };
    const shared = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        const message = payload as BroadcastState;
        merge((current) => {
          if (message.version < current.version) return null;
          return {
            ...current,
            version: message.version,
            room: { ...message.room, is_host: current.room.is_host },
            public: message.public ?? (message.status === 'lobby' ? null : current.public),
          };
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: key });
      });
    const own = supabase
      .channel(`room:${roomId}:player:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'private' }, ({ payload }) => {
        const message = payload as BroadcastPrivate;
        merge((current) => (message.version < current.version ? null : { ...current, private: message.private }));
      })
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void queryClient.invalidateQueries({ queryKey: key });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(shared);
      void supabase.removeChannel(own);
    };
    // key тұрақты: roomId-ден құралады.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token, userId, queryClient]);

  const setView = (view: RoomView) => {
    queryClient.setQueryData<RoomView>(key, (current) => (current && current.version > view.version ? current : view));
  };

  return { ...query, setView };
}

// Сервер уақытына қарай кері санау: deadline өткен соң сервердің фондық циклі күйді өзі ауыстырады.
export function secondsLeft(deadline: string | null | undefined, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
}

// Ойыншы түстері (дизайн: AdisBoard.dc.html PLAYERS).
export const SEAT_COLORS = ['#2563EB', '#C2410C', '#15803D', '#BE185D', '#7C3AED', '#0891B2'];
