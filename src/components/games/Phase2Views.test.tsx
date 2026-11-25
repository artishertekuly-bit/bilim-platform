// @vitest-environment jsdom
// D99: Games 2-кезең — аукцион (ставка), «Сенемін — Сенбеймін» (екі қадам), эскейп рум (құлыптар мен код).
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AuctionView from '@/components/games/AuctionView';
import EscapeRoomView from '@/components/games/EscapeRoomView';
import FactCheckView from '@/components/games/FactCheckView';
import { GAMES, GAME_TITLE, type RoomView } from '@/lib/games-api';
import { FINISH_TITLE, clampBet, formatTime } from '@/lib/games-ui';

const ME = 'u0';
const LATER = new Date(Date.now() + 60_000).toISOString();
const OPTIONS = [
  { id: 'a', text: '1465' },
  { id: 'b', text: '1511' },
  { id: 'c', text: '1731' },
];

function roomView(game: string, pub: Record<string, unknown>, priv: Record<string, unknown>): RoomView {
  return {
    room: {
      room_id: 'r1', game_type: game as RoomView['room']['game_type'], mode: 'solo', status: 'playing', join_code: null,
      host_role: 'student', scope: { subject_id: null, book: null, labels: [] }, settings: {}, min_players: 1,
      max_players: 1, players: [{ seat: 0, name: 'Әлия', left: false, user_id: ME }], created_at: null, started_at: null,
    },
    version: 1,
    public: { game, deadline: LATER, ...pub } as RoomView['public'],
    private: priv,
    me: { user_id: ME, seat: 0, left: false },
  };
}

const player = { id: ME, seat: 0, name: 'Әлия', left: false };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Каталог', () => {
  it('үш жаңа ойын тізімде, атаулары қазақша', () => {
    expect(GAMES.map((g) => g.type)).toEqual(expect.arrayContaining(['auction', 'fact_check', 'escape_room']));
    expect([GAME_TITLE.auction, GAME_TITLE.fact_check, GAME_TITLE.escape_room]).toEqual([
      'Білім аукционы', 'Сенемін — Сенбеймін', 'Эскейп рум',
    ]);
    expect(GAMES.find((g) => g.type === 'escape_room')?.modes).toEqual(['multi', 'solo']);
    expect(FINISH_TITLE.auction).toBe('Аукцион аяқталды');
  });
});

describe('Білім аукционы', () => {
  const betPublic = {
    phase: 'bet', rounds: 8, round: 1, min_bet: 50, granted: [], last: null, question: null,
    lot: { paragraph: 'Қазақ хандығы', difficulty: 2, tier: 'Орташа' },
    players: [{ ...player, balance: 1000, bet_placed: false }],
  };

  it('ставка кезінде тек лот көрінеді, пресет пен ставка жіберіледі', () => {
    const act = vi.fn().mockResolvedValue(undefined);
    render(<AuctionView view={roomView('auction', betPublic, { balance: 1000, my_bet: null })} act={act} busy={false} />);
    expect(screen.getByText('Қазақ хандығы')).toBeInTheDocument();
    expect(screen.getByText('Қиындығы: Орташа')).toBeInTheDocument();
    expect(screen.getByLabelText('Ставка')).toHaveAttribute('max', '1000');
    fireEvent.click(screen.getByRole('button', { name: '50%' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ставка қою: 500' }));
    expect(act).toHaveBeenCalledWith({ type: 'bet', amount: 500 });
  });

  it('жауап кезінде сұрақ ашылады, ставка тегі көрінеді', () => {
    const pub = {
      ...betPublic, phase: 'answer',
      question: { qid: 'q1', paragraph: 'Қазақ хандығы', difficulty: 2, stem: 'Хандық қай жылы құрылды?', options: OPTIONS, to: [ME], deadline: LATER, answered: [] },
    };
    render(<AuctionView view={roomView('auction', pub, { balance: 1000, my_bet: 300 })} act={vi.fn()} busy={false} />);
    expect(screen.getByText('Хандық қай жылы құрылды?')).toBeInTheDocument();
    expect(screen.getByText(/ставка 300/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ставка')).not.toBeInTheDocument();   // ставка енді өзгермейді
  });

  it('ставка шегі: 50…баланс, 10-ға еселі', () => {
    expect([clampBet(12, 50, 1000), clampBet(2000, 50, 1000), clampBet(333, 50, 1000)]).toEqual([50, 1000, 330]);
  });
});

describe('Сенемін — Сенбеймін', () => {
  const pub = {
    phase: 'question', rounds: 8, round: 1, last: null, points: { true: 100, spot: 50, bonus: 50 },
    players: [{ ...player, score: 0, answered: false }],
    statement: { qid: 's1', paragraph: 'Қазақ хандығы', difficulty: 1, stem: 'Қазақ хандығы қай жылы құрылды?', claim: '1511', options: OPTIONS, to: [ME], deadline: LATER, answered: [] },
  };

  it('«Сенемін» бірден жіберіледі', () => {
    const act = vi.fn().mockResolvedValue(undefined);
    render(<FactCheckView view={roomView('fact_check', pub, { score: 0, my_answer: null })} act={act} busy={false} />);
    expect(screen.getByText('Жауабы: 1511')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сенемін' }));
    expect(act).toHaveBeenCalledWith({ type: 'verdict', choice: 'true' });
  });

  it('«Сенбеймін» — екінші қадамда түзету таңдалады', () => {
    const act = vi.fn().mockResolvedValue(undefined);
    render(<FactCheckView view={roomView('fact_check', pub, { score: 0, my_answer: null })} act={act} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Сенбеймін' }));
    expect(screen.getByText('Дұрысы қайсы?')).toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '1465' }));
    expect(act).toHaveBeenCalledWith({ type: 'verdict', choice: 'false', option: 'a' });
  });

  it('раундтан кейін шындық пен түсіндірме ашылады', () => {
    const reveal = {
      ...pub, phase: 'reveal', statement: null,
      last: { stem: pub.statement.stem, claim: '1511', truth: false, fix_text: '1465', explanation: 'Дұрыс жауап: 1465',
        players: { 0: { points: 100, ok: true, fixed: true, choice: 'false' } } },
    };
    const act = vi.fn().mockResolvedValue(undefined);
    render(<FactCheckView view={roomView('fact_check', reveal, { score: 100, ready: false })} act={act} busy={false} />);
    expect(screen.getByText('Тұжырым қате · дұрысы: 1465')).toBeInTheDocument();
    expect(screen.getByText('+100 ұпай · түзету дұрыс')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Келесі тұжырым' }));
    expect(act).toHaveBeenCalledWith({ type: 'next' });
  });
});

describe('Эскейп рум', () => {
  const pub = {
    phase: 'playing', locks: 5, penalty_s: 10, started_at: LATER,
    lock_names: ['Кіреберіс', 'Кітапхана', 'Зертхана', 'Сервер бөлмесі', 'Шығыс есік'],
    players: [{ ...player, solved: 2, escaped: false, penalty: 10, time_s: null }],
  };

  it('құлып жолағы, ашылған таңбалар және тек ағымдағы сұрақ', () => {
    const priv = {
      stage: 3, solved: 2, penalty: 10, code_slots: ['7', 'K', null, null, null], need_code: false, escaped: false,
      feedback: { ok: false, lock: 3, penalty: 10 },
      challenge: { qid: 'c3', paragraph: 'Жаңа заман', difficulty: 2, stem: 'Зертхана есігіндегі жыл?', options: OPTIONS, to: [ME], deadline: LATER, answered: [] },
    };
    render(<EscapeRoomView view={roomView('escape_room', pub, priv)} act={vi.fn()} busy={false} />);
    expect(screen.getByLabelText('Ашылған құлып: 2/5')).toBeInTheDocument();
    expect(screen.getAllByTestId('code-slot').map((s) => s.textContent)).toEqual(['7', 'K', '?', '?', '?']);
    expect(screen.getByText('Зертхана есігіндегі жыл?')).toBeInTheDocument();
    expect(screen.getByText(/\+10 с айыппұл/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Шығыс коды')).not.toBeInTheDocument();
  });

  it('бес құлыптан кейін шығыс коды енгізіледі', () => {
    const act = vi.fn().mockResolvedValue(undefined);
    const priv = { stage: 5, solved: 5, penalty: 0, code_slots: ['7', 'K', 'Q', '2', 'M'], need_code: true, escaped: false, challenge: null, feedback: null };
    render(<EscapeRoomView view={roomView('escape_room', pub, priv)} act={act} busy={false} />);
    fireEvent.change(screen.getByLabelText('Шығыс коды'), { target: { value: '7kq2m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Есікті ашу' }));
    expect(act).toHaveBeenCalledWith({ type: 'code', code: '7KQ2M' });
  });

  it('уақыт пішімі', () => {
    expect([formatTime(110), formatTime(null), formatTime(5)]).toEqual(['1:50', '—', '0:05']);
  });
});
