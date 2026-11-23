// Жеке деректер / Баптаулар — барлық рөлге ортақ (дизайн: Settings.dc.html, ParentSettings.dc.html).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import Avatar from '@/components/bl/Avatar';
import { CameraIcon, PlusIcon } from '@/components/bl/icons';
import {
  Banner,
  Button,
  ConfirmSheet,
  ErrorNote,
  Field,
  ListGroup,
  ListRow,
  Page,
  PageTitle,
  Section,
  TextInput,
  TopBar,
} from '@/components/bl/ui';
import { useAuth, type UserRole } from '@/lib/auth-context';
import {
  incomingParentRequests,
  myChildren,
  outgoingParentRequests,
  platformKeys,
} from '@/lib/platform-api';
import { updateFullName } from '@/lib/profile-api';

// Аккаунтты толық жою үшін backend эндпоинті әлі жоқ: батырма соған дейін жасырын тұрады.
const ACCOUNT_DELETION_ENABLED = false;

const ROLE_TITLES: Record<UserRole, string> = {
  student: 'Оқушы',
  teacher: 'Мұғалім',
  parent: 'Ата-ана',
  admin: 'Әкімші',
};

function AvatarButton({ name, url, size }: { name: string; url?: string; size: 'md' | 'xl' }) {
  const badge = size === 'xl' ? 'h-[26px] w-[26px] -right-0.5 -bottom-0.5 border-bl-bg' : 'h-[22px] w-[22px] -right-[3px] -bottom-[3px] border-white';
  return (
    <Link to="/settings/avatar" aria-label="Профиль суретін өзгерту" className="relative flex-none rounded-full no-underline">
      <Avatar name={name} url={url} size={size} />
      <span
        aria-hidden="true"
        className={`absolute flex items-center justify-center rounded-full border-2 bg-bl-btn text-white ${badge}`}
      >
        <CameraIcon size={size === 'xl' ? 14 : 12} />
      </span>
    </Link>
  );
}

function ParentChildren() {
  const children = useQuery({ queryKey: platformKeys.children, queryFn: myChildren });
  const requests = useQuery({ queryKey: platformKeys.outgoing, queryFn: outgoingParentRequests });
  const pending = (requests.data ?? []).filter((r) => r.status === 'pending');

  return (
    <Section label="Балаларым">
      {children.isError ? <ErrorNote error={children.error} onRetry={() => children.refetch()} /> : null}
      <ListGroup>
        {(children.data ?? []).map((c) => (
          <div key={c.student_id} className="flex items-center gap-3 px-3.5 py-3">
            <Avatar name={c.full_name} url={c.avatar_url} tone="soft" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold">{c.full_name}</span>
              <span className="text-[13px] font-semibold text-bl-oktext">Расталды</span>
            </span>
          </div>
        ))}
        {pending.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-3.5 py-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-dashed border-bl-dash bg-bl-bg text-[15px] font-bold text-bl-ink3"
            >
              {r.child_email.charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold">{r.child_email}</span>
              <span className="text-[13px] text-bl-ink2">Баланың растауын күтуде</span>
            </span>
          </div>
        ))}
        <Link
          to="/parent/link"
          className="flex min-h-[52px] items-center gap-2.5 px-4 text-[15px] font-semibold text-bl-ink no-underline hover:bg-[#FBFAF8]"
        >
          <PlusIcon size={18} />
          Баланы қосу
        </Link>
      </ListGroup>
    </Section>
  );
}

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.fullName ?? '');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const role = user?.role ?? 'student';

  useEffect(() => setName(user?.fullName ?? ''), [user?.fullName]);

  const incoming = useQuery({
    queryKey: platformKeys.incoming,
    queryFn: incomingParentRequests,
    enabled: role === 'student',
  });
  const pendingIncoming = (incoming.data ?? []).filter((r) => r.status === 'pending').length;

  const saveName = useMutation({
    mutationFn: () => updateFullName(user!.id, name),
    onSuccess: async () => {
      setSaved(true);
      await refreshUser();
      void queryClient.invalidateQueries();
    },
  });

  const signOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  if (!user) return null;
  const dirty = name.trim().length >= 3 && name.trim() !== user.fullName;

  if (role === 'parent') {
    return (
      <AppShell>
        <Page>
          <PageTitle title="Баптаулар" />
          <div className="flex items-center gap-3.5 rounded-2xl border border-bl-line bg-white p-3.5">
            <AvatarButton name={user.fullName} url={user.avatarUrl} size="md" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[17px] font-semibold">{user.fullName}</span>
              <span className="truncate text-sm text-bl-ink2">Ата-ана · {user.email}</span>
            </span>
          </div>
          <ParentChildren />
          <ListGroup>
            <ListRow to="/settings/password">Құпиясөзді өзгерту</ListRow>
            <ListRow onClick={signOut}>Шығу</ListRow>
          </ListGroup>
        </Page>
      </AppShell>
    );
  }

  return (
    <AppShell nav={role !== 'student'}>
      {role === 'student' ? <TopBar back="/profile" backLabel="Профильге оралу" title="Жеке деректер" /> : null}
      <Page className={role === 'student' ? 'pt-2' : undefined}>
        {role !== 'student' ? <PageTitle title="Баптаулар" /> : null}
        <div className="flex items-center gap-3.5">
          <AvatarButton name={name || user.fullName} url={user.avatarUrl} size="xl" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-lg font-bold">{name || user.fullName}</span>
            <span className="text-sm text-bl-ink2">{ROLE_TITLES[role]}</span>
            <Link to="/settings/avatar" className="text-sm font-semibold text-bl-ink">
              Суретті өзгерту
            </Link>
          </span>
        </div>

        <section className="flex flex-col gap-3.5">
          <Field
            label="Аты-жөні"
            htmlFor="settings-name"
            hint={role === 'student' ? 'Мұғалім мен сыныптастарыңыз осы атты көреді' : 'Оқушылар мен ата-аналар осы атты көреді'}
            error={saveName.isError ? (saveName.error as Error).message : undefined}
          >
            <TextInput
              id="settings-name"
              type="text"
              autoComplete="name"
              maxLength={180}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Email</span>
            <span className="flex h-[52px] items-center truncate rounded-[14px] bg-bl-soft px-3.5 text-base text-bl-ink3">{user.email}</span>
          </div>
          {dirty ? (
            <Button size="md" onClick={() => saveName.mutate()} loading={saveName.isPending}>
              {saveName.isPending ? 'Сақталуда…' : 'Сақтау'}
            </Button>
          ) : null}
          {saved && !dirty ? <Banner tone="good">Сақталды</Banner> : null}
        </section>

        <ListGroup>
          <ListRow to="/settings/password">Құпиясөзді өзгерту</ListRow>
          {role === 'student' ? (
            <ListRow to="/notifications" trailing={pendingIncoming ? `${pendingIncoming} сұраныс` : undefined}>
              Ата-ана байланысы
            </ListRow>
          ) : null}
          {role !== 'student' ? <ListRow onClick={signOut}>Шығу</ListRow> : null}
        </ListGroup>

        {ACCOUNT_DELETION_ENABLED ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-11 self-start border-0 bg-transparent p-0 text-[15px] font-semibold text-bl-danger"
            >
              Аккаунтты жою
            </button>
            <ConfirmSheet
              open={confirmDelete}
              onClose={() => setConfirmDelete(false)}
              title="Аккаунтты жоясыз ба?"
              description="Емтихан нәтижелері, Тьютор диалогтары, жазбалар мен чаттар өшіріледі. Мұны қайтару мүмкін емес."
              confirmLabel="Иә, жою"
              onConfirm={() => setConfirmDelete(false)}
            />
          </>
        ) : null}
      </Page>
    </AppShell>
  );
}
