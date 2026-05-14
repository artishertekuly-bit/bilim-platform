import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { normalizeMediaUrl } from '@/lib/media-url';

type LessonAttachmentFormState = {
  title: string;
  description: string;
  externalUrl: string;
};

type SelectedLessonLike = {
  id: string;
  title: string;
} | null;

type LessonAttachmentLike = {
  id: string;
  title: string;
  description: string | null;
  file: {
    externalUrl: string | null;
    filename: string;
  };
};

function FieldBlock({
  label,
  children,
  required,
}: {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function InlineDeleteConfirm({
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
      <p className="text-xs font-semibold text-foreground">Материал өшірілсін бе?</p>

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

function AttachmentCard({
  attachment,
  deleting,
  deleteConfirmOpen,
  onToggleDeleteConfirm,
  onCancelDeleteConfirm,
  onDelete,
}: {
  attachment: LessonAttachmentLike;
  deleting: boolean;
  deleteConfirmOpen: boolean;
  onToggleDeleteConfirm: () => void;
  onCancelDeleteConfirm: () => void;
  onDelete: (attachmentId: string) => void | Promise<void>;
}) {
  const externalUrl = attachment.file.externalUrl;
  const visibleFileLabel = externalUrl || attachment.file.filename || 'Файл жоқ';

  return (
    <div className="rounded-3xl border border-border bg-card p-4 transition-colors hover:border-primary-muted hover:bg-primary-soft/25">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
              <FileText size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {attachment.title}
                </p>

                <StatusBadge tone={externalUrl ? 'primary' : 'muted'}>
                  {externalUrl ? (
                    <>
                      <ExternalLink size={12} />
                      Сілтеме
                    </>
                  ) : (
                    'URL жоқ'
                  )}
                </StatusBadge>
              </div>

              {attachment.description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {attachment.description}
                </p>
              ) : null}

              <p className="mt-2 truncate rounded-2xl border border-border bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">
                {visibleFileLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {externalUrl ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              asChild
              aria-label="Материалды ашу"
            >
              <a href={externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={13} />
              </a>
            </Button>
          ) : null}

          <Button
            type="button"
            variant={deleteConfirmOpen ? 'outline' : 'destructive'}
            size="icon-sm"
            disabled={deleting}
            onClick={onToggleDeleteConfirm}
            aria-label="Материалды өшіру"
          >
            {deleteConfirmOpen ? <X size={13} /> : <Trash2 size={13} />}
          </Button>
        </div>
      </div>

      {deleteConfirmOpen ? (
        <div className="mt-3">
          <InlineDeleteConfirm
            disabled={deleting}
            onConfirm={() => onDelete(attachment.id)}
            onCancel={onCancelDeleteConfirm}
          />
        </div>
      ) : null}
    </div>
  );
}

export function LessonAttachmentPanel({
  editingLessonId,
  selectedEditingLesson,
  lessonAttachmentForm,
  setLessonAttachmentForm,
  handleCreateLessonAttachment,
  canCreateLessonAttachment,
  createLessonAttachmentPending,
  lessonAttachmentsLoading,
  lessonAttachments,
  handleDeleteLessonAttachment,
  deleteLessonAttachmentPending,
}: {
  editingLessonId: string | null;
  selectedEditingLesson: SelectedLessonLike;
  lessonAttachmentForm: LessonAttachmentFormState;
  setLessonAttachmentForm: Dispatch<SetStateAction<LessonAttachmentFormState>>;
  handleCreateLessonAttachment: () => void | Promise<void>;
  canCreateLessonAttachment: boolean;
  createLessonAttachmentPending: boolean;
  lessonAttachmentsLoading: boolean;
  lessonAttachments: LessonAttachmentLike[];
  handleDeleteLessonAttachment: (attachmentId: string) => void | Promise<void>;
  deleteLessonAttachmentPending: boolean;
}) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const hasSelectedLesson = Boolean(editingLessonId && selectedEditingLesson);
  const formComplete =
    lessonAttachmentForm.title.trim().length > 0 &&
    lessonAttachmentForm.externalUrl.trim().length > 0;

  const handleConfirmedDelete = (attachmentId: string) => {
    handleDeleteLessonAttachment(attachmentId);
    setDeleteConfirmId(null);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Paperclip size={16} />
              Сабақ материалдары
            </CardTitle>

            <StatusBadge tone="secondary">
              <FileText size={12} />
              {lessonAttachments.length}
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!hasSelectedLesson ? (
          <EmptyState
            title="Сабақ таңдалмаған"
            text="Алдымен сабақты сақтаңыз."
            compact
          />
        ) : (
          <>
            <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                    <Plus size={17} />
                  </div>

                  <p className="truncate text-sm font-semibold text-foreground">
                    Жаңа материал
                  </p>
                </div>

                <StatusBadge tone={formComplete ? 'success' : 'muted'}>
                  {formComplete ? 'Толды' : 'Міндетті'}
                </StatusBadge>
              </div>

              <div className="space-y-4">
                <FieldBlock label="Материал атауы" required>
                  <Input
                    value={lessonAttachmentForm.title}
                    onChange={(event) =>
                      setLessonAttachmentForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Материал атауы"
                  />
                </FieldBlock>

                <FieldBlock label="Сілтеме" required>
                  <Input
                    value={lessonAttachmentForm.externalUrl}
                    onChange={(event) =>
                      setLessonAttachmentForm((previous) => ({
                        ...previous,
                        externalUrl: event.target.value,
                      }))
                    }
                    onBlur={(event) =>
                      setLessonAttachmentForm((previous) => ({
                        ...previous,
                        externalUrl: normalizeMediaUrl(event.target.value),
                      }))
                    }
                    placeholder="https://..."
                  />
                </FieldBlock>

                <FieldBlock label="Сипаттама">
                  <Textarea
                    rows={2}
                    value={lessonAttachmentForm.description}
                    onChange={(event) =>
                      setLessonAttachmentForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Сипаттама"
                  />
                </FieldBlock>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={handleCreateLessonAttachment}
                  disabled={!canCreateLessonAttachment || createLessonAttachmentPending}
                >
                  <LinkIcon size={14} className="mr-1.5" />
                  {createLessonAttachmentPending ? 'Қосылуда...' : 'Қосу'}
                </Button>
              </div>
            </section>

            {lessonAttachmentsLoading ? (
              <LoadingState text="Жүктелуде..." compact size="sm" />
            ) : null}

            {!lessonAttachmentsLoading && lessonAttachments.length === 0 ? (
              <EmptyState
                title="Материал жоқ"
                text="Материал қосыңыз."
                compact
              />
            ) : null}

            {!lessonAttachmentsLoading && lessonAttachments.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-muted/25 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">
                    Қосылған материалдар
                  </p>

                  <StatusBadge tone="muted">
                    {lessonAttachments.length}
                  </StatusBadge>
                </div>

                <div className="space-y-2">
                  {lessonAttachments.map((attachment) => (
                    <AttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                      deleting={deleteLessonAttachmentPending}
                      deleteConfirmOpen={deleteConfirmId === attachment.id}
                      onToggleDeleteConfirm={() =>
                        setDeleteConfirmId((current) =>
                          current === attachment.id ? null : attachment.id
                        )
                      }
                      onCancelDeleteConfirm={() => setDeleteConfirmId(null)}
                      onDelete={handleConfirmedDelete}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}