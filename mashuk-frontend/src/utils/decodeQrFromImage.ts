import jsQR from 'jsqr';
import { BrowserMultiFormatReader } from '@zxing/browser';

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  // Prefer createImageBitmap — respects EXIF orientation on modern WebViews.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const img = new Image();
        img.src = canvas.toDataURL('image/jpeg', 0.92);
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Не удалось открыть фото'));
        });
        return img;
      }
      bitmap.close?.();
    } catch {
      /* fall through to object URL */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось открыть фото'));
    };
    img.src = url;
  });
}

function drawScaled(
  img: HTMLImageElement,
  maxSide: number,
  opts?: { grayscale?: boolean; contrast?: number },
): ImageData | null {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  if (opts?.grayscale || opts?.contrast) {
    const d = imageData.data;
    const contrast = opts.contrast ?? 1;
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    for (let i = 0; i < d.length; i += 4) {
      let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (opts.contrast) {
        y = factor * (y - 128) + 128;
        y = Math.max(0, Math.min(255, y));
      }
      d[i] = d[i + 1] = d[i + 2] = y;
    }
  }
  return imageData;
}

async function decodeWithBarcodeDetector(file: File): Promise<string | null> {
  const Detector = (window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect: (source: ImageBitmap | HTMLImageElement) => Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const detector = new Detector({ formats: ['qr_code'] });
    const bitmap = await createImageBitmap(file);
    try {
      const codes = await detector.detect(bitmap);
      const raw = codes.find(c => c.rawValue?.trim())?.rawValue?.trim();
      return raw || null;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}

async function decodeWithZxing(img: HTMLImageElement): Promise<string | null> {
  try {
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageElement(img);
    const text = result?.getText?.()?.trim();
    return text || null;
  } catch {
    return null;
  }
}

function decodeWithJsQr(img: HTMLImageElement): string | null {
  const attempts: Array<{ maxSide: number; grayscale?: boolean; contrast?: number }> = [
    { maxSide: 1200 },
    { maxSide: 1600 },
    { maxSide: 800 },
    { maxSide: 2000 },
    { maxSide: 1200, grayscale: true },
    { maxSide: 1600, grayscale: true, contrast: 1.4 },
    { maxSide: 800, grayscale: true, contrast: 1.6 },
  ];
  for (const attempt of attempts) {
    const imageData = drawScaled(img, attempt.maxSide, attempt);
    if (!imageData) continue;
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    const raw = code?.data?.trim();
    if (raw) return raw;
  }
  return null;
}

/** Decode first QR found in an image file (camera capture or gallery). */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const fromDetector = await decodeWithBarcodeDetector(file);
  if (fromDetector) return fromDetector;

  const img = await loadImageElement(file);

  const fromZxing = await decodeWithZxing(img);
  if (fromZxing) return fromZxing;

  return decodeWithJsQr(img);
}
