import { fitWithin, JPEG_QUALITY, MAX_OUTPUT_BYTES } from './photoPolicy';

export interface PreparedImage {
  bytes: ArrayBuffer;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
  /** Hex SHA-256 (the contract's evidence field). Null where Web Crypto is unavailable (insecure origins). */
  sha256: string | null;
}

/** Decodes, orients, resizes and re-encodes a photo. Throws if the image cannot be decoded. */
export interface ImageProcessor {
  prepare(file: Blob): Promise<PreparedImage>;
}

/**
 * Browser implementation using createImageBitmap + canvas. Re-encoding through
 * a canvas produces a fresh JPEG with no EXIF, so location and camera metadata
 * are removed; `imageOrientation: 'from-image'` bakes in the camera rotation.
 */
export class CanvasImageProcessor implements ImageProcessor {
  async prepare(file: Blob): Promise<PreparedImage> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const { width, height } = fitWithin(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context unavailable');
      // White background so transparent PNG/WebP areas don't turn black in JPEG.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('Could not encode image');
      if (blob.size > MAX_OUTPUT_BYTES) throw new Error('Encoded image too large');
      const bytes = await blob.arrayBuffer();
      return { bytes, mediaType: 'image/jpeg', width, height, sha256: await sha256Hex(bytes) };
    } finally {
      bitmap.close();
    }
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
