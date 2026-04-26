import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Link as LinkIcon,
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

function CourseAssetCard({
  asset,
  deleting,
  onDelete,
}: {
  asset: CourseAssetItem;
  deleting: boolean;
  onDelete: (assetId: string) => void;
}) {
  const externalUrl = asset.file.externalUrl;
  const visibleFileLabel = externalUrl || asset.file.filename || 'Файл дерегі жоқ';

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
                  {asset.title}
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

              {asset.description ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {asset.description}
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
              aria-label="Курс материалын ашу"
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
            onClick={() => onDelete(asset.id)}
            aria-label="Курс материалын өшіру"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
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
  return (
    <Card id="materials" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <FolderOpen size={16} />
                Курс материалдары
              </CardTitle>

              <StatusBadge tone="secondary">
                <FileText size={12} />
                {courseAssets.length} материал
              </StatusBadge>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Бұл бөлім міндетті емес. Мұғалім курсқа силлабус, бағалау
              критерийі, формулалар жинағы немесе кіріспе PDF сияқты жалпы
              материал сілтемесін қоса алады.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        <section className="rounded-3xl border border-border bg-surface-soft/55 p-4 shadow-soft">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <Plus size={17} />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Жаңа курс материалы
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Бұл материал курс деңгейінде бекітіледі және course detail /
                lesson detail аймақтарында жалпы ресурс ретінде көрінеді.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FieldBlock label="Материал атауы">
              <Input
                value={courseAssetForm.title}
                onChange={(event) =>
                  setCourseAssetForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                placeholder="Мысалы: Курс силлабусы"
              />
            </FieldBlock>

            <FieldBlock
              label="Сілтеме"
              hint="Google Drive, PDF, презентация немесе сыртқы ресурс URL енгізуге болады."
            >
              <Input
                value={courseAssetForm.externalUrl}
                onChange={(event) =>
                  setCourseAssetForm((previous) => ({
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
                value={courseAssetForm.description}
                onChange={(event) =>
                  setCourseAssetForm((previous) => ({
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
              onClick={onCreateCourseAsset}
              disabled={!canCreateCourseAsset}
            >
              <LinkIcon size={14} className="mr-1.5" />
              Курс материалын қосу
            </Button>
          </div>
        </section>

        {courseAssetsLoading ? (
          <LoadingState text="Материалдар жүктелуде..." compact size="sm" />
        ) : null}

        {!courseAssetsLoading && courseAssets.length === 0 ? (
          <EmptyState
            title="Курс материалы қосылмаған"
            text="Силлабус, бағалау критерийі, формулалар жинағы немесе кіріспе PDF сияқты материалдарды кейін қосуға болады."
            compact
          />
        ) : null}

        {!courseAssetsLoading && courseAssets.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface-soft/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Қосылған курс материалдары
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Курсқа бекітілген жалпы файлдар мен сілтемелер.
                </p>
              </div>

              <StatusBadge tone="muted">{courseAssets.length}</StatusBadge>
            </div>

            <div className="space-y-2">
              {courseAssets.map((asset) => (
                <CourseAssetCard
                  key={asset.id}
                  asset={asset}
                  deleting={deleteCourseAssetPending}
                  onDelete={onDeleteCourseAsset}
                />
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}