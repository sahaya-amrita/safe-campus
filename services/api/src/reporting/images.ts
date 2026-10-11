/**
 * Server-side image checks for uploaded photos. The student app already
 * re-encodes photos (which drops EXIF), but the server never trusts that:
 * the real type is read from the bytes, and metadata segments that can carry
 * location or device details are removed again before storage.
 */

export type ImageType = 'image/jpeg' | 'image/png';

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

/**
 * Removes JPEG APP1 (EXIF/XMP), APP2–APP15 (except APP14 colour info) and COM
 * segments. Image data after the start-of-scan marker is copied unchanged.
 * Returns null when the file is not a well-formed JPEG.
 */
export function stripJpegMetadata(input: Uint8Array): Uint8Array | null {
  const bytes = Buffer.from(input);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded image data.
      parts.push(bytes.subarray(offset));
      return Buffer.concat(parts);
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    const segment = bytes.subarray(offset, offset + 2 + length);
    const isApp = marker >= 0xe1 && marker <= 0xef && marker !== 0xee;
    const isComment = marker === 0xfe;
    if (!isApp && !isComment) parts.push(segment);
    offset += 2 + length;
  }
  return null;
}

const PNG_DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);

/** Removes PNG text, EXIF and timestamp chunks. Returns null for a malformed PNG. */
export function stripPngMetadata(input: Uint8Array): Uint8Array | null {
  const bytes = Buffer.from(input);
  if (sniffImage(bytes) !== 'image/png') return null;
  const parts: Buffer[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === 'IEND') return Buffer.concat(parts);
  }
  return null;
}

export function sanitizeImage(bytes: Uint8Array): { type: ImageType; bytes: Uint8Array } | null {
  const type = sniffImage(bytes);
  if (!type) return null;
  const clean = type === 'image/jpeg' ? stripJpegMetadata(bytes) : stripPngMetadata(bytes);
  return clean ? { type, bytes: clean } : null;
}
