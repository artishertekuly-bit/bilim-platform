// Емтиханның таңдалған пәні, тақырыбы мен көлемі (ExamPicker → Main). Құрылғыда ғана сақталады.
// D93: оқушы тек пәнді таңдап, тақырыпты өзі жазады; платформа оған сай §-ті табады (`topicId`).
import { useCallback, useState } from 'react';

import type { ScopeType } from '@/lib/examiner-api';

const KEY = 'bilim.exam.selection';

export interface ExamSelection {
  subjectId: string | null;
  /** The topic as the learner wrote it. */
  topicQuery: string;
  book: string | null;
  scopeType: ScopeType;
  topicId: string | null;
  chapterId: string | null;
}

const EMPTY: ExamSelection = { subjectId: null, topicQuery: '', book: null, scopeType: 'topic', topicId: null, chapterId: null };

export function readExamSelection(): ExamSelection {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // Бұрынғы бөлек кілттерден көшіру.
      const book = window.localStorage.getItem('bilim.exam.book');
      const scope = window.localStorage.getItem('bilim.exam.scope') as ScopeType | null;
      return { ...EMPTY, book, scopeType: scope === 'chapter' || scope === 'subject' ? scope : 'topic' };
    }
    const v = JSON.parse(raw) as Partial<ExamSelection>;
    return {
      subjectId: typeof v.subjectId === 'string' ? v.subjectId : null,
      topicQuery: typeof v.topicQuery === 'string' ? v.topicQuery.slice(0, 200) : '',
      book: typeof v.book === 'string' ? v.book : null,
      scopeType: v.scopeType === 'chapter' || v.scopeType === 'subject' ? v.scopeType : 'topic',
      topicId: typeof v.topicId === 'string' ? v.topicId : null,
      chapterId: typeof v.chapterId === 'string' ? v.chapterId : null,
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
