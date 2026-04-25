import type { Dispatch, SetStateAction } from 'react';
import { ExternalLink, FileText, Link as LinkIcon, Trash2 } from 'lucide-react';

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
    <Card id="materials" className="scroll-mt-24">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <FileText size={14} />
            Курс материалдары
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Бұл бөлім міндетті емес. Мұғалім курсқа силлабус, бағалау критерийі,
          формулалар жинағы немесе кіріспе PDF сияқты қосымша материал сілтемесін қоса алады.
        </p>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label>Материал атауы</Label>
            <Input
              value={courseAssetForm.title}
              onChange={(e) =>
                setCourseAssetForm((p) => ({ ...p, title: e.target.value }))
              }
              placeholder="Мысалы: Курс силлабусы"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Сілтеме</Label>
            <Input
              value={courseAssetForm.externalUrl}
              onChange={(e) =>
                setCourseAssetForm((p) => ({ ...p, externalUrl: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Сипаттама</Label>
            <Textarea
              rows={2}
              value={courseAssetForm.description}
              onChange={(e) =>
                setCourseAssetForm((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Қысқаша түсіндірме"
            />
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={onCreateCourseAsset}
            disabled={!canCreateCourseAsset}
          >
            <LinkIcon size={14} className="mr-1.5" />
            Курс материалын қосу
          </Button>
        </div>

        {courseAssetsLoading ? (
          <p className="text-xs text-muted-foreground">Материалдар жүктелуде...</p>
        ) : null}

        {!courseAssetsLoading && courseAssets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Әзірге курс материалы қосылмаған.
          </p>
        ) : null}

        <div className="space-y-2">
          {courseAssets.map((asset) => (
            <div key={asset.id} className="rounded-lg border p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{asset.title}</p>
                  {asset.description ? (
                    <p className="mt-1 text-muted-foreground">{asset.description}</p>
                  ) : null}
                  <p className="mt-1 truncate text-muted-foreground">
                    {asset.file.externalUrl || asset.file.filename}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  {asset.file.externalUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      asChild
                    >
                      <a href={asset.file.externalUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={13} />
                      </a>
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    disabled={deleteCourseAssetPending}
                    onClick={() => onDeleteCourseAsset(asset.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
