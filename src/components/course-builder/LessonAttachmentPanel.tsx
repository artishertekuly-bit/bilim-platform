import type { Dispatch, SetStateAction } from 'react';
import { ExternalLink, Link as LinkIcon, Trash2 } from 'lucide-react';

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
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Сабақ файлдары</CardTitle>
        <p className="text-sm text-muted-foreground">
          Сабаққа PDF, Google Drive, презентация немесе басқа external материал сілтемесін қосыңыз.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {!editingLessonId || !selectedEditingLesson ? (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            Файл қосу үшін алдымен бар сабақты таңдаңыз немесе жаңа сабақты сақтаңыз.
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label>Материал атауы</Label>
                <Input
                  value={lessonAttachmentForm.title}
                  onChange={(e) =>
                    setLessonAttachmentForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="Мысалы: Үй жұмысы PDF"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Сілтеме</Label>
                <Input
                  value={lessonAttachmentForm.externalUrl}
                  onChange={(e) =>
                    setLessonAttachmentForm((p) => ({ ...p, externalUrl: e.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Сипаттама</Label>
                <Textarea
                  rows={2}
                  value={lessonAttachmentForm.description}
                  onChange={(e) =>
                    setLessonAttachmentForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Қысқаша түсіндірме"
                />
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={handleCreateLessonAttachment}
                disabled={!canCreateLessonAttachment}
              >
                <LinkIcon size={14} className="mr-1.5" />
                {createLessonAttachmentPending ? 'Қосылуда...' : 'Сабақ файлын қосу'}
              </Button>
            </div>

            {lessonAttachmentsLoading ? (
              <p className="text-xs text-muted-foreground">Сабақ файлдары жүктелуде...</p>
            ) : null}

            {!lessonAttachmentsLoading && lessonAttachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Бұл сабаққа әлі файл қосылмаған.
              </p>
            ) : null}

            <div className="space-y-2">
              {lessonAttachments.map((attachment) => (
                <div key={attachment.id} className="rounded-lg border p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{attachment.title}</p>
                      {attachment.description ? (
                        <p className="mt-1 text-muted-foreground">{attachment.description}</p>
                      ) : null}
                      <p className="mt-1 truncate text-muted-foreground">
                        {attachment.file.externalUrl || attachment.file.filename}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      {attachment.file.externalUrl ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          asChild
                        >
                          <a href={attachment.file.externalUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} />
                          </a>
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        disabled={deleteLessonAttachmentPending}
                        onClick={() => handleDeleteLessonAttachment(attachment.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
