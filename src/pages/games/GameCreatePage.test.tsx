// @vitest-environment jsdom
// D98: ойын бөлмесінің сұрақ көзі — пән банкі, параграфтар, еркін тақырып. Тұйық «банк дайын емес» жоқ.
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GameCreatePage from './GameCreatePage';

const api = {
  scopes: vi.fn(),
  bankSubjects: vi.fn(),
  preview: vi.fn(),
  createRoom: vi.fn(),
};

vi.mock('@/lib/games-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/games-api')>();
  return { ...actual, useGamesApi: () => api };
});
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { role: 'student' } }) }));

function RoomProbe() {
  const { roomId } = useParams();
  return <p>Бөлме: {roomId}</p>;
}

function renderPage(path = '/games/new?game=baige&mode=solo') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/games/new" element={<GameCreatePage />} />
          <Route path="/games/rooms/:roomId" element={<RoomProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.scopes.mockResolvedValue([]);
  api.bankSubjects.mockResolvedValue([
    { subject_id: 'kz', title: 'Қазақстан тарихы', mcq: 1655, has_textbook: true },
    { subject_id: 'world', title: 'Дүниежүзі тарихы', mcq: 5064, has_textbook: false },
  ]);
  api.preview.mockImplementation(async (body: { source: string }) =>
    body.source === 'topic'
      ? { source: 'topic', available: 0, needed: 10, deficit: 20, generate: true, ready: true }
      : { source: 'bank', available: 200, needed: 10, deficit: 0, generate: false, ready: true },
  );
  api.createRoom.mockResolvedValue({ room: { room_id: 'room-1' } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Ойын бөлмесі: сұрақ көзі', () => {
  it('пән банкінен бірден басталады ($0, LLM жоқ)', async () => {
    renderPage();
    expect(await screen.findByText(/Дайын: 200\+ сұрақ/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Пән'), { target: { value: 'world' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Бастау' }));
    expect(await screen.findByText('Бөлме: room-1')).toBeInTheDocument();
    expect(api.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ game_type: 'baige', mode: 'solo', source: 'bank', subject_id: 'world', topic_query: null }),
    );
  });

  it('параграф банкі бос болса, тұйық емес — басқа көз ұсынылады', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Параграфтар' }));
    expect(await screen.findByText(/«Пән банкі» не «Еркін тақырып» көзін таңдаңыз/)).toBeInTheDocument();
    expect(screen.queryByText(/Ойын банкі әлі дайын емес/)).not.toBeInTheDocument();
  });

  it('еркін тақырыпта ЖИ тек керек болғанда құрады және жүктелу күйін көрсетеді', async () => {
    let finish: (value: unknown) => void = () => {};
    api.createRoom.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Еркін тақырып' }));
    fireEvent.change(screen.getByPlaceholderText('Пән, мысалы: Информатика'), { target: { value: 'Информатика' } });
    fireEvent.change(screen.getByPlaceholderText('Тақырып, мысалы: Excel формулалары'), {
      target: { value: 'Excel формулалары' },
    });
    expect(await screen.findByText(/ЖИ бір рет құрады \(20 сұрақ\)/)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Бастау' }));
    expect(await screen.findByText('Сұрақтар құрылып жатыр…')).toBeInTheDocument();
    expect(api.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'topic', subject_text: 'Информатика', topic_query: 'Excel формулалары' }),
    );
    finish({ room: { room_id: 'room-2' } });
    expect(await screen.findByText('Бөлме: room-2')).toBeInTheDocument();
  });
});
