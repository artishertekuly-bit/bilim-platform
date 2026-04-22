import { useCallback, useMemo, useState } from 'react';
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

  const canSave = useMemo(() => !!imageSrc && !!croppedAreaPixels && !saving, [
    imageSrc,
    croppedAreaPixels,
    saving,
  ]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setSaving(true);

      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, 320, 'image/jpeg', 0.9);
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

      await onCropped(file);

      setCrop({ x: 0, y: 0 });
      setZoom(1);
      onClose();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Суретті өңдеу сәтсіз аяқталды');
    } finally {
      setSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, onCropped, onClose]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Аватарды өңдеу</DialogTitle>
          <DialogDescription>
            Суретті жылжытып, үлкейтіп, өзіңізге ыңғайлы етіп қиып сақтаңыз.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative h-80 w-full overflow-hidden rounded-xl bg-black">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                objectFit="cover"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Үлкейту</div>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.05}
              onValueChange={(value) => setZoom(value[0] ?? 1)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
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