// Емтиханның таңдалған пәні мен тақырыбы (ExamPicker → Main). Құрылғыда ғана сақталады.
// D93: емтихан — пән бойынша жалпы тестілеу. Оқушы не мұғалім пәнді таңдап, тақырыпты өзі жазады;
// сынып пен оқулық таңдалмайды, тақырыпқа сай мәтінді платформа дерекқордан өзі алады.
import { useCallback, useState } from 'react';

const KEY = 'bilim.exam.selection';
export const MAX_TOPIC_CHARS = 200;

export interface ExamSelection {
  subjectId: string | null;
  /** The topic as the learner or teacher wrote it. */
  topic: string;
}

const EMPTY: ExamSelection = { subjectId: null, topic: '' };

export function readExamSelection(): ExamSelection {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<ExamSelection> & { topicQuery?: unknown };
    // D93-тің бірінші нұсқасы тақырыпты `topicQuery` деп сақтаған.
    const topic = typeof v.topic === 'string' ? v.topic : typeof v.topicQuery === 'string' ? v.topicQuery : '';
    return {
      subjectId: typeof v.subjectId === 'string' ? v.subjectId : null,
      topic: topic.slice(0, MAX_TOPIC_CHARS),
    };
  } catch {
    return EMPTY;
  }
}

export function writeExamSelection(next: ExamSelection): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* жеке терезеде сақталмауы мүмкін */
  }
}

export function useExamSelection() {
  const [selection, setSelection] = useState<ExamSelection>(readExamSelection);
  const update = useCallback((patch: Partial<ExamSelection>) => {
    setSelection((prev) => {
      const next = { ...prev, ...patch };
      writeExamSelection(next);
      return next;
    });
  }, []);
  return [selection, update] as const;
}
