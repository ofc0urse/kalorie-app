/**
 * Kompresja zdjęcia w przeglądarce: dłuższy bok do `maxDim` px, JPEG.
 * Obsługuje orientację EXIF (createImageBitmap z imageOrientation lub <img>, który w Safari
 * sam ją uwzględnia) i zdjęcia HEIC z iPhone'a (Safari potrafi je zdekodować).
 */
export interface CompressedImage {
  base64: string;
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* np. HEIC w starszym Safari – próbujemy przez <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Nie udało się odczytać zdjęcia. Spróbuj innego pliku (JPEG/PNG/HEIC).');
  }
}

export async function compressImage(file: Blob, maxDim = 1024, quality = 0.8): Promise<CompressedImage> {
  const img = await decode(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Brak obsługi canvas.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, 0, 0, width, height);
    let q = quality;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    // gdyby mimo wszystko wyszło za dużo – obniżamy jakość
    while (dataUrl.length > 1_300_000 && q > 0.4) {
      q -= 0.15;
      dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { base64, dataUrl, bytes: Math.floor((base64.length * 3) / 4), width, height };
  } finally {
    img.close();
  }
}
