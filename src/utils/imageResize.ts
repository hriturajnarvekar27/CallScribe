export async function compressImageFileToDataUrl(
  file: File,
  options: { maxWidth: number; maxHeight: number; squareCrop?: boolean; quality?: number }
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WebP, or GIF).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image file is larger than 15 MB. Please choose a smaller image.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode the selected image file.'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) {
      throw new Error('Selected image has invalid dimensions.');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas image processing is unavailable in this browser.');
    }

    if (options.squareCrop) {
      const size = Math.min(options.maxWidth, options.maxHeight);
      const cropSide = Math.min(srcW, srcH);
      const sx = (srcW - cropSide) / 2;
      const sy = (srcH - cropSide) / 2;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, size, size);
    } else {
      const ratio = Math.min(1, options.maxWidth / srcW, options.maxHeight / srcH);
      canvas.width = Math.max(1, Math.round(srcW * ratio));
      canvas.height = Math.max(1, Math.round(srcH * ratio));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    return canvas.toDataURL('image/webp', options.quality ?? 0.84);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
