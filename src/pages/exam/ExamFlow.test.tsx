// @vitest-environment jsdom
// Регрессия: «Деңгей таңдауға өту» → деңгей карталары → деңгей сессиясы (оқушы да, мұғалім де).
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetExamSelectionMemory } from '@/lib/exam-selection';

import ExamHomePage from './ExamHomePage';
import ExamPickerPage from './ExamPickerPage';

const api = {
  subjects: vi.fn(),
  subjectLevels: vi.fn(),
  active: vi.fn(),
  startByTopic: vi.fn(),
  abandon: vi.fn(),
  mixedSubjects: vi.fn(),
  startMixed: vi.fn(),
};

vi.mock('@/lib/examiner-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/examiner-api')>();
  return { ...actual, useExaminerApi: () => api };
});
vi.mock('@/components/bl/AppShell', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));

const SUBJECTS = [
  { subject_id: 'kz-history', title: 'Тарих', books: [] },
  { subject_id: 'math', title: 'Математика', books: [] },
];

function level(n: number) {
  return {
    level: n,
    title: ['Білу', 'Қолдану', 'Пайымдау', 'Қолдану + Пайымдау'][n - 1],
    formats: ['Тест'],
    tasks: 10,
    minutes: 10,
    available: true,
    availability: 'ready' as const,
    note: null,
    last: { level: n, p: null, mastered: false, is_final: false, taken_at: null },
  };
}

function SessionProbe() {
  const { sessionId } = useParams();
  return <p>Сессия: {sessionId}</p>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/exam" element={<ExamHomePage />} />
          <Route path="/exam/picker" element={<ExamPickerPage />} />
          <Route path="/exam/session/:sessionId" element={<SessionProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetExamSelectionMemory();
  api.subjects.mockResolvedValue(SUBJECTS);
  api.subjectLevels.mockResolvedValue({ scope: { type: 'subject', id: 'kz-history', title: 'Тарих' }, levels: [1, 2, 3, 4].map(level) });
  api.active.mockResolvedValue(null);
  api.startByTopic.mockResolvedValue({ session_id: 'sess-1' });
  api.mixedSubjects.mockResolvedValue([
    { subject_id: 'kz-history', title: 'Қазақстан тарихы', mcq: 1655, other: 58, levels: true },
    { subject_id: 'world', title: 'Дүниежүзі тарихы', mcq: 5064, other: 0, levels: false },
  ]);
  api.startMixed.mockResolvedValue({ session_id: 'mixed-1' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Емтихан: пән + тақырып → деңгей', () => {
  it('«Деңгей таңдауға өту» деңгей карталарын ашады және деңгей сессиясын бастайды', async () => {
    renderAt('/exam/picker');

    fireEvent.click(await screen.findByRole('radio', { name: 'Тарих' }));
    fireEvent.change(screen.getByLabelText('Тақырып'), { target: { value: '  Түрік   қағанаты ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Деңгей таңдауға өту' }));

    expect(await screen.findByRole('heading', { name: 'Деңгейді таңдаңыз' })).toBeInTheDocument();
    expect(screen.getByText('Тарих · Түрік қағанаты')).toBeInTheDocument();
    expect(api.subjectLevels).toHaveBeenCalledWith('kz-history');

    fireEvent.click(await screen.findByRole('button', { name: /^Қолдану(?!\s*\+)/ }));
    expect(await screen.findByText('Сессия: sess-1')).toBeInTheDocument();
    expect(api.startByTopic).toHaveBeenCalledWith('kz-history', 'Түрік қағанаты', 2);
  });

  it('сақталған таңдаумен /exam бірден деңгей карталарын көрсетеді', async () => {
    renderAt('/exam/picker');
    fireEvent.click(await screen.findByRole('radio', { name: 'Тарих' }));
    fireEvent.change(screen.getByLabelText('Тақырып'), { target: { value: 'Түрік қағанаты' } });
    fireEvent.click(screen.getByRole('button', { name: 'Деңгей таңдауға өту' }));
    await screen.findByRole('heading', { name: 'Деңгейді таңдаңыз' });
    cleanup();

    renderAt('/exam');
    expect(await screen.findByRole('heading', { name: 'Деңгейді таңдаңыз' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Білу/ })).toBeInTheDocument();
  });
});

describe('Емтихан: пән бойынша тест (10 / 20 / 50)', () => {
  it('60/40 құрамын көрсетіп, таңдалған санмен бірден бастайды', async () => {
    renderAt('/exam');
    fireEvent.click(await screen.findByRole('radio', { name: 'Пән бойынша тест' }));

    expect(await screen.findByRole('radio', { name: 'Қазақстан тарихы' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/12 тест · 8 аралас тапсырма/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '10' }));
    expect(screen.getByText(/6 тест · 4 аралас тапсырма/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Тест тақырыбы'), { target: { value: ' Түрік  қағанаты ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Тестті бастау' }));
    expect(await screen.findByText('Сессия: mixed-1')).toBeInTheDocument();
    expect(api.startMixed).toHaveBeenCalledWith('kz-history', 10, 'Түрік қағанаты');
    expect(api.subjectLevels).not.toHaveBeenCalled();
  });

  it('тек тест сұрағы бар пәнде (Дүниежүзі тарихы) 50 сұрақ түгел тест болады', async () => {
    renderAt('/exam');
    fireEvent.click(await screen.findByRole('radio', { name: 'Пән бойынша тест' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Дүниежүзі тарихы' }));
    fireEvent.click(screen.getByRole('radio', { name: '50' }));
    expect(screen.getByText(/50 тест — бұл пәнде әзірге тек тест сұрақтары бар/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Тестті бастау' }));
    expect(await screen.findByText('Сессия: mixed-1')).toBeInTheDocument();
    expect(api.startMixed).toHaveBeenCalledWith('world', 50, '');
  });

  it('режим таңдауы сақталады', async () => {
    renderAt('/exam');
    fireEvent.click(await screen.findByRole('radio', { name: 'Пән бойынша тест' }));
    await screen.findByRole('button', { name: 'Тестті бастау' });
    cleanup();

    renderAt('/exam');
    expect(await screen.findByRole('radio', { name: 'Пән бойынша тест' })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByRole('button', { name: 'Тестті бастау' })).toBeInTheDocument();
  });
});
