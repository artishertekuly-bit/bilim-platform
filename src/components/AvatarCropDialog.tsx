import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Crop, ImageIcon, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

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
import { getCroppedImageBlob } from '@/lib/image-crop';

type Props = {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropped: (file: File) => Promise<void> | void;
};

const MIN_ZOOM = 0.35;
const DEFAULT_ZOOM = 0.75;
const MAX_ZOOM = 4;

export default function AvatarCropDialog({
  open,
  imageSrc,
  onClose,
  onCropped,
}: Props) {
  const { toast } = useToast();

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setCrop({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
  }, [imageSrc, open]);

  const canSave = useMemo(
    () => Boolean(imageSrc && croppedAreaPixels && !saving),
    [imageSrc, croppedAreaPixels, saving]
  );

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    []
  );

  const resetCropState = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setSaving(true);

      const blob = await getCroppedImageBlob(
        imageSrc,
        croppedAreaPixels,
        320,
        'image/jpeg',
        0.9
      );

      const file = new File([blob], 'avatar.jpg', {
        type: 'image/jpeg',
      });

      await onCropped(file);

      resetCropState();
      onClose();
    } catch (error) {
      toast({
        title: 'Суретті өңдеу мүмкін болмады',
        description:
          error instanceof Error
            ? error.message
            : 'Аватарды қиып сақтау кезінде белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, onClose, onCropped, resetCropState, toast]);

  const handleClose = useCallback(() => {
    if (saving) return;

    resetCropState();
    onClose();
  }, [onClose, resetCropState, saving]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-3xl border-border bg-card p-0 shadow-soft-lg">
        <DialogHeader className="border-b border-border/70 bg-card/80 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <Crop size={18} />
            </div>

            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">
                Аватарды өңдеу
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                Суретті жылжытып, кішірейтіп немесе үлкейтіп, өзіңізге ыңғайлы
                етіп қиып сақтаңыз.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="relative h-[360px] w-full overflow-hidden rounded-3xl border border-border bg-black shadow-inner-soft">
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                aspect={1}
                cropShape="round"
                showGrid={false}
                objectFit="contain"
                restrictPosition={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <ImageIcon size={28} />
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ZoomIn size={15} className="text-primary" />
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
              onValueChange={(value) => setZoom(value[0] ?? DEFAULT_ZOOM)}
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
              onClick={handleClose}
              disabled={saving}
            >
              Болдырмау
            </Button>

            <Button type="button" onClick={handleSave} disabled={!canSave}>
              {saving ? (
                <>
                  <Loader2 size={15} className="mr-2 animate-spin" />
                  Сақталуда...
                </>
              ) : (
                <>
                  <Crop size={15} className="mr-2" />
                  Қиып сақтау
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}