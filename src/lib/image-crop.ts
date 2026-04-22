export type AreaPixels = {
  width: number;
  height: number;
  x: number;
  y: number;
};

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: AreaPixels,
  outputSize = 320,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.92
): Promise<Blob> {
  const image = await createImage(imageSrc);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas контекстін алу мүмкін болмады');
  }

  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Cropped image blob жасалмады'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}