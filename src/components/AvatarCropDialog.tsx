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

const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_OUTPUT_TYPE = 'image/jpeg';
const AVATAR_OUTPUT_QUALITY = 0.92;

export default function AvatarCropDialog({
  open,
  imageSrc,
  onClose,
  onCropped,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!open) return;

    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setSaving(false);
    setErrorText('');
  }, [open, imageSrc]);

  const canSave = useMemo(
    () => Boolean(imageSrc && croppedAreaPixels && !saving),
    [imageSrc, croppedAreaPixels, saving]
  );

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    onClose();
  }, [onClose, saving]);

  const handleSave = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels || saving) return;

    setSaving(true);
    setErrorText('');

    try {
      const blob = await getCroppedImageBlob(
        imageSrc,
        croppedAreaPixels,
        AVATAR_OUTPUT_SIZE,
        AVATAR_OUTPUT_TYPE,
        AVATAR_OUTPUT_QUALITY
      );

      const file = new File([blob], `avatar-${Date.now()}.jpg`, {
        type: AVATAR_OUTPUT_TYPE,
        lastModified: Date.now(),
      });

      await onCropped(file);

      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Суретті өңдеу сәтсіз аяқталды';

      console.error('[AvatarCropDialog] Crop failed', error);
      setErrorText(message);
    } finally {
      setSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, onCropped, saving]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Аватарды өңдеу</DialogTitle>
          <DialogDescription>
            Суретті жылжытып, үлкейтіп, өзіңізге ыңғайлы етіп қиып сақтаңыз.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative h-80 w-full overflow-hidden rounded-xl bg-black">
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                objectFit="cover"
                minZoom={1}
                maxZoom={3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/70">
                Сурет таңдалмаған
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Үлкейту</span>
              <span className="text-muted-foreground">{zoom.toFixed(2)}x</span>
            </div>

            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.05}
              disabled={saving}
              onValueChange={(value) => setZoom(value[0] ?? 1)}
            />
          </div>

          {errorText ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorText}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
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