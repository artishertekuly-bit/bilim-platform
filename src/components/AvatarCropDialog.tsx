import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Жаңа сурет таңдалғанда crop/zoom қайта бастапқы күйге келеді.
   * Бұрынғы суреттің zoom/crop позициясы жаңа суретке әсер етпеуі керек.
   */
  useEffect(() => {
    if (!open) return;

    setCrop({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
  }, [imageSrc, open]);

  const canSave = useMemo(
    () => !!imageSrc && !!croppedAreaPixels && !saving,
    [imageSrc, croppedAreaPixels, saving]
  );

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    []
  );

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

      setCrop({ x: 0, y: 0 });
      setZoom(DEFAULT_ZOOM);
      onClose();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Суретті өңдеу сәтсіз аяқталды');
    } finally {
      setSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, onCropped, onClose]);

  const handleClose = useCallback(() => {
    if (saving) return;

    setCrop({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
    onClose();
  }, [onClose, saving]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Аватарды өңдеу</DialogTitle>
          <DialogDescription>
            Суретті жылжытып, кішірейтіп немесе үлкейтіп, өзіңізге ыңғайлы етіп қиып сақтаңыз.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative h-[360px] w-full overflow-hidden rounded-xl border bg-black">
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
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Масштаб</div>
              <div className="text-xs text-muted-foreground">{zoom.toFixed(2)}x</div>
            </div>

            <Slider
              value={[zoom]}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              onValueChange={(value) => setZoom(value[0] ?? DEFAULT_ZOOM)}
            />

            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Кішірейту</span>
              <span>Үлкейту</span>
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
              {saving ? 'Сақталуда...' : 'Қиып сақтау'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}