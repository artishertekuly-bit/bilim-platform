// Оқушы профилі (дизайн: Profile.dc.html; api §3.8, D63): нәтижелер P1…P4, мұғалімдер, баптау сілтемелері.
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import Avatar from '@/components/bl/Avatar';
import { ButtonLink, Card, EmptyNote, ErrorNote, ListGroup, ListRow, LoadingBlock, Page, Section } from '@/components/bl/ui';
import { LevelGrid } from '@/components/exam/LevelGrid';
import { useAuth } from '@/lib/auth-context';
import { classKeys, myClasses } from '@/lib/classes-api';
import { useExaminerApi } from '@/lib/examiner-api';
import { incomingParentRequests, platformKeys } from '@/lib/platform-api';

export default function StudentProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const api = useExaminerApi();
  const isStudent = user?.role === 'student';
  const profile = useQuery({ queryKey: ['examiner', 'profile'], queryFn: api.profile, enabled: isStudent });
  const classes = useQuery({ queryKey: classKeys.mine, queryFn: myClasses, enabled: isStudent });
  const incoming = useQuery({ queryKey: platformKeys.incoming, queryFn: incomingParentRequests, enabled: isStudent });

  if (user && !isStudent) return <Navigate to="/settings" replace />;
  if (!user) return null;

  const classTitles = [...new Set((classes.data ?? []).map((c) => c.title))];
  const pending = (incoming.data ?? []).filter((r) => r.status === 'pending').length;

  const signOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <AppShell>
      <Page>
        <div className="flex items-center gap-3.5">
          <Link to="/settings/avatar" aria-label="Профиль суретін өзгерту" className="flex-none rounded-full no-underline">
            <Avatar name={user.fullName} url={user.avatarUrl} size="lg" />
          </Link>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="m-0 truncate text-[22px] font-bold tracking-[-0.01em]">{user.fullName}</h1>
            <span className="truncate text-sm text-bl-ink2">{classTitles.length ? classTitles.join(', ') : 'Сыныпқа әлі қосылмағансыз'}</span>
          </div>
        </div>

        <Section label="Нәтижелерім">
          {profile.isLoading ? <LoadingBlock rows={2} /> : null}
          {profile.isError ? <ErrorNote error={profile.error} onRetry={() => profile.refetch()} /> : null}
          {profile.data && profile.data.subjects.length === 0 ? (
            <Card className="flex flex-col gap-3 p-4">
              <span className="text-[15px] font-semibold">Профиль әлі бос</span>
              <span className="text-sm leading-[1.45] text-bl-ink2">
                Профиль «Пән» көлеміндегі емтиханнан құрылады. Оқулықты таңдап, «Пән» көлемінде кез келген деңгейді тапсырыңыз.
              </span>
              <ButtonLink to="/exam" size="md">
                Емтиханға өту
              </ButtonLink>
            </Card>
          ) : null}
          {profile.data?.subjects.map((s) => {
            const anyTaken = s.levels.some((l) => l.p !== null);
            return anyTaken ? (
              <Card key={s.subject.id} className="flex flex-col gap-2.5 p-3.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold">{s.subject.title}</span>
                  {s.f !== null ? (
                    <span className="text-sm font-semibold">
                      F {Math.round(s.f)}%{s.f_is_final === false ? ' · алдын ала' : ''}
                    </span>
                  ) : null}
                </span>
                <LevelGrid levels={s.levels} />
              </Card>
            ) : (
              <div key={s.subject.id} className="flex items-center justify-between rounded-2xl border border-bl-line bg-white p-3.5">
                <span className="text-base font-semibold">{s.subject.title}</span>
                <span className="text-[13px] text-bl-ink2">Барлық деңгей өтпеді</span>
              </div>
            );
          })}
          {profile.data?.subjects.length ? (
            <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">Пән бойынша жалпы балл төрт деңгей түгел тапсырылғанда шығады.</p>
          ) : null}
        </Section>

        <Section label="Мұғалімдер">
          {classes.isError ? <ErrorNote error={classes.error} onRetry={() => classes.refetch()} /> : null}
          {classes.data && classes.data.length === 0 ? <EmptyNote>Сыныпқа қосылсаңыз, мұғалімдеріңіз осында көрінеді.</EmptyNote> : null}
          {classes.data?.length ? (
            <ListGroup>
              {classes.data.map((c) => (
                <div key={c.class_id} className="flex items-center gap-3 px-3.5 py-3">
                  <Avatar name={c.teacher_name} tone="soft" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{c.teacher_name}</span>
                    <span className="truncate text-[13px] text-bl-ink2">
                      {c.subject} · {c.title}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${c.teacher_name} мұғалімге жазу`}
                    onClick={() => navigate('/chat', { state: { with: c.teacher_id } })}
                    className="h-11 flex-none rounded-xl border-0 bg-bl-btn px-4 text-sm font-semibold text-white"
                  >
                    Жазу
                  </button>
                </div>
              ))}
            </ListGroup>
          ) : null}
        </Section>

        <ListGroup>
          <ListRow to="/classes">Сыныпқа қосылу</ListRow>
          <ListRow to="/settings">Жеке деректер</ListRow>
          <ListRow to="/notifications" trailing={pending ? `${pending} жаңа` : undefined}>
            Хабарламалар
          </ListRow>
          <ListRow onClick={signOut}>Шығу</ListRow>
        </ListGroup>
      </Page>
    </AppShell>
  );
}
