import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  Crop,
  ImageIcon,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { getCroppedImageBlobBySize } from '@/lib/image-crop';

type CourseThumbnailCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropped: (file: File) => Promise<void> | void;
};

const MIN_ZOOM = 0.35;
const DEFAULT_ZOOM = 0.85;
const MAX_ZOOM = 4;
const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 900;

export default function CourseThumbnailCropDialog({
  open,
  imageSrc,
  onClose,
  onCropped,
}: CourseThumbnailCropDialogProps) {
  const { toast } = useToast();

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setCrop({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
  }, [imageSrc, open]);

  const canSave = useMemo(
    () => Boolean(imageSrc && croppedAreaPixels && !saving),
    [croppedAreaPixels, imageSrc, saving],
  );

  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    [],
  );

  const reset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;

    reset();
    onClose();
  }, [onClose, reset, saving]);

  const handleSave = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setSaving(true);

    try {
      const blob = await getCroppedImageBlobBySize(
        imageSrc,
        croppedAreaPixels,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
        'image/jpeg',
        0.9,
      );

      const file = new File([blob], 'course-thumbnail.jpg', {
        type: 'image/jpeg',
      });

      await onCropped(file);

      reset();
      onClose();
    } catch (error) {
      toast({
        title: 'Мұқабаны сақтау мүмкін болмады',
        description:
          error instanceof Error
            ? error.message
            : 'Суретті қиып сақтау кезінде белгісіз қате шықты.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [
    croppedAreaPixels,
    imageSrc,
    onClose,
    onCropped,
    reset,
    toast,
  ]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-4xl overflow-hidden rounded-[2rem] border-border bg-card p-0 shadow-soft-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <Crop size={17} />
            </span>

            <div className="min-w-0">
              <DialogTitle className="text-base font-bold">
                Курс мұқабасын дайындау
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                Суретті жылжытып, масштабын өзгертіңіз. Нәтиже автоматты түрде
                1600 × 900 өлшемінде сақталады.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="relative aspect-video w-full overflow-hidden rounded-[1.75rem] border border-border bg-black shadow-inner-soft">
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                aspect={16 / 9}
                cropShape="rect"
                showGrid
                objectFit="contain"
                restrictPosition={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-white/55">
                <ImageIcon size={30} />
              </div>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-border bg-muted/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <ZoomIn size={15} />
                Масштаб
              </div>

              <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                {zoom.toFixed(2)}x
              </span>
            </div>

            <Slider
              value={[zoom]}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              onValueChange={(value) =>
                setZoom(value[0] ?? DEFAULT_ZOOM)
              }
              disabled={saving}
            />

            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ZoomOut size={11} />
                Кішірейту
              </span>
              <span className="inline-flex items-center gap-1">
                Үлкейту
                <ZoomIn size={11} />
              </span>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={handleClose}
              disabled={saving}
            >
              Болдырмау
            </Button>

            <Button
              type="button"
              className="rounded-full"
              onClick={handleSave}
              disabled={!canSave}
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="mr-2 animate-spin" />
                  Жүктелуде...
                </>
              ) : (
                <>
                  <Crop size={15} className="mr-2" />
                  Қиып жүктеу
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
