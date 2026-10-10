/**
 * Rules for optional help-request photos.
 *
 * Inputs: JPEG, PNG or WebP, at most 3, each at most 15 MB as picked.
 * Every accepted photo is re-encoded on the device to JPEG ≤ 1600 px. That
 * (a) applies the camera orientation, (b) drops ALL metadata including EXIF
 * GPS coordinates and camera serials, and (c) keeps storage small. The
 * output also fits the contract's evidence limits (image/jpeg, ≤ 10 MB).
 */
export const MAX_PHOTOS = 3;
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 10_000_000;
export const MAX_DIMENSION_PX = 1600;
export const JPEG_QUALITY = 0.82;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedType = (typeof ACCEPTED_TYPES)[number];

export type PhotoRejection = 'TOO_MANY' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'UNREADABLE' | 'STORAGE_FULL' | 'STORAGE_FAILED';

/** Identifies the real format from the file's first bytes; the declared MIME type is not trusted. */
export function sniffImageType(head: Uint8Array): AcceptedType | null {
  const at = (i: number) => head[i] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Cheap checks before decoding: count, declared size, and real file signature. */
export async function precheckPhoto(
  file: Pick<File, 'size' | 'type' | 'slice'>,
  alreadySelected: number,
): Promise<{ ok: true; type: AcceptedType } | { ok: false; reason: PhotoRejection }> {
  if (alreadySelected >= MAX_PHOTOS) return { ok: false, reason: 'TOO_MANY' };
  if (file.size > MAX_INPUT_BYTES) return { ok: false, reason: 'TOO_LARGE' };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniffImageType(head);
  if (!type) return { ok: false, reason: 'UNSUPPORTED_TYPE' };
  return { ok: true, type };
}

/** Scales `width × height` down to fit MAX_DIMENSION_PX, keeping aspect ratio. */
export function fitWithin(width: number, height: number, max = MAX_DIMENSION_PX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
