import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Link as LinkIcon,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { EmptyState, LoadingState } from '@/components/common/DataState';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { normalizeMediaUrl } from '@/lib/media-url';
import { removeNullCharacters } from '@/lib/utils';

type CourseAssetFormState = {
  title: string;
  description: string;
  externalUrl: string;
};

type CourseAssetItem = {
  id: string;
  title: string;
  description: string | null;
  file: {
    externalUrl: string | null;
    filename: string;
  };
};

const MAX_TITLE_CHARS = 180;
const MAX_DESCRIPTION_CHARS = 1_000;
const MAX_EXTERNAL_URL_CHARS = 900;

function sanitizeInputValue(value: string, limit: number): string {
  return removeNullCharacters(value).slice(0, limit);
}

function normalizeExternalUrl(value: string): string {
  return sanitizeInputValue(normalizeMediaUrl(value) || '', MAX_EXTERNAL_URL_CHARS);
}

function getVisibleFileLabel(asset: CourseAssetItem): string {
  return asset.file.externalUrl || asset.file.filename || 'Файл көрсетілмеген';
}

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

function CourseAssetCard({
  asset,
  deleting,
  deleteConfirmOpen,
  onToggleDeleteConfirm,
  onCancelDeleteConfirm,
  onDelete,
}: {
  asset: CourseAssetItem;
  deleting: boolean;
  deleteConfirmOpen: boolean;
  onToggleDeleteConfirm: () => void;
  onCancelDeleteConfirm: () => void;
  onDelete: (assetId: string) => void;
}) {
  const externalUrl = asset.file.externalUrl;
  const visibleFileLabel = getVisibleFileLabel(asset);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 transition-colors hover:border-primary-muted hover:bg-primary-soft/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
              <FileText size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">
                  {asset.title || asset.file.filename || 'Курс материалы'}
                </p>

                <StatusBadge tone={externalUrl ? 'primary' : 'muted'}>
                  {externalUrl ? 'Сілтеме' : 'Жоқ'}
                </StatusBadge>
              </div>

              {asset.description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {asset.description}
                </p>
              ) : null}

              <p className="mt-2 truncate rounded-2xl border border-border bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
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
            onConfirm={() => onDelete(asset.id)}
            onCancel={onCancelDeleteConfirm}
          />
        </div>
      ) : null}
    </div>
  );
}

export function CourseMaterialsPanel({
  courseAssetForm,
  setCourseAssetForm,
  onCreateCourseAsset,
  canCreateCourseAsset,
  courseAssets,
  courseAssetsLoading,
  deleteCourseAssetPending,
  onDeleteCourseAsset,
}: {
  courseAssetForm: CourseAssetFormState;
  setCourseAssetForm: Dispatch<SetStateAction<CourseAssetFormState>>;
  onCreateCourseAsset: () => void;
  canCreateCourseAsset: boolean;
  courseAssets: CourseAssetItem[];
  courseAssetsLoading: boolean;
  deleteCourseAssetPending: boolean;
  onDeleteCourseAsset: (assetId: string) => void;
}) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const formComplete = courseAssetForm.externalUrl.trim().length > 0;

  const updateCourseAssetField = <K extends keyof CourseAssetFormState>(
    key: K,
    value: CourseAssetFormState[K],
  ) => {
    setCourseAssetForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleConfirmedDelete = (assetId: string) => {
    onDeleteCourseAsset(assetId);
    setDeleteConfirmId(null);
  };

  return (
    <Card id="materials" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FolderOpen size={16} />
            Материалдар
          </CardTitle>

          <StatusBadge tone="secondary">
            <FileText size={12} />
            {courseAssets.length}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <section className="rounded-3xl border border-border bg-card p-4">
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
              {formComplete ? 'Дайын' : 'Толтырыңыз'}
            </StatusBadge>
          </div>

          <div className="space-y-4">
            <FieldBlock label="Материал атауы">
              <Input
                value={courseAssetForm.title}
                maxLength={MAX_TITLE_CHARS}
                onChange={(event) =>
                  updateCourseAssetField(
                    'title',
                    sanitizeInputValue(event.target.value, MAX_TITLE_CHARS),
                  )
                }
                placeholder="Материал атауы"
              />
            </FieldBlock>

            <FieldBlock label="Сілтеме" required>
              <Input
                value={courseAssetForm.externalUrl}
                maxLength={MAX_EXTERNAL_URL_CHARS}
                onChange={(event) =>
                  updateCourseAssetField(
                    'externalUrl',
                    sanitizeInputValue(event.target.value, MAX_EXTERNAL_URL_CHARS),
                  )
                }
                onBlur={(event) =>
                  updateCourseAssetField(
                    'externalUrl',
                    normalizeExternalUrl(event.target.value),
                  )
                }
                placeholder="https://..."
              />
            </FieldBlock>

            <FieldBlock label="Сипаттама">
              <Textarea
                rows={2}
                value={courseAssetForm.description}
                maxLength={MAX_DESCRIPTION_CHARS}
                onChange={(event) =>
                  updateCourseAssetField(
                    'description',
                    sanitizeInputValue(event.target.value, MAX_DESCRIPTION_CHARS),
                  )
                }
                placeholder="Сипаттама"
              />
            </FieldBlock>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onCreateCourseAsset}
              disabled={!canCreateCourseAsset}
            >
              <LinkIcon size={14} className="mr-1.5" />
              Қосу
            </Button>
          </div>
        </section>

        {courseAssetsLoading ? (
          <LoadingState text="Жүктелуде..." compact size="sm" />
        ) : null}

        {!courseAssetsLoading && courseAssets.length === 0 ? (
          <EmptyState title="Материал жоқ" text="Әзірге дерек жоқ." compact />
        ) : null}

        {!courseAssetsLoading && courseAssets.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-muted/25 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Қосылғандар</p>

              <StatusBadge tone="muted">{courseAssets.length}</StatusBadge>
            </div>

            <div className="space-y-2">
              {courseAssets.map((asset) => (
                <CourseAssetCard
                  key={asset.id}
                  asset={asset}
                  deleting={deleteCourseAssetPending}
                  deleteConfirmOpen={deleteConfirmId === asset.id}
                  onToggleDeleteConfirm={() =>
                    setDeleteConfirmId((current) =>
                      current === asset.id ? null : asset.id,
                    )
                  }
                  onCancelDeleteConfirm={() => setDeleteConfirmId(null)}
                  onDelete={handleConfirmedDelete}
                />
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}