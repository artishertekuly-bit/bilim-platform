import type { Dispatch, SetStateAction } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';

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
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <KeyRound size={14} />
            Invite codes
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Invite code оқушыға course access береді және автоматты түрде
          course enrollment жасайды.
        </p>

        {accessType !== 'private_invite' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Бұл бөлім толық қолданылуы үшін курс түрін “Жабық курс” етіп қойыңыз.
          </div>
        ) : null}

        <div className="space-y-2 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label>Қолдану лимиті</Label>
            <Input
              type="number"
              min={1}
              value={inviteForm.maxUses}
              onChange={(e) =>
                setInviteForm((p) => ({
                  ...p,
                  maxUses: e.target.value,
                }))
              }
              placeholder="Бос болса — шектеусіз"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Мерзімі</Label>
            <Input
              type="datetime-local"
              value={inviteForm.expiresAt}
              onChange={(e) =>
                setInviteForm((p) => ({
                  ...p,
                  expiresAt: e.target.value,
                }))
              }
              min={toDateTimeLocalValue(new Date().toISOString())}
            />
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={onCreateInvite}
            disabled={createInvitePending}
          >
            Invite code жасау
          </Button>
        </div>

        <div className="space-y-2">
          {courseInvitesLoading ? (
            <p className="text-xs text-muted-foreground">Invite codes жүктелуде...</p>
          ) : null}

          {!courseInvitesLoading && courseInvites.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Әлі invite code жоқ.
            </p>
          ) : null}

          {courseInvites.map((invite) => {
            const remaining =
              invite.max_uses === null
                ? null
                : Math.max(invite.max_uses - invite.used_count, 0);

            return (
              <div
                key={invite.id}
                className={`rounded-lg border p-3 text-xs ${
                  invite.is_active ? 'bg-background' : 'bg-muted/50 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">
                      {invite.code}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Қолданылды: {invite.used_count}
                      {invite.max_uses === null
                        ? ' / шектеусіз'
                        : ` / ${invite.max_uses}`}
                    </p>
                    <p className="text-muted-foreground">
                      Қалғаны: {remaining === null ? 'шектеусіз' : remaining}
                    </p>
                    <p className="text-muted-foreground">
                      Мерзімі: {formatDateTime(invite.expires_at)}
                    </p>
                    <p className="text-muted-foreground">
                      Статус: {invite.is_active ? 'Белсенді' : 'Өшірілген'}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onCopyInviteCode(invite.code)}
                    >
                      <Copy size={13} />
                    </Button>

                    {invite.is_active ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        disabled={deactivateInvitePending}
                        onClick={() => onDeactivateInvite(invite.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
