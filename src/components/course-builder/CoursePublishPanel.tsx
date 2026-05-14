import { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Eye,
  EyeOff,
  RotateCcw,
  X,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseStatus } from '@/lib/course-creator/course-builder-utils';

function getPublishState(status: CourseStatus) {
  if (status === 'published') {
    return {
      title: 'Жарияланған',
      tone: 'success' as const,
      icon: <CheckCircle2 size={12} />,
      panelIcon: <Eye size={17} />,
    };
  }

  if (status === 'archived') {
    return {
      title: 'Архивте',
      tone: 'muted' as const,
      icon: <Archive size={12} />,
      panelIcon: <Archive size={17} />,
    };
  }

  return {
    title: 'Черновик',
    tone: 'completed' as const,
    icon: <EyeOff size={12} />,
    panelIcon: <EyeOff size={17} />,
  };
}

function InlineConfirm({
  title,
  pending,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  pending: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-warning-muted bg-warning-soft/60 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>

        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Болдырмау
        </Button>
      </div>
    </div>
  );
}

export function CoursePublishPanel({
  courseId,
  status,
  pending,
  onChangeStatus,
}: {
  courseId: string;
  status: CourseStatus;
  pending: boolean;
  onChangeStatus: (input: { courseId: string; status: CourseStatus }) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<'unpublish' | 'archive' | null>(
    null
  );

  const state = getPublishState(status);

  const changeStatus = (nextStatus: CourseStatus) => {
    onChangeStatus({ courseId, status: nextStatus });
    setConfirmAction(null);
  };

  return (
    <Card id="publish" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm font-semibold">
              Жариялау
            </CardTitle>

            <StatusBadge tone={state.tone}>
              {state.icon}
              {state.title}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="rounded-3xl border border-border bg-muted/25 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
              {state.panelIcon}
            </div>

            <p className="text-sm font-semibold text-foreground">
              {state.title}
            </p>
          </div>
        </div>

        {confirmAction === 'unpublish' ? (
          <InlineConfirm
            title="Курс жариялаудан алынсын ба?"
            pending={pending}
            confirmLabel="Жариялаудан алу"
            onConfirm={() => changeStatus('draft')}
            onCancel={() => setConfirmAction(null)}
          />
        ) : null}

        {confirmAction === 'archive' ? (
          <InlineConfirm
            title="Курс архивке жіберілсін бе?"
            pending={pending}
            confirmLabel="Архивке жіберу"
            onConfirm={() => changeStatus('archived')}
            onCancel={() => setConfirmAction(null)}
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-primary-muted bg-primary-soft/70 p-4">
            <div className="mb-3">
              <StatusBadge tone="primary">
                <Eye size={12} />
                Жариялау
              </StatusBadge>
            </div>

            {status === 'archived' ? (
              <Button type="button" variant="outline" size="sm" disabled>
                Архивте
              </Button>
            ) : status === 'published' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction('unpublish')}
                disabled={pending}
              >
                <EyeOff size={14} className="mr-2" />
                Жариялаудан алу
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => changeStatus('published')}
                disabled={pending}
              >
                <Eye size={14} className="mr-2" />
                Жариялау
              </Button>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-muted/45 p-4">
            <div className="mb-3">
              <StatusBadge tone={status === 'archived' ? 'important' : 'muted'}>
                <Archive size={12} />
                Архив
              </StatusBadge>
            </div>

            {status === 'archived' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => changeStatus('draft')}
                disabled={pending}
              >
                <RotateCcw size={14} className="mr-2" />
                Қайтару
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction('archive')}
                disabled={pending}
              >
                <Archive size={14} className="mr-2" />
                Архивке жіберу
              </Button>
            )}
          </div>
        </div>

        {confirmAction ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmAction(null)}
            className="w-full sm:hidden"
          >
            <X size={14} className="mr-2" />
            Жабу
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}