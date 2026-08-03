import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

import CourseThumbnailCropDialog from '@/components/course-builder/CourseThumbnailCropDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  COURSE_THUMBNAIL_BUCKET,
  normalizeCourseThumbnailUrl,
} from '@/lib/course-thumbnail-storage';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_IMAGE_SIZE_MB = 10;
const MAX_ERROR_CHARS = 700;

type CourseThumbnailUploaderProps = {
  userId: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
};

function cleanText(value: unknown, limit = MAX_ERROR_CHARS): string {
  return limitText(
    removeNullCharacters(String(value ?? ''))
      .replace(/\s+/g, ' ')
      .trim(),
    limit,
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message);
  }

  return fallback;
}

function createFileName(userId: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);

  return `${userId}/course-${Date.now()}-${randomPart}.jpg`;
}

export function CourseThumbnailUploader({
  userId,
  value,
  onChange,
  disabled = false,
  onUploadingChange,
  className,
}: CourseThumbnailUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [selectedImageSrc, setSelectedImageSrc] =
    useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const normalizedValue = normalizeCourseThumbnailUrl(value) || '';
  const previewUrl = localPreviewUrl || normalizedValue;
  const busy = uploading || removing;

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewUrl]);

  useEffect(() => {
    onUploadingChange?.(busy);
  }, [busy, onUploadingChange]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    return () => {
      if (selectedImageSrc) {
        URL.revokeObjectURL(selectedImageSrc);
      }
    };
  }, [selectedImageSrc]);

  const replaceLocalPreview = (nextUrl: string) => {
    setLocalPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      return nextUrl;
    });
  };

  const replaceSelectedImage = (nextUrl: string | null) => {
    setSelectedImageSrc((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      return nextUrl;
    });
  };

  const closeCropDialog = () => {
    setCropOpen(false);
    replaceSelectedImage(null);
  };

  const handleFileSelect = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';

    if (!file) return;

    if (!userId) {
      toast({
        title: 'Сурет таңдалмады',
        description: 'Пайдаланушы аккаунты анықталмады.',
        variant: 'destructive',
      });
      return;
    }

    if (
      file.type !== 'image/jpeg' &&
      file.type !== 'image/png' &&
      file.type !== 'image/webp'
    ) {
      toast({
        title: 'Файл форматы жарамсыз',
        description: 'JPG, PNG немесе WEBP суретін таңдаңыз.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      toast({
        title: 'Файл тым үлкен',
        description: `Сурет көлемі ${MAX_IMAGE_SIZE_MB} MB-тан аспауы керек.`,
        variant: 'destructive',
      });
      return;
    }

    replaceSelectedImage(URL.createObjectURL(file));
    setCropOpen(true);
  };

  const uploadCroppedFile = async (file: File) => {
    if (!userId) {
      throw new Error('Пайдаланушы аккаунты анықталмады.');
    }

    const objectUrl = URL.createObjectURL(file);
    replaceLocalPreview(objectUrl);
    setUploading(true);

    try {
      const filePath = createFileName(userId);

      const { error: uploadError } = await supabase.storage
        .from(COURSE_THUMBNAIL_BUCKET)
        .upload(filePath, file, {
          upsert: false,
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage
        .from(COURSE_THUMBNAIL_BUCKET)
        .getPublicUrl(filePath);

      const publicUrl = normalizeCourseThumbnailUrl(data.publicUrl);

      if (!publicUrl) {
        await supabase.storage
          .from(COURSE_THUMBNAIL_BUCKET)
          .remove([filePath]);

        throw new Error('Жүктелген суреттің мекенжайы алынбады.');
      }

      onChange(publicUrl);
      replaceLocalPreview('');

      toast({
        title: 'Курс мұқабасы дайын',
        description: 'Курс өзгерісін сақтау батырмасымен бекітіңіз.',
      });
    } catch (error) {
      replaceLocalPreview('');
      throw new Error(
        getErrorMessage(
          error,
          'Суретті жүктеу кезінде қате шықты.',
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value || busy) return;

    setRemoving(true);

    try {
      replaceLocalPreview('');
      onChange('');

      toast({
        title: 'Курс суреті алынды',
        description: 'Өзгерісті сақтау батырмасымен бекітіңіз.',
      });
    } catch (error) {
      toast({
        title: 'Суретті өшіру мүмкін болмады',
        description: getErrorMessage(
          error,
          'Суретті өшіру кезінде қате шықты.',
        ),
        variant: 'destructive',
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'overflow-hidden rounded-[1.75rem] border border-border bg-background',
          className,
        )}
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
          {previewUrl && !previewFailed ? (
            <img
              src={previewUrl}
              alt="Курс мұқабасы"
              className="h-full w-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
                <ImageIcon size={19} />
              </span>
              <p className="mt-4 text-sm font-bold">Курс мұқабасы</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Сурет 16:9 форматында автоматты қиылады
              </p>
            </div>
          )}

          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-soft">
                <Loader2 size={15} className="animate-spin" />
                {uploading ? 'Жүктелуде...' : 'Өшірілуде...'}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold">
              {normalizedValue
                ? 'Мұқабаны ауыстыру'
                : 'Мұқаба жүктеу'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG немесе WEBP · {MAX_IMAGE_SIZE_MB} MB дейін
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {normalizedValue ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={handleRemove}
                disabled={disabled || busy}
              >
                <Trash2 size={14} className="mr-2" />
                Алып тастау
              </Button>
            ) : null}

            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy || !userId}
            >
              {normalizedValue ? (
                <RefreshCw size={14} className="mr-2" />
              ) : (
                <Upload size={14} className="mr-2" />
              )}
              {normalizedValue ? 'Ауыстыру' : 'Файл таңдау'}
            </Button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          disabled={disabled || busy}
          className="sr-only"
        />
      </div>

      <CourseThumbnailCropDialog
        open={cropOpen}
        imageSrc={selectedImageSrc}
        onClose={closeCropDialog}
        onCropped={uploadCroppedFile}
      />
    </>
  );
}
