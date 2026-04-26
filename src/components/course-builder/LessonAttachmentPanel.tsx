import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Plus,
  Trash2,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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

function AttachmentCard({
  attachment,
  deleting,
  onDelete,
}: {
  attachment: LessonAttachmentLike;
  deleting: boolean;
  onDelete: (attachmentId: string) => void | Promise<void>;
}) {
  const externalUrl = attachment.file.externalUrl;
  const visibleFileLabel = externalUrl || attachment.file.filename || 'Файл дерегі жоқ';

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:shadow-soft-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <FileText size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {attachment.title}
                </p>

                {externalUrl ? (
                  <StatusBadge tone="primary">
                    <ExternalLink size={12} />
                    External URL
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="muted">URL жоқ</StatusBadge>
                )}
              </div>

              {attachment.description ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {attachment.description}
                </p>
              ) : null}

              <p className="mt-2 truncate rounded-2xl border border-border bg-muted/55 px-3 py-2 text-[11px] text-muted-foreground">
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
            variant="destructive"
            size="icon-sm"
            disabled={deleting}
            onClick={() => onDelete(attachment.id)}
            aria-label="Материалды өшіру"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
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
  const hasSelectedLesson = Boolean(editingLessonId && selectedEditingLesson);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Paperclip size={16} />
                Сабақ файлдары
              </CardTitle>

              <StatusBadge tone="secondary">
                <FileText size={12} />
                {lessonAttachments.length} файл
              </StatusBadge>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Сабаққа PDF, Google Drive, презентация немесе басқа external материал
              сілтемесін қосыңыз. Бұл материалдар оқушының lesson detail бетінде
              көрінеді.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {!hasSelectedLesson ? (
          <div className="rounded-3xl border border-dashed border-primary-muted bg-primary-soft/50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-card text-primary shadow-inner-soft">
                <Paperclip size={17} />
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">
                  Сабақ таңдалмаған
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Файл қосу үшін алдымен бар сабақты таңдаңыз немесе жаңа сабақты
                  сақтаңыз.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-border bg-surface-soft/55 p-4 shadow-soft">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                  <Plus size={17} />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Жаңа материал қосу
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Таңдалған сабақ:{' '}
                    <span className="font-semibold text-foreground">
                      {selectedEditingLesson?.title}
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <FieldBlock label="Материал атауы">
                  <Input
                    value={lessonAttachmentForm.title}
                    onChange={(event) =>
                      setLessonAttachmentForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Мысалы: Үй жұмысы PDF"
                  />
                </FieldBlock>

                <FieldBlock
                  label="Сілтеме"
                  hint="Google Drive, PDF, презентация немесе сыртқы ресурс URL енгізуге болады."
                >
                  <Input
                    value={lessonAttachmentForm.externalUrl}
                    onChange={(event) =>
                      setLessonAttachmentForm((previous) => ({
                        ...previous,
                        externalUrl: event.target.value,
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
                    placeholder="Қысқаша түсіндірме"
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
                  {createLessonAttachmentPending
                    ? 'Қосылуда...'
                    : 'Сабақ файлын қосу'}
                </Button>
              </div>
            </section>

            {lessonAttachmentsLoading ? (
              <LoadingState
                text="Сабақ файлдары жүктелуде..."
                compact
                size="sm"
              />
            ) : null}

            {!lessonAttachmentsLoading && lessonAttachments.length === 0 ? (
              <EmptyState
                title="Бұл сабаққа файл қосылмаған"
                text="Қосымша PDF, презентация немесе external URL қоссаңыз, оқушы сабақ бетінде көре алады."
                compact
              />
            ) : null}

            {!lessonAttachmentsLoading && lessonAttachments.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface-soft/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Қосылған материалдар
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Сабаққа бекітілген файлдар мен сілтемелер.
                    </p>
                  </div>

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
                      onDelete={handleDeleteLessonAttachment}
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