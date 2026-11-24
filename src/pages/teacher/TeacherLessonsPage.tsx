// Менің сабақтарым (дизайн: TeacherLessons.dc.html; karta §3.2, §4.1, D20, D29):
// «Жарияланған / Жоба / Жасырылған», жаңа сабақ, өңдеу.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PlusIcon } from '@/components/bl/icons';
import { EmptyNote, ErrorNote, LoadingBlock, Segmented } from '@/components/bl/ui';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { useAuth } from '@/lib/auth-context';
import { departmentKeys, myLessonReviews } from '@/lib/departments-api';
import { platformKeys, teacherLessons, type LessonStatus } from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';

export default function TeacherLessonsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<LessonStatus>('published');
  const lessons = useQuery({ queryKey: platformKeys.teacherLessons, queryFn: () => teacherLessons(user?.id ?? ''), enabled: !!user?.id });
  const hasHidden = (lessons.data ?? []).some((l) => l.status === 'hidden');
  // Жасырудың себебі content_reviews-те: мұғалім оны тек өз сабағы үшін RPC арқылы оқиды (D91).
  const reviews = useQuery({ queryKey: departmentKeys.lessonReviews, queryFn: myLessonReviews, enabled: hasHidden });
  const reasonOf = new Map((reviews.data ?? []).map((r) => [r.lesson_id, r]));
  const items = (lessons.data ?? []).filter((l) => l.status === tab);
  const count = (s: LessonStatus) => (lessons.data ?? []).filter((l) => l.status === s).length;

  return (
    <TeacherScreen
      title="Сабақтар"
      right={
        <Link
          to="/teacher/lessons/new"
          className="flex h-11 flex-none items-center gap-1.5 rounded-xl bg-bl-btn px-3.5 text-sm font-semibold text-white no-underline"
        >
          <PlusIcon size={16} />
          Жаңа
        </Link>
      }
    >
      <Segmented<LessonStatus>
        label="Сабақ күйі"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'published', label: `Жарияланған${lessons.data ? ` · ${count('published')}` : ''}` },
          { id: 'draft', label: `Жоба${lessons.data ? ` · ${count('draft')}` : ''}` },
          { id: 'hidden', label: `Жасырылған${hasHidden ? ` · ${count('hidden')}` : ''}` },
        ]}
      />

      <div className="flex flex-col gap-2.5">
        {lessons.isLoading ? <LoadingBlock rows={3} /> : null}
        {lessons.isError ? <ErrorNote error={lessons.error} onRetry={() => lessons.refetch()} /> : null}
        {items.map((l) => (
          <div key={l.id} className="flex flex-col gap-2 rounded-2xl border border-bl-line bg-white px-4 py-3.5">
            <Link to={`/lessons/${l.id}`} className="text-base font-semibold leading-[1.35] text-bl-ink no-underline">
              {l.title}
            </Link>
            <span className="text-[13px] text-bl-ink2">
              {l.status === 'published' && l.published_at ? `Жарияланды · ${formatDateTime(l.published_at)}` : `Өзгертілді · ${formatDateTime(l.updated_at)}`}
            </span>
            {l.status === 'hidden' ? (
              <span className="flex flex-col gap-1 rounded-[10px] bg-bl-warnbg px-3 py-2.5 text-sm leading-[1.45] text-bl-warntext">
                {reasonOf.get(l.id)?.feedback ? (
                  <>
                    <span className="font-semibold">Себебі: {reasonOf.get(l.id)!.feedback}</span>
                    <span>Жасырылды · {formatDateTime(reasonOf.get(l.id)!.reviewed_at)}. Сабақты тек модератор қайта аша алады.</span>
                  </>
                ) : (
                  'Сабақты модератор жасырды. Оны тек модератор қайта аша алады.'
                )}
              </span>
            ) : null}
            {l.status !== 'hidden' ? (
              <Link
                to={`/teacher/lessons/${l.id}/edit`}
                className="flex h-10 items-center self-start rounded-[10px] border border-bl-field bg-white px-3.5 text-sm font-semibold text-bl-ink no-underline"
              >
                Өңдеу
              </Link>
            ) : null}
          </div>
        ))}
        {lessons.data && !items.length ? <EmptyNote>Бұл бөлімде сабақ жоқ</EmptyNote> : null}
      </div>
      <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
        Сабақ — өмірлік дағдылар туралы дербес бірлік: онда тест, балл және прогресс жоқ. Жарияланған сабақты барлық оқушы каталогтан көреді.
      </p>
    </TeacherScreen>
  );
}
