// Емтиханның таңдалған пәні мен тақырыбы (ExamPicker → Main). Құрылғыда ғана сақталады.
// D93: емтихан — пән бойынша жалпы тестілеу. Оқушы не мұғалім пәнді таңдап, тақырыпты өзі жазады;
// сынып пен оқулық таңдалмайды, тақырыпқа сай мәтінді платформа дерекқордан өзі алады.
//
// Таңдау — модуль деңгейіндегі ортақ қор (useSyncExternalStore). Бұрын ол setState-тің updater-ында
// localStorage-қа жазылатын: picker `update()`-тен кейін бірден `navigate('/exam')` шақырғанда React екі
// жаңартуды бір рендерге біріктіріп, picker-ді updater-ы орындалмай тұрып жауып тастайтын — таңдау сақталмай,
// /exam бос күйін көрсететін («Деңгей таңдауға өту» ештеңе істемегендей көрінетін). Енді жазу синхронды.
import { useSyncExternalStore } from 'react';

const KEY = 'bilim.exam.selection';
export const MAX_TOPIC_CHARS = 200;

/** levels — 4 деңгейлік емтихан; mixed — пән бойынша аралас тест (10/20/50 сұрақ). */
export type ExamMode = 'levels' | 'mixed';

export interface ExamSelection {
  subjectId: string | null;
  /** The topic as the learner or teacher wrote it. */
  topic: string;
  mode: ExamMode;
}

const EMPTY: ExamSelection = { subjectId: null, topic: '', mode: 'levels' };

function parse(raw: string | null): ExamSelection {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<ExamSelection> & { topicQuery?: unknown };
    // D93-тің бірінші нұсқасы тақырыпты `topicQuery` деп сақтаған.
    const topic = typeof v.topic === 'string' ? v.topic : typeof v.topicQuery === 'string' ? v.topicQuery : '';
    return {
      subjectId: typeof v.subjectId === 'string' ? v.subjectId : null,
      topic: topic.slice(0, MAX_TOPIC_CHARS),
      mode: v.mode === 'mixed' ? 'mixed' : 'levels',
    };
  } catch {
    return EMPTY;
  }
}

// Жеке терезеде localStorage жазылмауы мүмкін: соңғы таңдау жадта да тұрады.
let memoryRaw: string | null = null;
let cached: { raw: string | null; value: ExamSelection } | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memoryRaw;
  } catch {
    return memoryRaw;
  }
}

export function readExamSelection(): ExamSelection {
  const raw = readRaw();
  if (!cached || cached.raw !== raw) cached = { raw, value: parse(raw) };
  return cached.value;
}

export function writeExamSelection(next: ExamSelection): void {
  const raw = JSON.stringify(next);
  memoryRaw = raw;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    /* жеке терезеде сақталмауы мүмкін — жадтағы мән қалады */
  }
  listeners.forEach((listener) => listener());
}

/** Синхронды: навигациядан бұрын шақырылса да, келесі бет жаңа таңдауды оқиды. */
export function updateExamSelection(patch: Partial<ExamSelection>): ExamSelection {
  const next = { ...readExamSelection(), ...patch };
  writeExamSelection(next);
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Тек тесттерге: жадтағы таңдауды тазалайды. */
export function resetExamSelectionMemory(): void {
  memoryRaw = null;
  cached = null;
}

export function useExamSelection() {
  const selection = useSyncExternalStore(subscribe, readExamSelection, readExamSelection);
  return [selection, updateExamSelection] as const;
}
