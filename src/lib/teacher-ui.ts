// Мұғалім беттерінің ортақ көмекшілері (D83).
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { classKeys, classRoster } from '@/lib/classes-api';

export const REVIEW_REASON_TITLES: Record<string, string> = {
  t9_missing_quote: 'Дәйексөз табылмады',
  borderline: 'Шекаралық балл',
  appeal: 'Оқушы шағымы',
  gold_sample: 'Бақылау үлгісі',
};

export function reviewReasonTitle(reason: string | null): string {
  return (reason && REVIEW_REASON_TITLES[reason]) || 'ЖИ бағасы';
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('kk-KZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const inputClass =
  'h-12 w-full rounded-[14px] border border-[#D9D6D0] bg-white px-4 text-[15px] text-[#111111] outline-none focus:border-[#111111]';

/** Мұғалімнің барлық сыныбындағы оқушылардың аты: examiner API атты бермейді (тек `student_id`). */
export function useStudentNames(): Map<string, string> {
  const roster = useQuery({ queryKey: classKeys.roster(), queryFn: () => classRoster() });
  return useMemo(() => {
    const names = new Map<string, string>();
    roster.data?.forEach((student) => names.set(student.student_id, student.full_name));
    return names;
  }, [roster.data]);
}
