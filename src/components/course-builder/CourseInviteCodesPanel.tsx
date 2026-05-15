import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  CalendarClock,
  Copy,
  KeyRound,
  Plus,
  Trash2,
  Users,
  X,
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
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
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

function InlineDeactivateConfirm({
  disabled,
  onConfirm,
  onCancel,
}: {
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-semibold text-foreground">
        Шақыру коды өшірілсін бе?
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={disabled}
          onClick={onConfirm}
        >
          <Trash2 size={13} className="mr-2" />
          Өшіру
        </Button>

        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Болдырмау
        </Button>
      </div>
    </div>
  );
}

function InviteCodeCard({
  invite,
  deactivatePending,
  deactivateConfirmOpen,
  onToggleDeactivateConfirm,
  onCancelDeactivateConfirm,
  onCopyInviteCode,
  onDeactivateInvite,
}: {
  invite: CourseInviteRow;
  deactivatePending: boolean;
  deactivateConfirmOpen: boolean;
  onToggleDeactivateConfirm: () => void;
  onCancelDeactivateConfirm: () => void;
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

  const handleDeactivate = () => {
    onDeactivateInvite(invite.id);
    onCancelDeactivateConfirm();
  };

  return (
    <div
      className={`rounded-3xl border p-4 transition-colors ${
        active
          ? 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/20'
          : 'border-border bg-muted/40 opacity-80'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-2xl border border-border bg-muted/35 px-3 py-1.5 font-mono text-sm font-semibold tracking-wide text-foreground">
              {invite.code}
            </p>

            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
              <Users size={11} />
              Қолданылды: {invite.used_count}
              {invite.max_uses === null ? ' / ∞' : ` / ${invite.max_uses}`}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
              <Users size={11} />
              Қалды: {remaining === null ? '∞' : remaining}
            </span>

            {invite.expires_at ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
                <CalendarClock size={11} />
                {formatDateTime(invite.expires_at)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => onCopyInviteCode(invite.code)}
            aria-label="Шақыру кодын көшіру"
          >
            <Copy size={13} />
          </Button>

          {active ? (
            <Button
              type="button"
              variant={deactivateConfirmOpen ? 'outline' : 'destructive'}
              size="icon-sm"
              disabled={deactivatePending}
              onClick={onToggleDeactivateConfirm}
              aria-label="Шақыру кодын өшіру"
            >
              {deactivateConfirmOpen ? <X size={13} /> : <Trash2 size={13} />}
            </Button>
          ) : null}
        </div>
      </div>

      {deactivateConfirmOpen ? (
        <div className="mt-3">
          <InlineDeactivateConfirm
            disabled={deactivatePending}
            onConfirm={handleDeactivate}
            onCancel={onCancelDeactivateConfirm}
          />
        </div>
      ) : null}
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
  const [deactivateConfirmId, setDeactivateConfirmId] = useState<string | null>(null);

  const inviteCourse = isInviteCourse(accessType);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <KeyRound size={16} />
            Шақыру кодтары
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="secondary">{courseInvites.length}</StatusBadge>

            <StatusBadge tone={inviteCourse ? 'primary' : 'warning'}>
              {inviteCourse ? 'Жабық режим' : 'Қосымша'}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <section className="rounded-3xl border border-border bg-card p-4">
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
              <Plus size={17} />
            </div>

            <p className="text-sm font-semibold text-foreground">
              Жаңа код
            </p>
          </div>

          <div className="space-y-4">
            <FieldBlock label="Қолдану лимиті">
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
                placeholder="Шектеусіз"
              />
            </FieldBlock>

            <FieldBlock label="Мерзімі">
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
              {createInvitePending ? 'Жасалуда...' : 'Код жасау'}
            </Button>
          </div>
        </section>

        {courseInvitesLoading ? (
          <LoadingState text="Жүктелуде..." compact size="sm" />
        ) : null}

        {!courseInvitesLoading && courseInvites.length === 0 ? (
          <EmptyState
            title="Код жоқ"
            text="Шақыру кодын жасаңыз."
            compact
          />
        ) : null}

        {!courseInvitesLoading && courseInvites.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-muted/25 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Құрылған кодтар
              </p>

              <StatusBadge tone="muted">{courseInvites.length}</StatusBadge>
            </div>

            <div className="space-y-2">
              {courseInvites.map((invite) => (
                <InviteCodeCard
                  key={invite.id}
                  invite={invite}
                  deactivatePending={deactivateInvitePending}
                  deactivateConfirmOpen={deactivateConfirmId === invite.id}
                  onToggleDeactivateConfirm={() =>
                    setDeactivateConfirmId((current) =>
                      current === invite.id ? null : invite.id
                    )
                  }
                  onCancelDeactivateConfirm={() => setDeactivateConfirmId(null)}
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