// Сабақтар каталогы (karta §3.2, D19, D21, D31; api §5.1): «Барлығы / Сақталғандар», атауы бойынша іздеу.
// Сабақта тест, балл және прогресс жоқ: бұл — өмірлік дағдылар туралы дербес сабақтар.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Banner, Card, ExamScreen, LoadingBlock, SimpleHeader } from '@/components/exam/ExamUi';
import { platformKeys, savedLessons, searchLessons, type LessonCard } from '@/lib/platform-api';
import { inputClass } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

function LessonItem({ lesson }: { lesson: LessonCard }) {
  return (
    <Link to={`/lessons/${lesson.lesson_id}`} className="no-underline text-inherit">
      <Card className="flex flex-col gap-1 px-4 py-3.5">
        <span className="text-[15px] font-semibold">{lesson.title}</span>
        <span className="line-clamp-2 text-[13px] leading-snug text-[#5E5E5E]">{lesson.excerpt}</span>
        <span className="text-xs text-[#5E5E5E]">{lesson.author_name}</span>
      </Card>
    </Link>
  );
}

export default function LessonsCatalogPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'saved' ? 'saved' : 'all';
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  const all = useQuery({
    queryKey: platformKeys.lessons(query),
    queryFn: () => searchLessons(query, 40, 0),
    enabled: tab === 'all',
  });
  const saved = useQuery({ queryKey: platformKeys.saved, queryFn: savedLessons, enabled: tab === 'saved' });
  const active = tab === 'all' ? all : saved;
  const items = tab === 'all' ? all.data?.items : saved.data;

  return (
    <ExamScreen header={<SimpleHeader title="Сабақтар" to="/dashboard" />}>
      <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-[#ECE9E3] p-1">
        {(['all', 'saved'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setParams(value === 'saved' ? { tab: 'saved' } : {}, { replace: true })}
            className={cn(
              'h-10 rounded-xl text-sm font-semibold',
              tab === value ? 'bg-white text-[#111111] shadow-sm' : 'text-[#4A4A4A]',
            )}
          >
            {value === 'all' ? 'Барлығы' : 'Сақталғандар'}
          </button>
        ))}
      </div>

      {tab === 'all' ? (
        <input
          type="search"
          className={inputClass}
          value={input}
          maxLength={120}
          placeholder="Сабақты атауы бойынша іздеу"
          aria-label="Сабақты іздеу"
          onChange={(event) => setInput(event.target.value)}
        />
      ) : null}

      {active.isLoading ? <LoadingBlock /> : null}
      {active.isError ? <Banner tone="bad">{(active.error as Error).message}</Banner> : null}
      {items && items.length === 0 ? (
        <Card className="px-4 py-3.5 text-sm text-[#5E5E5E]">
          {tab === 'saved'
            ? 'Әзірге сақталған сабақ жоқ. Сабақ бетіндегі «Сақтау» батырмасын басыңыз.'
            : query
              ? 'Бұл атаумен сабақ табылмады.'
              : 'Әзірге жарияланған сабақ жоқ.'}
        </Card>
      ) : null}
      {items?.map((lesson) => <LessonItem key={lesson.lesson_id} lesson={lesson} />)}
      {tab === 'all' && all.data && all.data.total > all.data.items.length ? (
        <p className="m-0 text-center text-xs text-[#5E5E5E]">
          Алғашқы {all.data.items.length} сабақ көрсетілді ({all.data.total}). Іздеуді нақтылаңыз.
        </p>
      ) : null}
    </ExamScreen>
  );
}
