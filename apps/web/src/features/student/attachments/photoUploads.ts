import type { RecordStore } from '../../../lib/offline';
import { photosForCheckIn, type StoredPhoto } from './useAttachments';

/**
 * Sending photos after a help request reached the server (Phase 3).
 *
 * The help request itself never waits for photos. Once its receipt names a
 * help request, each photo kept on the device is uploaded once (the server
 * deduplicates by content), then all are linked to the request. Progress is
 * stored on each photo, so a reload or a lost connection resumes where it
 * stopped instead of starting again.
 */
export interface PhotoUploader {
  upload(bytes: ArrayBuffer, mediaType: StoredPhoto['mediaType']): Promise<{ id: string }>;
  link(helpRequestId: string, attachmentIds: string[]): Promise<void>;
}

export interface PhotoUploadStatus {
  total: number;
  /** Uploaded and linked to the help request on the server. */
  sent: number;
  /** The last attempt failed; it is tried again later. */
  failed: number;
}

export function photoUploadStatus(photos: readonly StoredPhoto[]): PhotoUploadStatus {
  return {
    total: photos.length,
    sent: photos.filter((p) => p.uploadState === 'LINKED').length,
    failed: photos.filter((p) => p.uploadState === 'FAILED').length,
  };
}

export async function sendPhotosForHelpRequest(
  store: RecordStore<StoredPhoto>,
  uploader: PhotoUploader,
  checkInKey: string,
  helpRequestId: string,
): Promise<PhotoUploadStatus> {
  const photos = await photosForCheckIn(store, checkInKey);
  for (const photo of photos) {
    if (photo.serverId) continue;
    try {
      const uploaded = await uploader.upload(photo.bytes, photo.mediaType);
      await store.put({ ...photo, serverId: uploaded.id, uploadState: 'UPLOADED' });
    } catch {
      await store.put({ ...photo, uploadState: 'FAILED' });
    }
  }
  const current = await photosForCheckIn(store, checkInKey);
  const pending = current.filter((p) => p.serverId && p.uploadState !== 'LINKED');
  if (pending.length > 0) {
    try {
      await uploader.link(
        helpRequestId,
        pending.map((p) => p.serverId!),
      );
      for (const photo of pending) await store.put({ ...photo, uploadState: 'LINKED' });
    } catch {
      for (const photo of pending) await store.put({ ...photo, uploadState: 'FAILED' });
    }
  }
  return photoUploadStatus(await photosForCheckIn(store, checkInKey));
}
