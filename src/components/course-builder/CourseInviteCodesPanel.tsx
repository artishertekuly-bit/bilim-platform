import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  CalendarClock,
  Copy,
  KeyRound,
  Lock,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CourseAccessType, CourseInviteRow } from '@/lib/app-data-types';
import {
  formatDateTime,
  toDateTimeLocalValue,
} from '@/lib/course-creator/course-builder-utils';

type InviteFormState = {
  maxUses: string;
  expiresAt: string;
};

function FieldBlock({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? (
        <p className="text-[11px] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function isInviteCourse(accessType: CourseAccessType) {
  const normalized = String(accessType || '');

  return (
    normalized === 'private_invite' ||
    normalized === 'school_only' ||
    normalized === 'closed' ||
    normalized === 'invite_only'
  );
}

function InviteCodeCard({
  invite,
  deactivatePending,
  onCopyInviteCode,
  onDeactivateInvite,
}: {
  invite: CourseInviteRow;
  deactivatePending: boolean;
  onCopyInviteCode: (code: string) => void;
  onDeactivateInvite: (inviteId: string) => void;
}) {
  const remaining =
    invite.max_uses === null
      ? null
      : Math.max(invite.max_uses - invite.used_count, 0);

  const active = invite.is_active;
  const exhausted = remaining === 0;
  const statusTone = !active ? 'muted' : exhausted ? 'warning' : 'success';
  const statusLabel = !active ? 'Өшірілген' : exhausted ? 'Лимит бітті' : 'Белсенді';

  return (
    <div
      className={`rounded-3xl border p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-soft-md ${
        active
          ? 'border-border bg-card hover:border-primary-muted'
          : 'border-border bg-muted/55 opacity-80'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${
                active
                  ? 'border-primary-muted bg-primary-soft text-primary'
                  : 'border-border bg-card text-muted-foreground'
              }`}
            >
              <KeyRound size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="rounded-2xl border border-border bg-surface-soft/70 px-3 py-1.5 font-mono text-sm font-semibold tracking-wide text-foreground">
                  {invite.code}
                </p>

                <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
              </div>

              <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
                  <Users size={11} />
                  Қолданылды: {invite.used_count}
                  {invite.max_uses === null
                    ? ' / шектеусіз'
                    : ` / ${invite.max_uses}`}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
                  <Users size={11} />
                  Қалғаны: {remaining === null ? 'шектеусіз' : remaining}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1 sm:col-span-2">
                  <CalendarClock size={11} />
                  Мерзімі: {formatDateTime(invite.expires_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onCopyInviteCode(invite.code)}
            aria-label="Кіру кодын көшіру"
          >
            <Copy size={13} />
          </Button>

          {active ? (
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              disabled={deactivatePending}
              onClick={() => onDeactivateInvite(invite.id)}
              aria-label="Кіру кодын өшіру"
            >
              <Trash2 size={13} />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CourseInviteCodesPanel({
  accessType,
  inviteForm,
  setInviteForm,
  courseInvites,
  courseInvitesLoading,
  createInvitePending,
  deactivateInvitePending,
  onCreateInvite,
  onDeactivateInvite,
  onCopyInviteCode,
}: {
  accessType: CourseAccessType;
  inviteForm: InviteFormState;
  setInviteForm: Dispatch<SetStateAction<InviteFormState>>;
  courseInvites: CourseInviteRow[];
  courseInvitesLoading: boolean;
  createInvitePending: boolean;
  deactivateInvitePending: boolean;
  onCreateInvite: () => void;
  onDeactivateInvite: (inviteId: string) => void;
  onCopyInviteCode: (code: string) => void;
}) {
  const inviteCourse = isInviteCourse(accessType);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <KeyRound size={16} />
                Кіру кодтары
              </CardTitle>

              <StatusBadge tone="secondary">
                <KeyRound size={12} />
                {courseInvites.length} code
              </StatusBadge>

              <StatusBadge tone={inviteCourse ? 'primary' : 'warning'}>
                {inviteCourse ? 'Жабық курс режимі' : 'Жабық курс емес'}
              </StatusBadge>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Кіру коды оқушыға курсқа қолжетімділік береді және автоматты түрде курс
              enrollment жасайды. Бұл әсіресе жабық курс үшін керек.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!inviteCourse ? (
          <div className="rounded-3xl border border-warning-muted bg-warning-soft/70 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-warning-muted bg-card text-warning-foreground shadow-inner-soft">
                <Lock size={17} />
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">
                  Курс жабық режимде емес
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Кіру коды толық қолданылуы үшін курс түрін “Жабық курс” етіп
                  қойыңыз. Ашық немесе ақылы курста access басқа логикамен
                  басқарылады.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <section className="rounded-3xl border border-border bg-surface-soft/55 p-4 shadow-soft">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <Plus size={17} />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Жаңа invite code жасау
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Қолдану лимиті мен мерзімін көрсетіңіз. Бос қалдырылған лимит
                шектеусіз деп қабылданады.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FieldBlock
              label="Қолдану лимиті"
              hint="Мысалы: 30. Бос қалса — шектеусіз."
            >
              <Input
                type="number"
                min={1}
                value={inviteForm.maxUses}
                onChange={(event) =>
                  setInviteForm((previous) => ({
                    ...previous,
                    maxUses: event.target.value,
                  }))
                }
                placeholder="Бос болса — шектеусіз"
              />
            </FieldBlock>

            <FieldBlock
              label="Мерзімі"
              hint="Бос қалдырсаңыз, invite code мерзімсіз болуы мүмкін."
            >
              <Input
                type="datetime-local"
                value={inviteForm.expiresAt}
                onChange={(event) =>
                  setInviteForm((previous) => ({
                    ...previous,
                    expiresAt: event.target.value,
                  }))
                }
                min={toDateTimeLocalValue(new Date().toISOString())}
              />
            </FieldBlock>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onCreateInvite}
              disabled={createInvitePending}
            >
              <KeyRound size={14} className="mr-1.5" />
              {createInvitePending ? 'Жасалуда...' : 'Кіру кодын жасау'}
            </Button>
          </div>
        </section>

        {courseInvitesLoading ? (
          <LoadingState text="Кіру кодтары жүктелуде..." compact size="sm" />
        ) : null}

        {!courseInvitesLoading && courseInvites.length === 0 ? (
          <EmptyState
            title="Кіру коды жоқ"
            text="Жабық курсқа оқушы шақыру үшін invite code жасаңыз."
            compact
          />
        ) : null}

        {!courseInvitesLoading && courseInvites.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface-soft/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Құрылған invite codes
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Code көшіріңіз немесе белсенді code-ты өшіріңіз.
                </p>
              </div>

              <StatusBadge tone="muted">{courseInvites.length}</StatusBadge>
            </div>

            <div className="space-y-2">
              {courseInvites.map((invite) => (
                <InviteCodeCard
                  key={invite.id}
                  invite={invite}
                  deactivatePending={deactivateInvitePending}
                  onCopyInviteCode={onCopyInviteCode}
                  onDeactivateInvite={onDeactivateInvite}
                />
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}