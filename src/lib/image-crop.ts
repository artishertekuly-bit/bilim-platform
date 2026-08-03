export type AreaPixels = {
  width: number;
  height: number;
  x: number;
  y: number;
};

function isRemoteUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener(
      'load',
      async () => {
        try {
          if ('decode' in image) {
            await image.decode();
          }
        } catch {
          // Кей browser-лер decode() кезінде warning беруі мүмкін.
          // load болған болса, image бәрібір қолдануға жарайды.
        }

        resolve(image);
      },
      { once: true }
    );

    image.addEventListener(
      'error',
      () => {
        reject(new Error('Суретті жүктеу мүмкін болмады.'));
      },
      { once: true }
    );

    /**
     * Remote image crop керек болса canvas tainted болмауы үшін.
     * Local blob/object URL үшін бұл міндетті емес.
     */
    if (isRemoteUrl(url)) {
      image.crossOrigin = 'anonymous';
    }

    image.src = url;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeCrop(image: HTMLImageElement, crop: AreaPixels) {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  if (!naturalWidth || !naturalHeight) {
    throw new Error('Сурет өлшемін анықтау мүмкін болмады.');
  }

  const x = clamp(Math.round(crop.x), 0, naturalWidth - 1);
  const y = clamp(Math.round(crop.y), 0, naturalHeight - 1);

  const maxWidth = naturalWidth - x;
  const maxHeight = naturalHeight - y;

  const width = clamp(Math.round(crop.width), 1, maxWidth);
  const height = clamp(Math.round(crop.height), 1, maxHeight);

  return {
    x,
    y,
    width,
    height,
  };
}

export async function getCroppedImageBlobBySize(
  imageSrc: string,
  pixelCrop: AreaPixels,
  outputWidth: number,
  outputHeight: number,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.92
): Promise<Blob> {
  if (!imageSrc) {
    throw new Error('Сурет көзі табылмады.');
  }

  if (!pixelCrop || pixelCrop.width <= 0 || pixelCrop.height <= 0) {
    throw new Error('Crop аймағы дұрыс емес.');
  }

  if (
    !Number.isFinite(outputWidth) ||
    !Number.isFinite(outputHeight) ||
    outputWidth <= 0 ||
    outputHeight <= 0
  ) {
    throw new Error('Output өлшемі дұрыс емес.');
  }

  const image = await createImage(imageSrc);
  const crop = normalizeCrop(image, pixelCrop);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas контекстін алу мүмкін болмады.');
  }

  canvas.width = Math.round(outputWidth);
  canvas.height = Math.round(outputHeight);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  try {
    ctx.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
  } catch {
    throw new Error('Суретті canvas арқылы қию мүмкін болмады.');
  }

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Cropped image blob жасалмады.'));
            return;
          }

          resolve(blob);
        },
        mimeType,
        quality
      );
    } catch {
      reject(
        new Error(
          'Суретті сақтау мүмкін болмады. Remote URL қолданылса, CORS рұқсаты керек.'
        )
      );
    }
  });
}

export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: AreaPixels,
  outputSize = 512,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.92
): Promise<Blob> {
  return getCroppedImageBlobBySize(
    imageSrc,
    pixelCrop,
    outputSize,
    outputSize,
    mimeType,
    quality
  );
}
